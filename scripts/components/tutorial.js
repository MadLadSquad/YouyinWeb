'use strict';
// First-visit onboarding tutorial orchestrator.
//
// Loaded on every page via the shared footer chrome, after scripts/index.js (so window.youyinProfileReady
// exists). The tutorial is inherently multi-page and event-driven — it waits on the character-database
// download, on a marketplace import committing, and on a practice session finishing — so it can't be a
// single in-page tour. Instead it's a small state machine persisted in localStorage: each page renders the
// slice that matches the current step, performs/awaits the relevant action, then advances the step and
// navigates to the next page.
//
// Element highlighting/pointer popovers use Driver.js (window.driver.js.driver, loaded from jsDelivr). The
// intro/outro are bespoke blocking modals (the intro embeds animated hanzi-writer widgets). See CLAUDE.md
// and the plan for the full flow. Storage keys mirror the existing localStorage idioms (theme-selector.js).

// ---------------------------------------------------------------------------------------------------------
// State (localStorage)
// ---------------------------------------------------------------------------------------------------------
const TUT_DONE = "youyinTutorialDone";   // "true" once completed or skipped
const TUT_STEP = "youyinTutorialStep";   // current stage; absent when no tutorial is running
const TUT_MODE = "youyinTutorialMode";   // "first" | "replay"

const TUT = {
    intro: "intro",
    marketplace: "marketplace",
    deckTour: "deck-tour",
    createCard: "create-card",
    cardReview: "card-review",
    createPhrase: "create-phrase",
    deckReview: "deck-review",
    session: "session",
    account: "account",
    outro: "outro",
};

function tutStep() { return window.localStorage.getItem(TUT_STEP); }
function tutSetStep(s) { window.localStorage.setItem(TUT_STEP, s); }
function tutIsReplay() { return window.localStorage.getItem(TUT_MODE) === "replay"; }
function tutIsDone() { return window.localStorage.getItem(TUT_DONE) === "true"; }

// Marks the tutorial finished (both the natural end and an early skip) and clears the running state
function tutFinish()
{
    window.localStorage.setItem(TUT_DONE, "true");
    window.localStorage.removeItem(TUT_STEP);
    window.localStorage.removeItem(TUT_MODE);
}

// Sets up a replay run: the user already completed the tutorial once (TUT_DONE is set), so clear it and
// seed the highlight-only walkthrough from the start. Called from the account page button.
window.youyinStartTutorialReplay = function ()
{
    window.localStorage.removeItem(TUT_DONE);
    window.localStorage.setItem(TUT_MODE, "replay");
    window.localStorage.setItem(TUT_STEP, TUT.intro);
    window.location.href = "./index.html";
};

// ---------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------

// Which page we're on, mirroring pageNeedsCharacterData() in index.js. Returns "index" for a directory root.
function tutPage()
{
    const path = window.location.pathname;
    if (path.endsWith("/"))
        return "index";
    const last = path.substring(path.lastIndexOf("/") + 1).replace(/\.html$/, "");
    return last === "" ? "index" : last;
}

function tutNavigate(url) { window.location.href = url; }

function tutDelay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Many of the site's buttons run their handler from runEventAfterAnimation (index.js): a click only arms
// the handler, which then runs on the following animationend/transitionend. A bare programmatic .click()
// never produces that follow-up event, so dispatch a synthetic animationend to actually fire the handler.
function tutTriggerButton(btn)
{
    if (!btn)
        return;
    btn.click();
    btn.dispatchEvent(new Event("animationend"));
}

// Resolves once getter() returns a truthy value (an element that has rendered/an async fetch that has
// landed), polling on animation frames. Resolves with null after the timeout so a missing target degrades
// gracefully (the replay walkthrough in particular may run against a deck that doesn't have every element).
function tutWaitFor(getter, timeout = 15000)
{
    return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
            let value = null;
            try { value = getter(); } catch (_) { value = null; }
            if (value)
                resolve(value);
            else if (Date.now() - start > timeout)
                resolve(null);
            else
                requestAnimationFrame(tick);
        };
        tick();
    });
}

// Sets an input's value and fires the change event the editor listens for, so the live preview / per-card
// rebuild happens exactly as if the user had typed and committed the value.
function tutFillField(id, value)
{
    const input = $(id);
    if (!input)
        return;
    input.value = value;
    input.dispatchEvent(new Event("change"));
}

