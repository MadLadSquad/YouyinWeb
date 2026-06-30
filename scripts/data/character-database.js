'use strict';
// ----------------------------- Character database storage layer -------------------------------
// The character stroke database is downloaded once (all chunks), cached per-chunk in IndexedDB, and
// held in memory in window.characterData. On every later visit the in-memory copy is rebuilt from
// IndexedDB and a background task diffs the upstream manifest against the stored one, re-downloading
// only the chunks whose content hash changed.
//
// This file is loaded only on the pages that actually draw characters (index/deck/deck-edit-card —
// see pageNeedsCharacterData in index.js); the IndexedDB helpers (idbGet/idbPut/idbDelete) and the
// loading UI (showCharLoadOverlay / showCharUpdatePill and their update/hide helpers) it relies on
// are globals defined in index.js and char-loading-ui.js, both loaded before this file via the footer

// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
// The character stroke database is shipped as numbered chunks. The manifest lists the chunk count
// and a per-chunk content hash so we can re-download only the chunks that actually changed. Both the
// manifest and the bulky chunks come from jsDelivr (cacheable, fast)
window.CHARACTER_MANIFEST_URL = "{{ char_data_url }}/character-map-chunks.json";
window.CHARACTER_CHUNK_URL_BASE = "{{ char_data_url }}/character-map-chunks/character-map-full-";
// Chunks are fetched in batches with a cooldown between batches so we don't hammer the CDN
window.CHARACTER_CHUNK_BATCH_SIZE = 5;
window.CHARACTER_CHUNK_COOLDOWN_MS = 300;
// Each manifest/chunk fetch is retried a few times. This rides out transient failures, most notably
// the brief window when a freshly-installed service worker activates and takes over mid-download —
// the outgoing worker aborts the requests it was handling, which would otherwise fail the download
window.CHARACTER_FETCH_RETRIES = 4;
window.CHARACTER_FETCH_RETRY_DELAY_MS = 600;
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

// In-memory copy of the entire character stroke database, keyed by character (including the regional
// variant postfix, e.g. "漢-jp"), mapping to the hanzi-writer content object. Populated once at
// startup from IndexedDB (see loadCharacterDataFromIDB) and kept fresh by backgroundUpdate().
// charDataLoader (writer.js) reads straight from this map — there is no per-character network fetch
window.characterData = {};

// The character database lives in the same IndexedDB store as the profile: one manifest entry plus
// one entry per chunk. Per chunk storage lets background updates replace only the chunks that changed
// and rebuild the in-memory map cleanly (so characters that move between or drop out of chunks are
// handled)
window.CHAR_MANIFEST_KEY = "CharManifest";
window.CHAR_CHUNK_PREFIX = "CharChunk:";

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
    const manifest = await idbGet(window.CHAR_MANIFEST_KEY);
    if (manifest === null)
        return null;

    // Read every chunk concurrently rather than awaiting them one at a time: the reads are independent
    // IndexedDB gets, so serializing them paid one round-trip per chunk and dominated startup on large
    // databases. Each chunk holds a disjoint set of characters, so merge order doesn't matter
    const chunks = await Promise.all(
        Array.from({ length: manifest.num }, (_, i) => idbGet(window.CHAR_CHUNK_PREFIX + i)));

    const data = {};
    for (const chunk of chunks)
        if (chunk !== null)
            Object.assign(data, chunk);
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
        console.warn("Error: could not fetch character manifest", err);
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
            await idbPut(window.CHAR_CHUNK_PREFIX + index, map);
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
        console.error("Error: character database unavailable on first load");
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
        await idbPut(window.CHAR_MANIFEST_KEY, manifest);
    }
    catch (err)
    {
        console.error("Error: character database download failed", err);
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
            await idbDelete(window.CHAR_CHUNK_PREFIX + index);
        await idbPut(window.CHAR_MANIFEST_KEY, upstream);
        // Rebuild the in-memory map from the updated chunks so removed characters and characters that
        // moved between chunks are reflected, not just the newly downloaded ones
        await loadCharacterDataFromIDB();
    }
    catch (err)
    {
        console.error("Error: background character update failed", err);
    }
    finally
    {
        hideCharUpdatePill(pill);
    }
}
