'use strict';

/**
 * Writes one statistic's value. Every stat on this page is a tile whose label is its own element in
 * the template, so this only ever replaces the value — which makes each write idempotent and safe to
 * repeat. (The rows used to carry "Label: " baked in and JS appended to it with `textContent +=`,
 * which flattened any child markup and could not be re-rendered without doubling up.)
 * @param { string } id - ID of the value element
 * @param { string|number } value - The value to render
 */
function renderStatValue(id, value)
{
    const el = $(id);
    if (el === null)
        return;

    el.textContent = value;
}

/**
 * Writes a statistic whose value carries a unit ("2.63" + "min."), with the unit as its own smaller
 * inline element. Two reasons over one concatenated string: the unit is metadata and shouldn't be
 * set in the same 29px numeral as the figure, and the pair gives the line a break opportunity —
 * "2.63min." is a single unbreakable token and overflowed the hero's narrow featured column on a
 * small phone, printing over the card's border.
 * @param { string } id - ID of the value element
 * @param { string } value - The formatted figure
 * @param { string } unit - The localised unit suffix
 */
function renderStatWithUnit(id, value, unit)
{
    const el = $(id);
    if (el === null)
        return;

    el.replaceChildren();
    // A real space between the two, not a margin: whitespace is what gives the line somewhere to
    // break, and a margin on the unit would not
    addTextNode(el, value + " ");
    addElement("span", unit, "", "t-num-unit", "", el);
}

/**
 * Sets data about the current user. Deals with calculating most of the statistics and showcasing them
 */
function setProfileCardData()
{
    renderStatValue("total-sessions-field", window.profileData.sessions);
    renderStreakField();
    renderGemsField();
    renderStatValue("deck-card-num-field", window.profileData.cards.length);
    renderStatValue("deck-phrase-num-field", window.profileData.phrases.length);

    let totalTime = (window.profileData.totalTimeInSessions * 1);
    if (isNaN(totalTime))
        totalTime = 0;

    // Average in milliseconds first, then localise each value separately — the average and the
    // total usually land in different units (e.g. seconds vs hours)
    let averageTime = totalTime / window.profileData.sessions;
    if (isNaN(averageTime))
        averageTime = 0;

    const average = getLocalisedTimePostfix(averageTime);
    const total = getLocalisedTimePostfix(totalTime);
    renderStatWithUnit("average-session-length-field", formatDecimal(average.time), average.postfix);
    renderStatWithUnit("time-spent-in-sessions-field", formatDecimal(total.time), total.postfix);

    const lastDate = window.profileData.lastDate;
    if (lastDate !== 0)
    {
        const date = new Date(lastDate);
        // The tile is narrow, so this drops the weekday and the year the old row carried
        renderStatValue("last-session-date-field", date.toLocaleDateString(lc.locale,
        {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "numeric"
        }));
    }
    else
        renderStatValue("last-session-date-field", lc.no_sessions_recorded);

    let knowledge = 0;
    for (const card of window.profileData.cards)
        knowledge += card.knowledge;

    knowledge /= window.profileData.cards.length;
    if (isNaN(knowledge))
        knowledge = 0;

    renderStatValue("average-knowledge-level-field", `${formatDecimal(knowledge)}/${window.MAX_KNOWLEDGE_LEVEL}`);

    const knowledgeFill = $("average-knowledge-fill");
    if (knowledgeFill !== null)
        knowledgeFill.style.setProperty("width", (knowledge / window.MAX_KNOWLEDGE_LEVEL) * 100 + "%");

    renderTodayProgress();
    renderProfileSubline();
}

/**
 * Fills the hero's "today" bar: how many rounds have been completed against the daily goal. Both
 * numbers are already in storage — activityByDay is written by recordSessionActivity after every
 * round, and streakGoal by the goal prompt — so this surfaces existing data rather than tracking
 * anything new. A goal of 0 means the user has not chosen one yet.
 */
