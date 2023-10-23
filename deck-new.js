'use strict';

// Global variables, why not
var previewName = window.CARD_DEFAULT_PREVIEW_NAME;
var previewCharacter = window.CARD_DEFAULT_CHARACTER;
var previewDefinitions = [  ];
var previewVariant = "";

var bUsingPinyinConversion = false;

var writer;

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
					arr[i] = arr[i].substr(0, arr[i].length - 1);
					if (lastEl == '0')
						index = 5;
				}
				arr[i] = arr[i].replace(key, val[index - 1]);
				continue;
			}
		}
	}
	return arr.join(" ");
}

// Utility function to update the elements of the selected cards list
function updateListElements()
{
	const editList = $("definition-list-current-edit");
	const previewList = $("card-preview-list");
	editList.replaceChildren(...window.previewDefinitions);

	let tmpArr = [];
	for (let i = 0; i < window.previewDefinitions.length; i++)
		tmpArr.push(addElement("li", window.previewDefinitions[i].textContent.slice(0, -1), "", "", "", null));
	previewList.replaceChildren(...tmpArr);
}

// Save new card data to localstorage
function finishButtonNewCard()
{
	const data = {
		name: window.previewName,
		character: window.previewCharacter + window.previewVariant,
		knowledge: 0,
		definitions: [],
	}

	for (let i = 0; i < previewDefinitions.length; i++)
	{
		// Definitions end with a space so we have to trim it real quick
		data.definitions.push(previewDefinitions[i].innerText.slice(0, -1));
	}

	window.localStorageData.cards.push(data);
	saveToLocalStorage(window.localStorageData);
	location.href = "./deck.html";
}

// Always call updateListElements after this
// Returns void, takes the name of the list element and an id for further on click events
function constructListElement(name, id)
{
	let el = addElement("li", `${name} `, "", "", "", null);

	// Add a remove definition button on each call
	addElement("button", "-", `remove-meaning-list-button-${id}`, "card-button-edit small-button", "", el).addEventListener("click", function()
	{
		for (let i = 0; i < window.previewDefinitions.length; i++)
		{
			if (window.previewDefinitions[i].firstElementChild.id == this.id)
			{
				window.previewDefinitions.splice(i, 1);
				updateListElements();
				break;
			}
		}
	});
	window.previewDefinitions.push(el);
}

function handleCardEditing()
{

}

// Returns void, takes references to the name text field, the character text field and the definition ordered list
function addFinishButton(nameTextField, characterTextField, meaningList)
{
	const urlParams = new URLSearchParams(window.location.search);
	let finishButtonClickFunction;

	let data = null;
	let urlType = null;

	// If this is set, we're editing a card instead of creating a new one
	if (urlParams.has("edit"))
	{
		data = window.localStorageData.cards;
		urlType = urlParams.get("edit");
	}
	else if (urlParams.has("phrase-edit"))
	{
		data = window.localStorageData.phrases;
		urlType = urlParams.get("phrase-edit")
	}

	if (data !== null && urlType !== null)
	{
		// Check if the number provided as a parameter of the page is higher or equal to the length of the array.
		// This check is needed because we use indexes as parameters for editing the card/phrase
		if (urlType >= data.length)
		{
			finishButtonClickFunction = finishButtonNewCard;
			return;
		}
		// Get reference to the element we're currently editing
		const el = data[urlType]

		// Fill text boxes
		$("name-text-field").value = el.name;
		$("character-text-field").value = el.character.charAt(0); // FIXME
		$("card-preview-name").textContent = el.name;
		$("deck-new-card-header").textContent = "Editing: " + el.name;

		// Use the current data to fill the boxes
		window.previewName = el.name;
		window.previewCharacter = el.character.charAt(0); // FIXME

		// Deal with regional character variants
		// TODO: Phrases require this to be moved to the card preview
		window.previewVariant = el.character.length > 1 ? el.character.substr(1, el.character.length) : "";
		$("character-variant-box").value = window.previewVariant;

		// Add all the definitions to the ordered lists
		for (let i in el.definitions)
		{
			let it = el.definitions[i];
			constructListElement(it, i);
			updateListElements();
		}

		// Callback for the finish button
		finishButtonClickFunction = function()
		{
			const urlParams = new URLSearchParams(window.location.search);
			let dt = window.localStorageData;
			let data = dt.cards[urlParams.get("edit")]; // FIXME: This should be changed for phrases

			data.name = window.previewName;
			data.character = window.previewCharacter.charAt(0) + window.previewVariant;
			data.definitions = [];
			for (let i = 0; i < previewDefinitions.length; i++)
			{
				data.definitions.push(previewDefinitions[i].innerText.slice(0, -1));
			}
			saveToLocalStorage(dt);
			location.href = "./deck.html";
		};

		// Add button element and add click event to ask for confirmation
		addElement("button", "Delete", "delete-card-button", "card-button-edit", "", $("current-new-card")).addEventListener("click", function()
		{
			let bExecuted = confirm("Are you sure you want to delete the card?");
			if (bExecuted)
			{
				const urlParams = new URLSearchParams(window.location.search);
				let dt = window.localStorageData;
				dt.cards.splice(urlParams.get("edit"), 1); // FIXME: This should be fixed for phrases

				saveToLocalStorage(dt);
				location.href = "./deck.html"
			}
		});
	}
	else // In any other case such as non "edit" parameters we assing to this
		finishButtonClickFunction = finishButtonNewCard;

	// Add selected function event
	$("finish-edit-button").addEventListener("click", finishButtonClickFunction);
}

