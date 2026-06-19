'use strict';

/**
 * The export button callback. Stringifies the current data and exports it.
 */
function updateExportButton()
{
    const dt = window.profileData;
    const data = {
        cards: dt.cards,
        phrases: dt.phrases
    }

    let file = new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "deck.yydeck.json";
    link.click();
    URL.revokeObjectURL(link.href);
}

/**
 * The import deck button callback. Imports a deck from a file.
 * @param {string} f - The element in question
 */
function importDeck(f) {
    let bExecuted = confirm(lc.import_deck_confirm_text);
    if (bExecuted)
    {
        const reader = new FileReader();
        reader.addEventListener("load", (e) => {
            let dt = window.profileData;
            let data = JSON.parse(e.target.result.toString());

            dt.cards.push.apply(dt.cards, data.cards);
            dt.phrases.push.apply(dt.phrases, data.phrases);

            // Wait for the IndexedDB write to commit before reloading, otherwise the reload can
            // tear the page down before the transaction flushes
            saveProfileData(dt).then(() => document.location.reload());
        });
        reader.readAsText(f.target.files[0])
    }
}

function clearDeck() {
    let bExecuted = confirm(lc.clear_deck_confirm_text);
    if (bExecuted)
    {
        let dt = window.profileData;
        dt.cards = [];
        dt.phrases = [];

        saveProfileData(dt).then(() => document.location.reload());
    }
}

/**
 * Sets data about the current user. Deals with calculating most of the statistics and showcasing them
 */
function setProfileCardData()
{
    $("total-sessions-field").textContent += window.profileData.sessions;
    renderStreakField();
    $("deck-card-num-field").textContent += window.profileData.cards.length;
    $("deck-phrase-num-field").textContent += window.profileData.phrases.length;

    let totalTime = (window.profileData.totalTimeInSessions * 1);
    if (isNaN(totalTime))
        totalTime = 0;

    // Average in milliseconds first, then localise each value separately — the average and the
    // total usually land in different units (e.g. seconds vs hours)
    let averageTime = totalTime / window.profileData.sessions;
    if (isNaN(averageTime))
        averageTime = 0;

    const average = getLocalisedTimePostfix(averageTime);
    const total = getLocalisedTimePostfix(totalTime);
    $("average-session-length-field").textContent += (formatDecimal(average.time) + average.postfix);
    $("time-spent-in-sessions-field").textContent += (formatDecimal(total.time) + total.postfix);

    const lastDate = window.profileData.lastDate;
    if (lastDate !== 0)
    {
        const date = new Date(lastDate);
        $("last-session-date-field").textContent += date.toLocaleDateString(lc.locale,
        {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "numeric"
        });
    }
    else
        $("last-session-date-field").textContent += lc.no_sessions_recorded;

    const averageKnowledge = $("average-knowledge-level-field");
    let knowledge = 0;
    for (let i in window.profileData.cards)
        knowledge += window.profileData.cards[i].knowledge;

    knowledge /= window.profileData.cards.length;
    if (isNaN(knowledge))
        knowledge = 0;
    averageKnowledge.textContent = `${lc.average_knowledge_level}: ${formatDecimal(knowledge)}/${window.MAX_KNOWLEDGE_LEVEL}`;
}

// A deck can hold a couple thousand cards, so the lists are virtualized: items are partitioned into
// blocks and only blocks near the viewport keep their card shells in the DOM, the rest collapse to a
// spacer of the block's last-measured height (see blockObserver / buildBlocks). This keeps the live
// DOM proportional to the viewport rather than to the deck. On top of that, each card's writer — the
// expensive part, an animated SVG — is only instantiated once the card scrolls near the viewport
// (cardWriterObserver). The two lookup maps below are prebuilt once so per-card construction stays
// O(1) instead of scanning the whole deck for every card.
//
// Each block lays out its own grid, so a block whose card count isn't a whole number of rows would
// leave a ragged partial row at the boundary with the next block. To avoid that, a block holds an
// exact multiple of the current column count (DECK_ROWS_PER_BLOCK rows). The column count is read
// from the realized grid and the blocks are rebuilt whenever it changes (see renderDeckLists).

