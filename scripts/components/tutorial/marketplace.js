'use strict';
// Tutorial: marketplace stage — import the Chinese Numbers deck.
//
// Loaded only on marketplace.html, before the shared footer so these stage functions are defined before
// footer's tutorial.js runs tutDispatch (it only routes to them at call time, by which point the cross-page
// core in scripts/components/tutorial.js — helpers, tutRunTour, tutDispatch — exists).

// Finds the import button for the Chinese Numbers starter deck among the rendered marketplace cards. The
// arbitrary-data attribute holds the deck's CDN path (…/Chinese-Numbers.yydeck.json); fall back to the
// card's visible name if the file is ever renamed.
function tutFindNumbersImportButton()
{
    const buttons = document.querySelectorAll('[id^="import-button-"]');
    for (const btn of buttons)
    {
        const data = btn.getAttribute("arbitrary-data") || "";
        if (data.endsWith("Chinese-Numbers.yydeck.json"))
            return btn;
    }
    for (const btn of buttons)
    {
        const heading = btn.closest(".card") && btn.closest(".card").querySelector("h1");
        if (heading && heading.textContent.trim().toLowerCase() === "chinese numbers")
            return btn;
    }
    return null;
}

async function tutRunMarketplace()
{
    const importButton = await tutWaitFor(tutFindNumbersImportButton);
    const replay = tutIsReplay();

    const steps = [
        {
            title: lc.tutorial_marketplace_title,
            description: lc.tutorial_marketplace_intro,
        },
        {
            element: "#marketplace-search",
            title: lc.tutorial_marketplace_search_title,
            description: lc.tutorial_marketplace_search,
            side: "bottom",
        },
    ];

    if (importButton)
    {
        steps.push({
            element: importButton,
            title: lc.tutorial_marketplace_import_title,
            description: replay ? lc.tutorial_marketplace_import_replay : lc.tutorial_marketplace_import,
            side: "top",
            onNext: (driverObj) => {
                tutSetStep(TUT.deckTour);
                // Tear the tour down first so the import's own progress bar is visible (not covered by the
                // Driver overlay/popover).
                if (driverObj)
                    driverObj.destroy();
                if (replay)
                {
                    tutNavigate("./deck.html");
                    return false;
                }
                // Auto-import: the real handler confirms first, so stub confirm() to accept for this one
                // synchronous trigger (confirm runs before the handler's first await). The handler then
                // shows its own progress overlay, writes to IndexedDB and navigates to the deck page.
                const original = window.confirm;
                window.confirm = () => true;
                tutTriggerButton(importButton);
                window.confirm = original;
                return false;
            },
        });
    }
    else
    {
        // Deck list never rendered (offline / CDN blocked). Skip straight to the deck page.
        steps.push({
            title: lc.tutorial_marketplace_import_title,
            description: lc.tutorial_marketplace_unavailable,
            onNext: () => { tutSetStep(TUT.deckTour); tutNavigate("./deck.html"); return false; },
        });
    }

    tutRunTour(steps);
}
