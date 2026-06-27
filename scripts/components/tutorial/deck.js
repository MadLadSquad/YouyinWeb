'use strict';
// Tutorial: deck-page stages — deck tour, card review and deck review.
//
// Loaded only on deck.html, before the shared footer so these stage functions are defined before footer's
// tutorial.js runs tutDispatch (it only routes to them at call time, by which point the cross-page core in
// scripts/components/tutorial.js — helpers, tutRunTour, tutDispatch — exists). These stages run
// when the orchestrator returns to the deck between the editor visits.

// ---------------------------------------------------------------------------------------------------------
// Deck page helpers
// ---------------------------------------------------------------------------------------------------------

function tutFirstEditButton() { return document.querySelector('[id^="card-edit-button-"]'); }

// The deck is virtualized: block heights start as estimates and only become real as blocks hydrate on
// scroll, so the document grows as we descend. A one-shot scroll to scrollHeight aims at the stale
// (smaller) estimate and stops short of the true bottom, so the last block — where a just-added card
// lands — never enters the hydrate margin and never renders. Re-issue the scroll until the height stops
// changing AND we've actually reached the bottom, so the trailing block reliably hydrates.
async function tutScrollToBottomStable(timeout = 8000)
{
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = Date.now();
    let last = -1, stable = 0;
    while (Date.now() - start < timeout)
    {
        window.scrollTo({ top: document.body.scrollHeight, behavior: reduce ? "auto" : "smooth" });
        await tutDelay(200);
        const h = document.body.scrollHeight;
        stable = (h === last) ? stable + 1 : 0;
        last = h;
        if (stable >= 2 && window.scrollY + window.innerHeight >= h - 4)
            break;
    }
}

// Finds a rendered card by its original index in profileData.cards (the deck virtualizer stamps that onto
// each card's edit button as arbitrary-data), then returns the enclosing card container.
function tutFindCardByDeckIndex(deckIndex)
{
    const target = String(deckIndex);
    for (const btn of document.querySelectorAll('[id^="card-edit-button-"]'))
        if (btn.getAttribute("arbitrary-data") === target)
            return btn.closest('[id^="card-container-"]');
    return null;
}

function tutLastCharacterCard()
{
    const section = $("deck-characters-section");
    if (!section)
        return null;
    const cards = section.querySelectorAll('[id^="card-container-"]');
    return cards.length ? cards[cards.length - 1] : null;
}

function tutFirstPhraseCard()
{
    const section = $("deck-phrases-section");
    return section ? section.querySelector('[id^="card-container-"]') : null;
}

// The card that shows a "part of phrase" list — the <p> built from lc.part_of inside a card container.
function tutPartOfCard()
{
    const label = (lc.part_of || "").trim();
    for (const card of document.querySelectorAll('[id^="card-container-"]'))
        for (const p of card.querySelectorAll("p"))
            if (label && p.textContent.trim().startsWith(label))
                return card;
    return null;
}

// ---------------------------------------------------------------------------------------------------------
// Deck tour — first arrival at the deck after the import
// ---------------------------------------------------------------------------------------------------------

