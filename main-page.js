'use strict';

// Global writer variable, because yes
window.writer;

window.totalPhraseErrors = 0;
window.errors = 0;
window.backwardsErrors = 0;

window.bInTest = false;
window.bInPhrase = false;

window.totalPhraseStrokes = 0;

window.currentPhraseIndex = 0;
window.currentIndex = 0;
window.sessionTime = 0;

window.bMobile = false;

window.linkChildren = null;

// This function uses some dark magic that works half the time in order to calculate the size of the mainpage viewport
// and main elements. Here are some issues:
// TODO: On portrait screens if the resolution changes this sometimes breaks and a refresh is needed, would be good if it was fixed. 
// Probably check out main.css and the main-page media query
function getDrawElementHeight()
{
	// Some magic code to calculate the height
	const html = document.querySelector("html");
	const mainEl = document.querySelector("main");
	const startButtonWriterSection = $("start-button-writer-section");//document.querySelector("main");
	const lastChild = html.lastElementChild;
	const lastChildRect = lastChild.getBoundingClientRect();
	const parentRect = html.getBoundingClientRect();
	const unusedSpace = parentRect.bottom - lastChildRect.bottom;

	// Here we have to adjust the height, because the list widget causes problems
	const listWidget = $("main-page-info-container");

	const footer = document.querySelector("footer");

	let finalHeight = window.innerHeight - unusedSpace + listWidget.getBoundingClientRect().height;
	window.bMobile = navigator.userAgent.toLowerCase().includes("mobile");
	if (window.bMobile)
	{
		finalHeight -= (footer.getBoundingClientRect().height);
	}
	else
	{
		finalHeight -= (listWidget.getBoundingClientRect().height + footer.getBoundingClientRect().height);
	}

	if (mainEl.getBoundingClientRect().width < finalHeight)
		finalHeight = mainEl.getBoundingClientRect().width - (getComputedStyle(startButtonWriterSection).paddingLeft.replace("px", "") * 2);
	else
	{
		listWidget.style.setProperty("height", finalHeight.toString() + "px");
		mainEl.style.setProperty("height", finalHeight.toString() + "px");
	}

	return finalHeight;
}

function writerOnMistake(strokeData)
{
	// Error calculation and display
	if (strokeData.isBackwards)
		window.backwardsErrors++;

	// Since we don't count backwards strokes as errors, remove them rom the mistakes and calculate errors correctly
	if ((strokeData.mistakesOnStroke - window.backwardsErrors) === window.WRITER_SHOW_HINT_ON_ERRORS)
	{
		window.errors++;
		window.totalPhraseErrors++;
	}

	// Either use the number of cards or the phrase-local number
	let num = window.localStorageData.cards.length;
	if (window.bInPhrase)
	{
		num = window.localStorageData.phrases[window.currentPhraseIndex].phrase.length;
		// Also update the phrase information. It's ugly, I know...
		$("phrase-info-widget-errors").textContent = `${lc.phrases_count_phrase}: ${window.currentPhraseIndex}/${window.localStorageData.phrases.length}; ${lc.phrases_count_errors}: ${window.totalPhraseErrors}`;
	}

	// Update the card information
	$("character-info-widget-errors").textContent = `${lc.phrases_count_cards}: ${window.currentIndex}/${num}; ${lc.phrases_count_errors}: ${window.errors}`;
}

function writerOnCorrectStroke(_)
{
	window.backwardsErrors = 0;
}

function updateIndividualSidebarElementText(prefix, spelling, errors, obj)
{
	$(`${prefix}-info-widget-spelling`).textContent = spelling;
	$(`${prefix}-info-widget-errors`).textContent = errors;
	const list = $(`${prefix}-info-widget-info`);
	list.replaceChildren();

	if (obj !== null)
	{
		for (let i in obj.definitions)
		{
			addElement("li", obj.definitions[i], "", "", "", list);
		}
	}
}

function changeSidebarText(phrase, phraseNum, card, cardNum)
{
	let definitionParagraph = $("character-info-widget-def-p");

	if (phrase !== null && phraseNum > 0)
		updateIndividualSidebarElementText("phrase", phrase.name, `${lc.phrases_count_phrase}: ${window.currentPhraseIndex}/${phraseNum}; ${lc.phrases_count_errors}: ${window.totalPhraseErrors}`, phrase);

	if (card !== null && cardNum > 0)
		updateIndividualSidebarElementText("character", `${lc.phrases_count_spelling}: ${card.name}`, `${lc.phrases_count_cards}: ${window.currentIndex}/${cardNum}; ${lc.phrases_count_errors}: 0`, card);
	else
	{
		updateIndividualSidebarElementText("character", lc.unknown_character, "", null);
		definitionParagraph.style.display = "none";
		return;
	}
	definitionParagraph.style.display = "block";
}

function resetSidebar()
{
	// Ugly ahh code to reset to the inital state
	$("character-info-widget-spelling").textContent = `${lc.phrases_count_spelling}: ${lc.to_be_loaded}`;
	$("character-info-widget-errors").textContent = `${lc.phrases_count_cards}: 0/0; ${lc.phrases_count_errors}: 0`;

	$("character-info-widget-info").replaceChildren(addElement("li", lc.to_be_loaded, "", "", "", null));

	// Hide the phrase info widget
	$("phrase-info-widget").style.display = "none";
}