// Adds one definition to a card/phrase edit form: fills the meaning input and triggers the "+" button the
// editor wires through runEventAfterAnimation (deck-new.js).
function tutAddDefinition(index, value)
{
    const field = $(`meaning-text-field-${index}`);
    if (!field)
        return;
    field.value = value;
    tutTriggerButton($(`add-meaning-list-button-${index}`));
}

// Adds several definitions one at a time, with a small pause so the user sees them appear in sequence.
async function tutAddDefinitions(index, values)
{
    for (const value of values)
    {
        tutAddDefinition(index, value);
        await tutDelay(500);
    }
}

// ---------------------------------------------------------------------------------------------------------
// Driver.js wrapper
// ---------------------------------------------------------------------------------------------------------

function tutDriverFactory() { return window.driver && window.driver.js && window.driver.js.driver; }

// Builds and runs a Driver.js tour from a list of steps. Each step is { element?, title, description,
// side?, align?, showButtons?, onHighlighted?, onNext? }. onHighlighted(driver) runs when the step renders
// (used to auto-type into the form the user is reading about). onNext(driver) runs when Next/Done is
// clicked: return true to let the wrapper advance/destroy, false if it navigates away or drives flow
// itself. Closing the tour early (× or Esc) ends the whole tutorial via tutFinish unless onClose is given.
function tutRunTour(steps, extraConfig)
{
    const factory = tutDriverFactory();
    if (!factory)
        return null;

    let driverObj;
    const driverSteps = steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        return {
            element: s.element,
            // onBeforeHighlight runs the instant the step starts rendering (before the 0.2s move/fade),
            // so a box we open here is already visible while the popover points at it — not after Next.
            onHighlightStarted: s.onBeforeHighlight ? () => s.onBeforeHighlight(driverObj) : undefined,
            onHighlighted: s.onHighlighted ? () => s.onHighlighted(driverObj) : undefined,
            // onDeselected fires on every way out of a step (Next, Prev, ×, Esc, destroy), so it's the
            // reliable place to tear down per-step side effects like an opened select box.
            onDeselected: s.onDeselected ? () => s.onDeselected(driverObj) : undefined,
            popover: {
                title: s.title || "",
                description: s.description || "",
                side: s.side || "bottom",
                align: s.align || "center",
                popoverClass: "tutorial-popover",
                showButtons: s.showButtons || ["next", "close"],
                nextBtnText: isLast ? (lc.tutorial_done || "Done") : (lc.tutorial_next || "Next"),
                onNextClick: () => {
                    const advance = s.onNext ? s.onNext(driverObj) : true;
                    if (advance === false)
                        return;
                    if (isLast)
                        driverObj.destroy();
                    else
                        driverObj.moveNext();
                },
            },
        };
    });

    driverObj = factory(Object.assign({
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 6,
        onCloseClick: () => {
            driverObj.destroy();
            tutFinish();
        },
        steps: driverSteps,
    }, extraConfig || {}));
    driverObj.drive();
    return driverObj;
}

// Highlights a single element the user is meant to click themselves (e.g. New Card / New Phrase, whose own
// handlers navigate). Shows only the close button so there's no competing Next, and attaches a one-time
// click listener that records the next step and tears the tour down before the native navigation fires.
function tutHighlightUserClick(element, title, description, side, nextStep)
{
    const driverObj = tutRunTour([{ element, title, description, side, showButtons: ["close"] }]);
    const target = typeof element === "string" ? document.querySelector(element) : element;
    if (target)
        target.addEventListener("click", () => {
            tutSetStep(nextStep);
            if (driverObj)
                driverObj.destroy();
        }, { once: true });
    return driverObj;
}

// Opens a button-triggered popup (language / theme / character-variant select) purely for display, by
// calling its registered popup controller's open() directly — more reliable than synthesizing a click,
// which doesn't open every select. Two things make the open box actually visible during a Driver tour:
//   - z-index: the popups live at z-index 50, but Driver's dim overlay sits at 10000, so without this the
//     opened box renders *underneath* the overlay (looks like it never opened). We lift it between the
//     overlay (10000) and the Driver popover (1e9) so the box shows over the dimming but under the popover.
//   - pointer-events: disabled so its contents can't be clicked/changed during the tour.
// Returns the popup element so it can be restored/closed later.
const TUT_BOX_Z_INDEX = "100000000";
function tutOpenBoxForDisplay(buttonId)
{
    const button = $(buttonId);
    if (!button)
        return null;
    for (const controller of window.youyinPopupControllers)
        if (controller.button === button)
        {
            controller.open();
            controller.popup.style.pointerEvents = "none";
            controller.popup.style.zIndex = TUT_BOX_Z_INDEX;
            return controller.popup;
        }
    return null;
}

