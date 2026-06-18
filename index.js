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

// The character stroke database is shipped as numbered chunks. The manifest lists the chunk count
// and a per-chunk content hash so we can re-download only the chunks that actually changed. The
// manifest is read from raw.githubusercontent (always fresh — jsDelivr edge-caches too long for
// reliable change detection); the bulky chunks come from jsDelivr (cacheable, fast)
window.CHARACTER_MANIFEST_URL = "https://raw.githubusercontent.com/MadLadSquad/hanzi-writer-data-youyin/master/character-map-chunks.json";
window.CHARACTER_CHUNK_URL_BASE = "https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/character-map-chunks/character-map-full-";
// Chunks are fetched in batches with a cooldown between batches so we don't hammer the CDN
window.CHARACTER_CHUNK_BATCH_SIZE = 5;
window.CHARACTER_CHUNK_COOLDOWN_MS = 300;
// Each manifest/chunk fetch is retried a few times. This rides out transient failures, most notably
// the brief window when a freshly-installed service worker activates and takes over mid-download —
// the outgoing worker aborts the requests it was handling, which would otherwise fail the download
window.CHARACTER_FETCH_RETRIES = 4;
window.CHARACTER_FETCH_RETRY_DELAY_MS = 600;
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

// In-memory copy of the user's profile data. It is loaded from IndexedDB once at startup (see
// main()) and every synchronous read across the page scripts goes through this object — only the
// initial load and the saveProfileData/saveGameModifiers writes touch IndexedDB
window.profileData = null;
window.gameModifiers = null;

// In-memory copy of the entire character stroke database, keyed by character (including the regional
// variant postfix, e.g. "漢-jp"), mapping to the hanzi-writer content object. Populated once at
// startup from IndexedDB (see loadCharacterDataFromIDB) and kept fresh by backgroundUpdate().
// charDataLoader reads straight from this map — there is no per-character network fetch anymore
window.characterData = {};

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
// The character database lives in the same store: one manifest entry plus one entry per chunk. Per
// chunk storage lets background updates replace only the chunks that changed and rebuild the
// in-memory map cleanly (so characters that move between or drop out of chunks are handled)
window.YOUYIN_CHAR_MANIFEST_KEY = "youyinCharManifest";
window.YOUYIN_CHAR_CHUNK_PREFIX = "youyinCharChunk:";

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