function setWriterState(ref)
{
	// Set the default writer state. Certain knowledge levels have certain features enabled/disabled
	window.writer._options.showHintAfterMisses = 3;
	window.writer.updateColor("radicalColor", null);
	if (ref.knowledge >= 3)
	{
		window.writer.hideOutline();
	}
	else if (ref.knowledge >= 2)
	{
		window.writer._options.showHintAfterMisses = window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3;
		window.writer.hideOutline();
	}
	else if (ref.knowledge >= 1)
	{
		window.writer.showOutline();
	}
	else
	{
		window.writer.updateColor("radicalColor", window.WRITER_RADICAL_COLOUR);
		window.writer.showOutline();
	}
}

function computeScore(strokes, errors, knowledge)
{
	let pointsPerStroke = (window.MAX_POINTS_ON_CHARACTER / strokes);
	let points = (window.MAX_POINTS_ON_CHARACTER - (errors * pointsPerStroke));
	let result;

	if (points >= window.MAX_POINTS_ON_CHARACTER)
		result = window.MAX_POINTS_ON_CHARACTER;
	else if (points >= window.ADD_POINTS_ON_ERROR_3_4)
		result = window.ADD_POINTS_ON_ERROR_3_4;
	else if (points >= window.ADD_POINTS_ON_ERROR_1_2)
		result = window.ADD_POINTS_ON_ERROR_1_2;
	else if (points >= 0.0625)
		result = -window.ADD_POINTS_ON_ERROR_1_3;
	else
		result = -window.ADD_POINTS_ON_ERROR_1_2;

	knowledge = Math.min(knowledge + result, window.MAX_KNOWLEDGE_LEVEL);
	return knowledge;
}

async function writerOnComplete(_)
{
	// Go to the next card
	++window.currentIndex;

	let data = window.localStorageData;

	// Calculate how many points to add to your knowledge
	const strokeNum = window.writer._character.strokes.length;
	totalPhraseStrokes += strokeNum;

	if (!window.bInPhrase)
		data.cards[(window.currentIndex - 1)].knowledge = computeScore(strokeNum, window.errors, data.cards[(window.currentIndex - 1)].knowledge);
	else
	{
		for (let i in data.cards)
		{
			if (data.phrases[window.currentPhraseIndex].phrase[(window.currentIndex - 1)] === data.cards[i].character)
			{
				data.cards[i].knowledge = computeScore(strokeNum, window.errors, data.cards[i].knowledge);
				break;
			}
		}
	}

	// Reset the errors
	window.errors = 0;

	// Basically sleep. This is so we wait until the finished character animation finishes, but also because the animation
	// will not feel great if we just skip directly without some time with no animation after it plays.
	await new Promise(r => setTimeout(r, window.WRITER_SLEEP_AFTER_COMPLETE));

	// This if statement handles switching to the next card
	if (!window.bInPhrase)
	{
		if (window.currentIndex < data.cards.length)
		{
			let ref = data.cards[window.currentIndex];

			setWriterState(ref);
			window.writer.setCharacter(ref.character);

			window.writer.quiz();
			changeSidebarText(null, 0, ref, data.cards.length);
			return;
		}
		window.totalPhraseStrokes = 0;
		window.currentIndex = 0;
		window.bInPhrase = true;
		$("phrase-info-widget").style.display = "block"; // Show the phrase info widget
	}

	// This code would be way more understandable and clearer if Javascript just had a goto statement
	if (window.currentPhraseIndex < data.phrases.length)
	{
		if (window.currentIndex >= data.phrases[window.currentPhraseIndex].phrase.length)
		{
			data.phrases[window.currentPhraseIndex].knowledge = computeScore(window.totalPhraseStrokes, window.totalPhraseErrors, data.phrases[window.currentPhraseIndex].knowledge);

			window.currentIndex = 0;
			++window.currentPhraseIndex;
			window.totalPhraseErrors = 0;
		}

		if (window.currentPhraseIndex < data.phrases.length)
		{
			const currentPhrase = data.phrases[window.currentPhraseIndex]

			let card = null;
			for (let i in data.cards)
			{
				if (currentPhrase.phrase[currentIndex] === data.cards[i].character)
				{
					card = data.cards[i];
					setWriterState(card);
					break;
				}
			}
			// Revert to using the phrase score if no card is found
			if (card === null)
				setWriterState(currentPhrase);

			window.writer.setCharacter(currentPhrase.phrase[currentIndex])
			window.writer.quiz();
			changeSidebarText(currentPhrase, data.phrases.length, card, currentPhrase.phrase.length);
			return;
		}
	}

	// If there are no cards, remove the writer and recreate the initial view
	$("character-target-div").remove();

	// Save user data
	const now = Date.now();
	data.totalTimeInSessions += (now - window.sessionTime);
	window.sessionTime = now;

	// Reset data
	window.currentIndex = 0;
	window.currentPhraseIndex = 0;
	window.bInTest = false;
	window.bInPhrase = false;

	// Recreate initial view
	createStartButton();
	resetSidebar();
	saveToLocalStorage(data);
	fisherYates(data.cards);
	fisherYates(data.phrases);

	// On mobile we remove all header elements when playing, so readd them
	if (window.bMobile)
		$("main-page-header").replaceChildren(...window.linkChildren);
}