// Restores a popup opened by tutOpenBoxForDisplay and closes it through its controller so its button's
// aria state stays correct — and, crucially, so pointer events work normally again after the tutorial.
function tutCloseBox(popup)
{
    if (!popup)
        return;
    popup.style.pointerEvents = "";
    popup.style.zIndex = "";
    for (const controller of window.youyinPopupControllers)
        if (controller.popup === popup)
        {
            controller.close();
            return;
        }
    popup.classList.remove("open");
}

// ---------------------------------------------------------------------------------------------------------
// Intro / outro modals (the intro embeds the animated 你好)
// ---------------------------------------------------------------------------------------------------------

// A loader-free hanzi-writer for the intro: omitting charDataLoader lets HanziWriter fetch 你/好 straight
// from its own CDN, so the animation runs immediately without waiting for the full local database download.
function tutCreateHelloWriter(targetId, character)
{
    return HanziWriter.create(targetId, character, {
        width: 90,
        height: 90,
        padding: 5,
        strokeColor: window.WRITER_STROKE_COLOUR,
        outlineColor: window.WRITER_OUTLINE_COLOUR,
        radicalColor: window.WRITER_RADICAL_COLOUR,
        showOutline: true,
        strokeAnimationSpeed: 1.25,
        delayBetweenStrokes: 60,
    });
}

// Animates the 你好 writers one after the other, looping forever until state.stopped flips. HanziWriter has
// no built-in loop, so this chains animateCharacter() promises by hand.
async function tutLoopHello(writers, state)
{
    while (!state.stopped)
    {
        for (const writer of writers)
        {
            if (state.stopped)
                return;
            await new Promise((resolve) => writer.animateCharacter({ onComplete: resolve }));
        }
        await tutDelay(700);
    }
}

// Builds the shared intro/outro modal shell, reusing the blocking-overlay classes from char-loading.css.
// buttons is a list of { id, label }. When withHello is set, the animated 你好 row is added. Returns
// { overlay, helloState }.
function tutBuildModal(title, body, buttons, withHello, clearBackground)
{
    const overlay = document.createElement("div");
    // The intro draws over the character-database download bar, so it uses the clear (transparent,
    // unblurred) surround to keep that bar visible. Every other modal keeps the standard dimmed/blurred
    // backdrop the rest of the site's modals use.
    overlay.className = "char-load-overlay tutorial-overlay" + (clearBackground ? " tutorial-overlay-clear" : "");

    const box = addElement("div", "", "", "char-load-box tutorial-box", "", overlay);
    addElement("h2", title, "", "char-load-title", "", box);
    addElement("p", body, "", "char-load-subtitle", "", box);

    const helloState = { stopped: true };
    if (withHello)
    {
        const hello = addElement("div", "", "", "tutorial-hello", "", box);
        addElement("div", "", "tutorial-hello-0", "tutorial-hello-char", "", hello);
        addElement("div", "", "tutorial-hello-1", "tutorial-hello-char", "", hello);
    }

    const buttonRow = addElement("div", "", "", "tutorial-modal-buttons", "", box);
    for (const b of buttons)
        addElement("button", b.label, b.id, "card-button-edit", "", buttonRow);

    document.body.appendChild(overlay);

    if (withHello && typeof HanziWriter !== "undefined")
    {
        helloState.stopped = false;
        const writers = [
            tutCreateHelloWriter("tutorial-hello-0", "你"),
            tutCreateHelloWriter("tutorial-hello-1", "好"),
        ];
        tutLoopHello(writers, helloState);
    }

    return { overlay, helloState };
}

