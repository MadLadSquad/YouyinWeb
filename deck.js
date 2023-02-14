'use strict';

function updateExportButton()
{
	const dt = window.localStorageData["cards"];

	let file = new Blob([JSON.stringify(dt)], { type: "application/json;charset=utf-8" });

	const link = document.createElement("a");
	link.href = URL.createObjectURL(file);
	link.download = "deck.yydeck.json";
	link.click();
	URL.revokeObjectURL(link.href);
}

function importDeck(f) {
	let bExecuted = confirm("Importing a deck WILL merge your current deck with the new one, to replace it first clear your current deck!");
	if (bExecuted)
	{
		const reader = new FileReader();
		reader.addEventListener("load", function(){
			let dt = window.localStorageData;
			dt["cards"].push.apply(dt["cards"], JSON.parse(this.result));

			saveToLocalStorage(dt);
			document.location.reload();
		});
		reader.readAsText(f.target.files[0])
	}
}

function clearDeck() {
	let bExecuted = confirm("Are you sure you want to DELETE the current deck, THIS CANNOT BE UNDONE! Export your data to save it just in case!");
	if (bExecuted)
	{
		let dt = window.localStorageData;
		dt["cards"] = [];

		saveToLocalStorage(dt);
		document.location.reload();
	}
}

function setProfileCardData()
{
	document.getElementById("total-sessions-field").textContent += window.localStorageData["sessions"];
	document.getElementById("streak-field").textContent += (window.localStorageData["streak"] + " days");
	document.getElementById("deck-card-num-field").textContent += window.localStorageData["cards"].length;

	const lastDate = window.localStorageData["lastDate"];
	const date = new Date(lastDate);
	document.getElementById("last-session-date-field").textContent += date.toLocaleDateString('en-GB',
	{
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "numeric"
	});

	const averageKnowledge = document.getElementById("average-knowledge-level-field");
	let knowledge = 0;
	for (let i in window.localStorageData["cards"])
		knowledge += window.localStorageData["cards"][i]["knowledge"];

	knowledge /= window.localStorageData["cards"].length;
	if (isNaN(knowledge))
		knowledge = 0;
	averageKnowledge.textContent = `Average knowledge level: ${knowledge.toFixed(4)}`;
}

function deckmain()
{
	setProfileCardData();

	// Get the elements and load their onclick events, holy shit that's massive! That's what she said!
	document.getElementById("export-deck-button").addEventListener("click", updateExportButton);
	document.getElementById("clear-deck-button").addEventListener("click", clearDeck);
	document.getElementById("import-deck-button").addEventListener("click", function(){
		document.getElementById("fileupload").click();
	});
	document.getElementById("fileupload").addEventListener("change", importDeck);

	const data = window.localStorageData;
	let deck = document.getElementById("deck");

	for (let val in data["cards"])
	{
		const it = data["cards"][val];

		// Add parent div
		let div = document.createElement("div");
		div.className = "card centered";
		div.id = `${val}`

		// Add title, character render div and the definitions text
		addElement("h3", `${it["name"]} ${it["knowledge"]}/5`, "", "", "", div);
		const target = addElement("div", "", `card-character-target-div-${val}`, "", "", div);
		addElement("p", "Definitions:", "", "", "", div);

		// Add the list to the card and fill it with elements
		let list = document.createElement("ol");
		for (let i in it["definitions"])
		{
			let f = it["definitions"][i];
			addElement("li", `${f}`, "", "", "", list);
		}
		div.appendChild(list);

		// Create the "Edit" button and add an onclick event that redirects to the new card page
		addElement("button", "Edit", `${val}`, "card-button-edit", "submit", div).addEventListener("click", function()
		{
			location.href = `./deck-edit-card.html?edit=${this.id}`;
		});

		deck.appendChild(div);

		// Create an instance of the writer
		let writer = HanziWriter.create(`card-character-target-div-${val}`, it["character"],
		{
			width: 100,
			heigt: 100,
			padding: 5,
			showOutline: true,
			strokeAnimationSpeed: 1.25,
			delayBetweenStrokes: 50,
		})
		target.addEventListener('mouseover', function() 
		{
			writer.animateCharacter();
		});
	}
}

deckmain();
