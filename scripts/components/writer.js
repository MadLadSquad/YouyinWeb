'use strict';
// hanzi-writer factory. Wraps the CDN-loaded HanziWriter with the site-wide defaults and reads stroke
// data straight from the in-memory window.characterData map (populated by character-database.js).
// Loaded only on the pages that draw characters (index/deck/deck-edit-card). HanziWriter (CDN) and the
// theme-owned WRITER_*_COLOUR globals are available by the time these factories are actually called
// (writers are instantiated behind window.youyinCharDataReady)

// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.CARD_WRITER_SIZE = 100;
// Writer size for the per-character widgets on phrase cards. Sized so the rendered glyph matches a
// normal h1 full-width character (the glyph fills size minus WRITER_PADDING on each side)
window.PHRASE_CARD_WRITER_SIZE = 50;
window.CARD_WRITER_STROKE_ANIMATION_SPEED = 1.25;
window.CARD_WRITER_DELAY_BETWEEN_STROKES = 50;

window.WRITER_PADDING = 5;
// The hanzi-writer colours (WRITER_RADICAL_COLOUR, WRITER_STROKE_COLOUR, WRITER_OUTLINE_COLOUR)
// are owned by theme.js, which runs first (it's in <head>) and sets them from the active theme
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

// hanzi-writer's data loader. The whole character database is already in memory (downloaded once and
// cached in IndexedDB — see character-database.js), so this is a synchronous map lookup. Returns
// undefined for a character that isn't in the database, which hanzi-writer handles the same way it
// used to handle a 404 from the old per-character fetch
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
