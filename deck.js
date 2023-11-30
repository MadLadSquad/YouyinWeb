'use strict';

/**
 * The export button callback. Stringifies the current data and exports it.
 */
function updateExportButton()
{
	const dt = window.localStorageData;
	const data = {
		cards: dt.cards,
		phrases: dt.phrases
	}

	let file = new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8" });

	const link = document.createElement("a");
	link.href = URL.createObjectURL(file);
	link.download = "deck.yydeck.json";
	link.click();
	URL.revokeObjectURL(link.href);
}

/**
 * The import deck button callback. Imports a deck from a file.
 * @param {string} f - The element in question
 */
function importDeck(f) {
	let bExecuted = confirm(lc.import_deck_confirm_text);
	if (bExecuted)
	{
		const reader = new FileReader();
		reader.addEventListener("load", (e) => {
			let dt = window.localStorageData;
			let data = JSON.parse(e.target.result.toString());

			dt.cards.push.apply(dt.cards, data.cards);
			dt.phrases.push.apply(dt.phrases, data.phrases);

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

/**
 * Sets data about the current user. Deals with calculating most of the statistics and showcasing them
 */
function setProfileCardData()
{
	$("total-sessions-field").textContent += window.localStorageData.sessions;
	$("streak-field").textContent += (window.localStorageData.streak + lc.streak_field_days);
	$("deck-card-num-field").textContent += window.localStorageData.cards.length;
	$("deck-phrase-num-field").textContent += window.localStorageData.phrases.length;

	let a = (window.localStorageData.totalTimeInSessions * 1);
	let averageSessionLen = isNaN(a) ? 0 : a;
	let sessionLenPostfix = lc.milliseconds;

	const result = getLocalisedTimePostfix(averageSessionLen);
	sessionLenPostfix = result.postfix;
	averageSessionLen = result.time;

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

/**
 * Constructs a card HTML element
 * @param { Object } it - Struct for the card data
 * @param { number } index - Used to create UUIDs. For normal cards, it's offset by the number of phrases
 * @param { HTMLElement } container - HTML element to attach to
 * @param { number } localIndex - non-unique index
 */
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
	runEventAfterAnimation(editButton, "click", (e) =>
	{
		// In the line above, we store the card index in the "arbitrary-data" field. Here we retrieve it
		location.href = `./deck-edit-card.html?${e.target.phrase}edit=${e.target.attributes["arbitrary-data"].nodeValue}`;
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

function setupGameModifiers()
{
	const extensiveModeCheckbox = $("extensive-mode-checkbox");
	extensiveModeCheckbox.checked = window.gameModifiers.extensive;

	extensiveModeCheckbox.addEventListener("change", function(){
		window.gameModifiers.extensive = this.checked;
		saveGameModifiers();
	});

	const levelReduce = $("level-reduce-slider");
	levelReduce.value = window.gameModifiers.levelReduce;
	levelReduce.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${parseFloat(levelReduce.value).toFixed(2).toString()} `;

	levelReduce.addEventListener("input", (e) => {
		window.gameModifiers.levelReduce = e.target.value;
		e.target.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${parseFloat(e.target.value).toFixed(2).toString()} `;
		saveGameModifiers();
	});
}

/**
 * Main function for the deck page
 */
function deckmain()
{
	setProfileCardData();
	setupGameModifiers();

	// Get the elements and load their onclick events, holy shit that's massive! That's what she said!
	runEventAfterAnimation($("export-deck-button"), "click", updateExportButton);
	runEventAfterAnimation($("clear-deck-button"), "click", clearDeck);
	runEventAfterAnimation($("import-deck-button"), "click", function(){
		$("fileupload").click();
	});
	$("fileupload").addEventListener("change", importDeck);

	runEventAfterAnimation($("new-card-button"), "click", function() { location.href = './deck-edit-card.html?new' });
	runEventAfterAnimation($("new-phrase-button"), "click", function() { location.href = './deck-edit-card.html?phrase-new' });
	runEventAfterAnimation($("marketplace-deck-button"), "click", function() { location.href = './marketplace.html' });

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
		constructCard(it, (val + data.phrases.length), cardsContainer, val);
	}
}

deckmain();