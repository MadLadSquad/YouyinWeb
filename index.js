'use strict';
// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_KNOWLEDGE_LEVEL = 4;
window.MAX_POINTS_ON_CHARACTER = 0.25;
window.ADD_POINTS_ON_ERROR_3_4 = 0.1875; // 3/4 of 0.25
window.ADD_POINTS_ON_ERROR_1_2 = 0.125; // 1/2 or 2/4 of 0.25
window.ADD_POINTS_ON_ERROR_1_3 = 0.0625; // 1/3 of 0.25

window.CARD_WRITER_SIZE = 100;
window.CARD_WRITER_STROKE_ANIMATION_SPEED = 1.25;
window.CARD_WRITER_DELAY_BETWEEN_STROKES = 50;
window.CARD_DEFAULT_CHARACTER = "是"
window.CARD_DEFAULT_PREVIEW_NAME = "Preview Name"

window.WRITER_PADDING = 5;
window.WRITER_RADICAL_COLOUR = "#c87e74";
window.WRITER_SLEEP_AFTER_COMPLETE = 1200; // In ms

window.WRITER_SHOW_HINT_ON_ERRORS = 3;
window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3 = 1;
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

window.localStorageData = null;

// Troll jQuery developers
function $(x)
{
	return document.getElementById(x);
}

function addTextNode(container, text)
{
	container.appendChild(document.createTextNode(text));
}

// This loads characters from the database. Change the URL to your own database.
async function charDataLoader(character, _, __)
{
	let response = await fetch(`https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/${character}.json`)
	if (response.status !== 200)
	{
		console.error(`Bad response from the character database, this is mainly caused by missing characters. Response code: ${response.status}`);
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

	if (parentEl !== null)
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

function fixLegacyCharacterVariants()
{
	for (let i in window.localStorageData.cards)
	{
		let card = window.localStorageData.cards[i];
		if (!card["variant"])
		{
			card["variant"] = card.character.substring(1);
			card["character"] = card.character.charAt(0);
		}
	}
}

function redirectWithLanguage(selectWidget, localStorageLang, previous)
{
	let url = location.href.split("/");
	// Skip [1] because it will be empty because of the second / in https://
	let redirect = url[0] + "//" + url[2] + "/" + localStorageLang + "/";

	// Move by 1 index if it's not null
	for (let i = previous !== null ? 4 : 3; i < url.length; i++)
		if (url[i] !== "")
			redirect += url[i] + "/";
	
	selectWidget.value = localStorageLang;
	location.href = redirect.slice(0, -1);
}

function setLanguage()
{
	let localStorageLang = window.localStorage.getItem("language");
	let selectWidget = $("lang-select");

	if (localStorageLang === null)
	{
		localStorageLang = "en_US";
		window.localStorage.setItem("language", localStorageLang);
	}
	else if (!location.href.includes(localStorageLang))
	{
		redirectWithLanguage(selectWidget, localStorageLang, null);
		return;
	}
	selectWidget.value = localStorageLang;
}

function setLanguageBox()
{
	$("lang-select").addEventListener("change", function(){
		let old = window.localStorage.getItem("language");
		window.localStorage.setItem("language", this.value);
		redirectWithLanguage(this, this.value, old);
	})
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
			phrases: [],
		}
		saveToLocalStorage(data);
		document.location.reload();
		return;
	}

	if (!window.localStorageData["phrases"])
	{
		window.localStorageData["phrases"] = [];
		saveToLocalStorage(window.localStorageData);
		document.location.reload();
	}

	fixLegacyCharacterVariants();

	setTitleName();
	setLanguage();
	setLanguageBox();
}

main();
