'use strict';

async function loadMarketplaceData(file)
{
	let response = await fetch(`https://cdn.jsdelivr.net/gh/MadLadSquad/YouyinPublicDeckRepository@latest/${file}`)
	if (response.status !== 200)
	{
		console.error(`Bad response from the character database, this is mainly caused by missing characters. Response code: ${response.status}`);
		return;
	}
	return await response.json();
}

async function constructElement(val, deckContainer, it, type1, type2, folder)
{
	// Get data for the given marketplace entry and process it
	let filename = folder + it.name;
	let marketplaceJSON = await loadMarketplaceData(filename);

	let leveledUpType = lc.leveled_up_no;
	let extension = ".yydeck.json"
	if (it.name.endsWith(".presetlvl.yydeck.json"))
	{
		leveledUpType = lc.leveled_up_yes
		extension = ".presetlvl.yydeck.json"
	}

	// Create card
	let div = addElement("div", "", `marketplace-${type1}-card-${val}`, "card centered", "", deckContainer);
	let nm = it.name.replaceAll("-", " ").replaceAll(extension, "");

	addElement("h1", nm, "", "", "", div);
	addElement("p", `${lc.status}: ${type2}`, "", "", "", div);
	addElement("p", `${lc.pre_leveled_up}: ${leveledUpType}`, "", "", "", div);
	addElement("p", `${lc.phrases_count_cards}: ${marketplaceJSON.length}`, "", "", "", div);

	// Import a deck from file
	addElement("button", lc.deck_import, `import-button-${type1}-${val}`, "card-button-edit", filename, div).addEventListener("click", async function()
	{
		// If an element is created using addElement, arbitrary data is also assigned
		let content = await loadMarketplaceData(this.getAttribute("arbitrary-data"));
		let bExecuted = confirm(lc.import_deck_confirm_text);
		if (bExecuted)
		{
			let dt = window.localStorageData;
			dt.cards.push.apply(dt.cards, content);
			saveToLocalStorage(dt);
			location.href = "./deck.html";
		}
	});

	// Stupid ahhhh whitespace adding code because web dev is stupid
	div.appendChild(document.createTextNode("\u00A0"));

	addElement("button", lc.deck_source, `source-button-${type1}-${val}`, "card-button-edit", filename, div).addEventListener("click", async function()
	{
		// If an element uses addElement, arbitrary data is also assigned
		window.open('https://github.com/MadLadSquad/YouyinPublicDeckRepository/blob/master/' + this.getAttribute("arbitrary-data"));
	});

	addElement("br", "", "", "", "", div);

	// Download deck with this interesting code
	addElement("button", lc.deck_download, `download-button-${type1}-${val}`, "card-button-edit", filename, div).addEventListener("click", async function()
	{
		let content = await loadMarketplaceData(this.getAttribute("arbitrary-data"));

		let file = new Blob([content], { type: "application/json;charset=utf-8" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(file);
		link.download = this.getAttribute("arbitrary-data").split("/").at(-1);
		link.click();
		URL.revokeObjectURL(link.href);
	});
}

function createErrorElement(deckContainer, response, marketplaceType)
{
	addElement("h1", `Error ${response.status}: Couldn't load the ${marketplaceType} marketplace, retry later!`, "", "error-text centered, vcentered", "", deckContainer);
}

async function handleOfficialRepos(deckContainer)
{
	let response = await fetch("https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/");
	if (response.status !== 200)
	{
		createErrorElement(deckContainer, response, "official");
		return;
	}
	const json = await response.json();
	for (let val in json)
	{
		let it = json[val];
		if (it.name.endsWith(".yydeck.json"))
			await constructElement(val, deckContainer, it, "official", lc.official, "");
	}
}

// Creates cards for the community decks
async function handleCommunityRepos(deckContainer)
{
	// Start from community, we will then iterate trough all the release folders
	let response = await fetch("https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/community");
	if (response.status !== 200)
	{
		createErrorElement(deckContainer, response, "community");
		return;
	}
	const json1 = await response.json();
	for (let ii in json1)
	{
		let it1 = json1[ii];
		if (it1.name.startsWith("r") && it1.type === "dir")
		{
			let res = await fetch(`https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/community/${it1['name']}`);
			if (res.status !== 200)
			{
				createErrorElement(deckContainer, res, "community");
				return;
			}
			const json = await res.json();

			addElement("h1", `${lc.release} ${it1.name.slice(1)}`, "", "centered", "", deckContainer);
			addElement("br", "", "", "", "", deckContainer);
			let el = addElement("section", "", "deck-community", "deck", "", deckContainer);
			for (let val in json)
			{
				let it = json[val];
				const fname = it1.name;
				if (it.name.endsWith(".yydeck.json"))
					await constructElement(val, el, it, "community", lc.community, `community/${fname}/`);
			}
		}
	}
}

async function marketplaceMain()
{
	const deckContainer = $("marketplace-deck-container");
	const communityContainer =  $("deck-community-master");

	await handleOfficialRepos(deckContainer);
	await handleCommunityRepos(communityContainer);
}

marketplaceMain().then(_ => {});
