'use strict';
// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_KNOWLEDGE_LEVEL = 4;

window.HOUR_UNIX = 3600000;
window.MINUTE_UNIX = 60000;
window.SECOND_UNIX = 1000;

// Hard cap on how many cards and how many phrases may be revised in a single play session. Decks
// larger than this are shuffled and only the first entries are revised, so each session draws a
// random subset of at most this many cards and (separately) this many phrases. Lives here rather
// than in main-page.js because the streak-freeze price is derived from it and the account page
// never loads main-page.js
window.MAX_SESSION_REVISION_ITEMS = 8;

// Gems awarded for one completed card and for one completed phrase. Characters drawn inside a
// phrase award nothing on their own — the phrase pays out once, as a whole — so a full session is
// worth GEMS_PER_ITEM * (cards + phrases) = GEMS_PER_ITEM * MAX_SESSION_REVISION_ITEMS * 2
window.GEMS_PER_ITEM = 10;

// How many streak freezes the user may hold at once. Each one absorbs one missed day, and they
// chain, so holding the maximum covers that many consecutive days off
window.MAX_STREAK_FREEZES = 3;

// Bounds of the daily streak goal (sessions per day) the user picks on the account page
window.STREAK_GOAL_MIN = 3;
window.STREAK_GOAL_MAX = 30;

// A streak freeze costs this many days of practice at the user's own daily goal
window.STREAK_FREEZE_COST_DAYS = 4;
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

// In-memory copy of the user's profile data. It is loaded from IndexedDB once at startup (see
// main()) and every synchronous read across the page scripts goes through this object — only the
// initial load and the saveProfileData/saveGameModifiers writes touch IndexedDB
window.profileData = null;
window.gameModifiers = null;

// ----------------------------- IndexedDB profile storage layer --------------------------------
// Profile data (decks, sessions, streak, game modifiers) lives in IndexedDB. UI-only settings
// (theme, language) deliberately stay in localStorage — they are tiny and read synchronously
// before the page renders. Values are stored as structured-clonable objects under string keys,
// so no JSON.stringify is needed
window.DB_NAME = "site";
window.DB_VERSION = 1;
window.DB_STORE = "profile";
window.CARD_DATA_KEY = "cardData";
window.GAME_MODIFIERS_KEY = "gameModifiers";

// Cached open-connection promise so we only open the database once per page
let dbPromise = null;

/**
 * Opens (and lazily creates) the IndexedDB database, caching the connection promise
 * @returns { Promise<IDBDatabase> } - The open database connection
 */
function openDB()
{
    if (dbPromise === null)
    {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(window.DB_NAME, window.DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(window.DB_STORE))
                    db.createObjectStore(window.DB_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return dbPromise;
}

/**
 * Reads a value from the profile store by key
 * @param { string } key - The key to read
 * @returns { Promise<*> } - The stored value, or null when nothing is stored under the key
 */
function idbGet(key)
{
    return openDB().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(window.DB_STORE, "readonly");
        const request = transaction.objectStore(window.DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result === undefined ? null : request.result);
        request.onerror = () => reject(request.error);
    }));
}

/**
 * Writes a value to the profile store under the given key
 * @param { string } key - The key to write
 * @param { * } value - A structured-clonable value to store
 * @returns { Promise<void> } - Resolves once the write transaction commits
 */
function idbPut(key, value)
{
    return openDB().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(window.DB_STORE, "readwrite");
        transaction.objectStore(window.DB_STORE).put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    }));
}

/**
 * Deletes a value from the profile store by key
 * @param { string } key - The key to delete
 * @returns { Promise<void> } - Resolves once the delete transaction commits
 */
function idbDelete(key)
{
    return openDB().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(window.DB_STORE, "readwrite");
        transaction.objectStore(window.DB_STORE).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    }));
}

/**
 * Troll jQuery developers. Returns the element with the given id
 * @param {string} x - ID of the element
 * @returns {HTMLElement} - The element in question
 */
function $(x)
{
    return document.getElementById(x);
}

/**
 * Reduces a URL path to the page it identifies: "deck", "account", "index", … The single source of
 * truth for "which page am I on"; tutPage() in tutorial.js and pageNeedsCharacterData() below both
 * defer to it.
 *
 * Every page is served from a directory URL ("/en_US/deck/"), so the page is the last non-empty
 * segment — except at the site root ("/") and at a locale root ("/en_US/"), which both serve the
 * landing page. The .html suffix is still tolerated so a directly-typed "/en_US/deck.html" and the
 * 404 document both resolve.
 * @param { string } path - A URL pathname
 * @returns { string } - The page identifier
 */
