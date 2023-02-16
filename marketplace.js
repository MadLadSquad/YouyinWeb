'use strict';

function constructElement(val, deckContainer, it, type1, type2, folder)
{
	let leveledUpType = "No";
	let extension = ".yydeck.json"
	if (it["name"].endsWith(".presetlvl.yydeck.json"))
	{
		leveledUpType = "Yes"
		extension = ".presetlvl.yydeck.json"
	}
	let div = document.createElement("div");
	div.className = "card centered";
	div.id = `marketplace-${type1}-card-${val}`;

	let nm = it["name"].replaceAll("-", " ").replaceAll(extension, "");

	addElement("h1", nm, "", "", "", div);
	addElement("p", `Status: ${type2}`, "", "", "", div);
	addElement("p", `Pre-leveled up: ${leveledUpType}`, "", "", "", div);

	addElement("button", "Import", `import-button-${type1}-${val}`, "card-button-edit", folder + it["name"], div).addEventListener("click", function()
	{
		// If an element is created using addElement, arbitrary data is also assigned
		fetch("https://raw.githubusercontent.com/MadLadSquad/YouyinPublicDeckRepository/master/" + this.getAttribute("arbitrary-data"))
			.then(function(result)
			{
				if (result.status != 200)
					throw new Error(`Bad response ${result.status}`);
				return result.text();
			})
			.then(function (content)
			{
				let bExecuted = confirm("Importing a deck WILL merge your current deck with the new one, to replace it first clear your current deck!");
				if (bExecuted)
				{
					let dt = window.localStorageData;
					dt["cards"].push.apply(dt["cards"], JSON.parse(content));
					saveToLocalStorage(dt);
					location.href = "./deck.html";
				}
			})
			.catch((error) => console.log(error));
	});

	// Stupid ahhhh whitespace adding code because web dev is stupid
	div.appendChild(document.createTextNode("\u00A0"));

	addElement("button", "Source", `source-button-${type1}-${val}`, "card-button-edit", folder + it["name"], div).addEventListener("click", function()
	{
		// If an element uses addElement, arbitrary data is also assigned
		window.open('https://github.com/MadLadSquad/YouyinPublicDeckRepository/blob/master/' + this.getAttribute("arbitrary-data"));
	});

	addElement("br", "", "", "", "", div);

	addElement("button", "Download", `download-button-${type1}-${val}`, "card-button-edit", folder + it["name"], div).addEventListener("click", function()
	{
		fetch("https://raw.githubusercontent.com/MadLadSquad/YouyinPublicDeckRepository/master/" + this.getAttribute("arbitrary-data"))
			.then(function(result)
			{
				if (result.status != 200)
					throw new Error(`Bad response ${result.status}`);
				return result.text();
			})
			.then(function (content)
			{
				let file = new Blob([content], { type: "application/json;charset=utf-8"});
				const link = document.createElement("a");

				link.href = URL.createObjectURL(file);
				link.download = "marketplace-deck.yydeck.json";
				link.click();
				URL.revokeObjectURL(link.href);
			})
			.catch((error) => console.log(error));
	});
	deckContainer.appendChild(div);
}

function createErrorElement(deckContainer, response, marketplaceType)
{
	let el = document.createElement("h1");
	el.textContent = `Error ${response.status}: Couldn't load the ${marketplaceType} marketplace, retry later!`;
	el.className = "error-text centered vcentered";

	deckContainer.appendChild(el);
}

async function handleOfficialRepos(deckContainer)
{
	let response = await fetch("https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/");
	if (await response.status !== 200)
	{
		createErrorElement(deckContainer, response, "official");
		return;
	}
	const json = await response.json();
	for (let val in json)
	{
		let it = json[val];
		if (it["name"].endsWith(".yydeck.json"))
			constructElement(val, deckContainer, it, "official", "Official", "");
	}
}

async function handleCommunityRepos(deckContainer)
{
	// Start from community, we will then iterate trough all the release folders
	let response = await fetch("https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/community");
	if (await response.status !== 200)
	{
		createErrorElement(deckContainer, response, "community");
		return;
	}
	const json1 = await response.json();
	for (let ii in json1)
	{
		let it1 = json1[ii];
		if (it1["name"].startsWith("r") && it1["type"] == "dir")
		{
			let res = await fetch(`https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/community/${it1['name']}`);
			if (await res.status !== 200)
			{
				createErrorElement(deckContainer, res, "community");
				return;
			}
			const json = await res.json();
			addElement("h1", `Release ${it1["name"].slice(1)}`, "", "centered", "", deckContainer);
			addElement("br", "", "", "", "", deckContainer);
			let el = addElement("section", "", "deck-community", "", "", deckContainer);
			for (let val in json)
			{
				let it = json[val];
				const fname = it1["name"];
				if (it["name"].endsWith(".yydeck.json"))
					constructElement(val, el, it, "community", "Community", `community/${fname}/`);
			}
		}
	}
}

async function marketplaceMain()
{
	const deckContainer = document.getElementById("deck");
	const communityContainer =  document.getElementById("deck-community-master");

	await handleOfficialRepos(deckContainer);
	await handleCommunityRepos(communityContainer);
}

marketplaceMain();
