'use strict';

// Defaults for the live card preview rendered while editing a card
window.CARD_DEFAULT_CHARACTER = "是"
window.CARD_DEFAULT_PREVIEW_NAME = "Preview Name"

// Global variables, why not
window.previewCards = [];
window.previewPhrase = null;

// Set when editing an existing card/phrase (?edit / ?phrase-edit). Holds the live array, the index,
// and a deep-copied "working" object that all the edit handlers mutate instead of the stored one, so
// live profileData is only touched when Finish commits the copy back. Stays null when creating new.
window.editContext = null;

window.writer = null;

window.currentIME = "";
window.IMEIndex = 0;


/**
 * Use the current IME(if any) to return a converted string
 * @param { string } string - Input string
 * @return { string } Output string
 */
function convertFromIME(string)
{
    if (window.currentIME === "")
        return string;

    return soundTables[currentIME].convert(string, IMEIndex);
}

/**
 * Constructs a preview card HTML element for a phrase or card
 * @param { number } index - The index into "it"
 * @param { Object? } it - The struct that whose data will be used to construct the preview card
 * @param { HTMLElement } owner - Parent HTML element
 * @returns { Object } - Reference to the current modified object. Could be "it", a card from local storage(if "it" is
 * a phrase reference, or it's null) or a new card.
 */
function constructPreviewCardGeneric(index, it, owner)
{
    let lit = it;
    // Local it variable because phrases will require finding the card
    if (it === null || it["phrase"])
    {
        // Index the phrase by code point so characters outside the BMP stay whole
        const phraseChar = it !== null ? toCharacters(it.phrase)[index] : null;
        if (it !== null)
        {
            for (const card of window.profileData.cards)
            {
                if (card.character === phraseChar)
                {
                    lit = card;
                    break;
                }
            }

            for (const card of window.previewCards)
                if (card.character === phraseChar)
                    return card;
        }

        if (it === null || lit === it)
        {
            window.previewCards.push({
                name: lc.unknown_character,
                character: it === null ? window.CARD_DEFAULT_CHARACTER : phraseChar,
                variant: "",
                knowledge: 0,
                definitions: []
            });
            lit = window.previewCards[window.previewCards.length - 1];
        }
    }

    let root = addElement("div", "", `character-preview-${index}`, "card centered", "", owner);

    addElement("h3", lit.name, `card-preview-name-${index}`, "", "", root);
    let writerArea = addElement("div", "", `card-character-target-div-preview-${index}`, "", "", root);
    addElement("p", `${lc.deck_definitions}`, "", "", "", root);
    let list = addElement("ol", "", `card-preview-list-${index}`, "", "", root);

    for (const definition of lit.definitions)
        addElement("li", definition, "", "", "", list);

    writerArea.writer = createCardWriter(`card-character-target-div-preview-${index}`, lit.character + lit.variant);
    writerArea.addEventListener("mouseover", function(){
        this.writer.animateCharacter();
    })
    return lit;
}

/**
 * Constructs an input element
 * @param { HTMLElement } container - The parent HTML element to attach to
 * @param { string } id - ID for the input element
 * @param { string } classT - Class for the input element
 * @param { string } type - Type attribute of the input element
 * @param { string } ariaLabel - Aria label attribute of the input element
 * @param { string } name - Name attribute of the input element
 * @param { string } previewID - ID of the text field in the preview card that corresponds to the owning edit card
 * @param { function } callback - Callback function when the data is changed
 * @returns { HTMLElement } - The resulting input element
 */
function constructInputElement(container, id, classT, type, ariaLabel, name, previewID, callback)
{
    let input = addElement("input", "", id, classT, "", container);
    input.setAttribute("type", type);
    input.setAttribute("aria-label", ariaLabel);
    input.setAttribute("name", name);
    input.previewID = previewID;

    input.addEventListener("change", (event) =>
    {
        event.target.value = convertFromIME(event.target.value);
        if (previewID !== "" && event.target.value !== "")
            $(previewID).textContent = event.target.value;
    });
    if (callback !== null)
        input.addEventListener("change", callback);
    return input;
}

