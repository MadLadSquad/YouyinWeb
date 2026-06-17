'use strict';
// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_KNOWLEDGE_LEVEL = 4;
window.MAX_POINTS_ON_CHARACTER = 0.05;
window.ADD_POINTS_ON_ERROR_3_4 = 0.0375;            // 3/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_2 = 0.025;             // 1/2 or 2/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_4 = 0.0125;            // 1/4 of 0.05

window.CARD_WRITER_SIZE = 100;
// Writer size for the per-character widgets on phrase cards. Sized so the rendered glyph matches a
// normal h1 full-width character (the glyph fills size minus WRITER_PADDING on each side)
window.PHRASE_CARD_WRITER_SIZE = 50;
window.CARD_WRITER_STROKE_ANIMATION_SPEED = 1.25;
window.CARD_WRITER_DELAY_BETWEEN_STROKES = 50;
window.CARD_DEFAULT_CHARACTER = "是"
window.CARD_DEFAULT_PREVIEW_NAME = "Preview Name"

// Hard cap on how many cards and how many phrases may be revised in a single play session. Decks
// larger than this are shuffled and only the first entries are revised, so each session draws a
// random subset of at most this many cards and (separately) this many phrases
window.MAX_SESSION_REVISION_ITEMS = 16;

window.WRITER_PADDING = 5;
// The hanzi-writer colours (WRITER_RADICAL_COLOUR, WRITER_STROKE_COLOUR, WRITER_OUTLINE_COLOUR)
// are owned by theme.js, which runs first (it's in <head>) and sets them from the active theme
window.WRITER_SLEEP_AFTER_COMPLETE = 1200;          // In ms
// How long the completed-character "fly into the progress counter" animation lasts. It is timed to
// land right as the next character loads (after WRITER_SLEEP_AFTER_COMPLETE), so the snapshot sits
// invisibly on top during the admire beat, then flies for the last stretch of the pause
window.WRITER_FLY_TO_COUNTER_DURATION = 650;        // In ms

window.WRITER_SHOW_HINT_ON_ERRORS = 3;
window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3 = 1;

window.HOUR_UNIX = 3600000;
window.MINUTE_UNIX = 60000;
window.SECOND_UNIX = 1000;

window.CHARACTER_FETCH_URL = "https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/";
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
 * Troll jQuery developers. Returns the element with the given id
 * @param {string} x - ID of the element
 * @returns {HTMLElement} - The element in question
 */
function $(x)
{
    return document.getElementById(x);
}

/**
 * Formats a number to 2 decimal places using a dot as the decimal separator.
 * @param { number|string } num - The number to format
 * @returns { string } - Formatted string
 */
function formatDecimal(num)
{
    const parsed = parseFloat(num);
    if (isNaN(parsed))
        return "0.00";
    return parsed.toFixed(2);
}


/**
 * Returns a localised postfix given a time. Also converts time units
 * @param { number } time - in milliseconds
 * @returns { Object<number, string> } - The postfix
 */
