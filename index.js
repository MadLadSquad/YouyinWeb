'use strict';
// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
var MAX_KNOWLEDGE_LEVEL = 4;
var MAX_POINTS_ON_CHARACTER = 0.25;
var ADD_POINTS_ON_ERROR_3_4 = 0.1875; // 3/4 of 0.25
var ADD_POINTS_ON_ERROR_1_2 = 0.125; // 1/2 or 2/4 of 0.25
var ADD_POINTS_ON_ERROR_1_3 = 0.0625; // 1/3 of 0.25

var CARD_WRITER_SIZE = 100;
var CARD_WRITER_STROKE_ANIMATION_SPEED = 1.25;
var CARD_WRITER_DELAY_BETWEEN_STROKES = 50;
var CARD_DEFAULT_CHARACTER = "是"
var CARD_DEFAULT_PREVIEW_NAME = "Preview Name"

var WRITER_PADDING = 5;
var WRITER_RADICAL_COLOUR = "#c87e74";
var WRITER_SLEEP_AFTER_COMPLETE = 1200; // In ms

var WRITER_SHOW_HINT_ON_ERRORS = 3;
var WRITER_SHOW_HINT_ON_ERRORS_LVL_3 = 1;
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

var localStorageData;

// This loads characters from the database. Change the URL to your own database.
async function charDataLoader(character, onLoad, onError)
{
	let response = await fetch(`https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/${character}.json`)
	if (await response.status !== 200)
	{
		console.log(`Bad response from the character database, this is mainly caused by missing characters. Response code: ${response.status}`);
		return;
	}
	return await response.json();
}

function saveToLocalStorage(string)
{
	window.localStorage.setItem("youyinCardData", JSON.stringify(string));
}

// Returns an element, creates an element with the given parameters and appends it
function addElement(elType, content, id, classType, data, parentEl)
{
	let el = document.createElement(elType);
	el.className = classType;
	el.id = id;
	el.textContent = content;
	el.setAttribute("arbitrary-data", data);

	parentEl.appendChild(el);
	return el;
}

// Returns void, sets the name of the title
function setTitleName()
{
	const el = document.getElementsByClassName("site-title");

	// Cool array of quirky names for the website title because who needs to be serious
	const names = [ "Youyin 卣囙", "Youyin 诱因", "Youyin 油印", "Yǒuyīn 　　", "Youyin  ඞඞ",
	];

	const selectedText = names[Math.floor(Math.random() * names.length)];

	for (let i = 0; i < el.length; i++)
		el[i].textContent = selectedText;
}

// Returns an URLSearchParams object
function getParams()
{
	return new URLSearchParams(window.location.search);
}

// Returns a string representing the current script the user is using
function getScriptType(params)
{
	if (params.has("script"))
	{
		return params.get("script")
	}
	return "zh";
}

// Returns an unsigned int representing the current language the page is in
function getLangType(params)
{
	if (params.has("lang"))
	{
		const lang = params.get("lang");
		if (lang == "bg")
			return 1;
		else if (lang == "cn")
			return 2;
		else if (lang == "tw")
			return 3;
		else if (lang == "de")
			return 4;
		else if (lang == "mk")
			return 5;
		else if (lang == "ru")
			return 6;
		else if (lang == "jp")
			return 7;
	}
	return 0;
}

// Returns void, called when the listbox is updated and redirects to the page with the localization
function modifySelectedLanguage()
{
	const e = document.getElementById("lang-select")

	const val = e.options[e.selectedIndex].value;
	location.replace(`./index.html?lang=${val}`);
}

// The standard shuffle algorithm
function fisherYates(array)
{
	let count = array.length,
		randomnumber,
		temp;
	while(count)
	{
		randomnumber = Math.random() * count-- | 0;
		temp = array[count];
		array[count] = array[randomnumber];
		array[randomnumber] = temp
	}
}

// I'm a C/C++ programmer, I ain't trusting this toy language with anything + it's stupid to not have a main function tbh
function main()
{
	// Saves us performance costs of loading and saving things many times
	window.localStorageData = JSON.parse(window.localStorage.getItem("youyinCardData"));
	if (window.localStorageData === null)
	{
		const data = {
			sessions: 0,
			streak: 0,
			lastDate: 0,
			totalTimeInSessions: 0,
			cards: [],
		}
		saveToLocalStorage(data);
		document.location.reload(true);
	}

	setTitleName();

	const params = getParams();
	const scriptType = getScriptType(params);
	const langType = getLangType(params);
}

main();
