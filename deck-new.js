'use strict';

// Global variables, why not
var previewName = window.CARD_DEFAULT_PREVIEW_NAME;
var previewCharacter = window.CARD_DEFAULT_CHARACTER;
var previewDefinitions = [  ];

var writer;

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
		character: window.previewCharacter,
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

		characterTextBox.value = el["character"];
		window.previewCharacter = el["character"];

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
			data["character"] = window.previewCharacter;
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

function constructPreviewEvents()
{
	const nameTextField = document.getElementById("name-text-field");
	const characterTextField = document.getElementById("character-text-field");

	addFinishButton(nameTextField, characterTextField, null);

	addButtonEvent("add-meaning-list-button", "click", function()
	{
		const txtField = document.getElementById("meaning-text-field");

		if (txtField.value == "")
			return;

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
		window.previewName = this.value;
		if (window.previewName == "")
			window.previewName = window.CARD_DEFAULT_PREVIEW_NAME;

		const el = document.getElementById("card-preview-name");
		el.innerText = `${window.previewName}`;
	});

	characterTextField.addEventListener("change", function()
	{
		window.previewCharacter = this.value;
		if (window.previewCharacter == "")
			window.previewCharacter = window.CARD_DEFAULT_CHARACTER;

		window.writer.setCharacter(window.previewCharacter.charAt(0));
	});

	writerRecreate();
}

constructPreviewEvents();
