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
	const names = [ "卣囙", "诱因", "油印", "Yǒuyīn", "📮📮", "ඞඞ", "ඣ",
		"爱汉字", "愛カタカナ", "愛ひらがな", "愛漢字",
		"❤️ Latin", "❤️ Кирилица", "❤️  მხედრული", "❤️ Հայոց գրեր", "❤️ العربية", "❤️ 한글", "❤️ Ελληνικά", "❤️ देवनागरी "
	];

	const selectedText = names[Math.floor(Math.random() * names.length)];

	for (let i = 0; i < el.length; i++)
		el[i].innerHTML += selectedText;
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

// I'm a C/C++ programmer, I ain't trusting this toy language with anything + it's stupid to not have a main function tbh
function main()
{
	setTitleName();

	const params = getParams();
	const scriptType = getScriptType(params);
	const langType = getLangType(params);
}

main();