function pageNameFromPath(path)
{
    const segments = path.split("/").filter((segment) => segment !== "");
    if (segments.length === 0)
        return "index";

    const last = segments[segments.length - 1].replace(/\.html$/, "");
    if (last === "" || last === "index" || localeFromSegment(last) !== null)
        return "index";
    return last;
}

/**
 * The locale directory the current page is served from, or "" at the site root (which mirrors the
 * default locale). Reads the path rather than localStorage so it describes where the browser
 * actually is, which is what building a sibling link needs. Always canonically cased: a lowercased
 * "/en_us/" (see localeFromSegment) is reported as "en_US", the directory that actually has pages.
 * @returns { string } - "en_US", "bg_BG", … or ""
 */
function currentLocaleDir()
{
    const first = location.pathname.split("/").filter((segment) => segment !== "")[0];
    return localeFromSegment(first) || "";
}

/**
 * Builds an absolute in-site URL for a page, in the locale the browser is currently in. Replaces the
 * relative "./deck.html" links the old build rewrote into absolute ones with a sed pass; those
 * always pointed at the root copy, so navigating inside a non-default locale used to take a bounce
 * through setLanguage()'s redirect.
 * @param { string } slug - Page slug ("deck", "account", …; "index" or "" for the landing page)
 * @param { string } [query] - Optional query string, including the leading "?"
 * @returns { string } - e.g. "/bg_BG/deck/"
 */
window.pageUrl = function (slug, query)
{
    const dir = currentLocaleDir();
    const base = dir === "" ? "/" : "/" + dir + "/";
    const path = (slug === "" || slug === "index") ? base : base + slug + "/";
    return path + (query || "");
};

/**
 * Marks the app-bar and tab-bar link for the current page, so the nav shows where you are. Done in
 * JS rather than the template because the header is one shared include across every page.
 */
function markCurrentNavLink()
{
    const current = pageNameFromPath(window.location.pathname);

    for (const link of document.querySelectorAll(".app-nav .nav-link, .tab-bar .tab-item"))
    {
        // link.pathname is the resolved URL, so the comparison doesn't depend on how the href is spelled
        if (pageNameFromPath(link.pathname) !== current)
            continue;

        link.classList.add("is-current");
        link.setAttribute("aria-current", "page");
    }
}

/**
 * Given an element, an event and a function to execute, tracks the given event and executes the provided callback
 * function when the animation or transition on the given element has finished playing
 * @param { HTMLElement } element - Element on which to track the event
 * @param { string } event - Event type, like "click"
 * @param { function } f - Function to run after animation
 */
function runEventAfterAnimation(element, event, f)
{
    // The armed flag lives on the element we bound to, not on e.target. Both events can be raised by
    // a descendant and bubble up here: a click lands on whatever is under the cursor (for a button
    // with an inline SVG icon that is the <svg>, not the <button>), while the ripple's transitionend
    // is raised by the button itself. Keying off e.target would arm one node and test another, and
    // the callback would silently never run.
    element.bWaitForAnimation = false;
    element.addEventListener(event, () => {
        element.bWaitForAnimation = true;
    });

    const func = (e) => {
        if (element.bWaitForAnimation)
        {
            element.bWaitForAnimation = false;
            f(e);
        }
    };

    element.addEventListener("animationend", func);
    element.addEventListener("transitionend", func);
}

/**
 * Adds a text node to an element
 * @param { HTMLElement } container - Parent element of the text node
 * @param { string } text - The text that the node contains
 */
function addTextNode(container, text)
{
    container.appendChild(document.createTextNode(text));
}

/**
 * Splits a string into an array of full Unicode characters. Indexing a string directly with []
 * (or counting .length) works on UTF-16 code units, which cuts characters outside the BMP —
 * rare CJK extension characters, for example — in half. Array.from iterates by code point and
 * keeps them whole, so use this whenever indexing into phrase/character data
 * @param { string } str - The string to split
 * @returns { string[] } - One entry per character
 */
function toCharacters(str)
{
    return Array.from(str);
}

