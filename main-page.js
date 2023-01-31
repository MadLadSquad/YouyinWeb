// Global writer variable, because yes
var writer;

// This function uses some dark magic that works half the time in order to calculate the size of the mainpage viewport
// and main elements. Here are some issues:
// TODO: On portrait screens if the resolution changes this sometimes breaks, would be good if it was fixed. Probably check out main.css
// and the main-page media query
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

	var finalHeight = window.innerHeight - unusedSpace - padding + listWidget.getBoundingClientRect().height;
	if (!!window.chrome)
	{
		const footer = document.querySelector("footer");
		finalHeight -= (listWidget.getBoundingClientRect().height + footer.getBoundingClientRect().height);
	}

	if (parent.getBoundingClientRect().width < finalHeight)
		finalHeight = parent.getBoundingClientRect().width - (2 * padding);
	else
		listWidget.style.setProperty("height", finalHeight.toString() + "px");

	return finalHeight;
}

function writerOnMistake(strokeData) {
	document.getElementById("character-info-widget-errors").innerHTML = `Errors: ${strokeData.totalMistakes}`;
}

function mainPageMain()
{
	const drawElementHeight = getDrawElementHeight();

	//var writer = HanziWriter.create('character-target-div', '概', {
	window.writer = HanziWriter.create('character-target-div', '粤', {
		width: drawElementHeight,
		height: drawElementHeight,
		showCharacter: false,
		padding: 5
	});
	window.writer.quiz({
		onMistake: writerOnMistake
	});

	notify = function() {
		const newDrawElementHeight = getDrawElementHeight();
		window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
	};
	window.addEventListener("resize", notify);
}

mainPageMain();