// How many grid rows make up one virtualization block. Block size is this times the live column
// count, so a wide screen (more columns) gets proportionally larger blocks. More rows per block means
// a wider DOM window but fewer block boundaries
window.DECK_ROWS_PER_BLOCK = 12;
// How far beyond the viewport a block is kept live, so fast scrolling doesn't reveal un-rendered gaps
window.DECK_BLOCK_HYDRATE_MARGIN = "800px";
// Rough rendered height (px) of one card row, used to estimate a not-yet-rendered block's spacer
// height before it has ever been measured. Tracks the card's contain-intrinsic-size plus the row gap
window.DECK_ROW_HEIGHT_ESTIMATE = 340;
// How far ahead of the viewport a card's writer is hydrated, so it's ready by the time it's visible.
// Kept smaller than the block margin so a card's block always exists before its writer is wanted
window.DECK_WRITER_HYDRATE_MARGIN = "400px";
// Debounce window (ms) for reacting to viewport resizes (orientation changes, window drags)
window.DECK_RESIZE_DEBOUNCE_MS = 200;

// Map: character -> array of phrase names that contain it. Prebuilt from the deck's phrases so the
// "part of" list on each character card is a single lookup rather than a scan over every phrase
let deckPhraseMembership = null;
// Map: character -> variant postfix, taken from the matching character card (first one wins)
let deckCharacterVariants = null;
// Shared IntersectionObserver that hydrates each card's writer when it nears the viewport
let cardWriterObserver = null;
// Shared IntersectionObserver that renders/collapses whole blocks as they enter/leave the viewport
let blockObserver = null;
// The non-empty lists to virtualize: [{ items, container, domOffset }]. Kept so a resize that changes
// the column count can rebuild every block at the new row-aligned size
let deckLists = [];
// Column count the blocks were last built for, so a resize only rebuilds when it actually changes
let deckColumnCount = 0;

/**
 * Builds the character -> [phrase names] membership map from the deck's phrases
 * @param { Array } phrases - The deck's phrase objects
 * @returns { Map<string, string[]> } - Each character mapped to the phrases that contain it
 */
function buildPhraseMembership(phrases)
{
    const map = new Map();
    for (const p of phrases)
    {
        // A character that appears twice in a phrase should still list that phrase only once
        const seen = new Set();
        for (const ch of toCharacters(p.phrase))
        {
            if (seen.has(ch))
                continue;
            seen.add(ch);
            if (!map.has(ch))
                map.set(ch, []);
            map.get(ch).push(p.name);
        }
    }
    return map;
}

/**
 * Builds the character -> variant postfix map from the deck's character cards
 * @param { Array } cards - The deck's character card objects
 * @returns { Map<string, string> } - Each character mapped to its variant postfix
 */
function buildCharacterVariants(cards)
{
    const map = new Map();
    for (const c of cards)
        if (!map.has(c.character))
            map.set(c.character, c.variant || "");
    return map;
}

/**
 * Resolves the variant postfix for a phrase character by looking it up in the prebuilt map.
 * Phrases don't store per-character variants, so we borrow it from the character card if one exists.
 * @param { string } character - The single character to resolve
 * @returns { string } - The variant postfix (e.g. "-jp"), or "" if no matching card exists
 */
function findCharacterVariant(character)
{
    return (deckCharacterVariants && deckCharacterVariants.get(character)) || "";
}

/**
 * Creates the IntersectionObserver that lazily hydrates card writers. Each observed card stores a
 * hydrateWriter() closure; the first time the card crosses into the pre-load margin we run it once
 * (drawing the resting outline) and stop observing. This caps the initial render at roughly a
 * screenful of cards instead of drawing one per card in the whole deck
 * @returns { IntersectionObserver } - The configured observer
 */
