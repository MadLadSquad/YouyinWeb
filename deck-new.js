'use strict';

// Global variables, why not
var previewName = window.CARD_DEFAULT_PREVIEW_NAME;
var previewCharacter = window.CARD_DEFAULT_CHARACTER;
var previewDefinitions = [  ];
var previewVariant = "";

var bUsingPinyinConversion = false;

var writer;

function pinyinify(string) {
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

function updateListElements()
{
	const editList = document.getElementById("definition-list-current-edit");
	const previewList = document.getElementById("card-preview-list");
	editList.replaceChildren(...window.previewDefinitions);

	let tmpArr = [];
	for (let i = 0; i < window.previewDefinitions.length; i++)
	{
		let el = document.createElement("li");
		el.textContent = window.previewDefinitions[i].textContent.slice(0, -1);
		tmpArr.push(el);
	}
	previewList.replaceChildren(...tmpArr);
}

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
		data["definitions"].push(previewDefinitions[i].innerText.slice(0, -1));
	}

	window.localStorageData["cards"].push(data);
	saveToLocalStorage(window.localStorageData);
	location.href = "./deck.html";
}

// Always call updateListElements after this
// Returns void, takes the name of the list element and an id for further on click events
function constructListElement(name, id)
{
	let el = document.createElement("li");
	el.textContent = (name + " ");

	// Add a remove definition button on each call
	let button = document.createElement("button");
	button.className = "card-button-edit small-button";
	button.id = `remove-meaning-list-button-${id}`;
	button.textContent = "-";
	button.addEventListener("click", function()
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

	// Append the button to the list element and push to the preview definitions list
	el.appendChild(button);
	window.previewDefinitions.push(el);
}

// Returns void, takes references to the name text field, the character text field and the definition ordered list
function addFinishButton(nameTextField, characterTextField, meaningList)
{
	const button = document.getElementById("finish-edit-button");
	const urlParams = new URLSearchParams(window.location.search);
	let finishButtonClickFunction;

	if (urlParams.has("edit"))
	{
		const data = window.localStorageData["cards"];
		// This statement checkf if the number provided as a parameter of the page is higher or equal to the length of the array.
		// This check is needed because we use indexes as parameters for editing the card
		if (urlParams.get("edit") >= data.length)
		{
			finishButtonClickFunction = finishButtonNewCard;
			return;
		}
		// Get reference to the element we're currently editing
		const el = data[urlParams.get("edit")]

		const nameTextBox = document.getElementById("name-text-field");
		const characterTextBox = document.getElementById("character-text-field");
		const previewName = document.getElementById("card-preview-name");

		nameTextBox.value = el["name"];
		window.previewName = el["name"];
		previewName.textContent = el["name"];

		characterTextBox.value = el["character"].charAt(0);
		window.previewCharacter = el["character"].charAt(0);

		// Deal with regional character variants
		window.previewVariant = el["character"].length > 1 ? el["character"].substr(1, el["character"].length) : "";
		document.getElementById("character-variant-box").value = window.previewVariant;

		// Add all the definitions to the ordered lists
		for (let i in el["definitions"])
		{
			let it = el["definitions"][i];
			constructListElement(it, i);
			updateListElements();
		}

		// Callback for the finish button
		finishButtonClickFunction = function()
		{
			const urlParams = new URLSearchParams(window.location.search);
			let dt = window.localStorageData;
			let data = dt["cards"][urlParams.get("edit")];

			data["name"] = window.previewName;
			data["character"] = window.previewCharacter.charAt(0) + window.previewVariant;
			data["definitions"] = [];
			for (let i = 0; i < previewDefinitions.length; i++)
			{
				data["definitions"].push(previewDefinitions[i].innerText.slice(0, -1));
			}
			saveToLocalStorage(dt);
			location.href = "./deck.html";
		};

		// Dynamically put the delete button there because it doesn't exist by default in the HTML
		const parentDiv = document.getElementById("current-new-card");
		const deleteButton = document.createElement("button");
		deleteButton.id = "delete-card-button";
		deleteButton.className = "card-button-edit";
		deleteButton.textContent = "Delete"

		// On click ask for confirmation
		deleteButton.addEventListener("click", function()
		{
			let bExecuted = confirm("Are you sure you want to delete the card?");
			if (bExecuted)
			{
				const urlParams = new URLSearchParams(window.location.search);
				let dt = window.localStorageData;
				dt["cards"].splice(urlParams.get("edit"), 1);

				saveToLocalStorage(dt);
				location.href = "./deck.html"
			}
		});
		// Add the button to the div
		parentDiv.appendChild(deleteButton);
	}
	else // In any other case such as non "edit" parameters we assing to this
		finishButtonClickFunction = finishButtonNewCard;

	// Add selected function event
	button.addEventListener("click", finishButtonClickFunction);
}

function addButtonEvent(id, type, func)
{
	document.getElementById(id).addEventListener(type, func);
}

function writerRecreate()
{
	document.getElementById("card-character-target-div-preview").replaceChildren();
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

async function fetchCharacterVariant(character, postfix, textContent)
{
	let select = document.getElementById("character-variant-box")
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
		let option = document.createElement("option");
		option.setAttribute("value", postfix);
		option.textContent = textContent;
		select.appendChild(option)
	}
}

async function fetchCharacterVariantsFromDB()
{
	let dt = await window.writer.getCharacterData();

	await fetchCharacterVariant(dt.symbol, "-jp", "🇯🇵 Kanji");
	await fetchCharacterVariant(dt.symbol, "-ko", "🇰🇷 Hanja");
}

function constructPreviewEvents()
{
	const nameTextField = document.getElementById("name-text-field");
	const characterTextField = document.getElementById("character-text-field");

	addFinishButton(nameTextField, characterTextField, null);

	document.getElementById("meaning-text-field").addEventListener("change", function()
	{
		let t = window.bUsingPinyinConversion ? pinyinify(this.value) : this.value;
		this.value = t;
	});

	addButtonEvent("add-meaning-list-button", "click", function()
	{
		const txtField = document.getElementById("meaning-text-field");

		if (txtField.value == "")
			return;

		let t = window.bUsingPinyinConversion ? pinyinify(txtField.value) : txtField.value;
		txtField.value = t;

		constructListElement(txtField.value, window.previewDefinitions.length);
		updateListElements();
		txtField.value = "";
	});

	addButtonEvent("card-character-target-div-preview", "mouseover", function()
	{
		window.writer.animateCharacter();
	});

	nameTextField.addEventListener("change", function()
	{
		window.previewName = window.bUsingPinyinConversion ? pinyinify(this.value) : this.value;
		this.value = window.previewName;
		if (window.previewName == "")
			window.previewName = window.CARD_DEFAULT_PREVIEW_NAME;

		const el = document.getElementById("card-preview-name");
		el.innerText = `${window.previewName}`;
	});

	characterTextField.addEventListener("change", function()
	{
		window.previewCharacter = window.bUsingPinyinConversion ? pinyinify(this.value) : this.value;
		this.value = window.previewCharacter;
		if (window.previewCharacter == "")
			window.previewCharacter = window.CARD_DEFAULT_CHARACTER;

		window.writer.setCharacter(window.previewCharacter.charAt(0) + window.previewVariant);
		fetchCharacterVariantsFromDB();
	});
	document.getElementById("character-variant-box").addEventListener("change", function()
	{
		window.previewVariant = this.value;
		window.writer.setCharacter(window.previewCharacter.charAt(0) + window.previewVariant);
	});
	writerRecreate();
	fetchCharacterVariantsFromDB();
}

constructPreviewEvents();
