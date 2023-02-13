'use strict';

// Global writer variable, because yes
var writer;
var currentCharacterErrors = [  ];
var bInTest = false;

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
	if (!!window.chrome || bMobile)
	{
		finalHeight -= (footer.getBoundingClientRect().height);
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
	document.getElementById("character-info-widget-errors").textContent = `Errors: ${strokeData.totalMistakes}`;
}

function writerOnComplete(strokeData)
{
	
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

	const startButton = document.getElementById("start-button");
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

		window.writer = HanziWriter.create('character-target-div', '概', {
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
		});
	});

	//document.getElementById("character-target-div").focus();

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
			console.log(newDrawElementHeight)
			el.style.setProperty("height", newDrawElementHeight + "px");
		}
		//window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
	};
	window.addEventListener("resize", notify);

	window.addEventListener("beforeunload", function(e)
	{
		

		return false;
	});
}

mainPageMain();