/**
 * Resolves the variant postfix for a phrase character by borrowing it from a matching character card.
 * Phrases don't store per-character variants, so a phrase containing a character the user already has
 * a card for (e.g. a Kanji variant) renders it the same way it appears on its own card.
 * @param { string } character - The single character to resolve
 * @returns { string } - The variant postfix (e.g. "-jp"), or "" if no matching card exists
 */
function findPhraseCharacterVariant(character)
{
    for (const card of window.profileData.cards)
        if (card.character === character)
            return card.variant || "";
    return "";
}

function constructPhraseEditCardPreview(it) {
    let lit = it;
    if (it === null)
    {
        window.previewPhrase = {
            name: lc.unknown_phrase,
            phrase: window.CARD_DEFAULT_CHARACTER,
            knowledge: 0,
            definitions: []
        };
        lit = window.previewPhrase;
    }

    let phrasePreviewRoot = addElement("div", "", "character-preview-phrase", "card centered", "", $("phrase-preview-section-container"));
    addElement("h3", lit.name, "card-preview-name-phrase", "", "", phrasePreviewRoot);

    // Draw the phrase as one writer per character (like the deck page's phrase cards) rather than as a
    // plain text header, so hovering animates each character's strokes one after another
    let writerRow = addElement("div", "", "card-character-target-div-phrase", "phrase-card-writers", "", phrasePreviewRoot);
    // Iterate by code point so characters outside the BMP stay whole
    const phraseChars = toCharacters(lit.phrase);
    let writers = [];
    for (let c = 0; c < phraseChars.length; c++)
    {
        const charTargetId = `card-character-target-div-phrase-${c}`;
        addElement("div", "", charTargetId, "phrase-card-character", "", writerRow);
        const fullCharacter = phraseChars[c] + findPhraseCharacterVariant(phraseChars[c]);
        writers.push(createCardWriter(charTargetId, fullCharacter, window.PHRASE_CARD_WRITER_SIZE));
    }

    // Chain the per-character animations on hover. The guard stops a fresh hover from restarting the
    // sequence while it's still drawing
    let bAnimating = false;
    writerRow.addEventListener("mouseover", async function() {
        if (bAnimating)
            return;
        bAnimating = true;
        for (const writer of writers)
            await writer.animateCharacter();
        bAnimating = false;
    });

    addElement("p", `${lc.deck_definitions}`, "", "", "", phrasePreviewRoot);
    let list = addElement("ol", "", "card-preview-list-phrase", "", "", phrasePreviewRoot)
    for (const definition of lit.definitions)
        addElement("li", definition, "", "", "", list);
    return lit;
}

/**
 * Checks if a given character variant exists in the in-memory character database
 * @param { string } character - The character in question
 * @param { string } postfix - Variant postfix, like "-jp" or "-ko" for Japanese and Korean respectively
 * @returns { undefined|Object } - The character's stroke data, or undefined when the variant is absent
 */
function testVariantExists(character, postfix)
{
    return charDataLoader(character + postfix, null, null);
}

/**
 * Constructs the character variant select box.
 *
 * The available variants depend on the current character, so this is also called
 * to rebuild the box whenever the character changes. It always clears the wrapper
 * first so a stale set of options is never left behind, and it resets the stored
 * variant when the previously-selected one isn't available for the new character.
 * @param { HTMLElement } container - The stable wrapper element the select is rendered into
 * @param { string } id - ID for the select box
 * @param { string } classT - Class for the select box
 * @param { string } ariaLabel - Aria label attribute for the select box
 * @param { string } name - Name attribute for the select box
 * @param { Object } it - Card object this corresponds to. Used to change the character's value in the change callback
 * @returns {Promise<void>}
 */
async function constructCharacterVariantSelect(container, id, classT, ariaLabel, name, it)
{
    container.replaceChildren();

    let selectButton = addElement("button", "", id, classT, "", container);
    selectButton.setAttribute("type", "button");
    selectButton.setAttribute("name", name);

    let options = [
        { value: "", text: lc.character_variant_default }
    ];
    if (await testVariantExists(it.character, "-jp") !== undefined)
        options.push({ value: "-jp", text: `🇯🇵   ${lc.character_variant_kanji}` });
    if (await testVariantExists(it.character, "-ko") !== undefined)
        options.push({ value: "-ko", text: `🇰🇷   ${lc.character_variant_hanja}` });

    // Drop a previously-selected variant that the new character doesn't offer
    if (!options.some(o => o.value === (it.variant || "")))
        it.variant = "";

    createCustomSelect(selectButton, ariaLabel, options, it.variant || "", function(newValue) {
        it.variant = newValue;
        const parts = id.split("-");
        const idx = parts[parts.length - 1];
        const writerEl = $(`card-character-target-div-preview-${idx}`);
        if (writerEl && writerEl.writer)
        {
            writerEl.writer.setCharacter(it.character + newValue);
        }
    });
}

