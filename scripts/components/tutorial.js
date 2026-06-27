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

// After Driver has highlighted a step, keep BOTH the highlighted widget and its popover on screen.
// Driver's own bringInView only frames the element (it centres it, or skips scrolling when the element
// is already fully visible) and ignores the popover's footprint, so on a short viewport a top/bottom
// popover can push the widget off the edge. We read the union of the element rect and the rendered
// .driver-popover rect and, if it spills past a small margin, do one corrective smooth scrollBy. When
// the two together are taller than the viewport we prioritise the widget (align its top to the margin)
// so the user always sees what's being pointed at. Runs on the next frame so Driver has placed the popover.
function tutEnsureBothInView(element)
{
    const node = typeof element === "string" ? document.querySelector(element) : element;
    if (!node)
        return;
    requestAnimationFrame(() => {
        const popover = document.querySelector(".driver-popover");
        const elRect = node.getBoundingClientRect();
        const margin = 12;
        const viewport = window.innerHeight || document.documentElement.clientHeight;

        let top = elRect.top;
        let bottom = elRect.bottom;
        if (popover)
        {
            const pRect = popover.getBoundingClientRect();
            top = Math.min(top, pRect.top);
            bottom = Math.max(bottom, pRect.bottom);
        }

        let delta = 0;
        if (bottom - top > viewport - 2 * margin)
            delta = elRect.top - margin;          // Can't fit both: keep the widget itself in view.
        else if (top < margin)
            delta = top - margin;                 // Spills past the top — scroll up.
        else if (bottom > viewport - margin)
            delta = bottom - (viewport - margin); // Spills past the bottom — scroll down.

        if (delta === 0)
            return;

        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
    });
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
        let boxPopup = null;
        const step = {
            element: s.element,
            onHighlightStarted: s.onBeforeHighlight ? () => s.onBeforeHighlight(driverObj) : undefined,
            onHighlighted: () => {
                if (s.onHighlighted)
                    s.onHighlighted(driverObj);
                // A step may open a select box purely for display (openBox). We do it here — after Driver
                // has actually rendered and positioned the popover — then float the list on the side of the
                // button OPPOSITE to where the popover landed, so the two never overlap on any viewport.
                if (s.openBox)
                    boxPopup = tutOpenBoxForDisplay(s.openBox);
                // A floated box popup is position:fixed; a corrective scroll would slide the button out from
                // under it, so only keep widget+popover framed for ordinary (non-box) steps.
                else
                    tutEnsureBothInView(s.element);
            },
            // onDeselected fires on every way out of a step (Next, Prev, ×, Esc, destroy), so it's the
            // reliable place to tear down per-step side effects like an opened select box.
            onDeselected: () => {
                if (s.openBox)
                    tutCloseBox(boxPopup);
                if (s.onDeselected)
                    s.onDeselected(driverObj);
            },
            popover: {
                title: s.title || "",
                description: s.description || "",
                side: s.side || "bottom",
                align: s.align || "center",
                popoverClass: "tutorial-popover",
                showButtons: s.showButtons || ["next", "close"],
                // A step can force its own label (e.g. a single-step tour that hands off to another tour
                // still wants "Next", not the "Done" that isLast would otherwise pick).
                nextBtnText: s.nextBtnText || (isLast ? (lc.tutorial_done || "Done") : (lc.tutorial_next || "Next")),
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
        return step;
    });

    driverObj = factory(Object.assign({
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 6,
        smoothScroll: true,
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
// which doesn't open every select.
//
// The theme popup opens fine during a tour but the language/variant ones didn't, and the reason is where
// each popup lives. The theme popup is mounted on document.body as position:fixed, so it sits in the root
// stacking context and a high z-index lifts it cleanly above Driver's dim overlay (z-index 10000). The
// language/variant popups (createCustomSelect) are position:absolute *inside* a .card; .card uses
// content-visibility:auto, which establishes a stacking context and paint-clips its descendants — so the
// opened popup is trapped beneath the overlay and clipped no matter how high its z-index, and it also only
// ever opens upward (no flip), which can push it off-screen at the tour's scroll position.
//
// Rather than fight the card's containment, we make every box behave like the theme one: float the opened
// popup onto document.body as position:fixed anchored to its button (above it, or below when there isn't
// room), lift it between the overlay (10000) and the Driver popover (1e9), and disable pointer-events so
// its contents can't be changed mid-tour. tutCloseBox puts it all back. Returns the popup element.
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
            tutFloatPopup(controller.popup, button);
            return controller.popup;
        }
    return null;
}

// Floats an opened popup onto document.body as position:fixed so it clears Driver's overlay, and anchors
// it to the side of its button OPPOSITE the Driver popover so the two never overlap. We decide the side
// reactively — by measuring where Driver actually rendered .driver-popover for this step — instead of
// guessing from free space, because Driver may auto-flip and its choice varies with viewport; reading the
// real popover position is the only thing that stays correct on both phone and desktop. Both popup kinds
// (the body-mounted theme popup and the card-nested language/variant popups) centre horizontally via the
// shared `.list-select-popup` CSS transform: translate(-50%), so we keep left = button-centre and never
// touch transform. The pristine inline style and DOM position are stashed so tutCloseBox can restore, and
// a scroll/resize listener re-anchors the fixed popup if the page moves under it during the step.
function tutFloatPopup(popup, button)
{
    if (popup.parentElement === document.body)
        popup.tutRestore = { onBody: true, cssText: popup.style.cssText };
    else
    {
        popup.tutRestore = { parent: popup.parentElement, next: popup.nextSibling, cssText: popup.style.cssText };
        document.body.appendChild(popup);
    }

    // Place the list on whichever side of the button the popover is NOT on (popover below -> list above).
    // Fall back to the side with more room if no popover is present (shouldn't happen for openBox steps).
    const bRect = button.getBoundingClientRect();
    const popover = document.querySelector(".driver-popover");
    if (popover)
    {
        const pRect = popover.getBoundingClientRect();
        popup.tutPlaceAbove = (pRect.top + pRect.bottom) / 2 >= (bRect.top + bRect.bottom) / 2;
    }
    else
        popup.tutPlaceAbove = bRect.top > (window.innerHeight - bRect.bottom);

    popup.style.position = "fixed";
    popup.style.zIndex = TUT_BOX_Z_INDEX;
    popup.style.pointerEvents = "none";
    popup.tutAnchorButton = button;
    tutAnchorFloatedPopup(popup);

    popup.tutReflow = () => tutAnchorFloatedPopup(popup);
    window.addEventListener("scroll", popup.tutReflow, true);
    window.addEventListener("resize", popup.tutReflow);
}

// Positions an already-floated popup against its button on the chosen side, capping its height to the room
// available there (the inner .list-select-list scrolls) so the list always fits within the viewport and
// stays clear of both the button and the popover on the far side. Re-run on scroll/resize.
function tutAnchorFloatedPopup(popup)
{
    const button = popup.tutAnchorButton;
    if (!button)
        return;
    const GAP = 8;
    const b = button.getBoundingClientRect();
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const room = popup.tutPlaceAbove ? b.top - 2 * GAP : window.innerHeight - b.bottom - 2 * GAP;
    popup.style.maxHeight = `${Math.min(22 * remPx, Math.max(0, room))}px`;

    // The popup centres on this x via the shared `.list-select-popup` transform: translate(-50%); clamp the
    // centre so a button near a screen edge can't push the list off-screen.
    const half = popup.offsetWidth / 2;
    const centre = Math.max(GAP + half, Math.min(b.left + b.width / 2, window.innerWidth - GAP - half));
    popup.style.left = `${centre}px`;
    if (popup.tutPlaceAbove)
    {
        popup.style.bottom = `${window.innerHeight - b.top + GAP}px`;
        popup.style.top = "auto";
    }
    else
    {
        popup.style.top = `${b.bottom + GAP}px`;
        popup.style.bottom = "auto";
    }
}

// Restores a popup opened by tutOpenBoxForDisplay: closes it through its controller so the button's aria
// state stays correct, then undoes the float (back to its original parent and pristine inline style) so
// it behaves normally again after the tutorial.
function tutCloseBox(popup)
{
    if (!popup)
        return;
    for (const controller of window.youyinPopupControllers)
        if (controller.popup === popup)
        {
            controller.close();
            tutUnfloatPopup(popup);
            return;
        }
    popup.classList.remove("open");
    tutUnfloatPopup(popup);
}

function tutUnfloatPopup(popup)
{
    if (popup.tutReflow)
    {
        window.removeEventListener("scroll", popup.tutReflow, true);
        window.removeEventListener("resize", popup.tutReflow);
    }
    delete popup.tutReflow;
    delete popup.tutAnchorButton;
    delete popup.tutPlaceAbove;

    const restore = popup.tutRestore;
    if (!restore)
    {
        popup.style.pointerEvents = "";
        popup.style.zIndex = "";
        return;
    }
    if (!restore.onBody && restore.parent)
        restore.parent.insertBefore(popup, restore.next);
    popup.style.cssText = restore.cssText;
    delete popup.tutRestore;
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
