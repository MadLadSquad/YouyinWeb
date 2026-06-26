'use strict';
// Tutorial: index-page stages (intro / session / outro).
//
// Loaded only on index.html, before the shared footer so these stage functions are defined before footer's
// tutorial.js runs tutDispatch (it only routes to them at call time, by which point the cross-page core in
// scripts/components/tutorial.js — helpers, tutRunTour, tutDispatch — exists). Defines the
// landing-page stage functions that tutDispatch() routes to: the bespoke intro/outro modals (the
// intro embeds the animated 你好 hanzi-writer widgets) and the practice-session walkthrough.

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
