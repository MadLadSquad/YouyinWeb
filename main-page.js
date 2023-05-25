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
	const parent = document.querySelector("html");
	const lastChild = parent.lastElementChild;
	const lastChildRect = lastChild.getBoundingClientRect();
	const parentRect = parent.getBoundingClientRect();
	const unusedSpace = parentRect.bottom - lastChildRect.bottom;

	// Here we have to adjust the height, because the list widget causes problems
	const listWidget = document.getElementById("character-info-widget");

	const footer = document.querySelector("footer");

	let finalHeight = window.innerHeight - unusedSpace - window.MAIN_PAGE_TOP_PADDING + listWidget.getBoundingClientRect().height;
	window.bMobile = navigator.userAgent.toLowerCase().includes("mobile");
	if (window.bMobile)
	{
		finalHeight -= (footer.getBoundingClientRect().height);
	}
	else
	{
		const footer = document.querySelector("footer");
		finalHeight -= (listWidget.getBoundingClientRect().height + footer.getBoundingClientRect().height);
	}

	if (parent.getBoundingClientRect().width < finalHeight)
	{
		finalHeight = parent.getBoundingClientRect().width - (2 * window.MAIN_PAGE_TOP_PADDING);
		if (window.bMobile)
		{
			if (!(!!window.chrome))
				finalHeight -= footer.getBoundingClientRect().height;
		}
	}
	else // The +4 is for the borders design
		listWidget.style.setProperty("height", (finalHeight + 4).toString() + "px");

	return finalHeight;
}

function writerOnMistake(strokeData)
{
	if (strokeData.isBackwards)
		window.backwardsErrors++;

	if ((strokeData.mistakesOnStroke - window.backwardsErrors) == window.WRITER_SHOW_HINT_ON_ERRORS)
		window.errors++;

	document.getElementById("character-info-widget-errors").textContent = `Cards: ${window.currentIndex}/${window.localStorageData["cards"].length}; Errors: ${window.errors}`;
}

function writerOnCorrectStroke(strokeData)
{
	window.backwardsErrors = 0;
}

function changeSidebarText()
{
	const spelling = window.localStorageData["cards"][window.currentIndex]["name"]
	
	document.getElementById("character-info-widget-spelling").textContent = `Spelling: ${spelling}`;
	document.getElementById("character-info-widget-errors").textContent = `Cards: ${window.currentIndex}/${window.localStorageData["cards"].length}; Errors: 0`;
	const list = document.getElementById("character-info-widget-info");
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
	document.getElementById("character-info-widget-spelling").textContent = "Spelling: To be loaded";
	document.getElementById("character-info-widget-errors").textContent = "Cards: 0/0; Errors: 0";

	const el = document.createElement("li");
	el.textContent = "To be loaded";
	document.getElementById("character-info-widget-info").replaceChildren(el);
}

function setWriterState(ref)
{
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
	++window.currentIndex;

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

	window.errors = 0;

	// Basically sleep
	await new Promise(r => setTimeout(r, window.WRITER_SLEEP_AFTER_COMPLETE));
	if (window.currentIndex < window.localStorageData["cards"].length)
	{
		let ref = window.localStorageData["cards"][window.currentIndex];

		setWriterState(ref);
		window.writer.setCharacter(ref["character"]);

		window.writer.quiz();
		changeSidebarText();
		return;
	}

	document.getElementById("character-target-div").remove();

	const now = Date.now();
	window.localStorageData["totalTimeInSessions"] += (now - window.sessionTime);
	window.sessionTime = now;

	window.currentIndex = 0;
	createStartButton();
	resetSidebar();
	saveToLocalStorage(window.localStorageData);
	fisherYates(window.localStorageData["cards"]);

	if (window.bMobile)
		document.getElementById("main-page-header").replaceChildren(...window.linkChildren);
}

function createStartButton()
{
	const drawElementHeight = getDrawElementHeight();
	let startButton = document.getElementById("start-button");
	if (startButton === null)
	{
		startButton = document.createElement("button");
		startButton.id = "start-button";
		startButton.className = "card-button-edit centered character-prop large-button-text";
		startButton.textContent = "Click to start session";

		document.getElementById("main-page").appendChild(startButton);
	}
	startButton.style.setProperty("width", drawElementHeight + "px");
	startButton.style.setProperty("height", drawElementHeight + "px");
	startButton.addEventListener("click", function()
	{
		if (window.bMobile)
		{
			const buttonList = document.getElementById("main-page-header");
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

		document.getElementById("start-button").remove();
		window.bInTest = true;

		const page = document.getElementById("main-page");

		page.innerHTML += `
			<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" id="character-target-div" class="centered character-div character-prop">
				<line x1="0" y1="0" x2="100%" y2="100%" stroke="#DDD" />
				<line x1="100%" y1="0" x2="0" y2="100%" stroke="#DDD" />
				<line x1="50%" y1="0" x2="50%" y2="100%" stroke="#DDD" />
				<line x1="0" y1="50%" x2="100%" y2="50%" stroke="#DDD" />
			</svg>
		`;
		
		window.writer = HanziWriter.create('character-target-div', window.localStorageData["cards"][window.currentIndex]["character"], {
			width: drawElementHeight,
			height: drawElementHeight,
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
	if (window.localStorageData["cards"].length == 0)
	{
		document.getElementById("start-button").remove();

		let link = document.createElement("a");
		link.href = "./deck.html"
		link.appendChild(document.createTextNode("Deck"));

		let el = document.createElement("h1");
		el.className = "centered vcentered"
		el.textContent = "You currently have no cards, go to the "
		el.appendChild(link);
		el.appendChild(document.createTextNode(" page to add some!"))

		document.getElementById("main-page").appendChild(el);
		return;
	}

	createStartButton();

	var notify = function() {
		const newDrawElementHeight = getDrawElementHeight();
		if (bInTest)
		{
			window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
		}
		else
		{
			const el = document.getElementById("start-button");
			el.style.setProperty("width", newDrawElementHeight + "px");
			el.style.setProperty("height", newDrawElementHeight + "px");
		}
		//window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
	};
	window.addEventListener("resize", notify);

	window.addEventListener("beforeunload", function(e)
	{
		if (bInTest)
			window.localStorageData["totalTimeInSessions"] += (Date.now() - window.sessionTime);
		saveToLocalStorage(window.localStorageData);
		return false;
	});
	fisherYates(window.localStorageData["cards"]);
}

mainPageMain();
