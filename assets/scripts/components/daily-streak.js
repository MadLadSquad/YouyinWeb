'use strict';
// Day boundaries throughout this file use localDayIndex from index.js

/**
 * Whether today is already banked into the streak. lastStreakDay is written by updateDailyStreak
 * once the day's goal is met (and nudged forward by a freeze spent at midnight), so "not before
 * today" means the user has kept the streak alive for the day they are currently having. The comparison is
 * >= rather than === for the same reason updateDailyStreak uses it: a clock or timezone moved
 * backwards must never read as a day lost. Safe to call before the profile has loaded
 * @returns { boolean } - True when the streak is alive and already counted for today
 */
function streakCountedToday()
{
    const data = window.profileData;
    if (data === null || data === undefined)
        return false;
    return data.streak > 0 && data.lastStreakDay >= localDayIndex(new Date());
}

/**
 * Rewrites the streak value on the account page, if present. The element is value-only — its label
 * is a sibling in the template — so this is a plain replace and safe to call repeatedly. (It used to
 * snapshot the element's own text as the label and rebuild "Label: value" from it, which meant the
 * label could never be its own element.)
 */
function renderStreakField()
{
    const el = $("streak-field");
    if (el === null)
        return;

    el.textContent = window.profileData.streak;
}

/**
 * Fills the streak and gem readouts in the app bar. These live in the shared header, so this runs on
 * every page; both spans are value-only (their icon and label are separate elements), which keeps
 * the write idempotent and safe to repeat whenever either number changes.
 */
function renderHeaderStats()
{
    if (window.profileData === null || window.profileData === undefined)
        return;

    const streakEl = $("header-streak-value");
    if (streakEl !== null)
        streakEl.textContent = window.profileData.streak;

    // The flame only burns once the day is banked; until a round is finished today it sits greyed
    // out, so the chip says whether the streak still needs feeding rather than just how long it is.
    // The class goes on the wrapper span, not the glyph: the twemoji observer replaces the glyph
    // itself with an <img> (see emoji.js) and would carry any class written onto it away with it
    const streakEmoji = $("header-streak-emoji");
    if (streakEmoji !== null)
        streakEmoji.classList.toggle("is-dormant", !streakCountedToday());

    const gemsEl = $("header-gems-value");
    if (gemsEl !== null)
        gemsEl.textContent = window.profileData.gems;
}

window.renderHeaderStats = renderHeaderStats;

// ------------------------------ App-bar streak / gems panel ------------------------------
// Every render function the panels installed, so a purchase (or a freeze spent at midnight) can
// repaint each open one. Both app-bar chips build a panel of their own, so there are two.
const streakPanelRenderers = [];

/**
 * Repaints every streak- or gem-derived readout on the page after the numbers change: the app bar,
 * the account page's profile card and shop if we happen to be on it, and any app-bar panel.
 * renderGemsField / renderShopFields are globals defined by scripts/pages/account.js and are simply
 * absent everywhere else
 */
function refreshStreakReadouts()
{
    renderStreakField();
    renderHeaderStats();
    if (window.renderGemsField)
        window.renderGemsField();
    if (window.renderShopFields)
        window.renderShopFields();
    for (const render of streakPanelRenderers)
        render();
}

/**
 * Buys one streak freeze. The affordability checks are repeated here rather than trusted from a
 * disabled button: the price moves with the streak-goal slider, and freezes can be spent underneath
 * by checkStreakExpiry at midnight. Lives here rather than in the account page's shop because the
 * app-bar panel sells them too, on every page
 * @returns { boolean } - True when a freeze was actually bought
 */
function buyStreakFreeze()
{
    let data = window.profileData;
    const cost = streakFreezeCost(streakFreezePriceGoal());

    if (data.streakGoal <= 0 || data.streakFreezes >= window.MAX_STREAK_FREEZES || data.gems < cost)
        return false;

    data.gems -= cost;
    ++data.streakFreezes;

    // Repaint from the in-memory copy immediately; the write is fire-and-forget because nothing here
    // navigates away, and saveProfileData rejects on failure so it needs a catch
    saveProfileData(data).catch(reportSaveFailure);
    refreshStreakReadouts();
    return true;
}
window.buyStreakFreeze = buyStreakFreeze;

/**
 * Describes where the streak currently stands, in one line: counted for today, riding on a freeze,
 * or about to be lost. "Frozen" is not a stored flag - a freeze is spent by checkStreakExpiry on a
 * day that passed with nothing completed - so what we can honestly say is whether today is already
 * banked and, if it is not, whether a freeze is standing by to cover it
 * @returns { string } - The localised status line
 */
