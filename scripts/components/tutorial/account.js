'use strict';
// Tutorial: account-page stage — profile stats, game modifiers, and the language/theme selectors.
//
// Loaded only on account.html, before the shared footer so these stage functions are defined before footer's
// tutorial.js runs tutDispatch (it only routes to them at call time, by which point the cross-page core in
// scripts/components/tutorial.js — helpers, tutRunTour, tutDispatch — exists).

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