// Stage 1: the intro modal, drawn over the character-database download bar. Skip ends the tutorial;
// Continue removes the modal straight away so the user can watch the download progress bar, then moves on
// to the marketplace once the database has finished downloading.
function tutShowIntro()
{
    const { overlay, helloState } = tutBuildModal(
        lc.tutorial_intro_title,
        lc.tutorial_intro_body,
        [
            { id: "tutorial-skip", label: lc.tutorial_skip },
            { id: "tutorial-continue", label: lc.tutorial_continue },
        ],
        true,
        // Only a genuine first visit downloads the database, so only then do we clear the backdrop to show
        // the progress bar. On a replay the data is already cached, so keep the normal dimmed/blurred modal.
        !tutIsReplay());

    const close = () => { helloState.stopped = true; overlay.remove(); };

    $("tutorial-skip").addEventListener("click", () => {
        close();
        tutFinish();
    });

    $("tutorial-continue").addEventListener("click", async () => {
        tutSetStep(TUT.marketplace);
        // Remove the modal immediately so the character-database download bar behind it is visible while we
        // wait for the download to finish (on a replay this resolves instantly — the data is already cached)
        close();
        await window.youyinCharDataReady;
        tutNavigate("./marketplace.html");
    });
}

// Final stage: the outro modal congratulating the user, then end the tutorial. No 你好 widgets here.
function tutShowOutro()
{
    const { overlay } = tutBuildModal(
        lc.tutorial_outro_title,
        lc.tutorial_outro_body,
        [{ id: "tutorial-finish", label: lc.tutorial_finish }],
        false,
        false); // standard dimmed/blurred backdrop, like the rest of the site's modals

    $("tutorial-finish").addEventListener("click", () => {
        overlay.remove();
        tutFinish();
    });
}

// ---------------------------------------------------------------------------------------------------------
// Marketplace stage — import the Chinese Numbers deck
// ---------------------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------------------
// Deck page helpers
// ---------------------------------------------------------------------------------------------------------

function tutFirstEditButton() { return document.querySelector('[id^="card-edit-button-"]'); }

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

// ---------------------------------------------------------------------------------------------------------
// Card creation (好) — first run only
// ---------------------------------------------------------------------------------------------------------

async function tutRunCreateCard()
{
    await tutWaitFor(() => $("character-text-field-0"));

    let variantPopup = null;
    tutRunTour([
        {
            element: "#input-mode",
            title: lc.tutorial_card_ime_title,
            description: lc.tutorial_card_ime,
            side: "bottom",
        },
        {
            element: "#name-text-field-0",
            title: lc.tutorial_card_pron_title,
            description: lc.tutorial_card_pron,
            side: "bottom",
            onHighlighted: () => tutFillField("name-text-field-0", "hǎo"),
        },
        {
            element: "#character-text-field-0",
            title: lc.tutorial_card_input_title,
            description: lc.tutorial_card_input,
            side: "bottom",
            onHighlighted: () => tutFillField("character-text-field-0", "好"),
        },
        {
            // The variant select is rebuilt for the new character; it always offers at least the default,
            // plus any Japanese (Kanji) / Korean (Hanja) form present in the stroke database. Open it so
            // the user sees the available variants (pointer-events disabled so they can't change it here).
            element: "#character-variant-box-0",
            title: lc.tutorial_card_variant_title,
            description: lc.tutorial_card_variant,
            side: "bottom",
            onBeforeHighlight: () => { variantPopup = tutOpenBoxForDisplay("character-variant-box-0"); },
            onDeselected: () => tutCloseBox(variantPopup),
        },
        {
            element: "#character-preview-0",
            title: lc.tutorial_card_preview_title,
            description: lc.tutorial_card_preview,
            side: "left",
        },
        {
            element: "#meaning-text-field-0",
            title: lc.tutorial_card_defs_title,
            description: lc.tutorial_card_defs,
            side: "bottom",
            onHighlighted: () => tutAddDefinitions(0, ["good", "fine", "ok"]),
        },
        {
            element: "#finish-edit-button",
            title: lc.tutorial_card_save_title,
            description: lc.tutorial_card_save,
            side: "top",
            onNext: () => {
                // Card saved; the finish handler navigates to the deck page, where the orchestrator picks
                // up the card-review stage.
                tutSetStep(TUT.cardReview);
                tutTriggerButton($("finish-edit-button"));
                return false;
            },
        },
    ]);
}