function streakStatusText()
{
    const data = window.profileData;
    if (data.streak === 0)
        return lc.streak_panel_none;
    if (streakCountedToday())
        return lc.streak_panel_safe;
    if (data.streakFreezes > 0)
        return lc.streak_panel_protected;
    return lc.streak_panel_at_risk;
}

/**
 * The weekday the user's locale starts its week on, counted like Date.getDay() (0 is Sunday). Falls
 * back to Monday where the browser cannot say: Intl.Locale's week info is not in every engine yet,
 * and older ones exposed it as a getter rather than a method
 * @returns { number } - 0-6
 */
function localeFirstWeekday()
{
    try
    {
        const locale = new Intl.Locale(lc.locale);
        const info = typeof locale.getWeekInfo === "function" ? locale.getWeekInfo() : locale.weekInfo;
        // firstDay is 1-7 with 7 for Sunday
        if (info && info.firstDay)
            return info.firstDay % 7;
    }
    catch (e) {}
    return 1;
}

/**
 * Fills the streak panel's week strip: seven days, each filled when the streak covers it. Covered
 * rather than practised: a day bridged by a freeze is part of the streak too, so it is filled as
 * well, in ice blue rather than the accent - checkStreakExpiry records those days in frozenDays.
 *
 * The strip normally shows the current week. A streak that began this week (or has not begun yet)
 * starts the strip on its first day instead, so a new or returning user isn't greeted by a row of
 * grey days they were never there for; once the streak has lived to the start of a week, it is the
 * plain week again
 * @param { HTMLElement } week - The strip's list element
 */
function renderStreakWeek(week)
{
    const data = window.profileData;
    const today = localDayIndex(new Date());
    // Day 0 of localDayIndex is 1 January 1970, a Thursday (getDay() 4)
    const weekStart = today - (today + 4 - localeFirstWeekday() + 7) % 7;
    const firstCounted = data.lastStreakDay - data.streak + 1;
    // With no streak alive, the next one can start today at the earliest
    const streakStart = data.streak > 0 ? Math.min(firstCounted, today) : today;
    const start = Math.max(weekStart, streakStart);
    const frozen = new Set(data.frozenDays);

    week.replaceChildren();
    for (let day = start; day < start + 7; day++)
    {
        let cls = "streak-panel-day";
        if (data.streak > 0 && day >= firstCounted && day <= data.lastStreakDay)
            cls += frozen.has(day) ? " streak-panel-day-frozen" : " streak-panel-day-done";
        if (day === today)
            cls += " streak-panel-day-today";

        // localDayIndex counts UTC midnights, so the weekday is read back in UTC
        const label = new Date(day * 86400000).toLocaleDateString(lc.locale, { weekday: "narrow", timeZone: "UTC" });
        addElement("li", label, "", cls, "", week);
    }
}

/**
 * Builds the panel behind an app-bar chip. The two chips ask different questions, so they get
 * different panels off the same builder:
 *   "streak" - the current week, how the streak stands, the freeze wallet backing it, and the shop
 *              underneath
 *   "gems"   - the balance and the one thing it buys; no streak count and no status line, because
 *              a gem balance says nothing about the streak and repeating it made the two chips
 *              indistinguishable
 * @param { HTMLElement } button - The chip that opens it
 * @param { string } mode - "streak" or "gems"
 */
