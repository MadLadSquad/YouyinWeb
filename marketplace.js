'use strict';

const MARKETPLACE_CDN = "https://cdn.jsdelivr.net/gh/MadLadSquad/YouyinPublicDeckRepository@latest";

async function loadMarketplaceData(file)
{
    let response = await fetch(`${MARKETPLACE_CDN}/${file}`)
    if (response.status !== 200)
    {
        console.warn(`Bad response from the public deck repository, the deck file may be missing or the CDN may be unavailable. Response code: ${response.status}`);
        return;
    }
    return await response.json();
}

/**
 * Constructs a marketplace element from a deck's metadata entry in the marketplace map.
 * @param { number } val - Running index, used purely to give elements unique ids
 * @param { HTMLElement } deckContainer - Container HTML element for the card
 * @param { Object } deck - Deck metadata: { name, cards, phrases, preset_levels, location }
 * @param { string } type - Marketplace type, either "official" or "unofficial"
 * @param { string } language - Language the deck belongs to
 */
function constructElement(val, deckContainer, deck, type, language)
{
    // The deck file lives at CDN/[official|unofficial]/language/[location] in the repository
    const path = `${type}/${language}/${deck.location}`;

    // Create card
    let div = addElement("div", "", `marketplace-${type}-card-${val}`, "card centered", "", deckContainer);

    addElement("h1", deck.name, "", "", "", div);
    addElement("p", `${lc.pre_leveled_up}: ${deck.preset_levels ? lc.leveled_up_yes : lc.leveled_up_no}`, "", "", "", div);
    addElement("p", `${lc.phrases_count_cards}: ${deck.cards}`, "", "", "", div);
    addElement("p", `${lc.phrases_count_phrase}: ${deck.phrases}`, "", "", "", div);

    // Import a deck from file
    runEventAfterAnimation(addElement("button", lc.deck_import, `import-button-${type}-${val}`, "card-button-edit", path, div), "click", async function(e)
    {
        let bExecuted = confirm(lc.import_deck_confirm_text);
        if (bExecuted)
        {
            // If an element is created using addElement, arbitrary data is also assigned
            let content = await loadMarketplaceData(e.target.getAttribute("arbitrary-data"));
            if (content === undefined)
                return;

            let dt = window.localStorageData;
            dt.cards.push.apply(dt.cards, content.cards);
            dt.phrases.push.apply(dt.phrases, content.phrases);
            saveToLocalStorage(dt);
            location.href = "./deck.html";
        }
    });

    // Stupid ahhhh whitespace adding code because web dev is stupid
    addTextNode(div, " ");

    runEventAfterAnimation(addElement("button", lc.deck_source, `source-button-${type}-${val}`, "card-button-edit", path, div), "click", async function(e)
    {
        // If an element uses addElement, arbitrary data is also assigned
        window.open('https://github.com/MadLadSquad/YouyinPublicDeckRepository/blob/master/' + e.target.getAttribute("arbitrary-data"));
    });

    addElement("br", "", "", "", "", div);

    // Download deck with this interesting code
    runEventAfterAnimation(addElement("button", lc.deck_download, `download-button-${type}-${val}`, "card-button-edit", path, div), "click", async function(e)
    {
        let content = await loadMarketplaceData(e.target.getAttribute("arbitrary-data"));
        if (content === undefined)
            return;

        // loadMarketplaceData returns the parsed object — serialize it back, otherwise the Blob
        // would contain the string "[object Object]"
        let file = new Blob([JSON.stringify(content)], { type: "application/json;charset=utf-8" });
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
 */
function createErrorElement(deckContainer, response)
{
    const text = lc.marketplace_load_error.replace("{}", response.status);
    addElement("h1", text, "", "error-text centered vcentered", "", deckContainer);
}

/**
 * Renders every language of a single marketplace type (official/unofficial). Each language gets its own
 * header followed by a grid of the decks belonging to it.
 * @param { HTMLElement } container - Container HTML element for this marketplace type
 * @param { Object[] } languages - Array of single-key objects, each mapping a language to its deck array
 * @param { string } type - Marketplace type, either "official" or "unofficial"
 */
function handleMarketplaceSection(container, languages, type)
{
    let val = 0;
    for (const entry of languages)
    {
        // Each entry maps one or more language names to their deck arrays. Iterate every key so a
        // language is never dropped, regardless of whether the map groups languages per object or
        // shares a single object between them
        for (const language of Object.keys(entry))
        {
            addElement("h1", language, "", "centered", "", container);
            addElement("br", "", "", "", "", container);
            let grid = addElement("section", "", `deck-${type}-${val}`, "deck", "", container);

            for (const deck of entry[language])
                constructElement(val++, grid, deck, type, language);
        }
    }
}

async function marketplaceMain()
{
    const officialContainer = $("marketplace-deck-container");
    const unofficialContainer = $("deck-community-master");

    // Everything the page needs is described by a single metadata map, so one fetch and one error
    // message cover the whole marketplace
    const response = await fetch(`${MARKETPLACE_CDN}/marketplace-map.json`);
    if (response.status !== 200)
    {
        createErrorElement(officialContainer, response);
    }
    else
    {
        const map = await response.json();
        if (map.official !== undefined)
            handleMarketplaceSection(officialContainer, map.official, "official");

        // Only surface the community section when there is at least one community deck to show
        if (map.unofficial !== undefined && map.unofficial.length > 0)
        {
            addElement("h1", lc.community_decks_header, "", "centered", "", unofficialContainer);
            handleMarketplaceSection(unofficialContainer, map.unofficial, "unofficial");
        }
    }

    runEventAfterAnimation($("upload-deck-public"), "click", (_) => { window.open('https://github.com/MadLadSquad/YouyinPublicDeckRepository') });
}

marketplaceMain().then(_ => {});