/**
 * Reconstructs the definition list for a given card or phrase
 * @param { HTMLElement } previewList - The HTML element that contains the definitions list inside its corresponding preview card
 * @param { HTMLElement } editList - The HTML element that contains the definitions list inside its corresponding edit card
 * @param { string[] } definitions - The list of definition strings
 * @param { boolean } bReadOnly - Whether the definition list is read only, i.e. when editing a phrase and a character
 * from it has a corresponding card that is already in the deck
 */
function reconstructDefinitionList(previewList, editList, definitions, bReadOnly)
{
    if (previewList === null || editList === null)
        return;

    previewList.replaceChildren();
    editList.replaceChildren();
    for (let i = 0; i < definitions.length; i++)
    {
        addElement("li", definitions[i], "", "", "", previewList);

        let li = addElement("li", definitions[i], "", "", "", editList);
        if (bReadOnly)
            return;

        addTextNode(li, " ");

        let button = addElement("button", "-", "", "card-button-edit small-button", "", li);
        button.previewList = previewList;
        button.editList = editList;
        button.definitions = definitions;
        button.defIndex = i;

        runEventAfterAnimation(button, "click", (e) => {
            e.target.definitions.splice(e.target.defIndex, 1);
            reconstructDefinitionList(e.target.previewList, e.target.editList, e.target.definitions, false)
        });
    }
}

/**
 * Constructs an edit card
 * @param { string|number } index - Index into the array that holds "it"
 * @param { Object } it - Object whose data will be used to construct an edit card
 * @param { HTMLElement } root - The root element, to which the edit card should be attached to
 * @param { boolean } bPhrase - Whether you're editing a phrase
 */
