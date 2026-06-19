'use strict';

/**
 * Encodes the LOCAL calendar date of the given Date as a timezone-independent integer day index.
 * Date.UTC re-interprets the local Y/M/D as if it were UTC, so the result identifies the calendar
 * day the user saw on their own clock, is immune to DST and stays comparable after the device
 * moves to another timezone. The same formula is inlined in index.js's lastStreakDay migration —
 * keep the two in sync
 * @param { Date } date - The date to encode
 * @returns { number } - Days since 1970-01-01 of the local calendar date
 */
function localDayIndex(date)
{
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/**
 * Rewrites the streak field on the deck page, if present. The element initially contains only the
 * translated label from the template; the label is captured into a data attribute on first call so
 * that later calls replace the value instead of appending to it
 */
function renderStreakField()
{
    const el = $("streak-field");
    if (el === null)
        return;

    if (el.getAttribute("data-streak-label") === null)
        el.setAttribute("data-streak-label", el.textContent);

    // The singular/plural wording was resolved at build time by the ui18n switch pattern; pick
    // the right baked variant and fill in the count
    const streak = window.profileData.streak;
    el.textContent = el.getAttribute("data-streak-label")
        + (streak === 1 ? lc.streak_days_count_one : lc.streak_days_count).replace("{streak}", streak);
}

/**
 * Advances the streak when a session is fully completed. The same local day as the last completion
 * is a no-op, the day right after grows the streak and anything else starts a new one. Does NOT
 * save — the completion path in main-page.js calls saveProfileData right after
 * @returns { boolean } - True when this completion advanced the streak, either by starting a new
 *                        one or by extending it to today; false when today was already counted
 */
function updateDailyStreak()
{
    let data = window.profileData;
    const today = localDayIndex(new Date());

    // >= instead of === also covers a clock or timezone moved backwards — never punish that. The
    // streak can still legitimately be 0 here (a play-day migrated from lastDate earlier today),
    // in which case this completion starts it
    if (data.lastStreakDay >= today)
    {
        if (data.streak === 0)
        {
            data.streak = 1;
            return true;
        }
        return false;
    }

    data.streak = (data.lastStreakDay === today - 1) ? (data.streak + 1) : 1;
    data.lastStreakDay = today;
    renderStreakField();
    return true;
}

/**
 * Kills an expired streak: it dies once the local clock passes midnight of the day AFTER the last
 * completed-session day with nothing completed. Day boundaries follow the device's current clock,
 * so the deadline moves with the user's timezone. Saves and refreshes the deck display on reset
 */
function checkStreakExpiry()
{
    let data = window.profileData;
    if (data.streak === 0 || !data.lastStreakDay)
        return;

    if (localDayIndex(new Date()) - data.lastStreakDay > 1)
    {
        data.streak = 0;
        saveProfileData(data);
        renderStreakField();
    }
}

/**
 * Applies the daily level reduction game modifier: every local calendar day that passed since the
 * last application subtracts the slider value from every card's and phrase's knowledge level,
 * clamped at 0. Days use the same local day index as the streak, so the boundary is the device's
 * local midnight and moves with the user's timezone. Saves whenever state changes
 */
function applyDailyLevelReduction()
{
    let data = window.profileData;
    const today = localDayIndex(new Date());

    // First run (fresh user or a deck from before the feature shipped): start counting from today
    // instead of retroactively punishing days where the modifier could not have run
    if (!data.lastLevelReduceDay)
    {
        data.lastLevelReduceDay = today;
        saveProfileData(data);
        return;
    }

    // A negative gap means the clock or timezone moved backwards — never punish that
    const days = today - data.lastLevelReduceDay;
    if (days <= 0)
        return;

    // The slider's input event stores its value as a string. Rounding to two decimals keeps the
    // stored levels free of float dust (the slider step is 0.01)
    const amount = days * Number(window.gameModifiers.levelReduce);
    if (amount > 0)
    {
        for (let it of data.cards)
            it.knowledge = Math.max(Math.round((it.knowledge - amount) * 100) / 100, 0);
        for (let it of data.phrases)
            it.knowledge = Math.max(Math.round((it.knowledge - amount) * 100) / 100, 0);
    }

    // Advance even when the slider sits at 0, so that raising it later only counts the days
    // after the change
    data.lastLevelReduceDay = today;
    saveProfileData(data);
}

/**
 * Milliseconds until the next local midnight, at least one second. The Date constructor normalises
 * the day + 1 overflow, including DST days where 00:00 does not exist locally
 * @returns { number } - The delay in milliseconds
 */
function msUntilNextLocalMidnight()
{
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return Math.max(next.getTime() - now.getTime(), window.SECOND_UNIX);
}

let dailyMidnightTimer = null;

/**
 * (Re)arms the midnight check for both daily systems. The delay is recomputed on every schedule,
 * so clock or timezone changes while the page stays open converge after at most one harmless
 * early check
 */
function scheduleDailyMidnightCheck()
{
    clearTimeout(dailyMidnightTimer);

    // +1s so a marginally-early timer still lands past midnight; an early fire is harmless
    // anyway — the checks no-op and we re-arm with the remaining time
    dailyMidnightTimer = setTimeout(function() {
        applyDailyLevelReduction();
        checkStreakExpiry();
        scheduleDailyMidnightCheck();
    }, msUntilNextLocalMidnight() + window.SECOND_UNIX);
}

// index.js's main() loads window.profileData and window.gameModifiers from IndexedDB asynchronously,
// so wait on window.youyinProfileReady before reducing levels and checking the streak. This needs
// only the profile (not the character database), and daily-streak.js loads before every page script,
// so this still runs before the deck page renders — the deck shows already-reduced levels
window.youyinProfileReady.then(() => {
    applyDailyLevelReduction();
    checkStreakExpiry();
    scheduleDailyMidnightCheck();
});

// Timers are throttled or paused in background tabs and across system sleep, and the timezone may
// have changed while suspended — re-evaluate whenever the tab becomes visible again
document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible")
    {
        applyDailyLevelReduction();
        checkStreakExpiry();
        scheduleDailyMidnightCheck();
    }
});
