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
 * Given an element, an event and a function to execute, tracks the given event and executes the provided callback
 * function when the animation or transition on the given element has finished playing
 * @param { HTMLElement } element - Element on which to track the event
 * @param { string } event - Event type, like "click"
 * @param { function } f - Function to run after animation
 */
function runEventAfterAnimation(element, event, f)
{
    element.bWaitForAnimation = false;
    element.addEventListener(event, (e) => {
        e.target.bWaitForAnimation = true;
    });

    const func = (e) => {
        if (e.target.bWaitForAnimation)
        {
            e.target.bWaitForAnimation = false;
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
    return idbPut(window.CARD_DATA_KEY, obj).catch((err) => {
        // Log, then re-reject. Resolving on failure made callers that navigate/reload in .then()
        // proceed as if the write had committed, silently dropping the user's import or edit. By
        // rejecting, a navigate-after-save chain simply doesn't fire, keeping the user on the page
        // with their data intact. Fire-and-forget callers should .catch() this (see main() below).
        console.error("Error: failed to save profile data", err);
        throw err;
    });
}

/**
 * Persists the game modifiers to IndexedDB
 * @returns { Promise<void> } - Resolves once the write commits
 */
function saveGameModifiers()
{
    return idbPut(window.GAME_MODIFIERS_KEY, window.gameModifiers).catch((err) => {
        // Re-reject for the same reason as saveProfileData: a resolved-on-failure promise let
        // callers act as though the modifier write had persisted when it hadn't.
        console.error("Error: failed to save game modifiers", err);
        throw err;
    });
}

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



// Some legacy users may be lacking variants as part of their character card objects, so this function fixes this
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
    // Persist once so the migration actually sticks; without this it silently recomputes every load
    // (and on a read-only page that never otherwise saves, it never lands at all). Best-effort.
    if (changed)
        saveProfileData(window.profileData).catch(() => {});
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
 * still have their data in localStorage — the first time we find nothing in IndexedDB but a legacy
 * entry in localStorage, we move it across (write to IndexedDB, then drop the localStorage key) so
 * subsequent visits read straight from IndexedDB. Leaves the globals as null when nothing exists
 * yet; main() initializes the defaults
 * @returns { Promise<void> } - Resolves once both globals are populated from storage
 */
async function loadProfileData()
{
    let cardData = await idbGet(window.CARD_DATA_KEY);
    let modifiers = await idbGet(window.GAME_MODIFIERS_KEY);

    // One-time migration of legacy localStorage users to IndexedDB
    if (cardData === null)
    {
        const legacy = window.localStorage.getItem("cardData");
        if (legacy !== null)
        {
            cardData = JSON.parse(legacy);
            await idbPut(window.CARD_DATA_KEY, cardData);
            window.localStorage.removeItem("cardData");
        }
    }
    if (modifiers === null)
    {
        const legacy = window.localStorage.getItem("gameModifiers");
        if (legacy !== null)
        {
            modifiers = JSON.parse(legacy);
            await idbPut(window.GAME_MODIFIERS_KEY, modifiers);
            window.localStorage.removeItem("gameModifiers");
        }
    }

    window.profileData = cardData;
    window.gameModifiers = modifiers;
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
 * and startup time. Detection is by URL so it doesn't depend on script load timing: directory roots
 * ("/", "/<locale>/") serve the index/main page, and the remaining pages are matched by their last
 * path segment, with or without the .html the CI strips
 * @returns { boolean } - True on index/deck/deck-edit-card, false everywhere else
 */
function pageNeedsCharacterData()
{
    const path = location.pathname;
    // A directory root serves index.html (the main practice page), which renders characters
    if (path.endsWith("/"))
        return true;
    const last = path.substring(path.lastIndexOf("/") + 1).replace(/\.html$/, "");
    return last === "index" || last === "deck" || last === "deck-edit-card";
}

/**
 * First-visit gate for the onboarding tutorial (see scripts/components/tutorial.js). Runs before the
 * character-database download so a brand-new visitor who landed on a non-home page is sent to the landing
 * page before any chunks are fetched. Returns true when it has triggered a redirect (the caller should stop
 * further initialization), false otherwise.
 */
function maybeStartTutorial()
{
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
    const path = location.pathname;
    const onLanding = path.endsWith("/") ||
        path.substring(path.lastIndexOf("/") + 1).replace(/\.html$/, "") === "index";
    if (!onLanding)
    {
        location.href = "./index.html";
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
    // from before phrases/levelReduce existed) is initialized in place and saved back — page
    // scripts wait on window.storageReady, so the data is ready before they run
    try
    {
        await loadProfileData();
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
        }
        // Best-effort init writes: nothing awaits these, and saveProfileData now rejects on failure,
        // so swallow it here to avoid an unhandled rejection (the failure is already logged inside).
        saveProfileData(window.profileData).catch(() => {});
    }
    else if (!window.profileData["phrases"])
    {
        window.profileData["phrases"] = [];
        saveProfileData(window.profileData).catch(() => {});
    }

    // Users from before the daily-streak feature: derive the last play-day once from lastDate in
    // the current timezone. daily-streak.js loads after this file, so its localDayIndex helper is
    // not available yet — the formula is inlined here (keep the two in sync)
    if (window.profileData["lastStreakDay"] === undefined)
    {
        const last = window.profileData.lastDate;
        const d = new Date(last);
        window.profileData["lastStreakDay"] = last !== 0
            ? Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
            : 0;
        saveProfileData(window.profileData).catch(() => {});
    }

    // Users from before the activity-calendar feature: start the per-day history empty (no
    // historical play-day data exists to backfill — only aggregate totals were ever stored)
    if (window.profileData["activityByDay"] === undefined)
    {
        window.profileData["activityByDay"] = {};
        saveProfileData(window.profileData).catch(() => {});
    }

    // Users from when the currency was still called "points": carry the balance over under its new
    // name and drop the old field, so nobody loses what they earned to a rename
    if (window.profileData["gems"] === undefined && window.profileData["points"] !== undefined)
    {
        window.profileData["gems"] = window.profileData["points"];
        delete window.profileData["points"];
        saveProfileData(window.profileData).catch(() => {});
    }

    // Users from before the gem economy: start them at zero rather than retroactively paying out
    // for sessions that predate the feature. A streakGoal of 0 means "never chosen", which is what
    // makes streak-goal.js prompt them for one on their next visit
    if (window.profileData["gems"] === undefined)
    {
        window.profileData["gems"] = 0;
        window.profileData["streakFreezes"] = 0;
        window.profileData["streakGoal"] = 0;
        saveProfileData(window.profileData).catch(() => {});
    }

    if (window.gameModifiers === null)
    {
        window.gameModifiers = {
            extensive: false,
            levelReduce: 0
        }
        saveGameModifiers().catch(() => {});
    }
    else if (window.gameModifiers.levelReduce === null || window.gameModifiers.levelReduce === undefined)
    {
        window.gameModifiers.levelReduce = 0;
        saveGameModifiers().catch(() => {});
    }

    fixLegacyCharacterVariants();

    setLanguage();
    setLanguageBox();
    setThemeBox();
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

    // First-visit onboarding gate. On a brand-new visit to a non-landing page this redirects to the landing
    // page, so stop initializing here and let the fresh page load take over (no point downloading the
    // character database for a page we're leaving)
    if (maybeStartTutorial())
        return;

    // Profile and chrome are ready: pages that only need the profile (deck shells, daily streak) can
    // start now, without waiting for the character database below. setLanguage may have already
    // redirected, in which case this never runs and the fresh page load takes over
    resolveProfileReady();

    // Register service worker for PWA support. It transparently caches the character chunks it sees
    // fetched (see sw.js) — the download itself is driven here on the page thread
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('Service Worker registered successfully with scope:', reg.scope);
                })
                .catch(err => {
                    console.error('Service Worker registration failed:', err);
                });
        });
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
    else
    {
        // This page never instantiates a writer, so the database was never loaded. Resolve anyway so
        // any incidental consumer of charDataReady (and storageReady, which is main()
        // itself) doesn't hang waiting on data that isn't coming
        resolveCharDataReady();
    }
}

// Loading profile data from IndexedDB is asynchronous, so page scripts must wait for this promise
// before touching window.profileData / window.gameModifiers. They do so via window.storageReady
window.storageReady = main();
