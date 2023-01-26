// Global writer variable, because yes
var writer;

function getDrawElementHeight()
{
	const parent = document.querySelector("html");
	const lastChild = parent.lastElementChild;
	const lastChildRect = lastChild.getBoundingClientRect();
	const parentRect = parent.getBoundingClientRect();
	const unusedSpace = parentRect.bottom - lastChildRect.bottom;

	// Here we have to adjust the height, because the list widget causes problems
	const listWidget = document.getElementById("character-info-widget");

	var finalHeight = window.innerHeight - unusedSpace - 10 + listWidget.getBoundingClientRect().height;

	listWidget.style.setProperty("height", finalHeight.toString() + "px");
	if ((finalHeight + listWidget.getBoundingClientRect().width) > parent.getBoundingClientRect().width)
		finalHeight = (parent.getBoundingClientRect().width / 2) - 10;

	return finalHeight;
}

function writerOnMistake(strokeData) {
	document.getElementById("character-info-widget-errors").innerHTML = `Errors: ${strokeData.totalMistakes}`;
}

function mainPageMain()
{
	const drawElementHeight = getDrawElementHeight();

	//var writer = HanziWriter.create('character-target-div', '概', {
	window.writer = HanziWriter.create('character-target-div', '最', {
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
