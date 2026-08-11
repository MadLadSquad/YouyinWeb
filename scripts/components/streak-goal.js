'use strict';

// The daily streak goal — how many practice sessions a day the user is aiming for. It is what
// prices a streak freeze (see streakFreezeCost in index.js), so the app needs one from everybody,
// and a profile with streakGoal === 0 has never picked one. This file owns the blocking prompt that
// collects it, plus the shared wording of the value so the modal's slider and the account page's
// settings slider read identically.
//
// Loaded on index.html and account.html only: those are the two pages the prompt appears on, and the
// account page's own slider borrows streakGoalText from here.

const STREAK_GOAL_OVERLAY_ID = "streak-goal-prompt";

/**
 * The user-facing wording of a goal value, e.g. "5 sessions a day". The singular/plural pair is
 * baked at build time by the ui18n switch pattern; pick the right variant and fill in the count
 * @param { number|string } value - The goal, in sessions per day
 * @returns { string } - The localised phrase
 */
function streakGoalText(value)
{
    const goal = Number(value);
    return (goal === 1 ? lc.streak_goal_sessions_one : lc.streak_goal_sessions).replace("{goal}", goal);
}

/**
 * Shows the blocking streak-goal prompt: a slider from STREAK_GOAL_MIN to STREAK_GOAL_MAX and a
 * single confirm button. There is deliberately no close affordance and no Esc handler — the goal is
 * required, so confirming is the only way out. Reuses the .char-load-* modal chrome the character
 * download and the tutorial modals already share (char-loading.css is linked on every page)
 */
function showStreakGoalModal()
{
    // Never stack two of these: the returning-user gate below and the tutorial outro can both reach
    // for the prompt on the landing page
    if (!document.body || $(STREAK_GOAL_OVERLAY_ID) !== null)
        return;

    const overlay = document.createElement("div");
    overlay.id = STREAK_GOAL_OVERLAY_ID;
    overlay.className = "char-load-overlay streak-goal-overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");

    const box = addElement("div", "", "", "char-load-box", "", overlay);
    addElement("h2", lc.streak_goal_modal_title, "", "char-load-title", "", box);
    addElement("p", lc.streak_goal_modal_body, "", "char-load-subtitle", "", box);

    const row = addElement("div", "", "", "streak-goal-row", "", box);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "settings-slider";
    slider.min = window.STREAK_GOAL_MIN;
    slider.max = window.STREAK_GOAL_MAX;
    slider.step = 1;
    slider.value = window.STREAK_GOAL_MIN;
    slider.setAttribute("aria-label", lc.streak_goal_aria_label);
    row.appendChild(slider);

    // The readout doubles as the slider's accessible description, so a screen reader announces the
    // chosen value in words rather than just the raw number the range input reports
    const value = addElement("p", streakGoalText(slider.value), "streak-goal-prompt-value", "streak-goal-value", "", box);
    slider.setAttribute("aria-describedby", value.id);
    slider.addEventListener("input", () => { value.textContent = streakGoalText(slider.value); });

    const confirm = addElement("button", lc.streak_goal_modal_confirm, "streak-goal-confirm", "card-button-edit", "", box);
    confirm.type = "button";
    confirm.addEventListener("click", function() {
        window.profileData.streakGoal = Number(slider.value);

        // Take the modal down straight away rather than after the write commits: the value is
        // already live in memory, and leaving a blocking overlay up while IndexedDB flushes reads as
        // a hang. A failed write is logged by saveProfileData and simply re-prompts on the next visit
        saveProfileData(window.profileData).catch(() => {});
        overlay.remove();

        // The account page may be sitting underneath with a stale slider and a placeholder price
        if (window.renderShopFields)
            window.renderShopFields();
        const settingsSlider = $("streak-goal-slider");
        if (settingsSlider !== null)
        {
            settingsSlider.value = window.profileData.streakGoal;
            settingsSlider.labels[0].childNodes[0].textContent =
                `${lc.streak_goal_label} ${streakGoalText(settingsSlider.value)} `;
        }
    });

    document.body.appendChild(overlay);
    slider.focus();
}
window.showStreakGoalModal = showStreakGoalModal;

// Returning users who predate the goal (or who somehow got past onboarding without one) are asked
// for it on their next visit. Brand-new users are not caught here — the tutorial owns the whole
// first visit, and its outro raises the prompt itself once the tour is over (tutorial/main-page.js),
// so that the two never fight over the screen. tutorialDone is exactly the "has been here before"
// signal: index.js's maybeStartTutorial already stamps it on users who predate the tutorial too.
window.profileReady.then(() => {
    if (window.profileData.streakGoal > 0)
        return;
    if (window.localStorage.getItem("tutorialStep") !== null)
        return;
    if (window.localStorage.getItem("tutorialDone") !== "true")
        return;

    showStreakGoalModal();
});
