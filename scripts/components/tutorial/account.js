'use strict';
// Tutorial: account-page stage — profile stats, game modifiers, and the language/theme selectors.
//
// Loaded only on account.html, before the shared footer so these stage functions are defined before footer's
// tutorial.js runs tutDispatch (it only routes to them at call time, by which point the cross-page core in
// scripts/components/tutorial.js — helpers, tutRunTour, tutDispatch — exists).

async function tutRunAccount()
{
    await tutWaitFor(() => $("profile-card"));

    // disableActiveInteraction keeps the highlighted controls (and the opened lists) unclickable, and a
    // lighter overlay keeps the lists legible. The openBox steps float the list and place the popover on the
    // opposite side of the button so it never covers the list.
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
            openBox: "lang-select-account",
        },
        {
            element: "#theme-button-account",
            title: lc.tutorial_account_theme_title,
            description: lc.tutorial_account_theme,
            openBox: "theme-button-account",
        },
        {
            element: "#activity-calendar-card",
            title: lc.tutorial_account_activity_title,
            description: lc.tutorial_account_activity,
            side: "top",
        },
        {
            element: "#clear-account-button",
            title: lc.tutorial_account_clear_title,
            description: lc.tutorial_account_clear,
            side: "top",
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
