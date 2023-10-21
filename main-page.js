'use strict';

// Global writer variable, because yes
var writer;

var errors = 0;
var backwardsErrors = 0;

var bInTest = false;

var currentIndex = 0;
var sessionTime = 0;

var bMobile = false;

var linkChildren;

// This function uses some dark magic that works half the time in order to calculate the size of the mainpage viewport
// and main elements. Here are some issues:
// TODO: On portrait screens if the resolution changes this sometimes breaks and a refresh is needed, would be good if it was fixed. 
// Probably check out main.css and the main-page media query
function getDrawElementHeight()
{
	// Some magic code to calculate the height
	const html = document.querySelector("html");
	const mainEl = document.querySelector("main");
	const lastChild = html.lastElementChild;
	const lastChildRect = lastChild.getBoundingClientRect();
	const parentRect = html.getBoundingClientRect();
	const unusedSpace = parentRect.bottom - lastChildRect.bottom;

	// Here we have to adjust the height, because the list widget causes problems
	const listWidget = $("character-info-widget");

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
		finalHeight = mainEl.getBoundingClientRect().width - (getComputedStyle(mainEl).paddingLeft.replace("px", "") * 2);
	else
		listWidget.style.setProperty("height", finalHeight.toString() + "px");

	return finalHeight;
}

function writerOnMistake(strokeData)
{
	// Error calculation and display
	if (strokeData.isBackwards)
		window.backwardsErrors++;

	if ((strokeData.mistakesOnStroke - window.backwardsErrors) == window.WRITER_SHOW_HINT_ON_ERRORS)
		window.errors++;

	$("character-info-widget-errors").textContent = `Cards: ${window.currentIndex}/${window.localStorageData["cards"].length}; Errors: ${window.errors}`;
}

function writerOnCorrectStroke(strokeData)
{
	window.backwardsErrors = 0;
}

function changeSidebarText()
{
	// Utility function to update the sidebar text
	const spelling = window.localStorageData["cards"][window.currentIndex]["name"]
	
	$("character-info-widget-spelling").textContent = `Spelling: ${spelling}`;
	$("character-info-widget-errors").textContent = `Cards: ${window.currentIndex}/${window.localStorageData["cards"].length}; Errors: 0`;
	const list = $("character-info-widget-info");
	list.replaceChildren();
	for (let i in window.localStorageData["cards"][window.currentIndex]["definitions"])
	{
		let it = window.localStorageData["cards"][window.currentIndex]["definitions"][i];
		const el = document.createElement("li");
		el.textContent = it;

		list.appendChild(el);
	}
}

function resetSidebar()
{
	// Ugly ahh code to reset to the inital state
	$("character-info-widget-spelling").textContent = "Spelling: To be loaded";
	$("character-info-widget-errors").textContent = "Cards: 0/0; Errors: 0";

	const el = document.createElement("li");
	el.textContent = "To be loaded";
	$("character-info-widget-info").replaceChildren(el);
}

function setWriterState(ref)
{
	// Set the default writer state. Certain knowledge levels have certain features enabled/disabled
	window.writer._options.showHintAfterMisses = 3;
	window.writer.updateColor("radicalColor", null);
	if (ref["knowledge"] >= 3)
	{
		window.writer.hideOutline();
	}
	else if (ref["knowledge"] >= 2)
	{
		window.writer._options.showHintAfterMisses = window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3;
		window.writer.hideOutline();
	}
	else if (ref["knowledge"] >= 1)
	{
		window.writer.showOutline();
	}
	else
	{
		window.writer.updateColor("radicalColor", window.WRITER_RADICAL_COLOUR);
		window.writer.showOutline();
	}
}

