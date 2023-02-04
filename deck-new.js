// Global variables, why not
var previewName = "Preview Name";
var previewCharacter = "是";
var previewDefinitions = [  ];

var writer;

function updateListElements()
{
	const editList = document.getElementById("definition-list-current-edit");
	const previewList = document.getElementById("card-preview-list");
	editList.replaceChildren(...window.previewDefinitions);

	var tmpArr = [];
	for (var i = 0; i < window.previewDefinitions.length; i++)
	{
		var el = document.createElement("li");
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

	for (var i = 0; i < previewDefinitions.length; i++)
	{
		data["definitions"].push(previewDefinitions[i].innerText.slice(0, -1));
	}

	var dt = JSON.parse(window.localStorage.getItem("youyinCardData"))
	dt["cards"].push(data);
	window.localStorage.setItem("youyinCardData", JSON.stringify(dt));
	location.href = "./deck.html";
}

function constructListElement(name, id)
{
	var el = document.createElement("li");
	el.textContent = (name + " ");

	var button = document.createElement("button");
	button.className = "card-button-edit small-button";
	button.id = `remove-meaning-list-button-${id}`;
	button.textContent = "-";
	button.addEventListener("click", function()
	{
		for (var i = 0; i < window.previewDefinitions.length; i++)
		{
			if (window.previewDefinitions[i].firstElementChild.id == this.id)
			{
				window.previewDefinitions.splice(i, 1);
				updateListElements();
				break;
			}
		}
	});

	el.appendChild(button);

	window.previewDefinitions.push(el);
	updateListElements();
}

function addFinishButton(nameTextField, characterTextField, meaningList)
{
	const button = document.getElementById("finish-edit-button");
	const urlParams = new URLSearchParams(window.location.search);
	var finishButtonClickFunction;
	if (urlParams.has("edit"))
	{
		const data = JSON.parse(window.localStorage.getItem("youyinCardData"))["cards"];
		if (urlParams.get("edit") >= data.length)
		{
			finishButtonClickFunction = finishButtonNewCard;
			return;
		}
		const el = data[urlParams.get("edit")]

		const nameTextBox = document.getElementById("name-text-field");
		const characterTextBox = document.getElementById("character-text-field");
		const previewName = document.getElementById("card-preview-name");

		nameTextBox.value = el["name"];
		window.previewName = el["name"];
		previewName.textContent = el["name"];

		characterTextBox.value = el["character"];
		window.previewCharacter = el["character"];

		for (var i in el["definitions"])
		{
			var it = el["definitions"][i];
			constructListElement(it, i);
		}

		finishButtonClickFunction = function()
		{
			const urlParams = new URLSearchParams(window.location.search);
			var dt = JSON.parse(window.localStorage.getItem("youyinCardData"))
			var data = dt["cards"][urlParams.get("edit")];

			data["name"] = window.previewName;
			data["character"] = window.previewCharacter;
			data["definitions"] = [];
			for (var i = 0; i < previewDefinitions.length; i++)
			{
				data["definitions"].push(previewDefinitions[i].innerText.slice(0, -1));
			}
			window.localStorage.setItem("youyinCardData", JSON.stringify(dt));
			location.href = "./deck.html";
		};

		const parentDiv = document.getElementById("current-new-card");
		const deleteButton = document.createElement("button");
		deleteButton.id = "delete-card-button";
		deleteButton.className = "card-button-edit";
		deleteButton.textContent = "Delete"
		deleteButton.addEventListener("click", function()
		{
			var bExecuted = confirm("Are you sure you want to delete the card?");
			if (bExecuted)
			{
				const urlParams = new URLSearchParams(window.location.search);
				var dt = JSON.parse(window.localStorage.getItem("youyinCardData"));
				dt["cards"].splice(urlParams.get("edit"), 1);

				window.localStorage.setItem("youyinCardData", JSON.stringify(dt));
				location.href = "./deck.html"
			}
		});

		parentDiv.appendChild(deleteButton);
	}
	else
		finishButtonClickFunction = finishButtonNewCard;

	button.addEventListener("click", finishButtonClickFunction);
}

function constructPreviewEvents()
{
	const nameTextField = document.getElementById("name-text-field");
	const characterTextField = document.getElementById("character-text-field");
	const meaningButton = document.getElementById("add-meaning-list-button");
	const writerEl = document.getElementById("card-character-target-div-preview");

	addFinishButton(nameTextField, characterTextField, null);

	meaningButton.addEventListener("click", function()
	{
		const txtField = document.getElementById("meaning-text-field");

		if (txtField.value == "")
			return;

		constructListElement(txtField.value, window.previewDefinitions.length);
		txtField.value = "";
	});

	nameTextField.addEventListener("change", function()
	{
		window.previewName = this.value;

		const el = document.getElementById("card-preview-name");
		el.innerText = `${previewName}`;
	});

	characterTextField.addEventListener("change", function()
	{
		window.previewCharacter = this.value;
		if (window.previewCharacter == "")
			window.previewChracter = "是";

		window.writer.setCharacter(window.previewCharacter.charAt(0));
	});

	window.writer = HanziWriter.create("card-character-target-div-preview", previewCharacter,
	{
		width: 100,
		heigt: 100,
		padding: 5,
		showOutline: true,
		strokeAnimationSpeed: 1.25,
		delayBetweenStrokes: 50,
	})
	writerEl.addEventListener('mouseover', function()
	{
		window.writer.animateCharacter();
	});
}

constructPreviewEvents();
