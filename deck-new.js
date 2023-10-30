'use strict';

// Global variables, why not
window.previewCards = [];
window.previewPhrase = null;

window.bUsingPinyinConversion = false;

window.writer;

// Convert each word in a sentence to pinyin
function pinyinify(string) {
	// Ugly af but it's the only way we can do it ig
	const pinyin =
	{
		"uai": [ "uāi", "uái", "uǎi", "uài", "uai" ],
		"ua": [ "uā", "uá", "uǎ", "uà", "ua" ],
		"ue": [ "uē", "ué", "uě", "uè", "ue" ],
		"ui": [ "uī", "uí", "uǐ", "uì", "ui" ],
		"uo": [ "uō", "uó", "uǒ", "uò", "uo" ],
		"va": [ "üā", "üá", "üǎ", "üà", "üa" ],
		"ve": [ "üē", "üé", "üě", "üè", "üe" ],
		"ai": [ "āi", "ái", "ǎi", "ài", "ai" ],
		"iao": [ "iāo", "iáo", "iǎo", "iào", "iao" ],
		"ao": [ "āo", "áo", "ǎo", "ào", "ao" ],
		"ei": [ "ēi", "éi", "ěi", "èi", "ei" ],
		"ia": [ "iā", "iá", "iǎ", "ià", "ia" ],
		"ie": [ "iē", "ié", "iě", "iè", "ie" ],
		"io": [ "iō", "ió", "iǒ", "iò", "io" ],
		"iu": [ "iū", "iú", "iǔ", "iù", "iu" ],
		"ou": [ "ōu", "óu", "ǒu", "òu", "ou" ],
		"a": [ "ā", "á", "ǎ", "à", "a" ],
		"e": [ "ē", "é", "ě", "è", "e" ],
		"i": [ "ī", "í", "ǐ", "ì", "i" ],
		"o": [ "ō", "ó", "ǒ", "ò", "o" ],
		"u": [ "ū", "ú", "ǔ", "ù", "u" ],
		"v": [ "ǖ", "ǘ", "ǚ", "ǜ", "ü" ],
	};

	let arr = string.toLowerCase().split(' ');

	// Pinyin-ify every element
	for (let i in arr)
	{
		for (const [key, val] of Object.entries(pinyin))
		{
			if (arr[i].includes(key))
			{
				let lastEl = arr[i].at(arr[i].length - 1);
				let index = 5;
				// Check if the number at the back is above 0 and less than 6 since we don't support Jyutping(it doesn't have markings anyway)
				if (lastEl >= '0' && lastEl <= '5')
				{
					index = parseInt(lastEl);
					arr[i] = arr[i].substring(0, arr[i].length - 1);
					if (lastEl === '0')
						index = 5;
				}
				arr[i] = arr[i].replace(key, val[index - 1]);
			}
		}
	}
	return arr.join(" ");
}

function constructPreviewCardGeneric(index, it, owner)
{
	let root = addElement("div", "", `character-preview-${index}`, "card centered", "", owner);

	let lit = it;
	// Local it variable because phrases will require finding the card
	if (it === null || it["phrase"])
	{
		if (it !== null)
		{
			for (let i in window.localStorageData.cards)
			{
				if (window.localStorageData.cards[i].character === it.phrase[index])
				{
					lit = window.localStorageData.cards[i];
					break;
				}
			}

			for (let i in window.previewCards)
			{
				if (window.previewCards[i].character === it.phrase[index])
				{
					lit = window.previewCards[i];
					break;
				}
			}
		}

		if (it === null || lit === it)
		{
			window.previewCards.push({
				name: lc.unknown_character,
				character: it === null ? window.CARD_DEFAULT_CHARACTER : it.phrase[index],
				variant: "",
				knowledge: 0,
				definitions: []
			});
			lit = window.previewCards[window.previewCards.length - 1];
		}
	}

	addElement("h3", lit.name, `card-preview-name-${index}`, "", "", root);
	let writerArea = addElement("div", "", `card-character-target-div-preview-${index}`, "", "", root);
	addElement("p", `${lc.deck_definitions}`, "", "", "", root);
	let list = addElement("ol", "", `card-preview-list-${index}`, "", "", root);

	for (let definition in lit.definitions)
		addElement("li", lit.definitions[definition], "", "", "", list);

	writerArea.writer = HanziWriter.create(`card-character-target-div-preview-${index}`, lit.character + lit.variant,
	{
		width: window.CARD_WRITER_SIZE,
		height: window.CARD_WRITER_SIZE,
		padding: window.WRITER_PADDING,
		showOutline: true,
		strokeAnimationSpeed: window.CARD_WRITER_STROKE_ANIMATION_SPEED,
		delayBetweenStrokes: window.CARD_WRITER_DELAY_BETWEEN_STROKES,
		charDataLoader: charDataLoader,
	})
	writerArea.addEventListener("mouseover", function(){
		this.writer.animateCharacter();
	})
	return lit;
}

