'use strict';

window.HOUR_UNIX = 36000000;
window.MINUTE_UNIX = 60000;
window.SECOND_UNIX = 1000;

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
	let bExecuted = confirm(lc.import_deck_confirm_text);
	if (bExecuted)
	{
		const reader = new FileReader();
		reader.addEventListener("load", function(){
			let dt = window.localStorageData;
			dt.cards.push.apply(dt.cards, JSON.parse(this.result.toString()));

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

		saveToLocalStorage(dt);
		document.location.reload();
	}
}

function setProfileCardData()
{
	$("total-sessions-field").textContent += window.localStorageData.sessions;
	$("streak-field").textContent += (window.localStorageData.streak + lc.streak_field_days);
	$("deck-card-num-field").textContent += window.localStorageData.cards.length;
	$("deck-phrase-num-field").textContent += window.localStorageData.phrases.length;

	let a = (window.localStorageData.totalTimeInSessions * 1);
	let averageSessionLen = isNaN(a) ? 0 : a;
	let sessionLenPostfix = lc.milliseconds;

	// 1000 * 60 * 60 basically an hour
	if (averageSessionLen > window.HOUR_UNIX)
	{
		sessionLenPostfix = lc.hours;
		averageSessionLen /= window.HOUR_UNIX;
	}
	else if (averageSessionLen > window.MINUTE_UNIX)
	{
		sessionLenPostfix = lc.minutes;
		averageSessionLen /= window.MINUTE_UNIX;
	}
	else if (averageSessionLen > window.SECOND_UNIX)
	{
		sessionLenPostfix = lc.seconds;
		averageSessionLen /= window.SECOND_UNIX;
	}

	let sessionLenTmp = averageSessionLen / window.localStorageData.sessions;
	if (isNaN(sessionLenTmp))
		sessionLenTmp = 0;
	$("average-session-length-field").textContent += (sessionLenTmp.toFixed(2).toString() + sessionLenPostfix);
	$("time-spent-in-sessions-field").textContent += (averageSessionLen.toFixed(2).toString() + sessionLenPostfix);

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
	averageKnowledge.textContent = `${lc.average_knowledge_level}: ${knowledge.toFixed(2)}/${window.MAX_KNOWLEDGE_LEVEL}`;
}

// it - struct
// index - used to create UUIDs. For normal cards, its offset by the number of phrases
// constainer - container element
// localIndex - non-unique index
function constructCard(it, index, container, localIndex)
{
	// Add parent div
	let div = addElement("div", "", `card-container-${index}`, "card centered", "", container)

	// Add title, character render div and the definitions text
	addElement("h3", `${it.name} ${it.knowledge}/${window.MAX_KNOWLEDGE_LEVEL}`, "", "", "", div);
	const target = it["character"]
									? addElement("div", "", `card-character-target-div-${index}`, "", "", div)
									: addElement("h1", it.phrase, `card-character-target-div-${index}`, "phrase-card-header", "", div);
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
	editButton.addEventListener("click", function()
	{
		// In the line above, we store the card index in the "arbitrary-data" field. Here we retrieve it
		location.href = `./deck-edit-card.html?${this.phrase}edit=${this.attributes["arbitrary-data"].nodeValue}`;
	});

	if (it["character"])
	{
		// Create an instance of the writer
		let writer = HanziWriter.create(`card-character-target-div-${index}`, it.character + it.variant,
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
		constructCard(it, val + data.phrases.length, cardsContainer, val);
	}
}

deckmain();