function renderTodayProgress()
{
    const data = window.profileData;
    const goal = data.streakGoal > 0 ? data.streakGoal : 0;
    const done = (data.activityByDay && data.activityByDay[localDayIndex(new Date())]) || 0;

    renderStatValue("today-rounds-value", done);

    const goalEl = $("today-rounds-goal");
    if (goalEl !== null)
        goalEl.textContent = goal > 0 ? lc.today_of_goal.replace("{goal}", goal) : lc.today_no_goal;

    const fill = $("today-progress-fill");
    if (fill !== null)
        fill.style.setProperty("width", goal > 0 ? Math.min(100, (done / goal) * 100) + "%" : "0%");

    const note = $("today-note");
    if (note === null)
        return;

    if (goal <= 0)
        note.textContent = "";
    else if (done >= goal)
        note.textContent = lc.today_goal_met;
    else
    {
        const left = goal - done;
        note.textContent = (left === 1 ? lc.today_goal_left_one : lc.today_goal_left).replace("{count}", left);
    }
}

/**
 * The line under the user's name: current streak and how many freezes are banked.
 */
function renderProfileSubline()
{
    const el = $("profile-subline");
    if (el === null)
        return;

    const streak = window.profileData.streak;
    const streakText = (streak === 1 ? lc.streak_days_count_one : lc.streak_days_count).replace("{streak}", streak);

    const freezes = window.profileData.streakFreezes;
    const freezeText = (freezes === 1 ? lc.streak_freeze_held_one : lc.streak_freeze_held).replace("{count}", freezes);

    el.textContent = streakText + " · " + freezeText;
}

/**
 * Rewrites the gem total on the profile card, and the matching readout in the app bar
 */
function renderGemsField()
{
    // gems_amount is "{gems} 💎" - the same wording the shop price and the in-session float use, so
    // the tile is marked the way every other gem figure on the site is. The twemoji observer swaps
    // the glyph for an SVG here as it does everywhere else.
    renderStatValue("gems-field", lc.gems_amount.replace("{gems}", window.profileData.gems));

    if (window.renderHeaderStats)
        window.renderHeaderStats();
}

/**
 * Draws the freeze wallet as MAX_STREAK_FREEZES pips, filled up to the number held. Cheaper to read
 * at a glance than the "1/3" count beside it, and it makes the ceiling obvious.
 * @param { number } held - How many freezes the user currently owns
 */
function renderFreezeSlots(held)
{
    const container = $("streak-freeze-slots");
    if (container === null)
        return;

    container.replaceChildren();
    for (let i = 0; i < window.MAX_STREAK_FREEZES; i++)
        addElement("span", "", "", i < held ? "shop-slot shop-slot-filled" : "shop-slot", "", container);
}

/**
 * Rewrites the streak-freeze shop: how many are held, what the next one costs, and whether the buy
 * button is currently usable. Exported on window because daily-streak.js calls it after spending
 * freezes on missed days — it is a no-op on every page but this one, since the elements are absent
 */
function renderShopFields()
{
    const goal = window.profileData.streakGoal;
    const cost = streakFreezeCost(goal > 0 ? goal : window.STREAK_GOAL_MIN);
    const held = window.profileData.streakFreezes;

    renderStatValue("streak-freeze-field", `${held}/${window.MAX_STREAK_FREEZES}`);
    renderStatValue("streak-freeze-cost-field", lc.gems_amount.replace("{gems}", cost));
    renderFreezeSlots(held);
    renderProfileSubline();

    const button = $("buy-streak-freeze-button");
    if (button === null)
        return;

    // A goal of 0 means the user has not picked one yet (streak-goal.js is showing them the prompt
    // over this page right now), so the price above is only a placeholder — don't let them buy at it
    if (goal <= 0)
    {
        button.disabled = true;
        button.title = lc.streak_freeze_needs_goal;
    }
    else if (held >= window.MAX_STREAK_FREEZES)
    {
        button.disabled = true;
        button.title = lc.streak_freeze_full;
    }
    else if (window.profileData.gems < cost)
    {
        button.disabled = true;
        button.title = lc.streak_freeze_too_expensive.replace("{gems}", cost - window.profileData.gems);
    }
    else
    {
        button.disabled = false;
        button.title = "";
    }
}
window.renderShopFields = renderShopFields;

/**
 * Wires the streak-freeze purchase. The transaction itself lives in daily-streak.js — the app bar's
 * streak panel sells freezes from every page, so the price checks, the write and the repaint are
 * shared rather than duplicated here
 */