// Back on the deck after creating 好: point at the new card, then send the user into the phrase editor.
async function tutRunCardReview()
{
    // The new card lands at the bottom of the (virtualized) deck; nudge it into view so it hydrates.
    const deckIndex = window.profileData.cards.length - 1;
    window.scrollTo(0, document.body.scrollHeight);
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

// ---------------------------------------------------------------------------------------------------------
// Phrase creation (你好, reusing 好 and creating 你) — first run only
// ---------------------------------------------------------------------------------------------------------

async function tutRunCreatePhrase()
{
    await tutWaitFor(() => $("character-text-field-phrase"));

    tutRunTour([
        {
            element: "#name-text-field-phrase",
            title: lc.tutorial_phrase_pron_title,
            description: lc.tutorial_phrase_pron,
            side: "bottom",
            onHighlighted: () => tutFillField("name-text-field-phrase", "nǐ hǎo"),
        },
        {
            element: "#character-text-field-phrase",
            title: lc.tutorial_phrase_input_title,
            description: lc.tutorial_phrase_input,
            side: "bottom",
            // Typing the phrase rebuilds the per-character edit cards, so do it on Next (which replaces the
            // input element) rather than on highlight, to avoid Driver holding a stale reference.
            onNext: () => { tutFillField("character-text-field-phrase", "你好"); return true; },
        },
        {
            element: "#meaning-text-field-phrase",
            title: lc.tutorial_phrase_defs_title,
            description: lc.tutorial_phrase_defs,
            side: "bottom",
            onHighlighted: () => tutAddDefinitions("phrase", ["hello"]),
        },
        {
            element: "#edit-phrase-0",
            title: lc.tutorial_phrase_subcard_title,
            description: lc.tutorial_phrase_subcard,
            side: "top",
            // The unknown 你 card (index 0) gets its own pronunciation and meaning; 好 (index 1) was reused.
            onHighlighted: async () => {
                tutFillField("name-text-field-0", "nǐ");
                await tutAddDefinitions(0, ["you"]);
            },
        },
        {
            element: "#finish-edit-button",
            title: lc.tutorial_phrase_save_title,
            description: lc.tutorial_phrase_save,
            side: "top",
            onNext: () => {
                tutSetStep(TUT.deckReview);
                tutTriggerButton($("finish-edit-button"));
                return false;
            },
        },
    ]);
}

// Back on the deck after creating the phrase: show the phrase, then a character that belongs to it.
async function tutRunDeckReview()
{
    const phraseCard = await tutWaitFor(tutFirstPhraseCard);
    // The membership cards (你/好) sit at the bottom of the virtualized deck; nudge them into view.
    window.scrollTo(0, document.body.scrollHeight);
    const partOf = await tutWaitFor(tutPartOfCard);

    const steps = [];
    if (phraseCard)
        steps.push({ element: phraseCard, title: lc.tutorial_review_phrase_title, description: lc.tutorial_review_phrase, side: "top" });
    if (partOf)
        steps.push({ element: partOf, title: lc.tutorial_review_partof_title, description: lc.tutorial_review_partof, side: "left" });
    steps.push({
        title: lc.tutorial_review_navigate_title,
        description: lc.tutorial_review_navigate,
        onNext: () => { tutSetStep(TUT.session); tutNavigate("./index.html"); return false; },
    });

    tutRunTour(steps);
}

// ---------------------------------------------------------------------------------------------------------
// Practice-session stage
// ---------------------------------------------------------------------------------------------------------

async function tutRunSession()
{
    await tutWaitFor(() => $("start-button"));
    const replay = tutIsReplay();

    if (replay)
    {
        // Highlight-only: explain the start button without forcing a real session (it would mutate stats).
        tutRunTour([{
            element: "#start-button",
            title: lc.tutorial_session_title,
            description: lc.tutorial_session_replay,
            side: "top",
            onNext: () => { tutSetStep(TUT.account); tutNavigate("./account.html"); return false; },
        }]);
        return;
    }

    // First run: highlight the start button and let the user click it themselves. The highlight cut-out keeps
    // it interactive; once clicked the button is replaced by the session UI, so tear the tour down and watch
    // for the finished-session screen to advance.
    const driverObj = tutRunTour([{
        element: "#start-button",
        title: lc.tutorial_session_title,
        description: lc.tutorial_session_start,
        side: "top",
        showButtons: ["close"], // the user advances by clicking Start itself, not a Next button
    }]);

    $("start-button").addEventListener("click", () => {
        if (driverObj)
            driverObj.destroy();
        tutObserveSessionEnd();
    }, { once: true });
}

// Waits for the finished-session screen's stat animations to play out — the Continue button (.finish-continue)
// is only added after the last stat slide finishes animating — then points the user to their profile.
function tutObserveSessionEnd()
{
    const promptProfile = () => {
        tutRunTour([{
            title: lc.tutorial_session_done_title,
            description: lc.tutorial_session_done,
            onNext: () => { tutSetStep(TUT.account); tutNavigate("./account.html"); return false; },
        }]);
    };

    if (document.querySelector(".finish-continue"))
    {
        promptProfile();
        return;
    }

    const observer = new MutationObserver(() => {
        if (document.querySelector(".finish-continue"))
        {
            observer.disconnect();
            promptProfile();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------------------------------------
// Account stage
// ---------------------------------------------------------------------------------------------------------

async function tutRunAccount()
{
    await tutWaitFor(() => $("profile-card"));

    // Opened language/theme popups are restored when leaving their step. disableActiveInteraction keeps the
    // highlighted controls (and the opened lists) unclickable, and a lighter overlay keeps the lists legible.
    let languagePopup = null;
    let themePopup = null;

    tutRunTour([
        {
            element: "#profile-card",
            title: lc.tutorial_account_stats_title,
            description: lc.tutorial_account_stats,
            side: "right",
        },
        {
            element: "#extensive-mode-checkbox",
            title: lc.tutorial_account_extensive_title,
            description: lc.tutorial_account_extensive,
            side: "bottom",
        },
        {
            element: "#level-reduce-slider",
            title: lc.tutorial_account_levelreduce_title,
            description: lc.tutorial_account_levelreduce,
            side: "bottom",
        },
        {
            element: "#lang-select-account",
            title: lc.tutorial_account_language_title,
            description: lc.tutorial_account_language,
            // Anchor to the side: the opened list expands vertically, so a top/bottom popover would overlap
            // it (the Driver popover sits at a very high z-index and would cover the list).
            side: "left",
            onBeforeHighlight: () => { languagePopup = tutOpenBoxForDisplay("lang-select-account"); },
            onDeselected: () => tutCloseBox(languagePopup),
        },
        {
            element: "#theme-button-account",
            title: lc.tutorial_account_theme_title,
            description: lc.tutorial_account_theme,
            side: "right",
            onBeforeHighlight: () => { themePopup = tutOpenBoxForDisplay("theme-button-account"); },
            onDeselected: () => tutCloseBox(themePopup),
        },
        {
            element: "#replay-tutorial-button",
            title: lc.tutorial_account_replay_title,
            description: lc.tutorial_account_replay,
            side: "top",
            onNext: () => { tutSetStep(TUT.outro); tutNavigate("./index.html"); return false; },
        },
    ], { overlayOpacity: 0.35, disableActiveInteraction: true });
}

// ---------------------------------------------------------------------------------------------------------
// Per-page dispatch
// ---------------------------------------------------------------------------------------------------------

function tutDispatch()
{
    if (tutIsDone())
        return;

    const step = tutStep();
    if (!step)
        return; // Not running on this page (index.js seeds the intro step on a first visit to the landing page)

    const page = tutPage();
    switch (step)
    {
        case TUT.intro:        if (page === "index") tutShowIntro(); break;
        case TUT.marketplace:  if (page === "marketplace") tutRunMarketplace(); break;
        case TUT.deckTour:     if (page === "deck") tutRunDeckTour(); break;
        case TUT.createCard:
            if (page === "deck-edit-card") tutRunCreateCard();
            else if (page === "deck") tutNavigate("./deck-edit-card.html?new");
            break;
        case TUT.cardReview:   if (page === "deck") tutRunCardReview(); break;
        case TUT.createPhrase:
            if (page === "deck-edit-card") tutRunCreatePhrase();
            else if (page === "deck") tutNavigate("./deck-edit-card.html?phrase-new");
            break;
        case TUT.deckReview:   if (page === "deck") tutRunDeckReview(); break;
        case TUT.session:      if (page === "index") tutRunSession(); break;
        case TUT.account:      if (page === "account") tutRunAccount(); break;
        case TUT.outro:        if (page === "index") tutShowOutro(); break;
    }
}

// The chrome (and the deck/account page shells) are ready once the profile loads; gate on it so highlighted
// elements exist. Individual stages additionally tutWaitFor their specific async-rendered targets.
window.youyinProfileReady.then(() => tutDispatch());