function constructEditCard(index, it, root, bPhrase)
{
    let lit = it;

    // If this is set to false, the data about a card can be edited. This will create a bunch of text boxes
    // to be actually able to edit the card
    let bReadOnly = true;

    // If editing the character is allowed. When editing new cards as part of a phrase we set this to false
    // as the character is determined by the phrase: changing it would leave a card that isn't in the phrase
    let bAllowChangingCharacter = true;

    // Is a phrase object but not representing a phrase
    if (it["phrase"] && !bPhrase)
    {
        // Index the phrase by code point so characters outside the BMP stay whole
        const phraseChars = toCharacters(it.phrase);
        for (const card of window.profileData.cards)
        {
            if (phraseChars[index] === card.character)
            {
                lit = card;
                break;
            }
        }

        for (const card of window.previewCards)
        {
            if (card.character === phraseChars[index])
            {
                lit = card;
                bReadOnly = false;
                bAllowChangingCharacter = false;

                for (let f = index - 1; f >= 0; --f)
                    if (phraseChars[f] === phraseChars[index])
                        return;
                break;
            }
        }
    }
    else if (it["phrase"] && bPhrase)
        bReadOnly = false;
    else if (it["character"])
        bReadOnly = false;

    let container = addElement("div", "", `edit-phrase-${index}`, "card centered", "", root);
    container.setAttribute("yy-readonly", bReadOnly.toString());

    addElement("h3", `${lc.card_name}: ` + (bReadOnly
                                                    ? lit.name
                                                    : ""),
                                                    "", "", "", container);

    if (!bReadOnly)
    {
        constructInputElement(container, `name-text-field-${index}`, "", "text", lc.name_text_field_aria, lc.name_text_field_aria, `card-preview-name-${index}`, (event) => {
            lit.name = event.target.value;
        }).value = lit !== null ? lit.name : "";
    }

    addElement("h3", 
                    bPhrase ? `${lc.card_phrase}: ` + (bReadOnly
                                                                ? lit.phrase
                                                                : "")
                            : `${lc.card_character}: ` + (bReadOnly || !bAllowChangingCharacter
                                                                                                ? lit.character
                                                                                                : ""),
                    "", "", "", container);

    let characterInput = null;
    if (!bReadOnly && bAllowChangingCharacter)
    {
        characterInput = constructInputElement(container, `character-text-field-${index}`, "", "text", lc.character_text_field_aria, lc.character_text_field_aria, "", null);
        characterInput.value = lit !== null ? (lit["character"] ? lit.character : lit.phrase) : "";
    }

    if (lit !== null && characterInput !== null)
    {
        if (lit["phrase"])
        {
            characterInput.addEventListener("change", (event) => {
                let phrasePreviewContainer = $("phrase-preview-section-container");
                let cardEditSection = $("card-edit-section");

                // Clear children and reconstruct previews
                phrasePreviewContainer.replaceChildren();
                cardEditSection.replaceChildren();
                lit.phrase = event.target.value === "" ? window.CARD_DEFAULT_CHARACTER : event.target.value;

                window.previewCards = [];
                constructPhraseEditCardPreview(lit);
                constructEditCard("phrase", lit, cardEditSection, true);
                // The rebuilt input is filled from the phrase, which fell back to the default preview
                // character above; keep it empty so validateEditorEntries still sees an empty phrase
                if (event.target.value === "")
                    clearNewEntryInput("character-text-field-phrase");
                // Iterate by code point — for…in over a string walks UTF-16 units and would
                // visit both halves of a character outside the BMP
                const phraseLength = toCharacters(lit.phrase).length;
                for (let i = 0; i < phraseLength; i++)
                {
                    constructPreviewCardGeneric(i, lit, phrasePreviewContainer);
                    constructEditCard(i, lit, cardEditSection, false);
                }
            });
        }
        else if (lit["character"])
        {
            characterInput.addEventListener("change", (e) => {
                lit.character = e.target.value;

                // Rebuild the variant box for the new character; the writer is then
                // refreshed with whatever variant survived the rebuild
                let variantWrapper = $(`character-variant-wrapper-${index}`);
                if (variantWrapper)
                {
                    constructCharacterVariantSelect(variantWrapper, `character-variant-box-${index}`, "centered", lc.character_variant_box_aria, lc.character_variant_box_aria, lit).then(() => {
                        $(`card-character-target-div-preview-${index}`).writer.setCharacter(lit.character + lit.variant);
                    });
                }
                else
                    $(`card-character-target-div-preview-${index}`).writer.setCharacter(lit.character + lit.variant);
            })
        }
    }

    if (!bPhrase && !bReadOnly)
    {
        // A little padding
        addTextNode(container, " ");
        // Stable wrapper so the variant box can be rebuilt in place when the character changes.
        // Inline-block keeps it on the same line as the character input, like the original layout
        let variantWrapper = addElement("div", "", `character-variant-wrapper-${index}`, "character-variant-wrapper", "", container);
        constructCharacterVariantSelect(variantWrapper, `character-variant-box-${index}`, "centered", lc.character_variant_box_aria, lc.character_variant_box_aria, lit).then(_ => {});
    }

    addElement("h3", `${lc.deck_definitions}`, "", "", "", container);
    if (!bReadOnly)
    {
        constructInputElement(container, `meaning-text-field-${index}`, "", "text", lc.meaning_text_field_aria, lc.meaning_text_field_aria, "", null);

        // A little padding
        addTextNode(container, " ");
        let addButton = addElement("button", "+", `add-meaning-list-button-${index}`, "card-button-edit small-button", "", container);

        runEventAfterAnimation(addButton, "click", (_) => {
            let textField = $(`meaning-text-field-${index}`);
            lit.definitions.push(textField.value);
            textField.value = "";

            reconstructDefinitionList($(`card-preview-list-${index}`), $(`definition-list-current-edit-${index}`), lit.definitions, false)
        });
    }
    let ol = addElement("ol", "", `definition-list-current-edit-${index}`, "", "", container);
    reconstructDefinitionList($(`card-preview-list-${index}`), ol, lit.definitions, bReadOnly)
}

/**
 * Parses the index in an ?edit= / ?phrase-edit= query value. Only a plain non-negative integer is
 * accepted: parseInt would read "3abc" as 3, and a NaN index would reach Array.splice as 0
 * @param { string|null } raw - The query value
 * @returns { number } - The index, or -1 when the value isn't a valid index
 */
