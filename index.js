'use strict';
// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_KNOWLEDGE_LEVEL = 4;
window.MAX_POINTS_ON_CHARACTER = 0.05;
window.ADD_POINTS_ON_ERROR_3_4 = 0.0375; 			// 3/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_2 = 0.025; 			// 1/2 or 2/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_4 = 0.0125; 			// 1/4 of 0.05

window.CARD_WRITER_SIZE = 100;
window.CARD_WRITER_STROKE_ANIMATION_SPEED = 1.25;
window.CARD_WRITER_DELAY_BETWEEN_STROKES = 50;
window.CARD_DEFAULT_CHARACTER = "是"
window.CARD_DEFAULT_PREVIEW_NAME = "Preview Name"

window.WRITER_PADDING = 5;
window.WRITER_RADICAL_COLOUR = "#c87e74";
window.WRITER_SLEEP_AFTER_COMPLETE = 1200; 			// In ms

window.WRITER_SHOW_HINT_ON_ERRORS = 3;
window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3 = 1;

window.HOUR_UNIX = 36000000;
window.MINUTE_UNIX = 60000;
window.SECOND_UNIX = 1000;

window.CHARACTER_FETCH_URL = "https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/";
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

window.localStorageData = null;
window.gameModifiers = null;

/**
 * Troll jQuery developers. Returns the element with the given id
 * @param {string} x - ID of the element
 * @returns {HTMLElement} - The element in question
 */
function $(x)
{
	return document.getElementById(x);
}

/**
 * Formats a number to 2 decimal places using a dot as the decimal separator.
 * @param { number|string } num - The number to format
 * @returns { string } - Formatted string
 */
function formatDecimal(num)
{
	const parsed = parseFloat(num);
	if (isNaN(parsed))
		return "0.00";
	return parsed.toFixed(2);
}


/**
 * Returns a localised postfix given a time. Also converts time units
 * @param { number } time - in milliseconds
 * @returns { Object<number, string> } - The postfix
 */
function getLocalisedTimePostfix(time)
{
	// I FUCKING HATE NOT HAVING PASS BY REFERENCE IN JAVASCRIPT
	let rt = {
		time: time,
		postfix: lc.milliseconds
	}

	if (time > window.HOUR_UNIX)
	{
		rt.time /= window.HOUR_UNIX;
		rt.postfix = lc.hours;
	}
	else if (time > window.MINUTE_UNIX)
	{
		rt.time /= window.MINUTE_UNIX;
		rt.postfix = lc.minutes;
	}
	else if (time > window.SECOND_UNIX)
	{
		rt.time /= window.SECOND_UNIX;
		rt.postfix = lc.seconds;
	}
	return rt;
}

/**
 * Given an element, an event and a function to execute, tracks the given event and executes the provided callback
 * function when the animation or transition on the given element has finished playing
 * @param { HTMLElement } element - Element on which to track the event
 * @param { string } event - Event type, like "click"
 * @param { function } f - Function to run after animation
 */
function runEventAfterAnimation(element, event, f)
{
	element.bWaitForAnimation = false;
	element.addEventListener(event, (e) => {
		e.target.bWaitForAnimation = true;
	});

	const func = (e) => {
		if (e.target.bWaitForAnimation)
		{
			e.target.bWaitForAnimation = false;
			f(e);
		}
	};

	element.addEventListener("animationend", func);
	element.addEventListener("transitionend", func);
}

/**
 * Adds a text node to an element
 * @param { HTMLElement } container - Parent element of the text node
 * @param { string } text - The text that the node contains
 */
function addTextNode(container, text)
{
	container.appendChild(document.createTextNode(text));
}

// This loads characters from the database. Change the URL to your own database.
async function charDataLoader(character, _, __)
{
	let response = await fetch(`${window.CHARACTER_FETCH_URL}${character}.json`)
	if (response.status !== 200)
	{
		console.warn(`Bad response from the character database, this is mainly caused by missing characters. Response code: ${response.status}`);
		return;
	}
	return await response.json();
}

/**
 * Saves an object to the "youyinCardData" entry in the browser's local storage
 * @param { Object } obj - The object in question
 */
function saveToLocalStorage(obj)
{
	window.localStorage.setItem("youyinCardData", JSON.stringify(obj));
}

function saveGameModifiers()
{
	window.localStorage.setItem("youyinGameModifiers", JSON.stringify(window.gameModifiers));
}

/**
 * Utility function to create an HTML element in a single line
 * @param { string } elType - Type of the new element
 * @param { string } content - Text content of the new element
 * @param { string } id - ID of the new element
 * @param { string } classType - Class of the new element
 * @param { string } data - Data that will be stored as the value of the "arbitrary-data" attribute
 * @param { HTMLElement } parentEl - Element to become the parent of the new element
 * @returns { HTMLElement } - The element that was created
 */
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

// Some legacy users may be lacking variants as part of their character card objects, so this function fixes this
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

/**
 * Redirects the user when selecting a new language from the language select box
 * @param { HTMLElement } selectWidget - The select box widget
 * @param { string } localStorageLang - Current language
 * @param { string|null } previous - Previous language
 */
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

/**
 * Builds the footer theme switcher: a button that toggles a searchable popup listing every
 * theme in window.youyinThemes. Selecting a theme applies it live (no reload) and persists
 * the choice under the "youyinTheme" localStorage key. Themes are applied by theme.js.
 */
