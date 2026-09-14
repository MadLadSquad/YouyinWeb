'use strict';
// Shared fuzzy-search matcher used by the marketplace and deck search bars.

/**
 * Case-insensitive subsequence fuzzy match: returns true when every character of `query` appears in
 * order somewhere within `target`. Both are expected to be lower-cased already. An empty query matches
 * everything.
 * @param { string } query - The search text
 * @param { string } target - The text to test against
 * @returns { boolean }
 */
function fuzzyMatch(query, target)
{
    if (query === "")
        return true;

    let i = 0;
    for (let j = 0; j < target.length && i < query.length; j++)
        if (target[j] === query[i])
            i++;
    return i === query.length;
}
