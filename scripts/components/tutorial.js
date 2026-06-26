'use strict';
// First-visit onboarding tutorial — cross-page core.
//
// Loaded on every page via the shared footer chrome, after scripts/index.js (so window.youyinProfileReady
// exists). The tutorial is inherently multi-page and event-driven — it waits on the character-database
// download, on a marketplace import committing, and on a practice session finishing — so it can't be a
// single in-page tour. Instead it's a small state machine persisted in localStorage: each page renders the
// slice that matches the current step, performs/awaits the relevant action, then advances the step and
// navigates to the next page.
//
// This file holds only the cross-page core: the state machine, the shared helpers, the Driver.js wrapper and
// the per-page dispatch. The per-page *stage* functions it dispatches to live in scripts/components/tutorial/
// (main-page.js, marketplace.js, deck.js, deck-new.js, account.js) and are loaded only on their page, after
// this file. Because tutDispatch runs from a youyinProfileReady.then() (well after every script has parsed)
// and every case is guarded by an exact tutPage() check, each stage function is only ever called on the page
// whose file defines it.
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
// Per-page dispatch
// ---------------------------------------------------------------------------------------------------------
//
// Each stage function below is defined by the per-page file in scripts/components/tutorial/ that loads on
// the matching page. The page guards ensure a stage is only invoked where its file is present.

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