function setupShop()
{
    renderShopFields();

    const button = $("buy-streak-freeze-button");
    if (button === null)
        return;

    // runEventAfterAnimation, not a bare click listener, so the purchase lands with the button's
    // ripple like every other .card-button-edit on the site
    runEventAfterAnimation(button, "click", () => buyStreakFreeze());
}

/**
 * Wires the daily streak-goal slider. Follows the level-reduce slider's split below: the label
 * tracks the drag live, but the value is only persisted once the drag settles. Re-renders the shop
 * on every change, because the freeze price is derived from the goal
 */
function setupStreakGoal()
{
    const slider = $("streak-goal-slider");
    if (slider === null)
        return;

    const goal = window.profileData.streakGoal;
    slider.value = goal > 0 ? goal : window.STREAK_GOAL_MIN;
    renderLabel(slider);

    slider.addEventListener("input", (e) => renderLabel(e.target));

    slider.addEventListener("change", (e) => {
        window.profileData.streakGoal = Number(e.target.value);
        saveProfileData(window.profileData).catch(() => {});
        renderShopFields();
    });

    // streakGoalText is defined by streak-goal.js, which the page loads before this file so that the
    // slider here and the one in the prompt modal word the value identically.
    // The readout is its own element rather than the label's first child node: writing into
    // labels[0].childNodes[0] silently wrote into whitespace as soon as the label gained any markup.
    function renderLabel(el)
    {
        renderStatValue("streak-goal-value", streakGoalText(el.value));
    }
}

function setupGameModifiers()
{
    const extensiveModeCheckbox = $("extensive-mode-checkbox");
    extensiveModeCheckbox.checked = window.gameModifiers.extensive;

    extensiveModeCheckbox.addEventListener("change", function(){
        window.gameModifiers.extensive = this.checked;
        saveGameModifiers();
    });

    const levelReduce = $("level-reduce-slider");
    levelReduce.value = window.gameModifiers.levelReduce;
    renderStatValue("level-reduce-value", formatDecimal(levelReduce.value));

    // Update the label live as the slider is dragged, but only persist once the drag settles
    // (the "change" event) — writing to IndexedDB on every "input" event fired a storage write
    // per pixel of the drag. The value is coerced to a Number so the stored modifier stays
    // numeric (matching the schema) instead of the raw string the input hands us.
    levelReduce.addEventListener("input", (e) => {
        renderStatValue("level-reduce-value", formatDecimal(e.target.value));
    });

    levelReduce.addEventListener("change", (e) => {
        window.gameModifiers.levelReduce = Number(e.target.value);
        saveGameModifiers();
    });
}

/**
 * Wipes every trace of the user's account from storage — the profile (decks, sessions, streak,
 * time spent) and the game modifiers — then reloads so main() reinitializes a clean set of defaults.
 * Guarded behind a confirm() because it is irreversible. The legacy localStorage copies are dropped
 * too so a stale one isn't re-migrated back into IndexedDB on the next load.
 */
function clearAccountData()
{
    if (!confirm(lc.clear_account_confirm_text))
        return;

    window.localStorage.removeItem(window.CARD_DATA_KEY);
    window.localStorage.removeItem(window.GAME_MODIFIERS_KEY);

    // Await both deletes (idbDelete returns a promise) before reloading, otherwise the page teardown
    // can abort the transactions mid-flight and leave data behind
    Promise.all([
        idbDelete(window.CARD_DATA_KEY),
        idbDelete(window.GAME_MODIFIERS_KEY),
    ]).then(() => document.location.reload());
}

/**
 * Main function for the account page
 */
function accountmain()
{
    setProfileCardData();
    setupGameModifiers();
    setupStreakGoal();
    setupShop();
    renderActivityCalendar("activity-calendar-container");

    // Replay the onboarding tutorial (highlight-only walkthrough). startTutorialReplay is defined by
    // scripts/components/tutorial.js, which loads from the shared footer before this page script
    const replayButton = $("replay-tutorial-button");
    if (replayButton && window.startTutorialReplay)
        replayButton.addEventListener("click", () => window.startTutorialReplay());

    const clearButton = $("clear-account-button");
    if (clearButton)
        clearButton.addEventListener("click", clearAccountData);
}

// The profile card and modifiers only need the profile data (sessions, cards, modifiers), not the
// character database — gate on profileReady just like the deck page does
window.profileReady.then(() => accountmain());