// hanzi-writer's data loader. The whole character database is already in memory (downloaded once and
// cached in IndexedDB — see the character store section below), so this is a synchronous map lookup.
// Returns undefined for a character that isn't in the database, which hanzi-writer handles the same
// way it used to handle a 404 from the old per-character fetch
function charDataLoader(character, _, __)
{
    return window.characterData[character];
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

// ----------------------------- Character database storage layer -------------------------------
// The character stroke database is downloaded once (all chunks), cached per-chunk in IndexedDB, and
// held in memory in window.characterData. On every later visit the in-memory copy is rebuilt from
// IndexedDB and a background task diffs the upstream manifest against the stored one, re-downloading
// only the chunks whose content hash changed

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Converts a downloaded chunk array into a { charKey: content } map for cheap merging
 * @param { Array<{ char: string, content: Object }> } arr - The chunk exactly as downloaded
 * @returns { Object<string, Object> } - Map from character key to its hanzi-writer content
 */
function chunkArrayToMap(arr)
{
    const map = {};
    for (let i = 0; i < arr.length; i++)
        map[arr[i].char] = arr[i].content;
    return map;
}

/**
 * Loads the stored character database from IndexedDB into window.characterData. Builds a fresh object
 * and swaps it in atomically so the map is never momentarily empty (a writer rendering mid-load would
 * otherwise see undefined)
 * @returns { Promise<Object|null> } - The stored manifest, or null when nothing has been downloaded
 */
async function loadCharacterDataFromIDB()
{
    const manifest = await idbGet(window.YOUYIN_CHAR_MANIFEST_KEY);
    if (manifest === null)
        return null;

    const data = {};
    for (let i = 0; i < manifest.num; i++)
    {
        const chunk = await idbGet(window.YOUYIN_CHAR_CHUNK_PREFIX + i);
        if (chunk !== null)
            Object.assign(data, chunk);
    }
    window.characterData = data;
    return manifest;
}

/**
 * Fetches a URL, retrying a few times with a delay between attempts to ride out transient failures
 * (see CHARACTER_FETCH_RETRIES). Throws the last error if every attempt fails
 * @param { string } url - The URL to fetch
 * @param { Object } [options] - fetch() options
 * @returns { Promise<Response> } - The successful (ok) response
 */
async function fetchWithRetry(url, options)
{
    let lastErr = null;
    for (let attempt = 0; attempt < window.CHARACTER_FETCH_RETRIES; attempt++)
    {
        try
        {
            const response = await fetch(url, options);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            return response;
        }
        catch (err)
        {
            lastErr = err;
            if (attempt < window.CHARACTER_FETCH_RETRIES - 1)
                await sleep(window.CHARACTER_FETCH_RETRY_DELAY_MS);
        }
    }
    throw lastErr;
}

/**
 * Fetches the upstream chunk manifest { num, version: [...] }
 * @returns { Promise<Object|null> } - The manifest, or null if it couldn't be fetched/parsed
 */
async function fetchUpstreamManifest()
{
    try
    {
        const response = await fetchWithRetry(window.CHARACTER_MANIFEST_URL, { cache: "no-store" });
        return await response.json();
    }
    catch (err)
    {
        console.warn("Youyin: could not fetch character manifest", err);
        return null;
    }
}

/**
 * Downloads the given chunk indices in throttled batches, persisting each to IndexedDB and merging it
 * into window.characterData. Reports progress after every chunk completes
 * @param { number[] } indices - Chunk indices to download
 * @param { function(number, number): void } onProgress - Called with (completed, total)
 * @returns { Promise<void> } - Resolves once every requested chunk is stored and merged
 */
async function downloadChunks(indices, onProgress)
{
    const total = indices.length;
    let done = 0;
    for (let i = 0; i < indices.length; i += window.CHARACTER_CHUNK_BATCH_SIZE)
    {
        const batch = indices.slice(i, i + window.CHARACTER_CHUNK_BATCH_SIZE);
        await Promise.all(batch.map(async (index) => {
            const response = await fetchWithRetry(`${window.CHARACTER_CHUNK_URL_BASE}${index}.json`);
            const map = chunkArrayToMap(await response.json());
            await idbPut(window.YOUYIN_CHAR_CHUNK_PREFIX + index, map);
            Object.assign(window.characterData, map);
            done++;
            if (onProgress)
                onProgress(done, total);
        }));
        // Cooldown between batches so we don't overload the CDN (no need after the last batch)
        if (i + window.CHARACTER_CHUNK_BATCH_SIZE < indices.length)
            await sleep(window.CHARACTER_CHUNK_COOLDOWN_MS);
    }
}

/**
 * First-visit path: downloads the entire character database behind a blocking progress modal and
 * stores it (chunks + manifest) in IndexedDB
 * @returns { Promise<void> } - Resolves once the database is in memory (or the download failed)
 */
async function firstTimeDownload()
{
    const manifest = await fetchUpstreamManifest();
    if (manifest === null)
    {
        // Offline / unreachable on a first visit: nothing to load. The app still runs, writers just
        // render nothing until a later visit succeeds
        console.error("Youyin: character database unavailable on first load");
        return;
    }

    const overlay = showCharLoadOverlay();
    try
    {
        const indices = [];
        for (let i = 0; i < manifest.num; i++)
            indices.push(i);
        await downloadChunks(indices, (done, total) => updateCharLoadOverlay(overlay, done, total));
        // Only record the manifest once every chunk is stored, so an interrupted download is retried
        // wholesale on the next visit rather than being mistaken for a complete database
        await idbPut(window.YOUYIN_CHAR_MANIFEST_KEY, manifest);
    }
    catch (err)
    {
        console.error("Youyin: character database download failed", err);
    }
    finally
    {
        hideCharLoadOverlay(overlay);
    }
}

/**
 * Return-visit path: diffs the upstream manifest against the stored one and re-downloads only the
 * chunks whose content hash changed (plus any new chunks when the count grew, dropping stored chunks
 * when it shrank). Runs unobtrusively in the background and is a no-op when nothing changed
 * @param { Object } localManifest - The manifest currently stored in IndexedDB
 * @returns { Promise<void> } - Resolves once any update has been applied
 */
async function backgroundUpdate(localManifest)
{
    const upstream = await fetchUpstreamManifest();
    if (upstream === null)
        return;

    // Chunks to (re)download: content hash differs, or the chunk is new because the count grew
    const changed = [];
    for (let i = 0; i < upstream.num; i++)
        if (i >= localManifest.num || upstream.version[i] !== localManifest.version[i])
            changed.push(i);

    // Chunks that no longer exist because the count shrank
    const removed = [];
    for (let i = upstream.num; i < localManifest.num; i++)
        removed.push(i);

    if (changed.length === 0 && removed.length === 0)
        return;

    const pill = showCharUpdatePill();
    try
    {
        if (changed.length > 0)
            await downloadChunks(changed, (done, total) => updateCharUpdatePill(pill, done, total));
        for (const index of removed)
            await idbDelete(window.YOUYIN_CHAR_CHUNK_PREFIX + index);
        await idbPut(window.YOUYIN_CHAR_MANIFEST_KEY, upstream);
        // Rebuild the in-memory map from the updated chunks so removed characters and characters that
        // moved between chunks are reflected, not just the newly downloaded ones
        await loadCharacterDataFromIDB();
    }
    catch (err)
    {
        console.error("Youyin: background character update failed", err);
    }
    finally
    {
        hideCharUpdatePill(pill);
    }
}

// The character-database loading UI (showCharLoadOverlay / showCharUpdatePill and their
// update/hide helpers, used above) lives in char-loading-ui.js, loaded before this file

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

    // Bring the character stroke database into memory. A first visit downloads every chunk behind a
    // blocking modal (awaited, so page scripts only run once the data is ready); later visits load
    // the cached copy instantly and reconcile changed chunks in the background without blocking
    const localCharManifest = await loadCharacterDataFromIDB();
    if (localCharManifest === null)
        await firstTimeDownload();
    else
        backgroundUpdate(localCharManifest);
}

// Loading profile data from IndexedDB is asynchronous, so page scripts must wait for this promise
// before touching window.profileData / window.gameModifiers. They do so via window.youyinStorageReady
window.youyinStorageReady = main();