function createCardWriterObserver()
{
    return new IntersectionObserver((entries, observer) => {
        for (const entry of entries)
        {
            if (!entry.isIntersecting)
                continue;
            observer.unobserve(entry.target);

            const card = entry.target;
            const hydrate = card.hydrateWriter;
            card.hydrateWriter = null;
            if (!hydrate)
                continue;

            // Card shells render before the character database has finished loading (it is gated on
            // youyinProfileReady, the writers on youyinCharDataReady), so hold drawing until the
            // stroke data is in memory. Re-check the card is still in the DOM — its block may have
            // been collapsed again while we waited on the data
            window.youyinCharDataReady.then(() => {
                if (card.isConnected)
                    hydrate();
            });
        }
    }, { rootMargin: window.DECK_WRITER_HYDRATE_MARGIN });
}

// SVG namespace for the hand-built static outlines (createElement won't do for SVG elements)
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draws a cheap, static outline of a character into a target element from the stroke data already in
 * memory: a single filled <path> (all strokes merged), with none of hanzi-writer's animation
 * controller, clip paths or per-stroke machinery — a fraction of the cost of a writer instance. This
 * is what a resting card shows; the full writer is only built when the card is hovered (see below).
 *
 * The transform replicates hanzi-writer's Positioner exactly so the static glyph lines up with the
 * animated one: the stroke data lives in a 1024-wide box whose y runs from -124 to 900 with the
 * y-axis pointing up, hence the vertical flip and the -124*scale vertical offset
 * @param { HTMLElement } targetEl - The element to draw the outline into
 * @param { string } character - Character (plus optional variant postfix) to draw
 * @param { number } size - Width/height in pixels, matching the writer that replaces it on hover
 * @returns { boolean } - True if an outline was drawn, false when no stroke data exists for the char
 */