function createStreakPanel(button, mode)
{
    if (button === null || button.parentNode === null)
        return;

    const bStreak = mode === "streak";

    // Same wrapper createCustomSelect uses, so the popup anchors to the chip and inherits the
    // shared open/close, outside-click and Escape handling
    const container = document.createElement("div");
    container.className = "list-select-container";
    button.parentNode.insertBefore(container, button);
    container.appendChild(button);

    const popup = addElement("div", "", "", "list-select-popup streak-panel", "", container);
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", bStreak ? lc.streak_field : lc.gems_label);

    // The streak panel opens on the current week. Hidden from screen readers: the status line under
    // the count says where the streak stands in words
    let week = null;
    if (bStreak)
    {
        week = addElement("ol", "", "", "streak-panel-week", "", popup);
        week.setAttribute("aria-hidden", "true");
    }

    // The headline number is whichever one the chip shows
    const head = addElement("div", "", "", "streak-panel-head", "", popup);
    const count = addElement("span", "0", "", "t-num streak-panel-count", "", head);
    addElement("span", bStreak ? lc.streak_field : lc.gems_label, "", "stat-label", "", head);

    let status = null;
    if (bStreak)
        status = addElement("p", "", "", "t-meta streak-panel-status", "", popup);
    else
        addElement("p", lc.gems_panel_hint, "", "t-meta streak-panel-hint", "", popup);

    addElement("hr", "", "", "hairline", "", popup);

    const freezeRow = addElement("div", "", "", "streak-panel-row", "", popup);
    addElement("span", lc.streak_freeze_field, "", "stat-label", "", freezeRow);
    const freezeCount = addElement("span", "", "", "chip streak-panel-value", "", freezeRow);
    const slots = addElement("div", "", "", "streak-panel-slots", "", popup);
    slots.setAttribute("aria-hidden", "true");

    // Only the streak panel repeats the balance - on the gems panel it is already the headline
    let gemCount = null;
    if (bStreak)
    {
        const gemRow = addElement("div", "", "", "streak-panel-row", "", popup);
        addElement("span", lc.gems_label, "", "stat-label", "", gemRow);
        gemCount = addElement("span", "", "", "chip chip-accent streak-panel-value", "", gemRow);
    }

    const priceRow = addElement("div", "", "", "streak-panel-row", "", popup);
    addElement("span", lc.streak_freeze_cost_field, "", "stat-label", "", priceRow);
    const price = addElement("span", "", "", "streak-panel-value", "", priceRow);

    const buy = addElement("button", lc.buy_streak_freeze_button, "", "streak-panel-buy", "", popup);
    buy.type = "button";

    // A plain listener rather than runEventAfterAnimation: this button is not a .card-button-edit
    // (styles/components/button.css is a per-page stylesheet and the app bar is on every page), so
    // there is no ripple transition to wait on
    buy.addEventListener("click", function(e) {
        e.stopPropagation();
        buyStreakFreeze();
    });

    function render()
    {
        if (window.profileData === null || window.profileData === undefined)
            return;

        const data = window.profileData;
        const goal = data.streakGoal;
        const cost = streakFreezeCost(streakFreezePriceGoal());
        const held = data.streakFreezes;

        count.textContent = bStreak ? data.streak : data.gems;
        if (week !== null)
            renderStreakWeek(week);
        if (status !== null)
            status.textContent = streakStatusText();
        freezeCount.textContent = `${held}/${window.MAX_STREAK_FREEZES}`;
        if (gemCount !== null)
            gemCount.textContent = data.gems;
        price.textContent = lc.gems_amount.replace("{gems}", cost);

        slots.replaceChildren();
        for (let i = 0; i < window.MAX_STREAK_FREEZES; i++)
            addElement("span", "", "", i < held ? "streak-panel-slot streak-panel-slot-filled" : "streak-panel-slot", "", slots);

        // Same three refusals the account shop reports, worded identically
        if (goal <= 0)
        {
            buy.disabled = true;
            buy.title = lc.streak_freeze_needs_goal;
        }
        else if (held >= window.MAX_STREAK_FREEZES)
        {
            buy.disabled = true;
            buy.title = lc.streak_freeze_full;
        }
        else if (data.gems < cost)
        {
            buy.disabled = true;
            buy.title = lc.streak_freeze_too_expensive.replace("{gems}", cost - data.gems);
        }
        else
        {
            buy.disabled = false;
            buy.title = "";
        }
    }

    streakPanelRenderers.push(render);

    createPopupController(button, popup, function() {
        // The chips sit at the top-right of the viewport, so the popup always drops below and
        // usually needs pulling back from the right edge
        const rect = button.getBoundingClientRect();
        render();

        // Below the phone breakpoint header.css turns the panel into a viewport-anchored sheet: its
        // left and right come from the screen, so the centring correction has nothing to correct and
        // the vertical flip has nothing to flip - it always hangs under the bar. Reading the computed
        // position rather than re-testing the width keeps the breakpoint written once, in the CSS.
        if (window.getComputedStyle(popup).position === "fixed")
        {
            popup.classList.remove("drop-below");
            popup.style.removeProperty("margin-left");
            popup.style.setProperty("top", `${Math.round(rect.bottom + 8)}px`);
            return;
        }

        popup.style.removeProperty("top");
        clampPopupHorizontally(popup, rect);
        positionPopupVertically(popup, rect);
    }, null);
}

/**
 * Advances the streak when a completed session brings today up to the daily goal (one session while
 * no goal has been chosen). A day already counted is a no-op, the day right after the last counted
 * one grows the streak and anything else starts a new one. Expects the session to have been recorded
 * in activityByDay already. Does NOT save — the completion path in main-page.js calls
 * saveProfileData right after
 * @returns { boolean } - True when this completion advanced the streak, either by starting a new
 *                        one or by extending it to today; false when today was already counted or
 *                        the goal is not met yet
 */
function updateDailyStreak()
{
    let data = window.profileData;
    const today = localDayIndex(new Date());

    const goal = data.streakGoal > 0 ? data.streakGoal : 1;
    const done = (data.activityByDay && data.activityByDay[today]) || 0;
    if (done < goal)
        return false;

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
    renderHeaderStats();
    return true;
}

