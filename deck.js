'use strict';

/**
 * The export button callback. Stringifies the current data and exports it.
 */
function updateExportButton()
{
    const dt = window.localStorageData;
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
            let dt = window.localStorageData;
            let data = JSON.parse(e.target.result.toString());

            dt.cards.push.apply(dt.cards, data.cards);
            dt.phrases.push.apply(dt.phrases, data.phrases);

            saveToLocalStorage(dt);
            document.location.reload();
        });
        reader.readAsText(f.target.files[0])
    }
}

function clearDeck() {
    let bExecuted = confirm(lc.clear_deck_confirm_text);
    if (bExecuted)
    {
        let dt = window.localStorageData;
        dt.cards = [];
        dt.phrases = [];

        saveToLocalStorage(dt);
        document.location.reload();
    }
}

/**
 * Sets data about the current user. Deals with calculating most of the statistics and showcasing them
 */
function setProfileCardData()
{
    $("total-sessions-field").textContent += window.localStorageData.sessions;
    renderStreakField();
    $("deck-card-num-field").textContent += window.localStorageData.cards.length;
    $("deck-phrase-num-field").textContent += window.localStorageData.phrases.length;

    let totalTime = (window.localStorageData.totalTimeInSessions * 1);
    if (isNaN(totalTime))
        totalTime = 0;

    // Average in milliseconds first, then localise each value separately — the average and the
    // total usually land in different units (e.g. seconds vs hours)
    let averageTime = totalTime / window.localStorageData.sessions;
    if (isNaN(averageTime))
        averageTime = 0;

    const average = getLocalisedTimePostfix(averageTime);
    const total = getLocalisedTimePostfix(totalTime);
    $("average-session-length-field").textContent += (formatDecimal(average.time) + average.postfix);
    $("time-spent-in-sessions-field").textContent += (formatDecimal(total.time) + total.postfix);

    const lastDate = window.localStorageData.lastDate;
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
    for (let i in window.localStorageData.cards)
        knowledge += window.localStorageData.cards[i].knowledge;

    knowledge /= window.localStorageData.cards.length;
    if (isNaN(knowledge))
        knowledge = 0;
    averageKnowledge.textContent = `${lc.average_knowledge_level}: ${formatDecimal(knowledge)}/${window.MAX_KNOWLEDGE_LEVEL}`;
}

/**
 * Resolves the variant postfix for a phrase character by looking up a matching card in the deck.
 * Phrases don't store per-character variants, so we borrow it from the character card if one exists.
 * @param { string } character - The single character to resolve
 * @returns { string } - The variant postfix (e.g. "-jp"), or "" if no matching card exists
 */
function findCharacterVariant(character)
{
    const cards = window.localStorageData.cards;
    for (let i in cards)
        if (cards[i].character === character)
            return cards[i].variant || "";
    return "";
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

    // Add title, character render div and the definitions text
    addElement("h3", `${it.name} ${formatDecimal(it.knowledge)}/${window.MAX_KNOWLEDGE_LEVEL}`, "", "", "", div);
    const target = it["character"]
                                    ? addElement("div", "", `card-character-target-div-${index}`, "", "", div)
                                    : addElement("div", "", `card-character-target-div-${index}`, "phrase-card-writers", "", div);
    addElement("p", `${lc.deck_definitions}`, "", "", "", div);

    // Add the list to the card and fill it with elements
    let list = addElement("ol", "", "", "", "", div);
    for (let i in it.definitions)
    {
        let f = it.definitions[i];
        addElement("li", `${f}`, "", "", "", list);
    }

    // If it's a character find which phrases contain it
    if (it["character"])
    {
        const data = window.localStorageData;
        // Actual optimisation
        if (data.phrases.length > 0)
        {
            // This is really not performant...
            let paragraph = addElement("p", `${lc.part_of}:`, "", "", "", div);
            let ol = document.createElement("ol");
            let bPartOfPhrase = false;

            for (let i in data.phrases)
            {
                if (data.phrases[i].phrase.includes(it.character))
                {
                    bPartOfPhrase = true;
                    addElement("li", `${data.phrases[i].name}`, "", "", "", ol);
                }
            }

            // Not ideal...
            if (bPartOfPhrase)
                div.appendChild(ol);
            else
                paragraph.remove();
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

    if (it["character"])
    {
        // Create an instance of the writer
        let writer = createCardWriter(`card-character-target-div-${index}`, it.character + it.variant);
        target.addEventListener('mouseover', function()
        {
            writer.animateCharacter();
        });
    }
    else
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
    }
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

    const data = window.localStorageData;
    let cardsContainer = $("deck-characters-section");
    let phrasesContainer = $("deck-phrases-section");

    // Remove phrases elements if none are available
    if (data.phrases.length === 0)
    {
        $("deck-phrases-header").remove();
        phrasesContainer.remove();
    }
    else // Load phrases
    {
        for (let val in data.phrases)
        {
            const it = data.phrases[val];
            constructCard(it, val, phrasesContainer, val);
        }
    }

    // Remove cards elements if none are available
    if (data.cards.length === 0)
    {
        $("deck-characters-header").remove();
        cardsContainer.remove();
        return;
    }

    // Load normal cards
    for (let val in data.cards)
    {
        const it = data.cards[val];
        constructCard(it, (val + data.phrases.length), cardsContainer, val);
    }
}

deckmain();