function createStaticOutline(targetEl, character, size)
{
    const data = window.characterData[character];
    if (!data || !data.strokes)
        return false;

    const GLYPH_SIZE = 1024;        // hanzi-writer glyph box width/height
    const GLYPH_Y_MIN = -124;       // the glyph box's lowest y (data y-axis points up)
    const p = window.WRITER_PADDING;
    const scale = (size - 2 * p) / GLYPH_SIZE;
    const tx = p;
    const ty = size - p - (-GLYPH_Y_MIN) * scale;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);

    // Merge every stroke into one filled <path>. Each stroke's "d" is its own subpath (it starts with
    // a moveto), so joining them is valid path data, and the default nonzero fill renders their union
    // solid — visually identical to one filled path per stroke, but a single SVG node per card
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", data.strokes.join(" "));
    path.setAttribute("fill", window.WRITER_STROKE_COLOUR);
    path.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale}, ${-scale})`);
    svg.appendChild(path);
    targetEl.appendChild(svg);
    return true;
}

/**
 * Constructs a card HTML element
 * @param { Object } it - Struct for the card data
 * @param { number } index - Used to create UUIDs. For normal cards, it's offset by the number of phrases
 * @param { HTMLElement } container - HTML element to attach to
 * @param { number } localIndex - non-unique index
 */
function constructCard(it, index, container, localIndex)
{
    // Add parent div
    let div = addElement("div", "", `card-container-${index}`, "card centered", "", container)

    // Add title, character render div and the definitions text. The render div reserves space via CSS
    // (card-writer-target / phrase-card-writers) so hydrating its writer later doesn't shift layout
    addElement("h3", `${it.name} ${formatDecimal(it.knowledge)}/${window.MAX_KNOWLEDGE_LEVEL}`, "", "", "", div);
    const target = it["character"]
                                    ? addElement("div", "", `card-character-target-div-${index}`, "card-writer-target", "", div)
                                    : addElement("div", "", `card-character-target-div-${index}`, "phrase-card-writers", "", div);
    addElement("p", `${lc.deck_definitions}`, "", "", "", div);

    // Add the list to the card and fill it with elements
    let list = addElement("ol", "", "", "", "", div);
    for (let i in it.definitions)
    {
        let f = it.definitions[i];
        addElement("li", `${f}`, "", "", "", list);
    }

    // If it's a character, list the phrases that contain it. Looked up from the prebuilt membership
    // map, so this is a single lookup instead of a scan over every phrase for every card
    if (it["character"])
    {
        const phraseNames = deckPhraseMembership.get(it.character);
        if (phraseNames && phraseNames.length > 0)
        {
            addElement("p", `${lc.part_of}:`, "", "", "", div);
            let ol = addElement("ol", "", "", "", "", div);
            for (const name of phraseNames)
                addElement("li", `${name}`, "", "", "", ol);
        }
    }

    // Create the "Edit" button and add an onclick event that redirects to the new card page
    let editButton = addElement("button", lc.deck_card_edit, `card-edit-button-${index}`, "card-button-edit", `${localIndex}`, div)
    editButton["phrase"] = it["phrase"] ? "phrase-" : ""; // If we're using phrases add this so that the callback can redirect correctly
    runEventAfterAnimation(editButton, "click", (e) =>
    {
        // In the line above, we store the card index in the "arbitrary-data" field. Here we retrieve it
        location.href = `./deck-edit-card.html?${e.target.phrase}edit=${e.target.attributes["arbitrary-data"].nodeValue}`;
    });

    // Defer the writer — the expensive, SVG-heavy part of a card — until it nears the viewport. The
    // observer runs this closure once and then forgets the card (see createCardWriterObserver)
    if (it["character"])
    {
        div.hydrateWriter = () =>
        {
            // Draw the cheap static outline at rest; the full animated writer is built lazily the
            // first time the card is hovered, and stashed on the card so teardown can stop it
            const fullCharacter = it.character + it.variant;
            createStaticOutline(target, fullCharacter, window.CARD_WRITER_SIZE);

            let writer = null;
            target.addEventListener('mouseover', function()
            {
                if (writer === null)
                {
                    // Swap the static outline for a real hanzi-writer on first hover
                    target.replaceChildren();
                    writer = createCardWriter(`card-character-target-div-${index}`, fullCharacter);
                    div.writers = [writer];
                }
                writer.animateCharacter();
            });
        };
    }
    else
    {
        div.hydrateWriter = () =>
        {
            // Draw each phrase character as a cheap static outline at rest. Each one's own-sized writer
            // is built on first hover, then their animations are chained so the phrase draws one
            // character after another
            const phraseChars = toCharacters(it.phrase);
            const charTargets = [];
            for (let c = 0; c < phraseChars.length; c++)
            {
                const charTargetId = `card-phrase-character-target-div-${index}-${c}`;
                const charEl = addElement("div", "", charTargetId, "phrase-card-character", "", target);
                const fullCharacter = phraseChars[c] + findCharacterVariant(phraseChars[c]);
                createStaticOutline(charEl, fullCharacter, window.PHRASE_CARD_WRITER_SIZE);
                charTargets.push({ id: charTargetId, character: fullCharacter, el: charEl });
            }

            let writers = null;
            let bAnimating = false;
            target.addEventListener('mouseover', async function()
            {
                if (writers === null)
                {
                    // Swap each static outline for a real writer on first hover, and stash them on the
                    // card so the block teardown can stop them
                    writers = [];
                    for (const ct of charTargets)
                    {
                        ct.el.replaceChildren();
                        writers.push(createCardWriter(ct.id, ct.character, window.PHRASE_CARD_WRITER_SIZE));
                    }
                    div.writers = writers;
                }

                // Guard against a fresh hover restarting the sequence while it's still running
                if (bAnimating)
                    return;
                bAnimating = true;
                for (const writer of writers)
                    await writer.animateCharacter();
                bAnimating = false;
            });
        };
    }

    cardWriterObserver.observe(div);
}

/**
 * Reads the realized number of grid columns by dropping a throwaway .deck-block into the container and
 * asking the browser how many tracks auto-fill resolved to. Reading the computed grid rather than
 * recomputing it from width + gap keeps us correct regardless of rem-based gaps or sub-pixel rounding.
 * The probe is added and removed within this synchronous call, so it never paints
 * @param { HTMLElement } container - The section the blocks live in
 * @returns { number } - The number of columns the deck grid currently has (at least 1)
 */
function getDeckColumnCount(container)
{
    const probe = document.createElement("div");
    probe.className = "deck-block";
    container.appendChild(probe);
    // getComputedStyle forces layout, so the auto-fill track list is resolved by the time we read it
    const template = getComputedStyle(probe).gridTemplateColumns;
    probe.remove();
    const count = (template && template !== "none") ? template.split(" ").length : 1;
    return Math.max(1, count);
}

/**
 * Estimates the rendered height of a block before it has ever been laid out, from the column count and
 * the number of cards in the block
 * @param { number } columns - The deck grid's current column count
 * @param { number } itemCount - How many cards the block holds
 * @returns { number } - Estimated block height in pixels
 */
function estimateBlockHeight(columns, itemCount)
{
    return Math.ceil(itemCount / columns) * window.DECK_ROW_HEIGHT_ESTIMATE;
}

/**
 * Pushes a section's refined per-block height estimate onto every block that is still an
 * un-measured spacer, so the scrollbar settles once the first block of the section has been measured
 * @param { Object } section - The section descriptor (its blocks share one running estimate)
 */
function applySpacerEstimate(section)
{
    for (const block of section.blocks)
        if (!block.rendered && block.measuredHeight === null)
            block.el.style.minHeight = `${section.estimate}px`;
}

/**
 * Builds a block's card shells and records how tall it ends up, so its spacer can match once it's
 * later collapsed. The first block measured in a section also seeds the spacer estimate used for
 * every block that hasn't been rendered yet
 * @param { Object } block - The block descriptor to render
 */
function renderBlock(block)
{
    if (block.rendered)
        return;
    block.rendered = true;

    // Build the cards into a fragment and attach it in one shot, so a block's worth of inserts is a
    // single DOM mutation rather than one per card. localIndex is the card's global position in its
    // list (the edit page navigates by it); the DOM id is offset past the phrases so ids are unique
    block.el.style.minHeight = "";
    const fragment = document.createDocumentFragment();
    for (let j = 0; j < block.items.length; j++)
    {
        const pos = block.start + j;
        constructCard(block.items[j], block.domOffset + pos, fragment, pos);
    }
    block.el.appendChild(fragment);

    // Defer the height read to the next frame. Several blocks can render in a single observer
    // callback while scrolling fast; measuring each one inline would force a synchronous reflow
    // between every build (layout thrash). Batching the reads into a frame lets the first read lay
    // out once and the rest come back from a clean layout
    measureBlockSoon(block);
}

/**
 * Measures a freshly rendered block on the next animation frame and seeds the section's spacer
 * estimate from the first block it manages to measure. No-ops if the block was torn down again before
 * the frame fired
 * @param { Object } block - The block descriptor to measure
 */
function measureBlockSoon(block)
{
    requestAnimationFrame(() => {
        if (!block.rendered)
            return;
        block.measuredHeight = block.el.offsetHeight;
        if (block.section.estimate === null && block.measuredHeight > 0)
        {
            block.section.estimate = block.measuredHeight;
            applySpacerEstimate(block.section);
        }
    });
}

/**
 * Stops a hanzi-writer instance so a tear-down doesn't leave an animation's requestAnimationFrame loop
 * running against detached SVG nodes (which would keep them alive until the animation happened to
 * finish). pauseAnimation is feature-checked because the CDN build's API can vary
 * @param { Object } writer - The hanzi-writer instance to stop
 */
function cleanupWriter(writer)
{
    if (writer && typeof writer.pauseAnimation === "function")
    {
        try
        {
            writer.pauseAnimation();
        }
        catch (e)
        {
            // A writer that never started animating can throw; nothing to stop in that case
        }
    }
}

/**
 * Collapses a rendered block back to an empty spacer of the height it last occupied, so scroll
 * position is preserved while its DOM (cards and their writers) is released
 * @param { Object } block - The block descriptor to tear down
 */
function teardownBlock(block)
{
    if (!block.rendered)
        return;
    block.rendered = false;

    // Stop any live writers first so their animation loops let go of the SVG we're about to detach
    for (const card of block.el.children)
        if (card.writers)
            for (const writer of card.writers)
                cleanupWriter(writer);

    const height = block.measuredHeight || block.section.estimate || block.initialEstimate;
    block.el.style.minHeight = `${height}px`;
    // replaceChildren() with no arguments empties the block; the removed card divs drop out of the
    // writer observer (it holds them weakly) and are garbage-collected along with their writers
    block.el.replaceChildren();
}

/**
 * Creates the IntersectionObserver that drives block virtualization: a block renders when it enters
 * the pre-load margin and collapses back to a spacer when it leaves
 * @returns { IntersectionObserver } - The configured observer
 */
function createBlockObserver()
{
    return new IntersectionObserver((entries) => {
        for (const entry of entries)
        {
            const block = entry.target.blockData;
            if (!block)
                continue;
            if (entry.isIntersecting)
                renderBlock(block);
            else
                teardownBlock(block);
        }
    }, { rootMargin: window.DECK_BLOCK_HYDRATE_MARGIN });
}

/**
 * Partitions a list of cards/phrases into virtualization blocks. Each block holds a whole number of
 * grid rows (DECK_ROWS_PER_BLOCK × columns cards) so its boundary always lands on a row boundary and
 * never leaves a ragged partial row. Each block starts life as an empty spacer div of estimated
 * height and is observed; the block observer fills it in and empties it again as it scrolls in and out
 * @param { Array } items - The card or phrase objects to virtualize
 * @param { HTMLElement } container - The section to append the blocks to
 * @param { number } domOffset - Added to each card's global position to form its unique DOM id (cards
 *                               are offset past the phrases so the two lists' ids never collide)
 * @param { number } columns - The deck grid's current column count, so blocks stay row-aligned
 */
function buildBlocks(items, container, domOffset, columns)
{
    const blockSize = columns * window.DECK_ROWS_PER_BLOCK;
    const section = { blocks: [], estimate: null };
    for (let start = 0; start < items.length; start += blockSize)
    {
        const blockItems = items.slice(start, start + blockSize);
        const el = document.createElement("div");
        el.className = "deck-block";
        const initialEstimate = estimateBlockHeight(columns, blockItems.length);
        el.style.minHeight = `${initialEstimate}px`;

        const block = {
            items: blockItems,
            start,
            domOffset,
            el,
            initialEstimate,
            rendered: false,
            measuredHeight: null,
            section,
        };
        el.blockData = block;
        section.blocks.push(block);
        container.appendChild(el);
        blockObserver.observe(el);
    }
}

/**
 * (Re)builds every virtualized list from deckLists at the current column count. Used for the initial
 * render and again whenever a resize changes the column count — the observers are recreated and the
 * containers cleared so blocks are re-partitioned row-aligned to the new width
 */
function renderDeckLists()
{
    // Fresh observers each build so stale block/card observations from the previous layout are dropped
    if (blockObserver)
        blockObserver.disconnect();
    if (cardWriterObserver)
        cardWriterObserver.disconnect();
    cardWriterObserver = createCardWriterObserver();
    blockObserver = createBlockObserver();

    // Column count is the same for both sections (same width), so measure once and reuse it
    deckColumnCount = deckLists.length > 0 ? getDeckColumnCount(deckLists[0].container) : 0;
    for (const list of deckLists)
    {
        list.container.replaceChildren();
        buildBlocks(list.items, list.container, list.domOffset, deckColumnCount);
    }
}

/**
 * Rebuilds the deck whenever a resize changes how many columns fit, so blocks stay row-aligned (and
 * the boundary packing stays clean) across orientation changes and window drags. Debounced, and a
 * no-op when the column count is unchanged so ordinary resizes don't churn the DOM
 */
function setupDeckResizeHandler()
{
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (deckLists.length > 0 && getDeckColumnCount(deckLists[0].container) !== deckColumnCount)
                renderDeckLists();
        }, window.DECK_RESIZE_DEBOUNCE_MS);
    });
}

function setupGameModifiers()
{
    const extensiveModeCheckbox = $("extensive-mode-checkbox");
    extensiveModeCheckbox.checked = window.gameModifiers.extensive;

    extensiveModeCheckbox.addEventListener("change", function(){
        window.gameModifiers.extensive = this.checked;
        saveGameModifiers();
    });

    const levelReduce = $("level-reduce-slider");
    levelReduce.value = window.gameModifiers.levelReduce;
    levelReduce.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${formatDecimal(levelReduce.value)} `;

    levelReduce.addEventListener("input", (e) => {
        window.gameModifiers.levelReduce = e.target.value;
        e.target.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${formatDecimal(e.target.value)} `;
        saveGameModifiers();
    });
}

/**
 * Main function for the deck page
 */
function deckmain()
{
    setProfileCardData();
    setupGameModifiers();

    // Get the elements and load their onclick events, holy shit that's massive! That's what she said!
    runEventAfterAnimation($("export-deck-button"), "click", updateExportButton);
    runEventAfterAnimation($("clear-deck-button"), "click", clearDeck);
    runEventAfterAnimation($("import-deck-button"), "click", function(){
        $("fileupload").click();
    });
    $("fileupload").addEventListener("change", importDeck);

    runEventAfterAnimation($("new-card-button"), "click", function() { location.href = './deck-edit-card.html?new' });
    runEventAfterAnimation($("new-phrase-button"), "click", function() { location.href = './deck-edit-card.html?phrase-new' });
    runEventAfterAnimation($("marketplace-deck-button"), "click", function() { location.href = './marketplace.html' });

    const data = window.profileData;
    let cardsContainer = $("deck-characters-section");
    let phrasesContainer = $("deck-phrases-section");

    // Prebuild the per-card lookup maps once so constructCard stays cheap for every card in a
    // multi-thousand-card deck
    deckPhraseMembership = buildPhraseMembership(data.phrases);
    deckCharacterVariants = buildCharacterVariants(data.cards);

    // Collect the non-empty lists to virtualize. Character ids are offset past the phrases so the two
    // lists' DOM ids never collide. Empty lists have their header and section removed instead
    deckLists = [];
    if (data.phrases.length === 0)
    {
        $("deck-phrases-header").remove();
        phrasesContainer.remove();
    }
    else
        deckLists.push({ items: data.phrases, container: phrasesContainer, domOffset: 0 });

    if (data.cards.length === 0)
    {
        $("deck-characters-header").remove();
        cardsContainer.remove();
    }
    else
        deckLists.push({ items: data.cards, container: cardsContainer, domOffset: data.phrases.length });

    // Build the blocks row-aligned to the current column count, and keep them aligned across resizes
    renderDeckLists();
    setupDeckResizeHandler();
}

// Render the deck as soon as the profile is loaded — the card shells don't need the character
// database, which loads separately (writers wait on youyinCharDataReady, see createCardWriterObserver)
window.youyinProfileReady.then(() => deckmain());