/**
 * Kills an expired streak: it dies once the local clock passes midnight of the day AFTER the last
 * counted day without the goal having been met. Day boundaries follow the device's current clock,
 * so the deadline moves with the user's timezone.
 *
 * Streak freezes cover the missed days first, one each. Each one advances lastStreakDay by a day,
 * standing in for a day that was never counted — so the streak survives but deliberately does NOT
 * grow, and a goal met later still extends it normally (lastStreakDay is left at yesterday, which is
 * the "extend" branch of updateDailyStreak). They chain: holding the maximum covers that many
 * consecutive days off. Freezes are only spent when they cover every missed day: a gap longer than
 * the wallet ends the streak either way, and spending them on it would only have emptied the wallet
 * for nothing. Refreshes the display whenever anything changed; the caller saves
 * @returns { boolean } - True when the profile changed and needs saving
 */
function checkStreakExpiry()
{
    let data = window.profileData;
    if (data.streak === 0 || !data.lastStreakDay)
        return false;

    // Days that passed with nothing completed. Today itself is never counted (there is still time
    // to practise), so the day right after the last session is free — the streak has always
    // survived a single day boundary. A negative result means the clock or timezone moved
    // backwards, which must never be punished
    const missed = localDayIndex(new Date()) - data.lastStreakDay - 1;
    if (missed <= 0)
        return false;

    if (missed <= data.streakFreezes)
    {
        // Recorded so the streak panel's week strip can tell these days from practised ones
        for (let day = data.lastStreakDay + 1; day <= data.lastStreakDay + missed; day++)
            data.frozenDays.push(day);
        data.streakFreezes -= missed;
        data.lastStreakDay += missed;
    }
    else
        data.streak = 0;

    // Repaints the app bar, its panels, and the account page's profile card and shop when we happen
    // to be on that page
    refreshStreakReadouts();
    return true;
}

/**
 * Applies the daily level reduction game modifier: every local calendar day that passed since the
 * last application subtracts the slider value from every card's and phrase's knowledge level,
 * clamped at 0. Days use the same local day index as the streak, so the boundary is the device's
 * local midnight and moves with the user's timezone. The caller saves
 * @returns { boolean } - True when the profile changed and needs saving
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
        return true;
    }

    // A negative gap means the clock or timezone moved backwards — never punish that
    const days = today - data.lastLevelReduceDay;
    if (days <= 0)
        return false;

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
    return true;
}

/**
 * Runs both daily systems and saves once if either changed anything. They used to save separately,
 * so the first load of every day wrote the whole profile twice
 */
function runDailyChecks()
{
    // Both run unconditionally: || would skip the streak check whenever the reduction changed something
    const bReduced = applyDailyLevelReduction();
    const bStreakChanged = checkStreakExpiry();
    if (bReduced || bStreakChanged)
        saveProfileData(window.profileData).catch(() => {});
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

// Set once the profile is loaded and every page gate (the privacy consent above all) has been passed.
// The visibility handler below is registered at script load and must not act before that
let bDailyChecksReady = false;

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
        runDailyChecks();
        scheduleDailyMidnightCheck();
        // Unconditionally, unlike checkStreakExpiry's own repaint: crossing midnight with the
        // streak intact changes nothing about the numbers, but yesterday's flame has to go out
        renderHeaderStats();
    }, msUntilNextLocalMidnight() + window.SECOND_UNIX);
}

// index.js's main() loads window.profileData and window.gameModifiers from IndexedDB asynchronously,
// so wait on window.profileReady before reducing levels and checking the streak. This needs
// only the profile (not the character database), and daily-streak.js loads before every page script,
// so this still runs before the deck page renders — the deck shows already-reduced levels
window.profileReady.then(() => {
    bDailyChecksReady = true;
    runDailyChecks();
    scheduleDailyMidnightCheck();
    // checkStreakExpiry only re-renders when it actually changed something, so paint the app-bar
    // readouts unconditionally here — this is the first point on every page where the profile exists
    renderHeaderStats();
    createStreakPanel($("header-streak"), "streak");
    createStreakPanel($("header-gems"), "gems");
});

// Timers are throttled or paused in background tabs and across system sleep, and the timezone may
// have changed while suspended — re-evaluate whenever the tab becomes visible again.
// This listener is registered at script load, before main() has loaded the profile (and in an
// UNSUPPORTED browser main() never resolves profileReady at all). Bail out until profileReady has
// resolved: before that the profile may be null, and even once it is loaded the consent modal may
// still be up — the profileReady handler above runs these once the page is actually ready.
document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible" && bDailyChecksReady)
    {
        runDailyChecks();
        scheduleDailyMidnightCheck();
        renderHeaderStats();
    }
});
