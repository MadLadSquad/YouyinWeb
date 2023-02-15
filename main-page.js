'use strict';

// Global writer variable, because yes
var writer;

var errors = 0;
var backwardsErrors = 0;
var currentCharacterXP = 1;

var bInTest = false;

var currentIndex = 0;
var sessionTime = 0;

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

	// Why does this exist, idk
	const padding = 10;

	const footer = document.querySelector("footer");

	let finalHeight = window.innerHeight - unusedSpace - padding + listWidget.getBoundingClientRect().height;
	const bMobile = navigator.userAgent.toLowerCase().includes("mobile");
	if (bMobile)
	{
		finalHeight -= (footer.getBoundingClientRect().height);
	}
	else if (!!window.chrome)
	{
		const footer = document.querySelector("footer");
		finalHeight -= (listWidget.getBoundingClientRect().height + footer.getBoundingClientRect().height);
	}

	if (parent.getBoundingClientRect().width < finalHeight)
	{
		finalHeight = parent.getBoundingClientRect().width - (2 * padding);
		if (bMobile && !(!!window.chrome))
			finalHeight -= footer.getBoundingClientRect().height;
	}
	else // The +4 is for the borders designe
		listWidget.style.setProperty("height", (finalHeight + 4).toString() + "px");

	return finalHeight;
}

function writerOnMistake(strokeData)
{
	if (strokeData.isBackwards)
		window.backwardsErrors++;

	if ((strokeData.mistakesOnStroke - window.backwardsErrors) == 3)
		window.errors++;

	document.getElementById("character-info-widget-errors").textContent = `Errors: ${window.errors}`;
}

function writerOnCorrectStroke(strokeData)
{
	window.backwardsErrors = 0;
}

function changeSidebarText()
{
	const spelling = window.localStorageData["cards"][window.currentIndex]["name"]
	
	document.getElementById("character-info-widget-spelling").textContent = `Spelling: ${spelling}`;
	document.getElementById("character-info-widget-errors").textContent = "Errors: 0";
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
	document.getElementById("character-info-widget-errors").textContent = "Errors: 0";

	const el = document.createElement("li");
	el.textContent = "To be loaded";
	document.getElementById("character-info-widget-info").replaceChildren(el);
}

function setWriterState(ref)
{
	window.writer.updateColor("radicalColor", null);
	if (ref["knowledge"] >= 3)
	{
		window.writer.hideOutline();
	}
	else if (ref["knowledge"] >= 2)
	{
		window.writer.hideOutline();
		window.bLiberalErrors = true;
	}
	else if (ref["knowledge"] >= 1)
	{
		window.writer.showOutline();
	}
	else
	{
		window.writer.updateColor("radicalColor", "#c87e74");
		window.writer.showOutline();
	}
}

async function writerOnComplete(strokeData)
{
	++window.currentIndex;
	window.bLiberalErrors = false;

	// Basically sleep
	await new Promise(r => setTimeout(r, 1200));
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
	window.localStorageData["totalTimeInSessions"] += (Date.now() - window.sessionTime);
	window.sessionTime = Date.now();

	window.currentIndex = 0;
	createStartButton();
	resetSidebar();
	saveToLocalStorage(window.localStorageData);
	fisherYates(window.localStorageData["cards"]);
}

function createStartButton()
{
	const drawElementHeight = getDrawElementHeight();
	let startButton = document.getElementById("start-button");
	if (startButton === null)
	{
		startButton = document.createElement("button");
		startButton.id = "start-button";
		startButton.className = "card-button-edit centered character-prop";
		startButton.textContent = "Start session";

		document.getElementById("main-page").appendChild(startButton);
	}
	startButton.style.setProperty("width", drawElementHeight + "px");
	startButton.style.setProperty("height", drawElementHeight + "px");
	startButton.addEventListener("click", function()
	{
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
			padding: 5,
			showHintAfterMisses: 3,
			radicalColor: '#c87e74'
		});
		window.writer.quiz({
			onMistake: writerOnMistake,
			onComplete: writerOnComplete,
			onCorrectStroke: writerOnCorrectStroke,
		});
		setWriterState(window.localStorageData["cards"][window.currentIndex]);
		changeSidebarText();
		window.sessionTime = Date.now();

		window.localStorageData["sessions"]++;
		window.localStorageData["lastDate"] = Date.now();
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
		window.localStorageData["totalTimeInSessions"] += (Date.now() - window.sessionTime);
		console.log(window.localStorageData["totalTimeInSessions"])
		saveToLocalStorage(window.localStorageData);
		return false;
	});
	fisherYates(window.localStorageData["cards"]);
}

mainPageMain();
