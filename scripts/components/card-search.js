'use strict';
// Shared search helpers used by the deck and marketplace search bars. The filtering *strategy* differs
// per page — the deck rebuilds its virtualized lists from the matching data, the marketplace toggles
// already-rendered cards — but the query normalisation, multi-field matching, the results fade-in
// animation, and the debounced input wiring are common and live here. The low-level subsequence
// matcher itself is fuzzyMatch (scripts/utils/fuzzy-match.js).

// How long the search results fade-in runs (ms). Kept short so filtering feels responsive
const SEARCH_RESULT_ANIM_MS = 180;
// Default debounce window (ms) for a search input, so fast typing doesn't refilter on every keystroke
const SEARCH_INPUT_DEBOUNCE_MS = 120;

/**
 * Normalises a raw search-box value for matching: trimmed and lower-cased. fuzzyMatch expects its
 * inputs already lower-cased, so every page runs its query through this first.
 * @param { string } raw - The raw value of the search box
 * @returns { string } - The normalised query
 */
function normaliseSearchQuery(raw)
{
    return raw.trim().toLowerCase();
}

/**
 * Generic multi-field fuzzy match: returns true when the (already-normalised) query fuzzily matches any
 * one of the provided field strings. Fields are tested individually rather than concatenated, so a
 * subsequence can't span a field boundary and cause a surprising match. Nullish/empty fields are
 * skipped, and an empty query matches everything. This is what lets a page "search based on different
 * parameters": the caller decides which fields each item contributes.
 * @param { string } query - Normalised search text (see normaliseSearchQuery)
 * @param { Array<string|undefined|null> } fields - The item's searchable strings
 * @returns { boolean }
 */
function searchMatchesFields(query, fields)
{
    if (query === "")
        return true;

    for (const field of fields)
        if (field && fuzzyMatch(query, field.toLowerCase()))
            return true;
    return false;
}

/**
 * Plays the shared "results changed" fade-in on each container. Animating the container rather than
 * each card keeps it cheap and virtualization-safe — children rendered lazily after the call (as on the
 * deck page) still inherit the fade. Honours prefers-reduced-motion (no-op then).
 * @param { Iterable<HTMLElement> } containers - The grids/sections whose contents changed
 */
function animateSearchResults(containers)
{
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        return;

    for (const container of containers)
        container.animate(
            [{ opacity: 0.4, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
            { duration: SEARCH_RESULT_ANIM_MS, easing: "ease" });
}

/**
 * Wires a search input to a handler, debounced so fast typing refilters only once it settles. The
 * handler receives the raw input value. No-op when the input is absent, so pages can call it
 * unconditionally.
 * @param { string } inputId - id of the search <input>
 * @param { function(string): void } onQuery - Called with the raw value after the debounce settles
 * @param { number } [debounceMs] - Debounce window; defaults to SEARCH_INPUT_DEBOUNCE_MS
 */
function wireSearchInput(inputId, onQuery, debounceMs = SEARCH_INPUT_DEBOUNCE_MS)
{
    const input = $(inputId);
    if (input === null)
        return;

    let timer = null;
    input.addEventListener("input", (e) => {
        const value = e.target.value;
        clearTimeout(timer);
        timer = setTimeout(() => onQuery(value), debounceMs);
    });
}
