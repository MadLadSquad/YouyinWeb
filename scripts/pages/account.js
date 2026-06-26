'use strict';

/**
 * Sets data about the current user. Deals with calculating most of the statistics and showcasing them
 */
function setProfileCardData()
{
    $("total-sessions-field").textContent += window.profileData.sessions;
    renderStreakField();
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

    levelReduce.addEventListener("input", (e) => {
        window.gameModifiers.levelReduce = e.target.value;
        e.target.labels[0].childNodes[0].textContent = `${lc.level_reduce_label} ${formatDecimal(e.target.value)} `;
        saveGameModifiers();
    });
}

/**
 * Main function for the account page
 */
function accountmain()
{
    setProfileCardData();
    setupGameModifiers();

    // Replay the onboarding tutorial (highlight-only walkthrough). youyinStartTutorialReplay is defined by
    // scripts/components/tutorial.js, which loads from the shared footer before this page script
    const replayButton = $("replay-tutorial-button");
    if (replayButton && window.youyinStartTutorialReplay)
        replayButton.addEventListener("click", () => window.youyinStartTutorialReplay());
}

// The profile card and modifiers only need the profile data (sessions, cards, modifiers), not the
// character database — gate on youyinProfileReady just like the deck page does
window.youyinProfileReady.then(() => accountmain());