function createStartButton()
{
	// Get the desired element height. These calculations will be used for the start button and
	// drawing widget
	const drawElementHeight = getDrawElementHeight();

	// Get start button, create if exists
	let startButton = $("start-button");
	if (startButton === null)
		startButton = addElement("button", lc.start_button_text, "start-button", "card-button-edit centered character-prop large-button-text", "", $("start-button-writer-section"));

	// Set the button width
	startButton.style.setProperty("width", drawElementHeight + "px");
	startButton.style.setProperty("height", drawElementHeight + "px");

	// When the button is clicked, we will create the writer view
	startButton.addEventListener("click", function()
	{
		// Make the experience more immersive by removing all buttons from the header, except for the main page link.
		// Also, add an exit button, even though it does the same as clicking the main page link.
		if (window.bMobile)
		{
			const buttonList = $("main-page-header");
			window.linkChildren = [ ...buttonList.children ];
			const headerHome = buttonList.children[0];

			buttonList.replaceChildren(headerHome);

			const el = document.createElement("li");
			const link = document.createElement("a");
			link.textContent = "Exit"
			link.setAttribute("href", "./index.html");

			el.appendChild(link);
			buttonList.appendChild(el);
		}

		// Remove the start session button and set the global to indicate that we're in a test
		$("start-button").remove();
		window.bInTest = true;

		// Append HTML for the writer background, which is just a star
		const page = $("start-button-writer-section");
		page.innerHTML += `
			<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" id="character-target-div" class="centered character-div character-prop">
				<line x1="0" y1="0" x2="100%" y2="100%" stroke="#DDD" />
				<line x1="100%" y1="0" x2="0" y2="100%" stroke="#DDD" />
				<line x1="50%" y1="0" x2="50%" y2="100%" stroke="#DDD" />
				<line x1="0" y1="50%" x2="100%" y2="50%" stroke="#DDD" />
			</svg>
		`;

		let data = window.localStorageData;

		// Get the width of the writer border, since the element will not be truly centered if we do not subtract from it
		const borderWidth = window.getComputedStyle($("character-target-div")).borderWidth.replace("px", "") * 2;
		window.writer = HanziWriter.create('character-target-div', data.cards[window.currentIndex].character + data.cards[window.currentIndex].variant, {
			width: drawElementHeight - borderWidth,
			height: drawElementHeight - borderWidth,
			showCharacter: false,
			padding: window.WRITER_PADDING,
			showHintAfterMisses: window.WRITER_SHOW_HINT_ON_ERRORS,
			radicalColor: window.WRITER_RADICAL_COLOUR,
			charDataLoader: charDataLoader,
		});
		window.writer.quiz({
			onMistake: writerOnMistake,
			onComplete: writerOnComplete,
			onCorrectStroke: writerOnCorrectStroke,
		});

		// Modify sidebar text, as well as statistics data
		setWriterState(data.cards[window.currentIndex]);
		changeSidebarText(null, 0, data.cards[window.currentIndex], data.cards.length);
		const now = Date.now();
		window.sessionTime = now;

		data.sessions++;
		data.lastDate = now;
	});
}

function mainPageMain()
{
	getDrawElementHeight();

	// If there are no cards there, create a widget to inform the user that they need to create a deck
	if (window.localStorageData.cards.length === 0)
	{
		$("start-button").remove();

		let link = document.createElement("a");
		link.href = "./deck.html"
		link.appendChild(document.createTextNode(lc.no_cards_link_deck));

		let el = document.createElement("h1");
		el.className = "centered vcentered"
		el.textContent = lc.no_cards_text
		el.appendChild(link);
		el.appendChild(document.createTextNode(lc.no_cards_text_postfix))

		$("start-button-writer-section").appendChild(el);
		return;
	}

	createStartButton();

	// Function to be called on the window resize event. This is needed because of a number of custom calculations we perform
	// to compute the width and height of the writer widget/start button from Javascript
	const notify = function() {
		const newDrawElementHeight = getDrawElementHeight();
		if (bInTest)
		{
			window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
		}
		else
		{
			const el = $("start-button");
			el.style.setProperty("width", newDrawElementHeight + "px");
			el.style.setProperty("height", newDrawElementHeight + "px");
		}
		//window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
	};
	window.addEventListener("resize", notify);

	// Add this event to make sure to save any data if we close the tab
	window.addEventListener("beforeunload", function(_)
	{
		if (bInTest)
			window.localStorageData.totalTimeInSessions += (Date.now() - window.sessionTime);
		saveToLocalStorage(window.localStorageData);
		return false;
	});

	// Shuffle the cards
	fisherYates(window.localStorageData.cards);
	fisherYates(window.localStorageData.phrases);
}

mainPageMain();
