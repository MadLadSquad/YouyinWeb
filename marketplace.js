'use strict';

async function loadMarketplaceData(file)
{
    let response = await fetch(`https://cdn.jsdelivr.net/gh/MadLadSquad/YouyinPublicDeckRepository@latest/${file}`)
    if (response.status !== 200)
    {
        console.warn(`Bad response from the public deck repository, the deck file may be missing or the CDN may be unavailable. Response code: ${response.status}`);
        return;
    }
    return await response.json();
}

/**
 * Constructs a marketplace element
 * @param { number } val - Index in the deck directory
 * @param { HTMLElement } deckContainer - Container HTML element for the card
 * @param { Object } it - JSON object for the element
 * @param { Object|undefined } marketplaceJSON - Pre-fetched contents of the deck file. Undefined if loading failed
 * @param { string } type1 - Deck type
 * @param { string } type2 - Deck type as a UI string
 * @param { string } folder - Folder in which the marketplace element is in. Empty if it's not in a folder
 */
function constructElement(val, deckContainer, it, marketplaceJSON, type1, type2, folder)
{
    // Skip decks whose contents couldn't be fetched — there is nothing useful to display
    if (marketplaceJSON === undefined)
        return;

    let filename = folder + it.name;

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
    runEventAfterAnimation(addElement("button", lc.deck_import, `import-button-${type1}-${val}`, "card-button-edit", filename, div), "click", async function(e)
    {
        let bExecuted = confirm(lc.import_deck_confirm_text);
        if (bExecuted)
        {
            // If an element is created using addElement, arbitrary data is also assigned
            let content = await loadMarketplaceData(e.target.getAttribute("arbitrary-data"));
            if (content === undefined)
                return;

            let dt = window.localStorageData;
            dt.cards.push.apply(dt.cards, content);
            saveToLocalStorage(dt);
            location.href = "./deck.html";
        }
    });

    // Stupid ahhhh whitespace adding code because web dev is stupid
    addTextNode(div, "\u00A0");

    runEventAfterAnimation(addElement("button", lc.deck_source, `source-button-${type1}-${val}`, "card-button-edit", filename, div), "click", async function(e)
    {
        // If an element uses addElement, arbitrary data is also assigned
        window.open('https://github.com/MadLadSquad/YouyinPublicDeckRepository/blob/master/' + e.target.getAttribute("arbitrary-data"));
    });

    addElement("br", "", "", "", "", div);

    // Download deck with this interesting code
    runEventAfterAnimation(addElement("button", lc.deck_download, `download-button-${type1}-${val}`, "card-button-edit", filename, div), "click", async function(e)
    {
        let content = await loadMarketplaceData(e.target.getAttribute("arbitrary-data"));
        if (content === undefined)
            return;

        let file = new Blob([content], { type: "application/json;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = e.target.getAttribute("arbitrary-data").split("/").at(-1);
        link.click();
        URL.revokeObjectURL(link.href);
    });
}

/**
 * Creates an error text element
 * @param { HTMLElement } deckContainer - Container HTML element
 * @param { Response } response - JSON response object
 * @param { string } marketplaceType - Localised marketplace type (lc.official or lc.community)
 */
function createErrorElement(deckContainer, response, marketplaceType)
{
    const text = lc.marketplace_load_error.replace("{}", response.status).replace("{}", marketplaceType);
    addElement("h1", text, "", "error-text centered vcentered", "", deckContainer);
}

/**
 * Constructs elements for official decks
 * @param { HTMLElement } deckContainer - Container HTML element
 * @returns {Promise<void>}
 */
async function handleOfficialRepos(deckContainer)
{
    let response = await fetch("https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/");
    if (response.status !== 200)
    {
        createErrorElement(deckContainer, response, lc.official);
        return;
    }
    const decks = (await response.json()).filter(it => it.name.endsWith(".yydeck.json"));

    // Fetch the contents of every deck in parallel, then construct the cards in repository order
    const contents = await Promise.all(decks.map(it => loadMarketplaceData(it.name)));
    for (let i = 0; i < decks.length; i++)
        constructElement(i, deckContainer, decks[i], contents[i], "official", lc.official, "");
}

/**
 * Constructs elements for community decks
 * @param { HTMLElement } deckContainer - Container HTML element
 * @returns {Promise<void>}
 */
async function handleCommunityRepos(deckContainer)
{
    // Start from community, we will then iterate through all the release folders
    let response = await fetch("https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/community");
    if (response.status !== 200)
    {
        createErrorElement(deckContainer, response, lc.community);
        return;
    }
    const releases = (await response.json()).filter(it => it.name.startsWith("r") && it.type === "dir");

    // Fetch all release folder listings in parallel. A failed listing only skips its own release
    const listings = await Promise.all(releases.map(async (release) => {
        const res = await fetch(`https://api.github.com/repos/MadLadSquad/YouyinPublicDeckRepository/contents/community/${release.name}`);
        if (res.status !== 200)
            return { error: res };
        return { decks: (await res.json()).filter(it => it.name.endsWith(".yydeck.json")) };
    }));

    // Fetch the contents of every deck of every release in parallel
    const contents = await Promise.all(listings.map((listing, i) =>
        listing.decks === undefined
            ? null
            : Promise.all(listing.decks.map(it => loadMarketplaceData(`community/${releases[i].name}/${it.name}`)))
    ));

    // Construct the sections and cards in repository order
    for (let i = 0; i < releases.length; i++)
    {
        if (listings[i].error !== undefined)
        {
            createErrorElement(deckContainer, listings[i].error, lc.community);
            continue;
        }

        addElement("h1", `${lc.release} ${releases[i].name.slice(1)}`, "", "centered", "", deckContainer);
        addElement("br", "", "", "", "", deckContainer);
        let el = addElement("section", "", "deck-community", "deck", "", deckContainer);
        for (let j = 0; j < listings[i].decks.length; j++)
            constructElement(j, el, listings[i].decks[j], contents[i][j], "community", lc.community, `community/${releases[i].name}/`);
    }
}

async function marketplaceMain()
{
    const deckContainer = $("marketplace-deck-container");
    const communityContainer = $("deck-community-master");

    // The official and community sections render into separate containers, so they can load
    // concurrently without affecting each other's order
    await Promise.all([
        handleOfficialRepos(deckContainer),
        handleCommunityRepos(communityContainer),
    ]);

    runEventAfterAnimation($("upload-deck-public"), "click", (_) => { window.open('https://github.com/MadLadSquad/YouyinPublicDeckRepository') });
}

marketplaceMain().then(_ => {});