function getLocalisedTimePostfix(time)
{
    // I FUCKING HATE NOT HAVING PASS BY REFERENCE IN JAVASCRIPT
    let rt = {
        time: time,
        postfix: lc.milliseconds
    }

    if (time > window.HOUR_UNIX)
    {
        rt.time /= window.HOUR_UNIX;
        rt.postfix = lc.hours;
    }
    else if (time > window.MINUTE_UNIX)
    {
        rt.time /= window.MINUTE_UNIX;
        rt.postfix = lc.minutes;
    }
    else if (time > window.SECOND_UNIX)
    {
        rt.time /= window.SECOND_UNIX;
        rt.postfix = lc.seconds;
    }
    return rt;
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

// This loads characters from the database. Change the URL to your own database.
async function charDataLoader(character, _, __)
{
    let response = await fetch(`${window.CHARACTER_FETCH_URL}${character}.json`)
    if (response.status !== 200)
    {
        console.warn(`Bad response from the character database, this is mainly caused by missing characters. Response code: ${response.status}`);
        return;
    }
    return await response.json();
}

/**
 * Creates a hanzi-writer instance with the site-wide defaults (colours, padding, data loader)
 * @param { string } targetId - ID of the element that hosts the writer
 * @param { string } character - Character (plus optional variant postfix) to render
 * @param { Object } overrides - Per-call hanzi-writer options merged over the defaults
 * @returns { Object } - The writer instance
 */
function createWriter(targetId, character, overrides)
{
    return HanziWriter.create(targetId, character, Object.assign({
        padding: window.WRITER_PADDING,
        strokeColor: window.WRITER_STROKE_COLOUR,
        outlineColor: window.WRITER_OUTLINE_COLOUR,
        radicalColor: window.WRITER_RADICAL_COLOUR,
        charDataLoader: charDataLoader,
    }, overrides));
}

/**
 * Creates the small animated writer used on deck and preview cards
 * @param { string } targetId - ID of the element that hosts the writer
 * @param { string } character - Character (plus optional variant postfix) to render
 * @param { number } size - Width/height in pixels. Defaults to the standard card writer size
 * @returns { Object } - The writer instance
 */
function createCardWriter(targetId, character, size = window.CARD_WRITER_SIZE)
{
    return createWriter(targetId, character, {
        width: size,
        height: size,
        showOutline: true,
        strokeAnimationSpeed: window.CARD_WRITER_STROKE_ANIMATION_SPEED,
        delayBetweenStrokes: window.CARD_WRITER_DELAY_BETWEEN_STROKES,
    });
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

// The standard shuffle algorithm
function fisherYates(array)
{
    let count = array.length,
        randomnumber,
        temp;
    while(count)
    {
        randomnumber = Math.random() * count-- | 0;
        temp = array[count];
        array[count] = array[randomnumber];
        array[randomnumber] = temp
    }
}

// Some legacy users may be lacking variants as part of their character card objects, so this function fixes this
function fixLegacyCharacterVariants()
{
    for (let i in window.profileData.cards)
    {
        let card = window.profileData.cards[i];
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
 * Redirects the user when selecting a new language from the language select box
 * @param { string } localStorageLang - Current language
 * @param { string|null } previous - Previous language
 */
function redirectWithLanguage(localStorageLang, previous)
{
    let url = location.href.split("/");
    // Skip [1] because it will be empty because of the second / in https://
    let redirect = url[0] + "//" + url[2] + "/" + localStorageLang + "/";

    // Move by 1 index if it's not null
    for (let i = previous !== null ? 4 : 3; i < url.length; i++)
        if (url[i] !== "")
            redirect += url[i] + "/";
    
    location.href = redirect.slice(0, -1);
}

// Locales that actually ship with the site — each needs a Translations/<locale>.yaml and gets
// built into its own subdirectory. Keep in sync with sw.js's LOCALES when adding a language
const SUPPORTED_LOCALES = [
    { value: "en_US", text: "🇬🇧   EN" },
    { value: "bg_BG", text: "🇧🇬   BG" },
];

function setLanguage()
{
    let localStorageLang = window.localStorage.getItem("language");

    // Reset to English when nothing is stored, or when the stored locale doesn't ship (the
    // selector used to offer locales without translations) — redirecting to a locale directory
    // that doesn't exist would strand the user on a 404 page
    if (localStorageLang === null || !SUPPORTED_LOCALES.some((l) => l.value === localStorageLang))
    {
        localStorageLang = "en_US";
        window.localStorage.setItem("language", localStorageLang);
    }
    else if (!location.href.includes(localStorageLang))
    {
        redirectWithLanguage(localStorageLang, null);
        return;
    }
    let selectWidget = $("lang-select");
    if (selectWidget)
        selectWidget.value = localStorageLang;
}

function setLanguageBox()
{
    let selectWidget = $("lang-select");
    if (selectWidget === null)
        return;

    let localStorageLang = window.localStorage.getItem("language") || "en_US";

    createCustomSelect(selectWidget, "Language select box", SUPPORTED_LOCALES, localStorageLang, function(newValue) {
        let old = window.localStorage.getItem("language");
        window.localStorage.setItem("language", newValue);
        redirectWithLanguage(newValue, old);
    });
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

    // Register service worker for PWA support
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('Youyin Service Worker registered successfully with scope:', reg.scope);
                    // Notify service worker to check/sync character database
                    if (reg.active) {
                        reg.active.postMessage({ type: 'SYNC_CHARACTERS' });
                    }
                })
                .catch(err => {
                    console.error('Youyin Service Worker registration failed:', err);
                });
        });

        // Listen for sync progress reports from the service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'CHARACTER_SYNC_PROGRESS') {
                console.log(`Character Sync Progress: ${event.data.loaded} / ${event.data.total}`);
            }
        });
    }
}

// Loading profile data from IndexedDB is asynchronous, so page scripts must wait for this promise
// before touching window.profileData / window.gameModifiers. They do so via window.youyinStorageReady
window.youyinStorageReady = main();
