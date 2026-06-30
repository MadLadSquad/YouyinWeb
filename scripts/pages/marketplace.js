'use strict';

const MARKETPLACE_CDN = "{{ marketplace_cdn_url }}";
const MARKETPLACE_URL = "{{ marketplace_url }}";

/**
 * Fetches and parses a deck/metadata file from the public deck repository.
 * @param { string } file - Path of the file within the marketplace repository
 * @param { function(number): void } [onProgress] - Optional callback receiving a 0..1 download
 *        fraction. When supplied (the blocking import flow) the body is streamed so the loading bar
 *        can advance as bytes arrive; without it the response is read in one go.
 * @returns { Promise<Object|undefined> } - The parsed JSON, or undefined when the fetch failed
 */
async function loadMarketplaceData(file, onProgress)
{
    let response = await fetch(`${MARKETPLACE_CDN}/${file}`)
    if (response.status !== 200)
    {
        console.warn(`Bad response from the public deck repository, the deck file may be missing or the CDN may be unavailable. Response code: ${response.status}`);
        return;
    }

    // Stream the body when a progress callback is supplied so the import loading bar can track the
    // download. Content-Length is absent (or, under gzip, the compressed size) for some responses,
    // so onProgress is only called when we have a usable total; the overlay stays indeterminate
    // otherwise.
    if (onProgress && response.body)
    {
        const total = Number(response.headers.get("Content-Length")) || 0;
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;)
        {
            const { done, value } = await reader.read();
            if (done)
                break;
            chunks.push(value);
            received += value.length;
            if (total > 0)
                onProgress(received / total);
        }
        return JSON.parse(await new Blob(chunks).text());
    }

    return await response.json();
}

/**
 * Builds and shows the blocking, blurred modal used while a deck is being imported. Reuses the shared
 * loading-modal component (.char-load-* in char-loading.css) so it matches the character-database
 * download overlay. The bar starts indeterminate and switches to a real percentage once the download
 * reports measurable progress.
 * @returns { HTMLElement } - The overlay element (pass it to updateImportOverlay/hideImportOverlay)
 */
function showImportOverlay()
{
    const overlay = document.createElement("div");
    overlay.className = "char-load-overlay";

    const box = addElement("div", "", "", "char-load-box", "", overlay);
    addElement("h2", lc.deck_import_title, "", "char-load-title", "", box);
    addElement("p", lc.deck_import_subtitle, "", "char-load-subtitle", "", box);

    const bar = addElement("div", "", "", "char-load-bar", "", box);
    overlay.fill = addElement("div", "", "", "char-load-bar-fill indeterminate", "", bar);

    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Advances the import overlay's progress bar.
 * @param { HTMLElement } overlay - The overlay returned by showImportOverlay
 * @param { number } fraction - Progress in the range 0..1
 */
function updateImportOverlay(overlay, fraction)
{
    overlay.fill.classList.remove("indeterminate");
    overlay.fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
}

/**
 * Removes the import overlay.
 * @param { HTMLElement } overlay - The overlay returned by showImportOverlay
 */
function hideImportOverlay(overlay)
{
    overlay.remove();
}

/**
 * Constructs a marketplace element from a deck's metadata entry in the marketplace map.
 * @param { number } val - Running index, used purely to give elements unique ids
 * @param { HTMLElement } deckContainer - Container HTML element for the card
 * @param { Object } deck - Deck metadata: { name, cards, phrases, preset_levels, location }
 * @param { string } type - Marketplace type, either "official" or "unofficial"
 * @param { string } language - Language the deck belongs to
 * @returns { HTMLElement } - The card element, so the caller can register it for searching
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
            // Block the page behind the loading modal for the whole import so nothing else can be
            // touched while the deck downloads and is merged in
            const overlay = showImportOverlay();
            try
            {
                // If an element is created using addElement, arbitrary data is also assigned
                let content = await loadMarketplaceData(e.target.getAttribute("arbitrary-data"),
                    (fraction) => updateImportOverlay(overlay, fraction));
                if (content === undefined)
                {
                    hideImportOverlay(overlay);
                    return;
                }

                // Download done; the remaining merge + IndexedDB write is the last sliver of the bar
                updateImportOverlay(overlay, 1);

                let dt = window.profileData;
                dt.cards.push.apply(dt.cards, content.cards);
                dt.phrases.push.apply(dt.phrases, content.phrases);
                // Wait for the write to commit before navigating, otherwise the imported deck may not
                // be persisted by the time the deck page loads. The overlay stays up through the
                // navigation so the page never becomes interactive mid-import
                await saveProfileData(dt);
                location.href = "./deck.html";
            }
            catch (err)
            {
                console.error("Error: deck import failed", err);
                hideImportOverlay(overlay);
            }
        }
    });

    // Stupid ahhhh whitespace adding code because web dev is stupid
    addTextNode(div, " ");

    runEventAfterAnimation(addElement("button", lc.deck_source, `source-button-${type}-${val}`, "card-button-edit", path, div), "click", async function(e)
    {
        // If an element uses addElement, arbitrary data is also assigned
        window.open(`${MARKETPLACE_URL}/blob/master/` + e.target.getAttribute("arbitrary-data"));
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

    return div;
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

// Every rendered deck, registered so the search bar can filter cards by name. `name` is pre-lowercased
// for matching; `card` is the element to show/hide.
const searchableDecks = [];
// Each language section (header + spacer + grid + its cards), so a whole group can be hidden when none
// of its decks match the current query instead of leaving a lone header above an empty grid.
const languageGroups = [];

/**
 * Shows the decks whose names fuzzily match the query and hides the rest, then collapses any language
 * group left with no visible decks. Unlike the deck page, every marketplace card already lives in the
 * DOM, so filtering toggles display directly. The grids that still have visible decks then get the
 * shared results fade-in (animateSearchResults, card-search.js) — the same animation the deck uses.
 * @param { string } rawQuery - The raw value of the search box
 */
function applyDeckFilter(rawQuery)
{
    const query = normaliseSearchQuery(rawQuery);

    for (const deck of searchableDecks)
        deck.card.style.display = searchMatchesFields(query, [deck.name]) ? "" : "none";

    const visibleGrids = [];
    for (const group of languageGroups)
    {
        const visible = group.cards.some((d) => d.card.style.display !== "none");
        const display = visible ? "" : "none";
        group.header.style.display = display;
        group.spacer.style.display = display;
        group.grid.style.display = display;
        if (visible)
            visibleGrids.push(group.grid);
    }

    animateSearchResults(visibleGrids);
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
            const header = addElement("h1", language, "", "centered", "", container);
            const spacer = addElement("br", "", "", "", "", container);
            const grid = addElement("section", "", `deck-${type}-${val}`, "deck", "", container);

            const group = { header, spacer, grid, cards: [] };
            languageGroups.push(group);

            for (const deck of entry[language])
            {
                const card = constructElement(val++, grid, deck, type, language);
                const record = { name: (deck.name || "").toLowerCase(), card };
                searchableDecks.push(record);
                group.cards.push(record);
            }
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

    runEventAfterAnimation($("upload-deck-public"), "click", (_) => { window.open(MARKETPLACE_URL) });

    // Filter the rendered decks live as the user types in the search box
    wireSearchInput("marketplace-search", applyDeckFilter);
}

// Wait until index.js has loaded the profile data from IndexedDB before running the marketplace
window.storageReady.then(() => marketplaceMain());