function parseEditIndex(raw)
{
    return (raw !== null && /^\d+$/.test(raw)) ? Number(raw) : -1;
}

function constructListElements()
{
    const urlParams = new URLSearchParams(window.location.search);
    let dataContainer = null;
    let index = -1;
    let deleteMessage = "";

    if (urlParams.has("edit"))
    {
        dataContainer = window.profileData.cards;
        index = parseEditIndex(urlParams.get("edit"));
        deleteMessage = lc.deck_new_delete_card;
    }
    else if (urlParams.has("phrase-edit"))
    {
        dataContainer = window.profileData.phrases;
        index = parseEditIndex(urlParams.get("phrase-edit"));
        deleteMessage = lc.deck_new_delete_phrase;
    }

    let cardEditSection = $("card-edit-section");
    if (dataContainer !== null && index >= 0 && index < dataContainer.length)
    {
        // Delete is only offered once the index is known to name an existing entry. A malformed or stale
        // link falls through to the new-card editor below and must not be able to delete anything
        const deleteButton = $("delete-edit-button");
        deleteButton.style.display = "inline-block";
        runEventAfterAnimation(deleteButton, "click", () => {
            if (!confirm(deleteMessage))
                return;

            dataContainer.splice(index, 1);
            saveProfileData(window.profileData).then(() => { location.href = window.pageUrl("deck"); }).catch(() => {});
        });

        // Edit a deep copy of the stored card/phrase, never the live object. Every edit handler below
        // mutates "it" in place (name / character / variant / definitions), so editing the live object
        // would (a) leave a cancelled edit applied in window.profileData and (b) let an unrelated
        // background save — the daily level reduction or the visibility-change streak check — persist an
        // abandoned half-edit. The data is plain JSON (strings, numbers, string arrays), so a
        // stringify/parse round-trip is a safe, dependency-free deep clone. deckEditMain's Finish handler
        // commits this working copy back at the original index; Cancel just navigates away and discards it.
        let it = JSON.parse(JSON.stringify(dataContainer[index]));
        window.editContext = { array: dataContainer, index: index, working: it };

        if (it["character"])
        {
            constructPreviewCardGeneric(0, it, cardEditSection);
            constructEditCard(0, it, cardEditSection, true);
            for (let i = 0; i < cardEditSection.childNodes.length; i++)
                cardEditSection.insertBefore(cardEditSection.childNodes[i], cardEditSection.firstChild);
        }
        else
        {
            $("phrase-preview-section").style.display = "block";
            let phrasePreviewSectionContainer = $("phrase-preview-section-container");
            constructPhraseEditCardPreview(it);
            constructEditCard("phrase", it, cardEditSection, true);
            // Iterate by code point — for…in over a string walks UTF-16 units and would
            // visit both halves of a character outside the BMP
            const phraseLength = toCharacters(it.phrase).length;
            for (let i = 0; i < phraseLength; i++)
            {
                constructPreviewCardGeneric(i, it, phrasePreviewSectionContainer)
                constructEditCard(i, it, cardEditSection, false);
            }
        }
    }
    else if (urlParams.has("phrase-new"))
    {
        $("phrase-preview-section").style.display = "block";

        let lit = constructPhraseEditCardPreview(null);
        constructEditCard("phrase", lit, cardEditSection, true);
        clearNewEntryInput("character-text-field-phrase");
    }
    else
    {
        constructPreviewCardGeneric(0, null, cardEditSection);
        constructEditCard(0, window.previewCards[0], cardEditSection, false);
        clearNewEntryInput("character-text-field-0");

        // Reverse children of $("card-edit-section") because we display the preview before the edit widget
        for (let i = 0; i < cardEditSection.childNodes.length; i++)
            cardEditSection.insertBefore(cardEditSection.childNodes[i], cardEditSection.firstChild);
    }
}

/**
 * Empties the character (or phrase) input of a new entry. The preview needs a character to draw, so
 * the new entry holds a default one, but prefilling the input with it made an untouched form save that
 * default as if the user had chosen it. The default is kept as the placeholder instead, and
 * validateEditorEntries refuses to save while the input is empty
 * @param { string } id - ID of the input
 */