function constructInputElement(container, id, classT, type, ariaLabel, name, previewID, callback)
{
	let input = addElement("input", "", id, classT, "", container);
	input.setAttribute("type", type);
	input.setAttribute("aria-label", ariaLabel);
	input.setAttribute("name", name);
	input.previewID = previewID;

	input.addEventListener("change", (event) =>
	{
		event.target.value = window.bUsingPinyinConversion ? pinyinify(event.target.value) : event.target.value;
		if (previewID !== "")
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

async function testVariantExists(character, postfix)
{
	return await charDataLoader(character + postfix, null, null);
}

async function constructCharacterVariantSelect(container, id, classT, ariaLabel, name, it)
{
	let select = addElement("select", "", id, classT, "", container);
	select.setAttribute("aria-label", ariaLabel);
	select.setAttribute("name", name);
	select.ownerReference = it;

	addElement("option", lc.character_variant_default, "", "", "", select).setAttribute("value", "");
	if (await testVariantExists(it.character, "-jp") !== undefined)
		addElement("option", `🇯🇵   ${lc.character_variant_kanji}`, "", "", "", select).setAttribute("value", "-jp");
	if (await testVariantExists(it.character, "-ko") !== undefined)
		addElement("option", `🇰🇷   ${lc.character_variant_hanja}`, "", "", "", select).setAttribute("value", "-ko");

	select.addEventListener("change", function() {
		this.ownerReference.variant = this.value;
	});
}

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

		button.addEventListener("click", function(){
			this.definitions.splice(this.defIndex, 1);
			reconstructDefinitionList(this.previewList, this.editList, this.definitions, false)
		});
	}
}

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
		for (let f in window.localStorageData.cards)
		{
			if (it.phrase[index] === window.localStorageData.cards[f].character)
			{
				lit = window.localStorageData.cards[f];
				break;
			}
		}

		for (let i in window.previewCards)
		{
			if (window.previewCards[i].character === it.phrase[index])
			{
				lit = window.previewCards[i];
				bReadOnly = false;

				for (let f = index - 1; f >= 0; --f)
				{
					if (it.phrase[f] === it.phrase[index])
					{
						bReadOnly = true;
						bAllowChangingCharacter = false;
						break;
					}
				}
				break;
			}
		}
	}
	else if (it["phrase"] && bPhrase)
		bReadOnly = false;
	else if (it["character"])
		bReadOnly = false;

	let container = addElement("div", "", `edit-phrase-${index}`, "card centered", "", root);
	container.setAttribute("yy-readonly", bReadOnly);

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

	if (lit !== null && lit["phrase"] && characterInput !== null)
	{
		characterInput.addEventListener("change", (event) => {
			let phrasePreviewContainer = $("phrase-preview-section-container");
			let cardEditSection = $("card-edit-section");

			// Clear children and reconstruct previews
			phrasePreviewContainer.replaceChildren();
			cardEditSection.replaceChildren();
			lit.phrase = event.target.value;

			window.previewCards = [];
			constructPhraseEditCardPreview(lit, phrasePreviewContainer);
			constructEditCard("phrase", lit, cardEditSection, true);
			for (let i in lit.phrase)
			{
				constructPreviewCardGeneric(i, lit, phrasePreviewContainer);
				constructEditCard(i, lit, cardEditSection);
			}
		});
	}

	if (!bPhrase && !bReadOnly)
	{
		// A little padding
		addTextNode(container, " ");
		constructCharacterVariantSelect(container, `character-variant-box-${index}`, "centered", lc.character_variant_box_aria, lc.character_variant_box_aria, lit).then(_ => {});
	}

	addElement("h3", `${lc.deck_definitions}`, "", "", "", container);
	if (!bReadOnly)
	{
		constructInputElement(container, `meaning-text-field-${index}`, "", "text", lc.meaning_text_field_aria, lc.meaning_text_field_aria, "", null);

		// A little padding
		addTextNode(container, " ");
		let addButton = addElement("button", "+", `add-meaning-list-button-${index}`, "card-button-edit small-button", "", container);

		addButton.addEventListener("click", (_) => {
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

	if (urlParams.has("edit"))
	{
		dataContainer = window.localStorageData.cards;
		index = urlParams.get("edit");
	}
	else if (urlParams.has("phrase-edit"))
	{
		dataContainer = window.localStorageData.phrases;
		index = urlParams.get("phrase-edit");
		$("phrase-preview-section").style.display = "block";
	}

	let cardEditSection = $("card-edit-section");
	if (dataContainer !== null && index <= dataContainer.length)
	{
		let it = dataContainer[index];
		
		if (it["character"])
		{
			constructPreviewCardGeneric(0, it, cardEditSection, false);
			constructEditCard(0, it, cardEditSection, true);
			for (let i = 0; i < cardEditSection.childNodes.length; i++)
				cardEditSection.insertBefore(cardEditSection.childNodes[i], cardEditSection.firstChild);
		}
		else
		{
			let phrasePreviewSectionContainer = $("phrase-preview-section-container");
			constructPhraseEditCardPreview(it);
			constructEditCard("phrase", it, cardEditSection, true);
			for (let i in it["phrase"])
			{
				constructPreviewCardGeneric(i, it, phrasePreviewSectionContainer, true)
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
		let lit = constructPreviewCardGeneric(0, null, cardEditSection, false);
		constructEditCard("0", lit, cardEditSection, false);

		// Reverse children of $("card-edit-section") because we display the preview before the edit widget
		for (let i = 0; i < cardEditSection.childNodes.length; i++)
			cardEditSection.insertBefore(cardEditSection.childNodes[i], cardEditSection.firstChild);
	}
}

function deckEditMain()
{
	constructListElements();
	$("finish-edit-button").addEventListener("click", function() {
		if (window.previewPhrase !== null)
			window.localStorageData.phrases.push(window.previewPhrase);

		window.localStorageData.cards.push(...window.previewCards.filter((value, index) => {
			const v = JSON.stringify(value);
			return index === window.previewCards.findIndex(obj => {
				return JSON.stringify(obj) === v;
			});
		}));

		saveToLocalStorage(window.localStorageData);
		location.href = "./deck.html";
	});
}

deckEditMain();