function setThemeBox()
{
	const button = $("theme-button");
	if (button === null)
		return;

	const current = window.localStorage.getItem("youyinTheme") || "default";

	// Build the popup container, search box and list
	const popup = document.createElement("div");
	popup.id = "theme-popup";
	popup.setAttribute("role", "dialog");
	popup.setAttribute("aria-label", lc.theme_button);

	const search = document.createElement("input");
	search.id = "theme-popup-search";
	search.type = "text";
	search.placeholder = lc.theme_search_placeholder;
	search.setAttribute("aria-label", lc.theme_search_placeholder);
	popup.appendChild(search);

	const list = document.createElement("div");
	list.id = "theme-popup-list";
	popup.appendChild(list);

	// One button per theme. Object key order can't be relied on (integer-like ids such as
	// "8008" get hoisted to the front), so sort explicitly: Default first, then by name.
	const themeIds = Object.keys(window.youyinThemes).sort(function (a, b) {
		if (a === "default") return -1;
		if (b === "default") return 1;
		return window.youyinThemes[a].name.localeCompare(window.youyinThemes[b].name);
	});

	const options = {};
	for (const id of themeIds)
	{
		const opt = document.createElement("button");
		opt.type = "button";
		opt.className = "theme-option" + (id === current ? " active" : "");
		opt.textContent = window.youyinThemes[id].name;
		opt.addEventListener("click", function(){
			window.applyTheme(id);
			window.localStorage.setItem("youyinTheme", id);
			for (const k in options)
				options[k].classList.toggle("active", k === id);
			closePopup();
		});
		list.appendChild(opt);
		options[id] = opt;
	}

	document.body.appendChild(popup);

	function filter(query)
	{
		query = query.toLowerCase();
		for (const id in options)
			options[id].style.display =
				window.youyinThemes[id].name.toLowerCase().includes(query) ? "block" : "none";
	}

	function openPopup()
	{
		popup.classList.add("open");
		button.setAttribute("aria-expanded", "true");
		search.value = "";
		filter("");
		search.focus();
	}

	function closePopup()
	{
		popup.classList.remove("open");
		button.setAttribute("aria-expanded", "false");
	}

	button.addEventListener("click", function(e){
		e.stopPropagation();
		popup.classList.contains("open") ? closePopup() : openPopup();
	});

	search.addEventListener("input", function(){ filter(this.value); });

	// Close on outside click and on Escape
	document.addEventListener("click", function(e){
		if (popup.classList.contains("open") && !popup.contains(e.target) && e.target !== button)
			closePopup();
	});
	document.addEventListener("keydown", function(e){
		if (e.key === "Escape" && popup.classList.contains("open"))
		{
			closePopup();
			button.focus();
		}
	});
}

/**
 * Traverses the DOM under `root` and replaces Unicode emojis with Twitter Emoji (Twemoji) SVG images.
 * Skips interactive, styling, or structural elements where images are invalid/unwanted.
 * @param {Node} root - The root node to parse
 */
function parseEmojis(root)
{
	if (!window.twemoji)
		return;

	const twemojiOptions = {
		base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/',
		folder: 'svg',
		ext: '.svg'
	};

	const ignoredTags = ['SCRIPT', 'STYLE', 'SELECT', 'OPTION', 'HEAD', 'NOSCRIPT', 'IFRAME'];

	function walk(node)
	{
		if (node.nodeType === Node.ELEMENT_NODE)
		{
			const tagName = node.tagName.toUpperCase();
			if (ignoredTags.includes(tagName) || node.classList.contains('emoji'))
				return;

			const children = Array.from(node.childNodes);
			for (let i = 0; i < children.length; i++)
			{
				walk(children[i]);
			}
		}
		else if (node.nodeType === Node.TEXT_NODE)
		{
			if (node.textContent.trim().length === 0)
				return;

			const originalText = node.textContent;
			const parsedHTML = window.twemoji.parse(originalText, twemojiOptions);
			if (parsedHTML !== originalText)
			{
				const parent = node.parentNode;
				if (!parent)
					return;

				const tempSpan = document.createElement('span');
				tempSpan.innerHTML = parsedHTML;

				while (tempSpan.firstChild)
				{
					parent.insertBefore(tempSpan.firstChild, node);
				}
				parent.removeChild(node);
			}
		}
	}

	walk(root);
}

/**
 * Initializes universal Twemoji replacement across the site, parsing the initial page content
 * and setting up a MutationObserver to parse dynamically added content.
 */
function initEmojiReplacement()
{
	if (!window.twemoji)
	{
		console.warn("Twemoji library not loaded; falling back to native emojis.");
		return;
	}

	// Initial parse of the body
	parseEmojis(document.body);

	// Watch for future updates to the DOM
	const observer = new MutationObserver((mutations) => {
		let targets = [];
		for (let i = 0; i < mutations.length; i++)
		{
			const mutation = mutations[i];
			if (mutation.type === 'childList')
			{
				const addedNodes = mutation.addedNodes;
				for (let j = 0; j < addedNodes.length; j++)
				{
					targets.push(addedNodes[j]);
				}
			}
		}

		if (targets.length > 0)
		{
			observer.disconnect();
			for (let i = 0; i < targets.length; i++)
			{
				parseEmojis(targets[i]);
			}
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
		}
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true
	});
}

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

	window.gameModifiers = JSON.parse(window.localStorage.getItem("youyinGameModifiers"));
	if (window.gameModifiers === null)
	{
		window.gameModifiers = {
			extensive: false,
			levelReduce: 0
		}
		saveGameModifiers();
		document.location.reload();
		return;
	}

	if (window.gameModifiers.levelReduce === null || window.gameModifiers.levelReduce === undefined)
	{
		window.gameModifiers.levelReduce = 0;
		saveGameModifiers();
	}

	fixLegacyCharacterVariants();

	setTitleName();
	setLanguage();
	setLanguageBox();
	setThemeBox();
	initEmojiReplacement();
}

main();