function clearNewEntryInput(id)
{
    const input = $(id);
    if (input === null)
        return;

    input.value = "";
    input.placeholder = window.CARD_DEFAULT_CHARACTER;
}

/**
 * Whether the character database has been loaded. When the download failed there is nothing to check
 * characters against, and refusing every save would lock the editor
 * @returns { boolean }
 */
function characterDatabaseLoaded()
{
    for (const _ in window.characterData)
        return true;
    return false;
}

/**
 * Checks everything the Finish button is about to save and returns the first problem found. The
 * practice page can only draw a character that is a single code point and has stroke data, so an
 * entry that fails either check would otherwise sit in the deck as a card that can never be revised
 * @returns { string|null } - A localised message describing the problem, or null when it can be saved
 */
function validateEditorEntries()
{
    // The inputs are checked rather than the objects: a new entry's object holds the default preview
    // character until the user types, and an emptied phrase input falls back to it too
    const phraseInput = $("character-text-field-phrase");
    if (phraseInput !== null && phraseInput.value === "")
        return lc.deck_edit_error_empty_phrase;

    const characterInput = $("character-text-field-0");
    if (characterInput !== null && characterInput.value === "")
        return lc.deck_edit_error_empty_character;

    // Every card this save writes: the card being edited, and the new cards (the one on the new-card
    // form, or those a phrase introduces)
    const cards = [...window.previewCards];
    const editContext = window.editContext;
    if (editContext !== null && editContext.working["character"] !== undefined)
        cards.push(editContext.working);

    const bCheckStrokes = characterDatabaseLoaded();
    for (const card of cards)
    {
        if (toCharacters(card.character).length !== 1)
            return lc.deck_edit_error_single_character;

        const variant = card.variant || "";
        if (bCheckStrokes && charDataLoader(card.character + variant, null, null) === undefined)
            return lc.deck_edit_error_no_stroke_data.replace("{character}", card.character);

        // A card whose character and variant another card already has would be revised twice
        const existing = window.profileData.cards.findIndex((c, i) =>
            c.character === card.character && (c.variant || "") === variant &&
            !(editContext !== null && editContext.array === window.profileData.cards && i === editContext.index));
        if (existing !== -1)
            return lc.deck_edit_error_duplicate.replace("{character}", card.character);
    }

    const phrase = editContext !== null && editContext.working["phrase"] !== undefined
        ? editContext.working
        : window.previewPhrase;
    if (phrase !== null && bCheckStrokes)
    {
        for (const character of toCharacters(phrase.phrase))
            if (charDataLoader(character + findPhraseCharacterVariant(character), null, null) === undefined &&
                charDataLoader(character, null, null) === undefined)
                return lc.deck_edit_error_no_stroke_data.replace("{character}", character);
    }

    return null;
}

function deckEditMain()
{
    constructListElements();
    runEventAfterAnimation($("finish-edit-button"), "click", function(_) {
        const problem = validateEditorEntries();
        if (problem !== null)
        {
            alert(problem);
            return;
        }

        // Commit an in-progress edit of an existing card/phrase: write the detached working copy back
        // over the original entry. This is the only place an edit reaches live profileData, so a
        // Cancel (which never runs this) leaves the stored card/phrase exactly as it was.
        if (window.editContext !== null)
            window.editContext.array[window.editContext.index] = window.editContext.working;

        if (window.previewPhrase !== null)
            window.profileData.phrases.push(window.previewPhrase);

        // Deduplicate new cards by character + variant (a phrase can contain the same character
        // several times), keeping the first occurrence of each
        const seenCharacters = new Set();
        for (const card of window.previewCards)
        {
            const key = card.character + card.variant;
            if (!seenCharacters.has(key))
            {
                seenCharacters.add(key);
                window.profileData.cards.push(card);
            }
        }

        // Wait for the write to commit before navigating back to the deck page
        saveProfileData(window.profileData).then(() => { location.href = window.pageUrl("deck"); }).catch(() => {});
    });
    runEventAfterAnimation($("cancel-edit-button"), "click", function() { location.href = window.pageUrl("deck") })
}

// Wait until index.js has loaded the profile data from IndexedDB before running the editor
window.storageReady.then(() => deckEditMain());