/**
 * Encodes the LOCAL calendar date of the given Date as a timezone-independent integer day index.
 * Date.UTC re-interprets the local Y/M/D as if it were UTC, so the result identifies the calendar
 * day the user saw on their own clock, is immune to DST and stays comparable after the device
 * moves to another timezone. Used by the streak, the daily level reduction, the activity calendar
 * and the lastStreakDay migration in main()
 * @param { Date } date - The date to encode
 * @returns { number } - Days since 1970-01-01 of the local calendar date
 */
function localDayIndex(date)
{
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/**
 * Saves a value as a JSON file download. Shared by the deck export and the marketplace download
 * @param { string } fileName - The name the browser offers to save the file under
 * @param { * } data - A JSON-serialisable value
 */
function downloadJSON(fileName, data)
{
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    // Not revoked straight after click(): Firefox reads the blob asynchronously once the download
    // starts, and an immediate revoke can cancel it
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Validates one card or phrase from an imported deck and returns a clean copy with only the fields
 * the app stores. Knowledge is clamped into range and non-string definitions are dropped, so a
 * hand-edited file cannot put a value into the profile that the practice page would choke on
 * @param { * } raw - The entry as it appears in the file
 * @param { string } field - "character" for a card, "phrase" for a phrase
 * @returns { Object|null } - The normalised entry, or null when the entry is unusable
 */
function normaliseDeckEntry(raw, field)
{
    if (raw === null || typeof raw !== "object" || typeof raw[field] !== "string")
        return null;

    const knowledge = Number(raw.knowledge);
    const entry = {
        name: typeof raw.name === "string" ? raw.name : "",
        [field]: raw[field],
        knowledge: Number.isFinite(knowledge) ? Math.min(Math.max(knowledge, 0), window.MAX_KNOWLEDGE_LEVEL) : 0,
        definitions: Array.isArray(raw.definitions) ? raw.definitions.filter((d) => typeof d === "string") : [],
    };

    if (field === "phrase")
        return toCharacters(entry.phrase).length > 0 ? entry : null;

    // Decks from before variants existed carry the variant postfix inside the character itself
    // ("漢-jp"); split it off like fixLegacyCharacterVariants does for stored cards. Only a postfix of
    // that shape is split, so a card spelled "AB" is rejected rather than read as "A" in variant "B"
    if (typeof raw.variant === "string")
        entry.variant = raw.variant;
    else
    {
        const firstChar = toCharacters(entry.character)[0] || "";
        const rest = entry.character.slice(firstChar.length);
        if (rest === "" || /^-[a-z]+$/.test(rest))
        {
            entry.variant = rest;
            entry.character = firstChar;
        }
        else
            entry.variant = "";
    }
    if (entry.variant !== "" && !/^-[a-z]+$/.test(entry.variant))
        return null;
    return toCharacters(entry.character).length === 1 ? entry : null;
}

/**
 * Validates an imported deck (a .yydeck.json file or a marketplace deck) and merges it into the
 * in-memory profile. The whole file is rejected when any entry is unusable, so a malformed file is
 * reported instead of half-merged. Entries the user already has (a card with the same character and
 * variant, a phrase with the same text) are skipped rather than duplicated, which keeps the progress
 * on them and makes importing the same deck twice a no-op. Does not save
 * @param { * } content - The parsed deck: { cards: [...], phrases: [...] }
 * @returns { { cards: number, phrases: number } } - How many new cards and phrases were added
 */
function mergeDeckIntoProfile(content)
{
    if (content === null || typeof content !== "object" ||
        (content.cards === undefined && content.phrases === undefined) ||
        (content.cards !== undefined && !Array.isArray(content.cards)) ||
        (content.phrases !== undefined && !Array.isArray(content.phrases)))
        throw new Error("Error: the file is not a deck");

    const cards = [];
    for (const raw of content.cards || [])
    {
        const card = normaliseDeckEntry(raw, "character");
        if (card === null)
            throw new Error("Error: the deck contains an invalid card");
        cards.push(card);
    }

    const phrases = [];
    for (const raw of content.phrases || [])
    {
        const phrase = normaliseDeckEntry(raw, "phrase");
        if (phrase === null)
            throw new Error("Error: the deck contains an invalid phrase");
        phrases.push(phrase);
    }

    // Only merge once everything validated, so a rejected file leaves the profile untouched
    const data = window.profileData;
    const cardKeys = new Set(data.cards.map((c) => c.character + (c.variant || "")));
    const phraseKeys = new Set(data.phrases.map((p) => p.phrase));
    const added = { cards: 0, phrases: 0 };

    for (const card of cards)
    {
        const key = card.character + card.variant;
        if (cardKeys.has(key))
            continue;
        cardKeys.add(key);
        data.cards.push(card);
        ++added.cards;
    }

    for (const phrase of phrases)
    {
        if (phraseKeys.has(phrase.phrase))
            continue;
        phraseKeys.add(phrase.phrase);
        data.phrases.push(phrase);
        ++added.phrases;
    }
    return added;
}

/**
 * Persists the profile data object to IndexedDB under the card-data key. Updates the in-memory
 * copy too, so callers passing a fresh object keep window.profileData in sync. The returned promise
 * resolves once the write commits — await it before navigating away, otherwise the browser may tear
 * the page down before the transaction flushes
 * @param { Object } obj - The profile data object to persist
 * @returns { Promise<void> } - Resolves once the write commits
 */
function saveProfileData(obj)
{
    window.profileData = obj;

    // Nothing the privacy policy describes may be stored before it has been accepted. The privacy and
    // licenses pages run without an answer, so a change made there stays in memory only
    if (!privacyConsentGiven())
        return Promise.resolve();

    return idbPut(window.CARD_DATA_KEY, obj).catch((err) => {
        // Log, then re-reject. Resolving on failure made callers that navigate/reload in .then()
        // proceed as if the write had committed, silently dropping the user's import or edit. By
        // rejecting, a navigate-after-save chain simply doesn't fire, keeping the user on the page
        // with their data intact. Fire-and-forget callers should .catch() this (see main() below).
        console.error("Error: failed to save profile data", err);
        throw err;
    }).then(announceProfileChange);
}

/**
 * Persists the game modifiers to IndexedDB
 * @returns { Promise<void> } - Resolves once the write commits
 */
function saveGameModifiers()
{
    if (!privacyConsentGiven())
        return Promise.resolve();

    return idbPut(window.GAME_MODIFIERS_KEY, window.gameModifiers).catch((err) => {
        // Re-reject for the same reason as saveProfileData: a resolved-on-failure promise let
        // callers act as though the modifier write had persisted when it hadn't.
        console.error("Error: failed to save game modifiers", err);
        throw err;
    }).then(announceProfileChange);
}

// ------------------------------------ Cross-tab consistency ------------------------------------
// Every tab holds its own in-memory copy of the profile and each save writes that whole copy back, so
// a save from a tab holding stale data would silently undo what another tab had just written. Every
// successful save is therefore announced on a BroadcastChannel, and a tab that hears one reloads to
// pick the fresh data up. It waits until it is visible and idle: a practice round in progress and the
// card editor both hold unsaved work that a reload would throw away
const profileChannel = ("BroadcastChannel" in window) ? new BroadcastChannel("profile") : null;
let bProfileStale = false;

function announceProfileChange()
{
    if (profileChannel !== null)
        profileChannel.postMessage("saved");
}

function reloadIfProfileStale()
{
    if (!bProfileStale || document.visibilityState !== "visible")
        return;
    if (window.bInTest || pageNameFromPath(location.pathname) === "deck-edit-card")
        return;
    location.reload();
}

if (profileChannel !== null)
{
    profileChannel.addEventListener("message", () => {
        bProfileStale = true;
        reloadIfProfileStale();
    });
}
document.addEventListener("visibilitychange", reloadIfProfileStale);

/**
 * Price of one streak freeze, in gems. A freeze costs window.STREAK_FREEZE_COST_DAYS days of
 * practice at the user's own daily goal: goal sessions a day, each worth a full batch of cards and
 * phrases. Scaling with the goal keeps a freeze the same amount of effort for everyone, whether
 * they aim for three sessions a day or thirty
 * @param { number } goal - The user's daily streak goal, in sessions per day
 * @returns { number } - The cost in gems
 */
function streakFreezeCost(goal)
{
    return window.STREAK_FREEZE_COST_DAYS * window.GEMS_PER_ITEM *
        (window.MAX_SESSION_REVISION_ITEMS * 2) * goal;
}

/**
 * Utility function to create an HTML element in a single line
 * @param { string } elType - Type of the new element
 * @param { string } content - Text content of the new element
 * @param { string } id - ID of the new element
 * @param { string } classType - Class of the new element
 * @param { string } data - Data that will be stored as the value of the "arbitrary-data" attribute
 * @param { HTMLElement } parentEl - Element to become the parent of the new element
 * @returns { HTMLElement } - The element that was created
 */
function addElement(elType, content, id, classType, data, parentEl)
{
    let el = document.createElement(elType);
    el.className = classType;
    el.id = id;
    el.textContent = content;
    // Most callers pass no arbitrary-data; only write the attribute when there's actually a value,
    // so building a multi-thousand-card deck doesn't pay an empty setAttribute per element
    if (data)
        el.setAttribute("arbitrary-data", data);

    if (parentEl !== null)
        parentEl.appendChild(el);
    return el;
}



/**
 * Some legacy users may be lacking variants as part of their character card objects, so this function
 * fixes them in memory
 * @returns { boolean } - True when a card was changed and the profile needs saving
 */
function fixLegacyCharacterVariants()
{
    let changed = false;
    for (let card of window.profileData.cards)
    {
        // Only `undefined` means "legacy card, never migrated". An empty-string variant is the
        // legitimate default for a plain character, so `!card.variant` would treat every such card as
        // unmigrated and re-split it on every page load — wasted O(deck) work that never settles.
        if (card["variant"] === undefined)
        {
            // Split by code point — charAt(0)/substring(1) count UTF-16 units and would cut a
            // character outside the BMP in half, corrupting both the character and the variant
            const firstChar = toCharacters(card.character)[0] || "";
            card["variant"] = card.character.slice(firstChar.length);
            card["character"] = firstChar;
            changed = true;
        }
    }
    // The caller persists the change once the privacy policy has been accepted, so the migration
    // sticks instead of being recomputed on every load
    return changed;
}

/**
 * Reads and JSON-parses a legacy localStorage entry, returning null when it is absent OR unparseable.
 * Corrupt legacy data must never throw: a raw JSON.parse in the IndexedDB-failure fallback path would
 * throw a second time, uncaught, rejecting main()/storageReady and leaving every page script dormant
 * (a blank, dead page). Treating garbage as "no data" lets the app boot with an empty profile instead.
 * @param { string } key - The localStorage key to read
 * @returns { * } - The parsed value, or null when missing/corrupt
 */
function parseLegacyJSON(key)
{
    const raw = window.localStorage.getItem(key);
    if (raw === null)
        return null;
    try
    {
        return JSON.parse(raw);
    }
    catch (e)
    {
        console.error(`Error: corrupt legacy localStorage "${key}"; ignoring`, e);
        return null;
    }
}

/**
 * Loads profile data and game modifiers from IndexedDB into the in-memory globals. Legacy users
 * still have their data in localStorage: when IndexedDB holds nothing but a legacy entry exists, the
 * legacy copy is read into memory and reported back, and persistStartupChanges moves it across
 * (write to IndexedDB, then drop the localStorage key) once the privacy policy has been accepted.
 * Leaves the globals as null when nothing exists yet; main() initializes the defaults
 * @returns { Promise<{ cardData: boolean, gameModifiers: boolean }> } - Which values came from legacy
 *          localStorage and still need moving into IndexedDB
 */
async function loadProfileData()
{
    window.profileData = await idbGet(window.CARD_DATA_KEY);
    window.gameModifiers = await idbGet(window.GAME_MODIFIERS_KEY);

    const legacy = { cardData: false, gameModifiers: false };
    if (window.profileData === null)
    {
        const parsed = parseLegacyJSON("cardData");
        if (parsed !== null && typeof parsed === "object")
        {
            window.profileData = parsed;
            legacy.cardData = true;
        }
    }
    if (window.gameModifiers === null)
    {
        const parsed = parseLegacyJSON("gameModifiers");
        if (parsed !== null && typeof parsed === "object")
        {
            window.gameModifiers = parsed;
            legacy.gameModifiers = true;
        }
    }
    return legacy;
}

/**
 * Writes the repairs main() made to the profile at startup (defaults for a first visit, field
 * migrations, the legacy localStorage move). They are held in memory until the privacy policy has
 * been accepted, because nothing may be stored before. Best-effort: a failed write is logged by
 * saveProfileData and simply retried on the next load, and a legacy localStorage copy is only
 * dropped once its IndexedDB write has committed
 * @param { { cardData: boolean, gameModifiers: boolean } } legacy - What loadProfileData read from localStorage
 * @param { boolean } bProfileChanged - Whether the profile needs saving
 * @param { boolean } bModifiersChanged - Whether the game modifiers need saving
 */
function persistStartupChanges(legacy, bProfileChanged, bModifiersChanged)
{
    if (bProfileChanged)
    {
        saveProfileData(window.profileData).then(() => {
            if (legacy.cardData)
                window.localStorage.removeItem("cardData");
        }).catch(() => {});
    }
    if (bModifiersChanged)
    {
        saveGameModifiers().then(() => {
            if (legacy.gameModifiers)
                window.localStorage.removeItem("gameModifiers");
        }).catch(() => {});
    }
}

// Startup is split across two readiness signals so a page can render everything that only needs the
// profile before the (potentially large) character database has finished loading:
//   - profileReady resolves once window.profileData / window.gameModifiers are populated and the
//     page chrome is set up. The deck shells and the daily-streak logic wait on this and run at once.
//   - charDataReady resolves once window.characterData holds the stroke database. Anything that
//     draws characters (hanzi-writer instances) waits on this.
// storageReady stays the "everything is ready" signal (it is main() itself) for the page scripts
// that need character data up front
let resolveProfileReady;
let resolveCharDataReady;
window.profileReady = new Promise((resolve) => { resolveProfileReady = resolve; });
window.charDataReady = new Promise((resolve) => { resolveCharDataReady = resolve; });

/**
 * Whether the current page actually draws characters and therefore needs the (large) stroke database
 * in memory. Only the main practice page, the deck and the card/phrase editor instantiate writers; the
 * marketplace, account and 404 pages never do, so loading the whole database there only wastes memory
 * and startup time. Detection is by URL (see pageNameFromPath) so it doesn't depend on script load
 * timing
 * @returns { boolean } - True on index/deck/deck-edit-card, false everywhere else
 */
function pageNeedsCharacterData()
{
    const page = pageNameFromPath(location.pathname);
    return page === "index" || page === "deck" || page === "deck-edit-card";
}

/**
 * First-visit gate for the onboarding tutorial (see scripts/components/tutorial.js). Runs before the
 * character-database download so a brand-new visitor who landed on a non-home page is sent to the landing
 * page before any chunks are fetched. Returns true when it has triggered a redirect (the caller should stop
 * further initialization), false otherwise.
 */
function maybeStartTutorial()
{
    // The privacy policy and the licenses are legal text that has to stay readable before anything
    // else: the consent modal opens the policy in a new tab, and redirecting that tab to the landing
    // page would put the same modal back in front of it
    if (onPrivacyPolicyPage())
        return false;

    // Already finished/skipped, or a run is in progress (tutorial.js handles in-progress steps and replay).
    if (window.localStorage.getItem("tutorialDone") === "true")
        return false;
    if (window.localStorage.getItem("tutorialStep") !== null)
        return false;

    // Users who predate the tutorial already have content — don't drag them into onboarding; mark it done.
    const p = window.profileData;
    const hasContent = (p.cards && p.cards.length) || (p.phrases && p.phrases.length) || p.sessions > 0;
    if (hasContent)
    {
        window.localStorage.setItem("tutorialDone", "true");
        return false;
    }

    // Brand-new, empty profile with no tutorial yet. The tutorial begins on the landing page (so the intro
    // modal can draw over the character-database download bar); route first-timers there first.
    if (pageNameFromPath(location.pathname) !== "index")
    {
        location.href = window.pageUrl("index");
        return true;
    }

    window.localStorage.setItem("tutorialMode", "first");
    window.localStorage.setItem("tutorialStep", "intro");
    return false;
}

async function main()
{
    // Critical browser features are blocked (privacy/lockdown profile). browser-support.js has
    // already shown the blocking overlay; never resolve any readiness promise so every page script
    // stays dormant — no IndexedDB writes, no CDN downloads, no service-worker registration.
    if (window.UNSUPPORTED)
        return new Promise(function () {});

    // Load the profile data once into memory. Missing or partial data (a first visit, or decks
    // from before phrases/levelReduce existed) is initialized in place and recorded in the two flags
    // below; persistStartupChanges writes it back once the privacy policy has been accepted. Page
    // scripts wait on the readiness promises, so the data is ready before they run
    let legacy = { cardData: false, gameModifiers: false };
    try
    {
        legacy = await loadProfileData();
    }
    catch (err)
    {
        // IndexedDB can be unavailable (e.g. some private-browsing modes). Fall back to whatever is
        // still in localStorage (legacy users keep their decks; the migration just never completes)
        // so the app still works this session, even if writes won't persist
        console.error("Error: failed to load profile data from IndexedDB", err);
        // Parse defensively: loadProfileData may have thrown *because* this legacy JSON is corrupt, and
        // re-parsing it raw here would throw again — this time uncaught. parseLegacyJSON degrades a bad
        // entry to null so main() falls through to initializing a fresh profile below.
        window.profileData = parseLegacyJSON("cardData");
        window.gameModifiers = parseLegacyJSON("gameModifiers");
    }

    let bProfileChanged = legacy.cardData;
    let bModifiersChanged = legacy.gameModifiers;

    if (window.profileData === null)
    {
        window.profileData = {
            sessions: 0,
            streak: 0,
            lastDate: 0,
            lastStreakDay: 0,
            lastLevelReduceDay: 0,
            totalTimeInSessions: 0,
            cards: [],
            phrases: [],
            activityByDay: {},
            gems: 0,
            streakFreezes: 0,
            streakGoal: 0,
        };
        bProfileChanged = true;
    }
    else if (!window.profileData["phrases"])
    {
        window.profileData["phrases"] = [];
        bProfileChanged = true;
    }

    // Users from before the daily-streak feature: derive the last play-day once from lastDate in
    // the current timezone
    if (window.profileData["lastStreakDay"] === undefined)
    {
        const last = window.profileData.lastDate;
        window.profileData["lastStreakDay"] = last ? localDayIndex(new Date(last)) : 0;
        bProfileChanged = true;
    }

    // Users from before the activity-calendar feature: start the per-day history empty (no
    // historical play-day data exists to backfill — only aggregate totals were ever stored)
    if (window.profileData["activityByDay"] === undefined)
    {
        window.profileData["activityByDay"] = {};
        bProfileChanged = true;
    }

    // Users from when the currency was still called "points": carry the balance over under its new
    // name and drop the old field, so nobody loses what they earned to a rename
    if (window.profileData["gems"] === undefined && window.profileData["points"] !== undefined)
    {
        window.profileData["gems"] = window.profileData["points"];
        delete window.profileData["points"];
        bProfileChanged = true;
    }

    // Users from before the gem economy: start them at zero rather than retroactively paying out
    // for sessions that predate the feature. A streakGoal of 0 means "never chosen", which is what
    // makes streak-goal.js prompt them for one on their next visit
    if (window.profileData["gems"] === undefined)
    {
        window.profileData["gems"] = 0;
        window.profileData["streakFreezes"] = 0;
        window.profileData["streakGoal"] = 0;
        bProfileChanged = true;
    }

    if (window.gameModifiers === null)
    {
        window.gameModifiers = {
            extensive: false,
            levelReduce: 0
        }
        bModifiersChanged = true;
    }
    else if (window.gameModifiers.levelReduce === null || window.gameModifiers.levelReduce === undefined)
    {
        window.gameModifiers.levelReduce = 0;
        bModifiersChanged = true;
    }

    if (fixLegacyCharacterVariants())
        bProfileChanged = true;

    // A redirect into the user's locale directory is underway. Stop here, exactly as for UNSUPPORTED:
    // carrying on would show the consent modal on a page that is being left and let a later
    // navigation (maybeStartTutorial's, or a page script's) override this one
    if (setLanguage())
        return new Promise(function () {});
    setLanguageBox();
    setThemeBox();
    markCurrentNavLink();
    initEmojiReplacement();

    // Fallback page exit transition for browsers without native Cross-Document View Transitions (like Firefox)
    if (!('pageswap' in window) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    {
        document.addEventListener('click', (event) => {
            // Only take over a plain left-click. Modified clicks (Ctrl/Cmd/Shift/Alt) and middle-clicks
            // open a new tab/window, `download` links save a file, and an already-handled event
            // shouldn't be re-driven — turning any of those into a 200 ms same-tab navigation would
            // silently override what the user asked for.
            if (event.defaultPrevented || event.button !== 0 ||
                event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
                return;

            const anchor = event.target.closest('a');
            if (anchor && anchor.href && anchor.host === location.host &&
                anchor.target !== '_blank' && !anchor.hasAttribute('download'))
            {
                const targetUrl = anchor.href;
                const currentUrlNoHash = location.href.split('#')[0];
                const targetUrlNoHash = targetUrl.split('#')[0];
                if (currentUrlNoHash === targetUrlNoHash || targetUrl.startsWith('javascript:'))
                {
                    return;
                }

                event.preventDefault();
                document.body.classList.add('page-exiting');
                setTimeout(() => {
                    location.href = targetUrl;
                }, 200);
            }
        });
    }

    // Privacy-policy consent gate (see scripts/components/privacy-consent.js). Nothing the policy
    // describes may happen before the user has accepted it, so this sits ahead of the onboarding
    // tutorial, ahead of resolveProfileReady (which is what every page script, the tutorial and the
    // streak-goal prompt wait on) and ahead of the downloads below. Already-consenting visitors and
    // the privacy page itself pass through without a modal
    await awaitPrivacyConsent();
    if (privacyConsentGiven())
        persistStartupChanges(legacy, bProfileChanged, bModifiersChanged);

    // First-visit onboarding gate. On a brand-new visit to a non-landing page this redirects to the landing
    // page, so stop initializing here and let the fresh page load take over (no point downloading the
    // character database for a page we're leaving). Never resolving storageReady also keeps the page
    // scripts that start on it from running, and navigating, on the page being left
    if (maybeStartTutorial())
        return new Promise(function () {});

    // Profile and chrome are ready: pages that only need the profile (deck shells, daily streak) can
    // start now, without waiting for the character database below. setLanguage may have already
    // redirected, in which case this never runs and the fresh page load takes over
    resolveProfileReady();

    // Everything from here on caches or downloads, so it is all behind the consent answer rather than
    // behind the await above: the privacy page is exempt from the modal (the policy has to stay
    // readable) and therefore reaches this point without having answered anything
    if (privacyConsentGiven())
    {
        // Register service worker for PWA support. It transparently caches the character chunks it sees
        // fetched (see sw.js) — the download itself is driven here on the page thread. Registration
        // waits for the load event so it doesn't compete with the page's own requests, but by the time
        // this runs (after the IndexedDB read and, on a first visit, the consent modal) load has
        // usually fired already, and a listener added then would never run
        if ('serviceWorker' in navigator)
        {
            const registerServiceWorker = () => {
                navigator.serviceWorker.register('/sw.js')
                    .catch(err => console.error('Service Worker registration failed:', err));
            };
            if (document.readyState === "complete")
                registerServiceWorker();
            else
                window.addEventListener('load', registerServiceWorker, { once: true });
        }

        // Bring the character stroke database into memory, but only on the pages that actually draw
        // characters (see pageNeedsCharacterData). A first visit downloads every chunk behind a blocking
        // modal (awaited, so character data is ready before charDataReady resolves); later visits
        // load the cached copy instantly and reconcile changed chunks in the background
        if (pageNeedsCharacterData())
        {
            try
            {
                const localCharManifest = await loadCharacterDataFromIDB();
                if (localCharManifest === null)
                    await firstTimeDownload();
                else
                    backgroundUpdate(localCharManifest);
            }
            finally
            {
                // Always signal readiness, even if loading failed — writers then simply render nothing (as
                // they did when a per-character fetch 404'd) instead of consumers waiting on this forever
                resolveCharDataReady();
            }
        }
    }

    // Pages that never instantiate a writer (and the privacy page, which skipped the block above
    // entirely) never loaded the database. Resolve anyway so any incidental consumer of charDataReady
    // — and storageReady, which is main() itself — doesn't hang waiting on data that isn't coming.
    // Re-resolving an already-settled promise is a no-op, so the path above needs no guard here
    resolveCharDataReady();
}

// Loading profile data from IndexedDB is asynchronous, so page scripts must wait for this promise
// before touching window.profileData / window.gameModifiers. They do so via window.storageReady.
//
// main() is NOT started here. It is kicked off by bootstrap(), which the per-page bundle calls at
// the point the shared footer used to sit: after the page's own definitions (character-database.js,
// the tutorial stage functions) that main()'s async continuations reach for, and before the page
// scripts that read window.storageReady at their top level. Before bundling, that ordering was
// bought by splitting those files around the footer's <script> tags and relying on microtasks
// draining between them; inside a single bundle there is no such gap.
window.bootstrap = function ()
{
    if (window.storageReady === undefined)
        window.storageReady = main();
    return window.storageReady;
};