async function writerOnComplete(strokeData)
{
	// Go to the next card
	++window.currentIndex;

	// Calculate how many points to add to your knowledge
	const strokeNum = window.writer._character.strokes.length;
	let pointsPerStroke = (window.MAX_POINTS_ON_CHARACTER / strokeNum);
	let points = (window.MAX_POINTS_ON_CHARACTER - (window.errors * pointsPerStroke));
	let result = 0;

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

	var knowledge = window.localStorageData["cards"][(window.currentIndex - 1)]["knowledge"];
	knowledge = (knowledge + result) >= window.MAX_KNOWLEDGE_LEVEL ? window.MAX_KNOWLEDGE_LEVEL : (knowledge + result);
	window.localStorageData["cards"][(window.currentIndex - 1)]["knowledge"] = knowledge;

	// Reset the errors
	window.errors = 0;

	// Basically sleep. This is so we wait until the finished character animation finishes, but also because the animation
	// will not feel great if we just skip directly without some time with no animation after it plays.
	await new Promise(r => setTimeout(r, window.WRITER_SLEEP_AFTER_COMPLETE));

	// This if statement handles switching to the next card
	if (window.currentIndex < window.localStorageData["cards"].length)
	{
		let ref = window.localStorageData["cards"][window.currentIndex];

		setWriterState(ref);
		window.writer.setCharacter(ref["character"]);

		window.writer.quiz();
		changeSidebarText();
		return;
	}

	// If there are no cards, remove the writer and recreate the initial view
	$("character-target-div").remove();

	// Save user data
	const now = Date.now();
	window.localStorageData["totalTimeInSessions"] += (now - window.sessionTime);
	window.sessionTime = now;

	// Recreate initial view
	window.currentIndex = 0;
	createStartButton();
	resetSidebar();
	saveToLocalStorage(window.localStorageData);
	fisherYates(window.localStorageData["cards"]);

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
	{
		startButton = document.createElement("button");
		startButton.id = "start-button";
		startButton.className = "card-button-edit centered character-prop large-button-text";
		startButton.textContent = "Click to start session";

		$("main-page").appendChild(startButton);
	}

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

			var el = document.createElement("li");
			var link = document.createElement("a");
			link.textContent = "Exit"
			link.setAttribute("href", "./index.html");

			el.appendChild(link);
			buttonList.appendChild(el);
		}

		// Remove the start session button and set the global to indicate that we're in a test
		$("start-button").remove();
		window.bInTest = true;

		// Append HTML for the writer background, which is just a star
		const page = $("main-page");
		page.innerHTML += `
			<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" id="character-target-div" class="centered character-div character-prop">
				<line x1="0" y1="0" x2="100%" y2="100%" stroke="#DDD" />
				<line x1="100%" y1="0" x2="0" y2="100%" stroke="#DDD" />
				<line x1="50%" y1="0" x2="50%" y2="100%" stroke="#DDD" />
				<line x1="0" y1="50%" x2="100%" y2="50%" stroke="#DDD" />
			</svg>
		`;

		// Get the width of the writer border, since the element will not be truly centered if we do not subtract from it
		const borderWidth = window.getComputedStyle($("character-target-div")).borderWidth.replace("px", "") * 2;
		window.writer = HanziWriter.create('character-target-div', window.localStorageData["cards"][window.currentIndex]["character"], {
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
		setWriterState(window.localStorageData["cards"][window.currentIndex]);
		changeSidebarText();
		const now = Date.now();
		window.sessionTime = now;

		window.localStorageData["sessions"]++;
		window.localStorageData["lastDate"] = now;
	});
}

function mainPageMain()
{
	const drawElementHeight = getDrawElementHeight();

	// If there are no cards there, create a widget to inform the user that they need to create a deck
	if (window.localStorageData["cards"].length == 0)
	{
		$("start-button").remove();

		let link = document.createElement("a");
		link.href = "./deck.html"
		link.appendChild(document.createTextNode("Deck"));

		let el = document.createElement("h1");
		el.className = "centered vcentered"
		el.textContent = "You currently have no cards, go to the "
		el.appendChild(link);
		el.appendChild(document.createTextNode(" page to add some!"))

		$("main-page").appendChild(el);
		return;
	}

	createStartButton();

	// Function to be called on the window resize event. This is needed because of a number of custom calculations we perform
	// to compute the width and height of the writer widget/start button from Javascript
	var notify = function() {
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
	window.addEventListener("beforeunload", function(e)
	{
		if (bInTest)
			window.localStorageData["totalTimeInSessions"] += (Date.now() - window.sessionTime);
		saveToLocalStorage(window.localStorageData);
		return false;
	});

	// Shuffle the cards
	fisherYates(window.localStorageData["cards"]);
}

mainPageMain();
