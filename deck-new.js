'use strict';

// Global variables, why not
window.previewCards = [];
window.previewPhrase = null;

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
            for (let i in window.profileData.cards)
            {
                if (window.profileData.cards[i].character === phraseChar)
                {
                    lit = window.profileData.cards[i];
                    break;
                }
            }

            for (let i in window.previewCards)
                if (window.previewCards[i].character === phraseChar)
                    return window.previewCards[i];
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

    for (let definition in lit.definitions)
        addElement("li", lit.definitions[definition], "", "", "", list);

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
    addElement("h1", lit.phrase, "card-character-target-div-phrase", "phrase-card-header", "", phrasePreviewRoot);
    addElement("p", `${lc.deck_definitions}`, "", "", "", phrasePreviewRoot);
    let list = addElement("ol", "", "card-preview-list-phrase", "", "", phrasePreviewRoot)
    for (let definition in lit.definitions)
        addElement("li", lit.definitions[definition], "", "", "", list);
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
    for (let i in definitions)
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
    // as the character is determined by the 
    let bAllowChangingCharacter = true;

    // Is a phrase object but not representing a phrase
    if (it["phrase"] && !bPhrase)
    {
        // Index the phrase by code point so characters outside the BMP stay whole
        const phraseChars = toCharacters(it.phrase);
        for (let f in window.profileData.cards)
        {
            if (phraseChars[index] === window.profileData.cards[f].character)
            {
                lit = window.profileData.cards[f];
                break;
            }
        }

        for (let i in window.previewCards)
        {
            if (window.previewCards[i].character === phraseChars[index])
            {
                lit = window.previewCards[i];
                bReadOnly = false;

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
                constructPhraseEditCardPreview(lit, phrasePreviewContainer);
                constructEditCard("phrase", lit, cardEditSection, true);
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

function constructListElements()
{
    const urlParams = new URLSearchParams(window.location.search);
    let dataContainer = null;
    let index = null;

    let deleteButton = $("delete-edit-button");
    if (urlParams.has("edit"))
    {
        dataContainer = window.profileData.cards;
        index = parseInt(urlParams.get("edit"), 10);
        deleteButton.style.display = "inline-block";

        deleteButton.cardIndex = index;
        runEventAfterAnimation(deleteButton, "click", (e) => {
            if (confirm(lc.deck_new_delete_card))
            {
                window.profileData.cards.splice(e.target.cardIndex, 1);
                saveProfileData(window.profileData).then(() => { location.href = "./deck.html"; });
            }
        });
    }
    else if (urlParams.has("phrase-edit"))
    {
        dataContainer = window.profileData.phrases;
        index = parseInt(urlParams.get("phrase-edit"), 10);
        $("phrase-preview-section").style.display = "block";
        deleteButton.style.display = "inline-block";

        deleteButton.cardIndex = index;
        runEventAfterAnimation(deleteButton, "click", (e) => {
            if (confirm(lc.deck_new_delete_phrase))
            {
                window.profileData.phrases.splice(e.target.cardIndex, 1);
                saveProfileData(window.profileData).then(() => { location.href = "./deck.html"; });
            }
        });
    }

    let cardEditSection = $("card-edit-section");
    if (dataContainer !== null && index >= 0 && index < dataContainer.length)
    {
        let it = dataContainer[index];
        
        if (it["character"])
        {
            constructPreviewCardGeneric(0, it, cardEditSection);
            constructEditCard(0, it, cardEditSection, true);
            for (let i = 0; i < cardEditSection.childNodes.length; i++)
                cardEditSection.insertBefore(cardEditSection.childNodes[i], cardEditSection.firstChild);
        }
        else
        {
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
    }
    else
    {
        constructPreviewCardGeneric(0, null, cardEditSection);
        constructEditCard(0, window.previewCards[0], cardEditSection, false);

        // Reverse children of $("card-edit-section") because we display the preview before the edit widget
        for (let i = 0; i < cardEditSection.childNodes.length; i++)
            cardEditSection.insertBefore(cardEditSection.childNodes[i], cardEditSection.firstChild);
    }
}

function deckEditMain()
{
    constructListElements();
    runEventAfterAnimation($("finish-edit-button"), "click", function(_) {
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
        saveProfileData(window.profileData).then(() => { location.href = "./deck.html"; });
    });
    runEventAfterAnimation($("cancel-edit-button"), "click", function() { location.href = './deck.html' })
}

// Wait until index.js has loaded the profile data from IndexedDB before running the editor
window.youyinStorageReady.then(() => deckEditMain());
