'use strict';

/**
 * Sets data about the current user. Deals with calculating most of the statistics and showcasing them
 */
function setProfileCardData()
{
    $("total-sessions-field").textContent += window.profileData.sessions;
    renderStreakField();
    renderGemsField();
    $("deck-card-num-field").textContent += window.profileData.cards.length;
    $("deck-phrase-num-field").textContent += window.profileData.phrases.length;

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
    $("average-session-length-field").textContent += (formatDecimal(average.time) + average.postfix);
    $("time-spent-in-sessions-field").textContent += (formatDecimal(total.time) + total.postfix);

    const lastDate = window.profileData.lastDate;
    if (lastDate !== 0)
    {
        const date = new Date(lastDate);
        $("last-session-date-field").textContent += date.toLocaleDateString(lc.locale,
        {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "numeric"
        });
    }
    else
        $("last-session-date-field").textContent += lc.no_sessions_recorded;

    const averageKnowledge = $("average-knowledge-level-field");
    let knowledge = 0;
    for (const card of window.profileData.cards)
        knowledge += card.knowledge;

    knowledge /= window.profileData.cards.length;
    if (isNaN(knowledge))
        knowledge = 0;
    averageKnowledge.textContent = `${lc.average_knowledge_level}: ${formatDecimal(knowledge)}/${window.MAX_KNOWLEDGE_LEVEL}`;
}

/**
 * Rewrites one of the profile/shop stat rows. The elements start out holding only the translated
 * label baked in by the template, so the first call stashes that label in a data attribute and every
 * call rebuilds the row from it — the same trick renderStreakField uses, and what lets these rows be
 * re-rendered after a purchase instead of endlessly appending to themselves
 *
 * Snapshots innerHTML rather than textContent because a label may contain an emoji (the gem total's
 * 💎): emoji.js runs inside main() before profileReady resolves, so by the time this first runs the
 * emoji has usually already become an <img class="emoji"> that textContent cannot see and a
 * textContent write would delete. Nothing here is user-supplied — the labels are baked in by the
 * template and the values are numbers this file formats into build-time translation strings — so
 * the round-trip carries no markup risk
 * @param { string } id - ID of the row element
 * @param { string } value - The value to render after the label
 */
function renderLabelledField(id, value)
{
    const el = $(id);
    if (el === null)
        return;

    if (el.getAttribute("data-field-label") === null)
        el.setAttribute("data-field-label", el.innerHTML);

    el.innerHTML = el.getAttribute("data-field-label") + value;
}

/**
 * Rewrites the gem total on the profile card
 */
function renderGemsField()
{
    renderLabelledField("gems-field", window.profileData.gems);
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

    renderLabelledField("streak-freeze-field", `${held}/${window.MAX_STREAK_FREEZES}`);
    renderLabelledField("streak-freeze-cost-field", lc.gems_amount.replace("{gems}", cost));

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
 * Wires the streak-freeze purchase. The affordability checks are repeated inside the handler rather
 * than trusted from the disabled state alone: the price moves with the streak-goal slider sitting
 * right next to it, and freezes can be spent underneath by daily-streak.js at midnight
 */
function setupShop()
{
    renderShopFields();

    const button = $("buy-streak-freeze-button");
    if (button === null)
        return;

    // runEventAfterAnimation, not a bare click listener, so the purchase lands with the button's
    // ripple like every other .card-button-edit on the site
    runEventAfterAnimation(button, "click", function() {
        let data = window.profileData;
        const cost = streakFreezeCost(data.streakGoal);

        if (data.streakGoal <= 0 || data.streakFreezes >= window.MAX_STREAK_FREEZES || data.gems < cost)
            return;

        data.gems -= cost;
        ++data.streakFreezes;

        // Repaint from the in-memory copy immediately; the write is fire-and-forget because nothing
        // here navigates away, and saveProfileData rejects on failure so it needs a catch
        saveProfileData(data).catch(() => {});
        renderGemsField();
        renderShopFields();
    });
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
    // slider here and the one in the prompt modal word the value identically
    function renderLabel(el)
    {
        el.labels[0].childNodes[0].textContent = `${lc.streak_goal_label} ${streakGoalText(el.value)} `;
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
    levelReduce.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${formatDecimal(levelReduce.value)} `;

    // Update the label live as the slider is dragged, but only persist once the drag settles
    // (the "change" event) — writing to IndexedDB on every "input" event fired a storage write
    // per pixel of the drag. The value is coerced to a Number so the stored modifier stays
    // numeric (matching the schema) instead of the raw string the input hands us.
    levelReduce.addEventListener("input", (e) => {
        e.target.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${formatDecimal(e.target.value)} `;
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