async function tutRunDeckTour()
{
    await tutWaitFor(() => $("new-card-button"));

    if (tutIsReplay())
    {
        // Highlight-only replay: show the whole deck, the add-card controls, and (if present) the edit
        // button + phrase-membership explanation, then jump to the session stage. It never creates cards.
        const steps = [
            { element: "#deck-characters-section", title: lc.tutorial_deck_title, description: lc.tutorial_deck_intro },
            { element: "#new-card-button", title: lc.tutorial_deck_newcard_title, description: lc.tutorial_deck_newcard, side: "right" },
        ];
        const editBtn = tutFirstEditButton();
        if (editBtn)
            steps.push({ element: editBtn, title: lc.tutorial_review_edit_title, description: lc.tutorial_review_edit, side: "left" });
        const partOf = tutPartOfCard();
        if (partOf)
            steps.push({ element: partOf, title: lc.tutorial_review_partof_title, description: lc.tutorial_review_partof, side: "left" });

        steps[steps.length - 1].onNext = () => { tutSetStep(TUT.session); tutNavigate("./index.html"); return false; };
        tutRunTour(steps);
        return;
    }

    // First run: highlight the entire deck, then point at New Card and let the user click it themselves
    // (its own handler navigates to the new-card editor).
    let driverObj;
    driverObj = tutRunTour([
        {
            element: "#deck-characters-section",
            title: lc.tutorial_deck_title,
            description: lc.tutorial_deck_intro,
        },
        {
            element: "#new-card-button",
            title: lc.tutorial_deck_newcard_title,
            description: lc.tutorial_deck_newcard,
            side: "right",
            showButtons: ["close"],
            onHighlighted: (d) => {
                const btn = $("new-card-button");
                if (btn)
                    btn.addEventListener("click", () => {
                        tutSetStep(TUT.createCard);
                        if (d)
                            d.destroy();
                    }, { once: true });
            },
        },
    ]);
}

// Back on the deck after creating 好: point at the new card, then send the user into the phrase editor.
async function tutRunCardReview()
{
    // The new card lands at the bottom of the (virtualized) deck; nudge it into view so it hydrates.
    const deckIndex = window.profileData.cards.length - 1;
    await tutScrollToBottomStable();
    const card = (await tutWaitFor(() => tutFindCardByDeckIndex(deckIndex))) || tutLastCharacterCard();

    const steps = [];
    if (card)
        steps.push({ element: card, title: lc.tutorial_cardreview_title, description: lc.tutorial_cardreview, side: "top" });

    steps.push({
        element: "#new-phrase-button",
        title: lc.tutorial_cardreview_phrase_title,
        description: lc.tutorial_cardreview_phrase,
        side: "right",
        showButtons: ["close"],
        onHighlighted: (d) => {
            const btn = $("new-phrase-button");
            if (btn)
                btn.addEventListener("click", () => {
                    tutSetStep(TUT.createPhrase);
                    if (d)
                        d.destroy();
                }, { once: true });
        },
    });

    tutRunTour(steps);
}

// Back on the deck after creating the phrase: show the phrase, then a character that belongs to it.
// The phrase sits at the top (the phrases section precedes the characters section) and is in view on
// entry, while the membership cards (你/好) sit at the bottom of the virtualized deck. We must NOT scroll
// to the bottom up front: that would tear down the phrase card's virtualized block, leaving the first
// step's popover pointing at a now-empty top of screen. So show the phrase where it already is, and only
// after the user advances do we scroll down to reveal — and hydrate — the membership card.
async function tutRunDeckReview()
{
    const phraseCard = await tutWaitFor(tutFirstPhraseCard);
    if (!phraseCard)
    {
        // Degenerate (no phrase rendered); skip straight to the membership stage.
        tutShowDeckReviewMembership();
        return;
    }

    tutRunTour([{
        element: phraseCard,
        title: lc.tutorial_review_phrase_title,
        description: lc.tutorial_review_phrase,
        side: "top",
        nextBtnText: lc.tutorial_next || "Next",
        onNext: (d) => { d.destroy(); tutShowDeckReviewMembership(); return false; },
    }]);
}

// Second half of the deck review: only now scroll to the bottom (hydrating the membership cards), then
// point at a character that belongs to the phrase before sending the user into their first session.
async function tutShowDeckReviewMembership()
{
    await tutScrollToBottomStable();
    const partOf = await tutWaitFor(tutPartOfCard);

    const steps = [];
    if (partOf)
        steps.push({ element: partOf, title: lc.tutorial_review_partof_title, description: lc.tutorial_review_partof, side: "left" });
    steps.push({
        title: lc.tutorial_review_navigate_title,
        description: lc.tutorial_review_navigate,
        onNext: () => { tutSetStep(TUT.session); tutNavigate("./index.html"); return false; },
    });

    tutRunTour(steps);
}
