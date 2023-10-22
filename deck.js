'use strict';

var HOUR_UNIX = 36000000;
var MINUTE_UNIX = 60000;
var SECOND_UNIX = 1000;

function updateExportButton()
{
	const dt = window.localStorageData.cards;

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
			dt.cards.push.apply(dt.cards, JSON.parse(this.result));

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
		dt.cards = [];

		saveToLocalStorage(dt);
		document.location.reload();
	}
}

function setProfileCardData()
{
	$("total-sessions-field").textContent += window.localStorageData.sessions;
	$("streak-field").textContent += (window.localStorageData.streak + " days");
	$("deck-card-num-field").textContent += window.localStorageData.cards.length;
	$("deck-phrase-num-field").textContent += window.localStorageData.phrases.length;

	let a = (window.localStorageData.totalTimeInSessions * 1);
	let averageSessionLen = isNaN(a) ? 0 : a;
	let sessionLenPostfix = "ms"

	// 1000 * 60 * 60 basically an hour
	if (averageSessionLen > window.HOUR_UNIX)
	{
		sessionLenPostfix = "h"
		averageSessionLen /= window.HOUR_UNIX;
	}
	else if (averageSessionLen > window.MINUTE_UNIX)
	{
		sessionLenPostfix = "min"
		averageSessionLen /= window.MINUTE_UNIX;
	}
	else if (averageSessionLen > window.SECOND_UNIX)
	{
		sessionLenPostfix = "sec";
		averageSessionLen /= window.SECOND_UNIX;
	}

	let sessionLenTmp = averageSessionLen / window.localStorageData.sessions;
	if (isNaN(sessionLenTmp))
		sessionLenTmp = 0;
	$("average-session-length-field").textContent += (sessionLenTmp.toFixed(2).toString() + sessionLenPostfix);
	$("time-spent-in-sessions-field").textContent += (averageSessionLen.toFixed(2).toString() + sessionLenPostfix);

	const lastDate = window.localStorageData.lastDate;
	if (lastDate != 0)
	{
		const date = new Date(lastDate);
		$("last-session-date-field").textContent += date.toLocaleDateString('en-GB',
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
		$("last-session-date-field").textContent += "No sessions yet recorded!";

	const averageKnowledge = $("average-knowledge-level-field");
	let knowledge = 0;
	for (let i in window.localStorageData.cards)
		knowledge += window.localStorageData.cards[i].knowledge;

	knowledge /= window.localStorageData.cards.length;
	if (isNaN(knowledge))
		knowledge = 0;
	averageKnowledge.textContent = `Average knowledge level: ${knowledge.toFixed(2)}/${window.MAX_KNOWLEDGE_LEVEL}`;
}

function constructCard(it, index, container)
{
	// Add parent div
	let div = document.createElement("div");
	div.className = "card centered";
	div.id = `${index}`

	// Add title, character render div and the definitions text
	addElement("h3", `${it.name} ${it.knowledge}/${window.MAX_KNOWLEDGE_LEVEL}`, "", "", "", div);
	const target = it["character"]
									? addElement("div", "", `card-character-target-div-${index}`, "", "", div)
									: addElement("h1", it.phrase, `card-character-target-div-${index}`, "phrase-card-header", "", div);
	addElement("p", "Definitions:", "", "", "", div);

	// Add the list to the card and fill it with elements
	let list = document.createElement("ol");
	for (let i in it.definitions)
	{
		let f = it.definitions[i];
		addElement("li", `${f}`, "", "", "", list);
	}
	div.appendChild(list);

	// If it's a character find which phrases contain it
	if (it["character"])
	{
		const data = window.localStorageData;
		// Actual optimisation
		if (data.phrases.length > 0)
		{
			// This is really not performant...
			let paragraph = addElement("p", "Part of:", "", "", "", div);
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
	addElement("button", "Edit", `${index}`, "card-button-edit", "submit", div).addEventListener("click", function()
	{
		location.href = `./deck-edit-card.html?edit=${this.id}`;
	});

	container.appendChild(div);
	if (it["character"])
	{
		// Create an instance of the writer
		let writer = HanziWriter.create(`card-character-target-div-${index}`, it.character,
		{
			width: window.CARD_WRITER_SIZE,
			height: window.CARD_WRITER_SIZE,
			padding: window.WRITER_PADDING,
			showOutline: true,
			strokeAnimationSpeed: window.CARD_WRITER_STROKE_ANIMATION_SPEED,
			delayBetweenStrokes: window.CARD_WRITER_DELAY_BETWEEN_STROKES,
			charDataLoader: charDataLoader,
		})
		target.addEventListener('mouseover', function() 
		{
			writer.animateCharacter();
		});
	}
}

function deckmain()
{
	setProfileCardData();

	// Get the elements and load their onclick events, holy shit that's massive! That's what she said!
	$("export-deck-button").addEventListener("click", updateExportButton);
	$("clear-deck-button").addEventListener("click", clearDeck);
	$("import-deck-button").addEventListener("click", function(){
		$("fileupload").click();
	});
	$("fileupload").addEventListener("change", importDeck);

	const data = window.localStorageData;
	let cardsContainer = $("deck-characters-section");
	let phrasesContainer = $("deck-phrases-section");

	// Remove phrases elements if none are available
	if (data.phrases.length == 0)
	{
		$("deck-phrases-header").remove();
		$("deck-phrases-section").remove();
	}
	else // Load phrases
	{
		for (let val in data.phrases)
		{
			const it = data.phrases[val];
			constructCard(it, val, phrasesContainer);
		}
	}

	// Remove cards elements if none are available
	if (data.cards.length == 0)
	{
		$("deck-characters-header").remove();
		$("deck-characters-section").remove();
		return;
	}

	// Load normal cards
	for (let val in data.cards)
	{
		const it = data.cards[val];
		constructCard(it, val + data.phrases.length, cardsContainer);
	}
}

deckmain();
