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

// A deck can hold a couple thousand cards, so the page is rendered progressively: card shells are
// built in batches across animation frames (so the initial render never blocks on the whole deck),
// and each card's writer — the expensive part, an animated SVG — is only instantiated once the card
// scrolls near the viewport (see cardWriterObserver). These two maps are prebuilt once so per-card
// construction stays O(1) instead of scanning the whole deck for every card.

// How many card shells to build per animation frame. The page paints between batches, so cards
// stream in instead of the tab locking up while a multi-thousand-card deck is laid out
window.DECK_RENDER_BATCH_SIZE = 30;
// How far ahead of the viewport a card's writer is hydrated, so it's ready by the time it's visible
window.DECK_WRITER_HYDRATE_MARGIN = "400px";

// Map: character -> array of phrase names that contain it. Prebuilt from the deck's phrases so the
// "part of" list on each character card is a single lookup rather than a scan over every phrase
let deckPhraseMembership = null;
// Map: character -> variant postfix, taken from the matching character card (first one wins)
let deckCharacterVariants = null;
// Shared IntersectionObserver that hydrates each card's writer when it nears the viewport
let cardWriterObserver = null;

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
 * (creating the SVG writer) and stop observing. This caps the initial render at roughly a screenful
 * of writers instead of one per card in the whole deck
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
            if (entry.target.hydrateWriter)
            {
                entry.target.hydrateWriter();
                entry.target.hydrateWriter = null;
            }
        }
    }, { rootMargin: window.DECK_WRITER_HYDRATE_MARGIN });
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
            // Create an instance of the writer
            let writer = createCardWriter(`card-character-target-div-${index}`, it.character + it.variant);
            target.addEventListener('mouseover', function()
            {
                writer.animateCharacter();
            });
        };
    }
    else
    {
        div.hydrateWriter = () =>
        {
            // Render each character of the phrase as its own normal-sized writer, then chain their
            // animations so the phrase is drawn one character after another on hover
            const phraseChars = toCharacters(it.phrase);
            let writers = [];
            for (let c = 0; c < phraseChars.length; c++)
            {
                const charTargetId = `card-phrase-character-target-div-${index}-${c}`;
                addElement("div", "", charTargetId, "phrase-card-character", "", target);
                writers.push(createCardWriter(charTargetId, phraseChars[c] + findCharacterVariant(phraseChars[c]), window.PHRASE_CARD_WRITER_SIZE));
            }

            // Guard against a fresh hover restarting the sequence while it's still running
            let bAnimating = false;
            target.addEventListener('mouseover', async function()
            {
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
 * Renders a list of cards/phrases into a container in batches across animation frames, so a large
 * deck streams in instead of blocking the main thread while the whole list is laid out at once
 * @param { Array } items - The card or phrase objects to render
 * @param { HTMLElement } container - The section to append the cards to
 * @param { number } indexOffset - Added to each item's position to form its unique DOM id (cards are
 *                                  offset past the phrases so the two lists' ids never collide)
 */
function renderCardsProgressively(items, container, indexOffset)
{
    let i = 0;
    function renderBatch()
    {
        const end = Math.min(i + window.DECK_RENDER_BATCH_SIZE, items.length);
        for (; i < end; i++)
            constructCard(items[i], indexOffset + i, container, i);
        if (i < items.length)
            requestAnimationFrame(renderBatch);
    }
    renderBatch();
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

    // Prebuild the per-card lookup maps and the lazy-writer observer once, before rendering, so
    // constructCard stays cheap for every card in a multi-thousand-card deck
    deckPhraseMembership = buildPhraseMembership(data.phrases);
    deckCharacterVariants = buildCharacterVariants(data.cards);
    cardWriterObserver = createCardWriterObserver();

    // Remove phrases elements if none are available, otherwise stream the phrase cards in
    if (data.phrases.length === 0)
    {
        $("deck-phrases-header").remove();
        phrasesContainer.remove();
    }
    else
        renderCardsProgressively(data.phrases, phrasesContainer, 0);

    // Remove cards elements if none are available
    if (data.cards.length === 0)
    {
        $("deck-characters-header").remove();
        cardsContainer.remove();
        return;
    }

    // Stream the character cards in, their ids offset past the phrases so the two lists never collide
    renderCardsProgressively(data.cards, cardsContainer, data.phrases.length);
}

// Wait until index.js has loaded the profile data from IndexedDB before rendering the deck
window.youyinStorageReady.then(() => deckmain());