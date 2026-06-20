'use strict';
// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_KNOWLEDGE_LEVEL = 4;

window.HOUR_UNIX = 3600000;
window.MINUTE_UNIX = 60000;
window.SECOND_UNIX = 1000;
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
window.YOUYIN_DB_NAME = "youyin";
window.YOUYIN_DB_VERSION = 1;
window.YOUYIN_DB_STORE = "profile";
window.YOUYIN_CARD_DATA_KEY = "youyinCardData";
window.YOUYIN_GAME_MODIFIERS_KEY = "youyinGameModifiers";

// Cached open-connection promise so we only open the database once per page
let youyinDBPromise = null;

/**
 * Opens (and lazily creates) the Youyin IndexedDB database, caching the connection promise
 * @returns { Promise<IDBDatabase> } - The open database connection
 */
function openYouyinDB()
{
    if (youyinDBPromise === null)
    {
        youyinDBPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(window.YOUYIN_DB_NAME, window.YOUYIN_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(window.YOUYIN_DB_STORE))
                    db.createObjectStore(window.YOUYIN_DB_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return youyinDBPromise;
}

/**
 * Reads a value from the profile store by key
 * @param { string } key - The key to read
 * @returns { Promise<*> } - The stored value, or null when nothing is stored under the key
 */
function idbGet(key)
{
    return openYouyinDB().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(window.YOUYIN_DB_STORE, "readonly");
        const request = transaction.objectStore(window.YOUYIN_DB_STORE).get(key);
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
    return openYouyinDB().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(window.YOUYIN_DB_STORE, "readwrite");
        transaction.objectStore(window.YOUYIN_DB_STORE).put(value, key);
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
    return openYouyinDB().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(window.YOUYIN_DB_STORE, "readwrite");
        transaction.objectStore(window.YOUYIN_DB_STORE).delete(key);
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
    return idbPut(window.YOUYIN_CARD_DATA_KEY, obj).catch((err) => {
        console.error("Youyin: failed to save profile data", err);
    });
}

/**
 * Persists the game modifiers to IndexedDB
 * @returns { Promise<void> } - Resolves once the write commits
 */
function saveGameModifiers()
{
    return idbPut(window.YOUYIN_GAME_MODIFIERS_KEY, window.gameModifiers).catch((err) => {
        console.error("Youyin: failed to save game modifiers", err);
    });
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

// Returns void, sets the name of the title
function setTitleName()
{
    const el = document.getElementsByClassName("site-title");

    // Cool array of quirky names for the website title because who needs to be serious
    const names = [ "Youyin 卣囙", "Youyin 诱因", "Youyin 油印", "Yǒuyīn 　　", "Youyin  ඞඞ",
    ];

    const selectedText = names[Math.floor(Math.random() * names.length)];

    for (let i = 0; i < el.length; i++)
        el[i].textContent = selectedText;
}

// Some legacy users may be lacking variants as part of their character card objects, so this function fixes this
function fixLegacyCharacterVariants()
{
    for (let card of window.profileData.cards)
    {
        if (!card["variant"])
        {
            // Split by code point — charAt(0)/substring(1) count UTF-16 units and would cut a
            // character outside the BMP in half, corrupting both the character and the variant
            const firstChar = toCharacters(card.character)[0] || "";
            card["variant"] = card.character.slice(firstChar.length);
            card["character"] = firstChar;
        }
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
    let cardData = await idbGet(window.YOUYIN_CARD_DATA_KEY);
    let modifiers = await idbGet(window.YOUYIN_GAME_MODIFIERS_KEY);

    // One-time migration of legacy localStorage users to IndexedDB
    if (cardData === null)
    {
        const legacy = window.localStorage.getItem("youyinCardData");
        if (legacy !== null)
        {
            cardData = JSON.parse(legacy);
            await idbPut(window.YOUYIN_CARD_DATA_KEY, cardData);
            window.localStorage.removeItem("youyinCardData");
        }
    }
    if (modifiers === null)
    {
        const legacy = window.localStorage.getItem("youyinGameModifiers");
        if (legacy !== null)
        {
            modifiers = JSON.parse(legacy);
            await idbPut(window.YOUYIN_GAME_MODIFIERS_KEY, modifiers);
            window.localStorage.removeItem("youyinGameModifiers");
        }
    }

    window.profileData = cardData;
    window.gameModifiers = modifiers;
}

// Startup is split across two readiness signals so a page can render everything that only needs the
// profile before the (potentially large) character database has finished loading:
//   - youyinProfileReady resolves once window.profileData / window.gameModifiers are populated and the
//     page chrome is set up. The deck shells and the daily-streak logic wait on this and run at once.
//   - youyinCharDataReady resolves once window.characterData holds the stroke database. Anything that
//     draws characters (hanzi-writer instances) waits on this.
// youyinStorageReady stays the "everything is ready" signal (it is main() itself) for the page scripts
// that need character data up front
let resolveProfileReady;
let resolveCharDataReady;
window.youyinProfileReady = new Promise((resolve) => { resolveProfileReady = resolve; });
window.youyinCharDataReady = new Promise((resolve) => { resolveCharDataReady = resolve; });

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

async function main()
{
    // Load the profile data once into memory. Missing or partial data (a first visit, or decks
    // from before phrases/levelReduce existed) is initialized in place and saved back — page
    // scripts wait on window.youyinStorageReady, so the data is ready before they run
    try
    {
        await loadProfileData();
    }
    catch (err)
    {
        // IndexedDB can be unavailable (e.g. some private-browsing modes). Fall back to whatever is
        // still in localStorage (legacy users keep their decks; the migration just never completes)
        // so the app still works this session, even if writes won't persist
        console.error("Youyin: failed to load profile data from IndexedDB", err);
        const legacyCardData = window.localStorage.getItem("youyinCardData");
        const legacyModifiers = window.localStorage.getItem("youyinGameModifiers");
        window.profileData = legacyCardData !== null ? JSON.parse(legacyCardData) : null;
        window.gameModifiers = legacyModifiers !== null ? JSON.parse(legacyModifiers) : null;
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
        }
        saveProfileData(window.profileData);
    }
    else if (!window.profileData["phrases"])
    {
        window.profileData["phrases"] = [];
        saveProfileData(window.profileData);
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
        saveProfileData(window.profileData);
    }

    if (window.gameModifiers === null)
    {
        window.gameModifiers = {
            extensive: false,
            levelReduce: 0
        }
        saveGameModifiers();
    }
    else if (window.gameModifiers.levelReduce === null || window.gameModifiers.levelReduce === undefined)
    {
        window.gameModifiers.levelReduce = 0;
        saveGameModifiers();
    }

    fixLegacyCharacterVariants();

    setTitleName();
    setLanguage();
    setLanguageBox();
    setThemeBox();
    initEmojiReplacement();

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
                    console.log('Youyin Service Worker registered successfully with scope:', reg.scope);
                })
                .catch(err => {
                    console.error('Youyin Service Worker registration failed:', err);
                });
        });
    }

    // Bring the character stroke database into memory, but only on the pages that actually draw
    // characters (see pageNeedsCharacterData). A first visit downloads every chunk behind a blocking
    // modal (awaited, so character data is ready before youyinCharDataReady resolves); later visits
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
        // any incidental consumer of youyinCharDataReady (and youyinStorageReady, which is main()
        // itself) doesn't hang waiting on data that isn't coming
        resolveCharDataReady();
    }
}

// Loading profile data from IndexedDB is asynchronous, so page scripts must wait for this promise
// before touching window.profileData / window.gameModifiers. They do so via window.youyinStorageReady
window.youyinStorageReady = main();