function addButtonEvent(id, type, func)
{
	$(id).addEventListener(type, func);
}

// Recreate the writer
function writerRecreate()
{
	$("card-character-target-div-preview").replaceChildren();
	window.writer = HanziWriter.create("card-character-target-div-preview", window.previewCharacter,
	{
		width: window.CARD_WRITER_SIZE,
		height: window.CARD_WRITER_SIZE,
		padding: window.WRITER_PADDING,
		showOutline: true,
		strokeAnimationSpeed: window.CARD_WRITER_STROKE_ANIMATION_SPEED,
		delayBetweenStrokes: window.CARD_WRITER_DELAY_BETWEEN_STROKES,
		charDataLoader: charDataLoader,
	})
}

// Utility to fetch a character variant from the database
async function fetchCharacterVariant(character, postfix, textContent)
{
	let select = $("character-variant-box")
	let res = await fetch(`https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin@latest/data/${character}${postfix}.json`)
	let bFound = false;
	for (let i in select.options)
	{
		let it = select.options[i].value
		if (it == postfix)
		{
			bFound = true;
			if (await res.status !== 200)
			{
				select.removeChild(select.options[i]);
			}
			return;
		}
	}
	if (!bFound && await res.status === 200)
	{
		let option =  addElement("option", textContent, "", "", "", select);
		option.setAttribute("value", postfix);
	}
}

// Tries to fetch regional variants of a given character from the character db
// Not ideal but it works I guess
async function fetchCharacterVariantsFromDB()
{
	let dt = await window.writer.getCharacterData();

	await fetchCharacterVariant(dt.symbol, "-jp", "🇯🇵 Kanji");
	await fetchCharacterVariant(dt.symbol, "-ko", "🇰🇷 Hanja");
}

function constructPreviewEvents()
{
	const nameTextField = $("name-text-field");
	const characterTextField = $("character-text-field");

	addFinishButton(nameTextField, characterTextField, null);

	// Pinyinifies text in the input box if using the pinyinifier
	$("meaning-text-field").addEventListener("change", function()
	{
		let t = window.bUsingPinyinConversion ? pinyinify(this.value) : this.value;
		this.value = t;
	});

	// Update preview and list when the user adds a definition
	addButtonEvent("add-meaning-list-button", "click", function()
	{
		const txtField = $("meaning-text-field");

		if (txtField.value == "")
			return;

		let t = window.bUsingPinyinConversion ? pinyinify(txtField.value) : txtField.value;
		txtField.value = t;

		constructListElement(txtField.value, window.previewDefinitions.length);
		updateListElements();
		txtField.value = "";
	});

	// Animate characters on hover in the preview view
	addButtonEvent("card-character-target-div-preview", "mouseover", function()
	{
		window.writer.animateCharacter();
	});

	// Pinyinify on change. Additionally, if the preview name is empty add the default preview name
	nameTextField.addEventListener("change", function()
	{
		window.previewName = window.bUsingPinyinConversion ? pinyinify(this.value) : this.value;
		this.value = window.previewName;
		if (window.previewName == "")
			window.previewName = window.CARD_DEFAULT_PREVIEW_NAME;

		const el = $("card-preview-name");
		el.innerText = `${window.previewName}`;
	});

	// Pinyinify on change. Also set the writer character to update in the preview view
	characterTextField.addEventListener("change", function()
	{
		window.previewCharacter = window.bUsingPinyinConversion ? pinyinify(this.value) : this.value;
		this.value = window.previewCharacter;
		if (window.previewCharacter == "")
			window.previewCharacter = window.CARD_DEFAULT_CHARACTER;

		window.writer.setCharacter(window.previewCharacter.charAt(0) + window.previewVariant);
		fetchCharacterVariantsFromDB();
	});

	// Set variant of character from the variant box
	$("character-variant-box").addEventListener("change", function()
	{
		window.previewVariant = this.value;
		window.writer.setCharacter(window.previewCharacter.charAt(0) + window.previewVariant);
	});
	writerRecreate();
	fetchCharacterVariantsFromDB();
}

constructPreviewEvents();
