'use strict';

// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_POINTS_ON_CHARACTER = 0.05;
window.ADD_POINTS_ON_ERROR_3_4 = 0.0375;            // 3/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_2 = 0.025;             // 1/2 or 2/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_4 = 0.0125;            // 1/4 of 0.05

// window.MAX_SESSION_REVISION_ITEMS (the per-session cap on cards and on phrases) lives in the
// constant block of scripts/index.js instead: the streak-freeze price is derived from it and the
// account page never loads this file

window.WRITER_SLEEP_AFTER_COMPLETE = 1200;          // In ms
// Pause before moving past a character that has no stroke data and so can't be drawn
window.WRITER_SKIP_MISSING_DELAY = 300;             // In ms
// How long the completed-character "fly into the progress counter" animation lasts. It is timed to
// land right as the next character loads (after WRITER_SLEEP_AFTER_COMPLETE), so the snapshot sits
// invisibly on top during the admire beat, then flies for the last stretch of the pause
window.WRITER_FLY_TO_COUNTER_DURATION = 650;        // In ms
// How long the "+ N gems" label takes to rise off the writer and out of the top of the viewport
window.GEMS_GAIN_FLOAT_DURATION = 1100;           // In ms

window.WRITER_SHOW_HINT_ON_ERRORS = 3;
window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3 = 1;
// ---------------------------------- CONSTANT BLOCK END ----------------------------------

// The standard shuffle algorithm
function fisherYates(array)
{
    let count = array.length,
        randomnumber,
        temp;
    while(count)
    {
        randomnumber = Math.random() * count-- | 0;
        temp = array[count];
        array[count] = array[randomnumber];
        array[randomnumber] = temp
    }
}

// Global writer variable, because yes
window.writer = null;

window.totalPhraseErrors = 0;
window.errors = 0;
window.backwardsErrors = 0;

// Running totals for the whole session (never reset per-card). totalSessionErrors backs the single
// global "Errors" counter shown in the sidebar; together with totalSessionStrokes it yields the
// accuracy percentage shown on the finished-round recap screen
window.totalSessionErrors = 0;
window.totalSessionStrokes = 0;

window.bInTest = false;
window.bInPhrase = false;

window.totalPhraseStrokes = 0;

window.currentPhraseIndex = 0;
window.currentIndex = 0;
// When the round's active time was last added to totalTimeInSessions (see flushSessionTime)
window.sessionTime = 0;
// Active time spent in the current round, for the recap. Excludes time the tab spent hidden
window.roundActiveTime = 0;

// The app bar's nav links, stashed while a phone round replaces them with an Exit link; null otherwise
window.linkChildren = null;

// Extensive mode revisits items in passes of decreasing knowledge level, starting from the top
window.extensiveModeLevel = window.MAX_KNOWLEDGE_LEVEL;

// The phone layout breakpoint from styles/components/header.css, where the app bar's nav collapses and
// the tab bar takes over. A round goes immersive only there
const PHONE_LAYOUT_QUERY = "(max-width: 760px)";

window.cardsReviewedCounter = 1;
window.phrasesReviewedCounter = 0;

// How long after the last resize event to wait before recomputing the writer/button geometry, so a
// window drag doesn't run the (layout-thrashing) recompute on every intermediate event. Matches the
// deck page's DECK_RESIZE_DEBOUNCE_MS
const MAIN_PAGE_RESIZE_DEBOUNCE_MS = 200;

/**
 * The number of cards (or phrases) that may be revised in the current session. The cards and
 * phrases arrays are shuffled before each session and never resized mid-session, so capping the
 * length to window.MAX_SESSION_REVISION_ITEMS limits revision to a stable, random subset of the
 * deck. Pass the cards array to cap cards and the phrases array to cap phrases independently.
 *
 * When the deck has fewer phrases than window.MAX_SESSION_REVISION_ITEMS, the unused phrase slots
 * are donated to the card cap so a session still revises a full batch of items. The phrase cap
 * itself always stays at window.MAX_SESSION_REVISION_ITEMS.
 * @param { Object[] } arr - The cards or phrases array
 * @returns { number } - The capped count
 */
function sessionRevisionCount(arr)
{
    let max = window.MAX_SESSION_REVISION_ITEMS;
    if (arr === window.profileData.cards)
    {
        const phraseNum = window.profileData.phrases.length;
        const remainder = window.MAX_SESSION_REVISION_ITEMS - phraseNum;
        if (remainder > 0)
            max += remainder;
    }
    return Math.min(arr.length, max);
}

// This function uses some dark magic that works half the time in order to calculate the size of the main page viewport
// and main elements. Here are some issues:
// TODO: On portrait screens if the resolution changes this sometimes breaks and a refresh is needed, would be good if it was fixed. 
// Probably check out styles/pages/index.css and the main-page media query
function getDrawElementHeight()
{
    const html = document.querySelector("html");
    const mainEl = document.querySelector("main");
    const startButtonWriterSection = $("start-button-writer-section");
    const listWidget = $("main-page-info-container");
    const footer = document.querySelector("footer");

    // Reset styles that might have been set in previous calls, to get correct layout reads
    listWidget.style.removeProperty("height");
    mainEl.style.removeProperty("height");

    // Batch every layout read up front, before any style write below, so the function forces at most
    // one reflow instead of interleaving reads and writes (layout thrash). Values needed more than once
    // (the list widget height, the main width) are read a single time into locals.
    // The header (incl. its margin-top) and the hr between main and footer also eat vertical space
    // outside main, so subtract them too — otherwise the page overflows the viewport.
    const headerBottom = document.querySelector("header").getBoundingClientRect().bottom;
    const hrHeight = $("main-page-hr").getBoundingClientRect().height;
    const footerHeight = footer.getBoundingClientRect().height;
    const mainWidth = mainEl.getBoundingClientRect().width;
    const sectionPaddingLeft = getComputedStyle(startButtonWriterSection).paddingLeft.replace("px", "") * 2;
    const viewportHeight = window.innerHeight;

    // Chrome that is fixed rather than in flow, so the measurements above cannot see it:
    //  - the round progress strip sits between the header and main, and only exists mid-round
    //  - the phone tab bar is position:fixed over the bottom of the viewport (and is hidden for the
    //    duration of a round, hence reading its live rect rather than assuming its height)
    const progressStrip = $("session-progress-strip");
    const progressStripHeight = progressStrip === null ? 0 : progressStrip.getBoundingClientRect().height;
    const tabBar = document.querySelector(".tab-bar");
    const tabBarHeight = tabBar === null ? 0 : tabBar.getBoundingClientRect().height;

    // Everything outside the writer, measured directly. This used to be derived from <html>'s own box
    // (html.bottom minus its last child's bottom), which measures whatever empty space happens to be
    // below the content — so the answer depended on how tall the document was at the instant of the
    // call. At the start of a round the page is briefly short (the start button is gone, the writer
    // not yet sized) and that made the writer come out ~300px smaller than the space available; once
    // the document was taller than the viewport it read as 0 instead and the footer was pushed off
    // the bottom. Summing the chrome we can actually name is both simpler and stable.
    const chromeHeight = headerBottom + progressStripHeight + hrHeight + footerHeight + tabBarHeight;

    const isPortrait = window.matchMedia("(orientation: portrait)").matches;
    if (isPortrait)
    {
        // Calculate a static maximum height for the card info box
        const targetInfoHeight = 120;
        listWidget.style.setProperty("height", targetInfoHeight + "px");

        // Calculate the writer height to fit the remaining space
        const availableWriterHeight = viewportHeight - chromeHeight - targetInfoHeight - 16;
        let finalHeight = Math.min(mainWidth - sectionPaddingLeft, availableWriterHeight);
        if (finalHeight < 100)
            finalHeight = 100;

        return finalHeight;
    }

    // Landscape: the sidebar sits beside the writer rather than above it, so the writer gets the whole
    // remaining column height
    let finalHeight = viewportHeight - chromeHeight;

    if (mainWidth < finalHeight)
        finalHeight = mainWidth - sectionPaddingLeft;
    else
    {
        // Every read happened above, so these writes can't dirty layout mid-measurement
        listWidget.style.setProperty("height", finalHeight.toString() + "px");
        mainEl.style.setProperty("height", finalHeight.toString() + "px");
    }

    return finalHeight;
}

/**
 * Fills the idle screen: the ring showing how many rounds have been completed today against the
 * daily goal, and the line describing what is queued. Both read data that already exists —
 * activityByDay, streakGoal, and the same capped counts the round itself will draw from.
 */
function renderSessionIdle()
{
    const data = window.profileData;
    const goal = data.streakGoal > 0 ? data.streakGoal : 0;
    const done = (data.activityByDay && data.activityByDay[localDayIndex(new Date())]) || 0;

    const doneEl = $("session-goal-done");
    if (doneEl !== null)
        doneEl.textContent = done;

    const ofEl = $("session-goal-of");
    if (ofEl !== null)
        ofEl.textContent = goal > 0 ? lc.today_of_goal.replace("{goal}", goal) : lc.today_no_goal;

    // The ring is a stroked circle of radius 52, so its full sweep is 2 * PI * 52
    const arc = $("session-goal-arc");
    if (arc !== null)
    {
        const circumference = 2 * Math.PI * 52;
        const fraction = goal > 0 ? Math.min(1, done / goal) : 0;
        arc.style.setProperty("stroke-dasharray", circumference.toFixed(1));
        arc.style.setProperty("stroke-dashoffset", (circumference * (1 - fraction)).toFixed(1));
    }

    const note = $("session-queue-note");
    if (note !== null)
        note.textContent = lc.session_queue_note
            .replace("{cards}", sessionRevisionCount(data.cards))
            .replace("{phrases}", sessionRevisionCount(data.phrases));
}

/**
 * Updates the round progress strip under the header. The same counts the sidebar renders as text,
 * surfaced where they stay visible for the whole round.
 */
function renderSessionProgress()
{
    const strip = $("session-progress-strip");
    if (strip === null || strip.hidden)
        return;

    const data = window.profileData;

    // A round has two stages and the strip has to follow whichever one is on screen. bInPhrase flips
    // once the cards are done; from then on currentIndex counts characters WITHIN the current phrase,
    // not items completed, and the item counter is currentPhraseIndex. Reading currentIndex against
    // the card cap through both stages is what made a two-phrase round report "3 / 16".
    const bPhrases = window.bInPhrase;
    const total = bPhrases ? sessionRevisionCount(data.phrases) : sessionRevisionCount(data.cards);
    const done = Math.min(bPhrases ? window.currentPhraseIndex : window.currentIndex, total);

    // How far into the phrase currently being written, so the bar keeps creeping through a long
    // phrase instead of standing still and then jumping a whole step
    let partial = 0;
    if (bPhrases && done < total)
    {
        const length = toCharacters(data.phrases[window.currentPhraseIndex].phrase).length;
        if (length > 0)
            partial = Math.min(window.currentIndex, length) / length;
    }

    const label = $("session-progress-label");
    if (label !== null)
        label.textContent = bPhrases ? lc.phrases_count_phrase : lc.phrases_count_cards;

    const fill = $("session-progress-fill");
    if (fill !== null)
        fill.style.setProperty("width", total > 0 ? Math.min(100, ((done + partial) / total) * 100) + "%" : "0%");

    const count = $("session-progress-count");
    if (count !== null)
        count.textContent = `${done} / ${total}`;

    const errors = $("session-progress-errors");
    if (errors !== null)
        errors.textContent = lc.session_errors_count.replace("{count}", window.totalSessionErrors);
}

/**
 * Shows or hides the round progress strip. Hiding it also clears the inline width so the bar starts
 * from empty next round rather than animating down from wherever it stopped.
 * @param { boolean } visible - Whether a round is in progress
 */
function setSessionProgressVisible(visible)
{
    const strip = $("session-progress-strip");
    if (strip === null)
        return;

    strip.hidden = !visible;
    if (visible)
    {
        renderSessionProgress();
        return;
    }

    // Back to the generic wording, so the next round does not open on the last one's stage
    const label = $("session-progress-label");
    if (label !== null)
        label.textContent = lc.session_round_in_progress;

    const fill = $("session-progress-fill");
    if (fill !== null)
        fill.style.setProperty("width", "0%");
}

function writerOnMistake(strokeData)
{
    // Error calculation and display
    if (strokeData.isBackwards)
        window.backwardsErrors++;

    // Since we don't count backwards strokes as errors, remove them rom the mistakes and calculate errors correctly.
    // Compare against the writer's current hint threshold — setWriterState lowers it to 1 at high
    // knowledge levels, so a fixed comparison with 3 would never count those errors
    if ((strokeData.mistakesOnStroke - window.backwardsErrors) === window.writer._options.showHintAfterMisses)
    {
        window.errors++;
        window.totalPhraseErrors++;
        window.totalSessionErrors++;
    }

    // Either use the number of cards or the phrase-local number
    let num = sessionRevisionCount(window.profileData.cards);
    if (window.bInPhrase)
    {
        num = toCharacters(window.profileData.phrases[window.currentPhraseIndex].phrase).length;
        // Also update the phrase information. It's ugly, I know...
        // Display as 1-based to match changeSidebarText, which renders currentPhraseIndex + 1
        $("phrase-info-widget-errors").textContent = `${lc.phrases_count_phrase}: ${window.currentPhraseIndex + 1}/${sessionRevisionCount(window.profileData.phrases)}; ${lc.phrases_count_errors}: ${window.totalSessionErrors}`;
    }

    // Update the card information. 1-based to match changeSidebarText, which renders currentIndex + 1.
    // The errors counter is the global session total, not per-card. While revising a phrase the phrase
    // widget already shows it, so omit it here to avoid two identical counters
    $("character-info-widget-errors").textContent = cardSidebarText(num);
    renderSessionProgress();
}

function writerOnCorrectStroke(_)
{
    window.backwardsErrors = 0;
}

/**
 * Builds the card widget's count line. The global errors counter is appended only when revising a
 * standalone card - while inside a phrase the phrase widget already shows it, so we omit it here to
 * avoid two identical counters
 * @param { number } cardNum - Number of cards (or phrase characters) the position is counted against
 * @returns { string } - The localised count line
 */
function cardSidebarText(cardNum)
{
    let text = `${lc.phrases_count_cards}: ${window.currentIndex + 1}/${cardNum}`;
    if (!window.bInPhrase)
        text += `; ${lc.phrases_count_errors}: ${window.totalSessionErrors}`;
    return text;
}

/**
 * Generic function that updates the sidebar element for a phrase or card
 * @param { string } prefix - Prefix, this is different depending on whether you're editing the phrase or character card
 * data
 * @param { string } spelling - Spelling of the given character or phrase
 * @param { string } errors - The number of errors for the given character or phrase. String because it may be localised
 * @param { Object|null } obj - Object currently editing. May be null if not editing an object
 */
function updateIndividualSidebarElementText(prefix, spelling, errors, obj)
{
    $(`${prefix}-info-widget-spelling`).textContent = spelling;
    $(`${prefix}-info-widget-errors`).textContent = errors;
    const list = $(`${prefix}-info-widget-info`);
    list.replaceChildren();

    if (obj !== null)
        for (const def of obj.definitions)
            addElement("li", def, "", "", "", list);
}

/**
 * Changes the sidebar text
 * @param { Object|null } phrase - Phrase to edit. May be null if only editing a character card
 * @param { number } phraseNum - Number of phrases in the deck. Used to show which phrase you're currently on
 * @param { Object|null } card - Card to edit. May be null if a phrase doesn't contain the card but contains the character
 * @param { number } cardNum - Number of cards. Used to show which card you're currently on
 */
function changeSidebarText(phrase, phraseNum, card, cardNum)
{
    let definitionParagraph = $("character-info-widget-def-p");

    if (phrase !== null && phraseNum > 0)
        updateIndividualSidebarElementText("phrase", `${lc.phrases_count_spelling}: ${phrase.name}`, `${lc.phrases_count_phrase}: ${window.currentPhraseIndex + 1}/${phraseNum}; ${lc.phrases_count_errors}: ${window.totalSessionErrors}`, phrase);

    if (card !== null && cardNum > 0)
        updateIndividualSidebarElementText("character", `${lc.phrases_count_spelling}: ${card.name}`, cardSidebarText(cardNum), card);
    else
    {
        updateIndividualSidebarElementText("character", lc.unknown_character, cardSidebarText(cardNum), null);
        definitionParagraph.style.display = "none";
        renderSessionProgress();
        return;
    }
    definitionParagraph.style.display = "block";
    renderSessionProgress();
}

function resetSidebar()
{
    // Ugly ahh code to reset to the initial state
    $("character-info-widget-spelling").textContent = `${lc.phrases_count_spelling}: ${lc.to_be_loaded}`;
    $("character-info-widget-errors").textContent = `${lc.phrases_count_cards}: 0/0; ${lc.phrases_count_errors}: 0`;

    $("character-info-widget-info").replaceChildren(addElement("li", lc.to_be_loaded, "", "", "", null));

    // Hide the phrase info widget
    $("phrase-info-widget").style.display = "none";
}

/**
 * The finished-round recap.
 *
 * The round used to be reported as a deck of slides, one stat per slide, each sliding in from the
 * right over the last, with the summary card arriving at the end. That made the user sit through a
 * sequence they had already seen the numbers of. Now the summary card is the *only* thing shown,
 * and the movement is spent on it instead: its parts fly in one after another the way a lesson
 * recap does in Duolingo, and every number counts up from zero as its part lands.
 *
 * The reveal is described declaratively - each part is pushed onto a list in the order it should
 * appear, and playFinishReveal turns that list into staggered CSS animations plus the matching
 * timers for the counters. Nothing about the card's layout depends on the timing, so a part can be
 * added, removed or reordered by moving one push.
 */

// The first part lands after this, and each subsequent part this much later again. Chosen so the
// whole card (card, ring, title, three stat tiles, chips, button - nine parts) is on screen in
// roughly a second: long enough to read as a sequence, short enough not to be a wait.
const FINISH_POP_BASE = 90;
const FINISH_POP_STEP = 110;

// How long a counter takes to run up to its final value once its part has landed
const FINISH_COUNT_DURATION = 700;

// Matches the finish-pop keyframes in styles/pages/index.css. Only used to work out when the last
// part has finished arriving, which is when the recap is announced as ready
const FINISH_POP_DURATION = 420;

function finishReducedMotion()
{
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts an element's number up from zero to its real value. Every counter on the recap runs the
 * same easeOutCubic - it sprints away and settles onto the final number rather than crawling to it,
 * which is what makes the value feel earned instead of merely printed. Reduced motion gets the
 * finished number and nothing else.
 * @param { HTMLElement } el - The element whose textContent is the number
 * @param { number } to - The final value
 * @param { function(number): string } format - Renders an in-between value (rounding, unit, postfix)
 */
function countUpTo(el, to, format)
{
    if (finishReducedMotion())
    {
        el.textContent = format(to);
        return;
    }

    const start = performance.now();
    const tick = (now) => {
        const t = Math.min((now - start) / FINISH_COUNT_DURATION, 1);
        el.textContent = format(to * (1 - Math.pow(1 - t, 3)));
        if (t < 1)
            requestAnimationFrame(tick);
    };
    el.textContent = format(0);
    requestAnimationFrame(tick);
}

/**
 * Renders a translated string that carries exactly one {placeholder} into a chip, putting the
 * placeholder's value in a span of its own so it can be counted up while the words around it stay
 * put. Falls back to the plain string when the placeholder is missing (a translation may drop it).
 *
 * The words go into a wrapper rather than straight into the chip. .chip is an inline-flex row with a
 * gap, meant to space an icon from its label; rendering a sentence into it directly would make every
 * text fragment around the number its own flex item and open that same gap mid-sentence. One wrapper
 * child keeps the whole string as ordinary inline text.
 * @param { HTMLElement } chip - The chip to render into
 * @param { string } template - The translated string, e.g. "+ {gems} 💎"
 * @param { string } placeholder - The placeholder including its braces, e.g. "{gems}"
 * @param { number } value - The value the placeholder stands for
 * @returns { HTMLElement | null } - The span holding the number, or null when there was no placeholder
 */
function addPlaceholderNumber(chip, template, placeholder, value)
{
    const text = addElement("span", "", "", "", "", chip);
    const at = template.indexOf(placeholder);
    if (at < 0)
    {
        text.textContent = template;
        return null;
    }

    addTextNode(text, template.substring(0, at));
    const number = addElement("span", String(value), "", "", "", text);
    addTextNode(text, template.substring(at + placeholder.length));
    return number;
}

/**
 * Plays a reveal built by buildFinishSummary: hands each part its slot in the stagger and fires the
 * part's onReveal (counters, the ring fill, the fire burst) as it lands.
 *
 * Reduced motion skips the whole thing - no fly-in, no counting - and shows the finished card, so
 * the recap is instant rather than merely calm.
 * @param { Array } parts - Ordered { el, onReveal? } descriptors
 * @returns { number } - Milliseconds until the last part has finished arriving
 */
function playFinishReveal(parts)
{
    if (finishReducedMotion())
    {
        for (const part of parts)
            if (part.onReveal)
                part.onReveal();
        return 0;
    }

    let delay = FINISH_POP_BASE;
    for (const part of parts)
    {
        part.el.classList.add("finish-pop");
        part.el.style.setProperty("--pop-delay", `${delay}ms`);
        if (part.onReveal)
            window.setTimeout(part.onReveal, delay);
        delay += FINISH_POP_STEP;
    }
    return delay - FINISH_POP_STEP + FINISH_POP_DURATION;
}

/**
 * Builds the round-summary card: an accuracy ring, the round's three headline numbers, and the gems
 * and streak chips. Everything shown was already computed by showFinishedSessionPage; nothing new
 * is tracked. Parts are pushed onto `parts` in the order they should fly in - the card first, then
 * its contents top to bottom - and playFinishReveal times them.
 * @param { HTMLElement } container - The stage to build the card into
 * @param { Object } entry - The summary descriptor { accuracy, characters, phrases, time, gems, ... }
 * @param { Array } parts - Reveal list to append this card's parts to
 * @returns { HTMLElement } - The card
 */
function buildFinishSummary(container, entry, parts)
{
    const card = addElement("div", "", "", "finish-summary", "", container);
    parts.push({ el: card });

    // Accuracy ring. Radius 52 to match the idle screen's goal ring, so the two read as one family
    const ring = addElement("div", "", "", "finish-summary-ring", "", card);
    const circumference = 2 * Math.PI * 52;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    let fill = null;
    for (const cls of ["finish-ring-track", "finish-ring-fill"])
    {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", "60");
        circle.setAttribute("cy", "60");
        circle.setAttribute("r", "52");
        circle.setAttribute("class", cls);
        if (cls === "finish-ring-fill")
        {
            circle.style.setProperty("stroke-dasharray", circumference.toFixed(1));
            // Drawn from empty; the CSS transition sweeps it round once the ring has landed
            circle.style.setProperty("stroke-dashoffset", circumference.toFixed(1));
            fill = circle;
        }
        svg.appendChild(circle);
    }
    ring.appendChild(svg);

    const ringInner = addElement("div", "", "", "finish-summary-ring-inner", "", ring);
    const accuracy = addElement("span", "0%", "", "t-num finish-summary-accuracy", "", ringInner);
    addElement("span", lc.finish_page_accuracy, "", "stat-label", "", ringInner);
    // The arc sweeping round and the percentage counting up are the same measurement, so they run
    // together off the ring's slot in the stagger
    parts.push({
        el: ring,
        onReveal: () => {
            fill.style.setProperty("stroke-dashoffset",
                (circumference * (1 - entry.accuracy / 100)).toFixed(1));
            countUpTo(accuracy, entry.accuracy, (v) => `${Math.round(v)}%`);
        }
    });

    parts.push({ el: addElement("h3", entry.text, "", "finish-summary-title", "", card) });

    const stats = addElement("div", "", "", "finish-summary-stats", "", card);
    // Reuses the exact labels the per-stat slides used to show, so the card still reads as a recap.
    // Each tile carries its own formatter: the two tallies are whole numbers, the session length is
    // a two-decimal value with a localised unit after it.
    const rows = [
        { label: lc.finish_page_characters_reviewed, value: entry.characters, format: (v) => String(Math.round(v)) },
        { label: lc.finish_page_phrases_reviewed, value: entry.phrases, format: (v) => String(Math.round(v)) },
        { label: lc.finish_page_session_len, value: entry.timeValue, format: (v) => `${formatDecimal(v)}${entry.timePostfix}` }
    ];
    for (const row of rows)
    {
        const tile = addElement("div", "", "", "finish-summary-stat", "", stats);
        addElement("span", row.label, "", "stat-label", "", tile);
        const value = addElement("span", "", "", "t-num-sm", "", tile);
        // Each tile flies in on its own slot, so the three of them read as a run rather than a block
        parts.push({ el: tile, onReveal: () => countUpTo(value, row.value, row.format) });
    }

    const chips = addElement("div", "", "", "finish-summary-chips", "", card);

    const gems = addElement("span", "", "", "chip chip-accent", "", chips);
    const gemsNumber = addPlaceholderNumber(gems, lc.gems_gain, "{gems}", entry.gems);
    parts.push({
        el: gems,
        onReveal: gemsNumber === null
            ? undefined
            : () => countUpTo(gemsNumber, entry.gems, (v) => String(Math.round(v)))
    });

    // The streak chip is the round's one piece of good news that is not about this round, so it is
    // what the fire burst celebrates: the emojis go up as the chip lands
    if (entry.streakTemplate !== "")
    {
        const streak = addElement("span", "", "", "chip", "", chips);
        const streakNumber = addPlaceholderNumber(streak, entry.streakTemplate, "{streak}", entry.streak);
        parts.push({
            el: streak,
            onReveal: () => {
                if (streakNumber !== null)
                    countUpTo(streakNumber, entry.streak, (v) => String(Math.round(v)));
                const r = container.getBoundingClientRect();
                playStreakFireAnimation({
                    left: r.left + window.scrollX,
                    top: r.top + window.scrollY,
                    width: r.width,
                    height: r.height
                });
            }
        });
    }

    return card;
}

/**
 * Gives the finished-round stage whatever vertical space is actually free below it.
 *
 * The stage starts out the size of the writer it replaces, which is a square: on a phone that square
 * is bounded by the screen's *width*, so it stops well short of the bottom of the screen and the
 * recap ends up sitting high with a band of dead space under it. The stage centres its contents, so
 * handing it the leftover height is all it takes to centre the recap on the screen. Landscape and
 * desktop are width-generous and height-bound, so there the writer square is already about as tall
 * as the space allows and this is a no-op.
 *
 * It is a *minimum* height, not a fixed one: a tall recap on a short phone grows the stage and the
 * page scrolls, rather than the card losing its ring off the top and its button off the bottom.
 *
 * Measured rather than derived: whatever sits under the stage (the rule, the footer, the phone tab
 * bar's body padding) is read straight off the current layout, so the page never gains a scrollbar.
 * @param { HTMLElement } container - The stage, already sized to the writer's footprint
 */
function growFinishStageToViewport(container)
{
    const rect = container.getBoundingClientRect();
    const belowStage = document.body.getBoundingClientRect().bottom - rect.bottom;
    const available = document.documentElement.clientHeight - rect.top - belowStage;

    if (available > rect.height)
        container.style.setProperty("min-height", Math.floor(available) + "px");
}

/**
 * Appends the Continue button below the round summary and registers it as the last part of the
 * reveal, so it arrives once there is something to continue from. Dismisses the finished-round
 * screen on click.
 * @param { HTMLElement } container - The stage to append the button to
 * @param { Array } parts - Reveal list to append the button to
 */
function addFinishContinueButton(container, parts)
{
    const button = addElement("button", lc.finish_page_continue, "", "card-button-edit finish-continue", "", container);
    runEventAfterAnimation(button, "click", (_) => {
        $("finished-session-section").remove();
        createStartButton();
        resetSidebar();
    });
    parts.push({ el: button });
}

/**
 * Celebrates a user who just advanced their daily streak (started a new one or extended it): fire
 * emojis fly out from the bottom of the play field and burn out on the way up. The twemoji
 * MutationObserver picks the emojis up automatically, so they render as SVGs like everywhere else
 * on the site. Skipped entirely for users who prefer reduced motion
 * @param { Object } rect - Document-space { left, top, width, height } the burst covers. Defaults
 *                          to the writer area the play field occupied; the finished-round recap
 *                          passes the stage's rectangle so the fire plays over the summary card
 */
function playStreakFireAnimation(rect = window.lastWriterRect)
{
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        return;

    let container = addElement("div", "", "streak-fire-container", "streak-fire-container", "", document.body);
    container.setAttribute("aria-hidden", "true");
    container.style.setProperty("left", rect.left + "px");
    container.style.setProperty("top", rect.top + "px");
    container.style.setProperty("width", rect.width + "px");
    container.style.setProperty("height", rect.height + "px");

    const FIRE_EMOJI_COUNT = 36;
    let finished = 0;
    for (let i = 0; i < FIRE_EMOJI_COUNT; i++)
    {
        let emoji = addElement("span", "🔥", "", "streak-fire-emoji", "", container);

        // Each emoji gets its own start position, flight path and timing so the burst looks
        // organic instead of a synchronised wall of fire
        emoji.style.setProperty("--fire-left", (5 + Math.random() * 90) + "%");
        emoji.style.setProperty("--fire-rise", -((0.55 + Math.random() * 0.45) * rect.height) + "px");
        emoji.style.setProperty("--fire-drift", ((Math.random() - 0.5) * 6) + "rem");
        emoji.style.setProperty("--fire-spin", ((Math.random() - 0.5) * 90) + "deg");
        emoji.style.setProperty("--fire-duration", (1 + Math.random() * 0.8) + "s");
        emoji.style.setProperty("--fire-delay", (Math.random() * 1) + "s");
        emoji.style.setProperty("font-size", (1.25 + Math.random() * 1.25) + "rem");

        emoji.addEventListener("animationend", (_) => {
            if (++finished === FIRE_EMOJI_COUNT)
                container.remove();
        });
    }
}

/**
 * Computes the session accuracy as a whole-number percentage from the global error and stroke
 * totals - e.g. 3 errors over 12 strokes yields 75%. At most one error is counted per stroke, so
 * accuracy stays within [0, 100]; defaults to 100% when nothing was reviewed
 * @returns { number } - The accuracy percentage, rounded to a whole number
 */
function computeSessionAccuracy()
{
    if (window.totalSessionStrokes <= 0)
        return 100;

    const accuracy = (1 - window.totalSessionErrors / window.totalSessionStrokes) * 100;
    return Math.round(Math.min(Math.max(accuracy, 0), 100));
}

// Dispatched on document once the recap has fully arrived. The onboarding tutorial waits on it
// before pointing the user at their profile, so its popover doesn't land on a half-built card
const FINISH_SUMMARY_READY_EVENT = "finish-summary-ready";

function showFinishedSessionPage(st, bStreakAdvanced)
{
    const result = getLocalisedTimePostfix(st);

    let mainContainer = $("start-button-writer-section");
    let container = addElement("section", "", "finished-session-section", "centered", "", mainContainer);
    // Start the stage off at the footprint the writer had, so the recap lands where the play field
    // was rather than jumping up the page. It is a floor, not a ceiling - see growFinishStageToViewport
    container.style.setProperty("min-height", getDrawElementHeight() + "px");
    growFinishStageToViewport(container);

    // Rounds that started or extended the daily streak get to brag about its new length. The
    // singular/plural wording is two translation keys; here we only pick the right variant - the count itself is left as its {streak} placeholder so the
    // card can count it up in place
    let streakTemplate = "";
    if (bStreakAdvanced)
        streakTemplate = window.profileData.streak === 1
            ? lc.finish_page_streak_increased_one
            : lc.finish_page_streak_increased;

    // Gems are derived, not tracked: awardItemGems pays GEMS_PER_ITEM per completed card and per
    // completed whole phrase
    const parts = [];
    buildFinishSummary(container, {
        text: lc.finish_page_header,
        accuracy: computeSessionAccuracy(),
        characters: window.cardsReviewedCounter,
        phrases: window.phrasesReviewedCounter,
        timeValue: result.time,
        timePostfix: result.postfix,
        gems: (window.cardsReviewedCounter + window.phrasesReviewedCounter) * window.GEMS_PER_ITEM,
        streak: window.profileData.streak,
        streakTemplate: streakTemplate
    }, parts);
    addFinishContinueButton(container, parts);

    const total = playFinishReveal(parts);
    window.setTimeout(() => document.dispatchEvent(new CustomEvent(FINISH_SUMMARY_READY_EVENT)), total);
}

/**
 * Swallows the rejection of a hanzi-writer call. Its calls return promises that reject when the
 * character failed to load; writerOnMissingCharacter already handles that case, so the rejections
 * would only surface as unhandled-rejection noise
 * @param { * } result - Whatever the writer call returned
 */
function ignoreWriterFailure(result)
{
    if (result && typeof result.catch === "function")
        result.catch(() => {});
}

function setWriterState(ref)
{
    // Set the default writer state. Certain knowledge levels have certain features enabled/disabled
    const writer = window.writer;
    writer._options.showHintAfterMisses = 3;
    ignoreWriterFailure(writer.updateColor("radicalColor", null));
    if (ref.knowledge >= 3)
    {
        ignoreWriterFailure(writer.hideOutline());
    }
    else if (ref.knowledge >= 2)
    {
        writer._options.showHintAfterMisses = window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3;
        ignoreWriterFailure(writer.hideOutline());
    }
    else if (ref.knowledge >= 1)
    {
        ignoreWriterFailure(writer.showOutline());
    }
    else
    {
        ignoreWriterFailure(writer.updateColor("radicalColor", window.WRITER_RADICAL_COLOUR));
        ignoreWriterFailure(writer.showOutline());
    }
}

/**
 * Loads the next character into the session writer, styles it for the item's knowledge level and
 * starts quizzing it. The character has to be set first: after a failed load hanzi-writer throws
 * from every other call until setCharacter is called again, which used to abort the round
 * @param { string } character - The character plus its variant postfix
 * @param { Object } ref - The card or phrase whose knowledge level styles the writer
 */
function quizSessionCharacter(character, ref)
{
    ignoreWriterFailure(window.writer.setCharacter(character));
    setWriterState(ref);
    ignoreWriterFailure(window.writer.quiz());
}

/**
 * Computes how to score a phrase or character card
 * @param { number } strokes - Strokes in the given character
 * @param { number } errors - Errors committed for the given character
 * @param { number } knowledge - Knowledge for the given phrase or character card
 * @returns { number } - The final score
 */
function computeScore(strokes, errors, knowledge)
{
    // Nothing was drawn (every character was skipped for missing stroke data): there is nothing to
    // grade, and dividing by zero strokes would turn the score into NaN
    if (strokes <= 0)
        return knowledge;

    let pointsPerStroke = (window.MAX_POINTS_ON_CHARACTER / strokes);
    let points = (window.MAX_POINTS_ON_CHARACTER - (errors * pointsPerStroke));
    let result;

    if (points >= window.MAX_POINTS_ON_CHARACTER)
        result = window.MAX_POINTS_ON_CHARACTER;
    else if (points >= window.ADD_POINTS_ON_ERROR_3_4)
        result = window.ADD_POINTS_ON_ERROR_3_4;
    else if (points >= window.ADD_POINTS_ON_ERROR_1_2)
        result = window.ADD_POINTS_ON_ERROR_1_2;
    else if (points >= window.ADD_POINTS_ON_ERROR_1_4)
        result = -window.ADD_POINTS_ON_ERROR_1_4;
    else
        result = -window.ADD_POINTS_ON_ERROR_1_2;

    knowledge = Math.min(Math.max(knowledge + result, 0), window.MAX_KNOWLEDGE_LEVEL);
    return knowledge;
}

function resetSessionData()
{
    window.totalPhraseErrors = 0;
    window.totalPhraseStrokes = 0;
    window.errors = 0;
    window.backwardsErrors = 0;

    window.currentIndex = 0;
    window.currentPhraseIndex = 0;
    window.bInTest = false;
    window.bInPhrase = false;

    $("phrase-info-widget").style.display = "none"
}

/**
 * Resets the play state when playing phrases
 * @param { Object } data - Container for currentPhrase
 */
function resetPlayForPhrases(data)
{
    // This runs once per character of a phrase, so only count a phrase as reviewed when we're
    // setting up its first character (currentIndex === 0) - otherwise the tally counts characters
    if (window.currentIndex === 0)
        ++window.phrasesReviewedCounter;
    let currentPhrase = data.phrases[window.currentPhraseIndex];
    const phraseChars = toCharacters(currentPhrase.phrase);
    let card = null;
    for (const c of data.cards)
    {
        if (phraseChars[window.currentIndex] === c.character)
        {
            card = c;
            break;
        }
    }

    // A phrase character is drawn in the variant of its own card, the way the deck page shows it, and
    // styled by that card's knowledge. Revert to using the phrase score if no card is found
    const character = phraseChars[window.currentIndex] + (card !== null ? (card.variant || "") : "");
    quizSessionCharacter(character, card !== null ? card : currentPhrase);
    changeSidebarText(currentPhrase, sessionRevisionCount(data.phrases), card, phraseChars.length);
}

/**
 * Rewrites every id in a cloned subtree to a fresh unique value, fixing up the references to them
 * (url(#id) in clip-path/mask/fill/... and href="#id") so the clone is self-contained. Needed
 * because the snapshot is inserted into the live document next to the writer it was cloned from -
 * duplicate ids would make url(#id) resolve to whichever element comes first, corrupting both.
 * @param { Element } root - The cloned subtree to rewrite in place
 */
function uniquifyElementIds(root)
{
    const ided = root.querySelectorAll("[id]");
    if (ided.length === 0)
        return;

    // Collect the old ids longest-first so that an id which is a prefix of another (e.g. "x1" vs
    // "x10") can't be partially matched when we rewrite references
    const oldIds = [];
    ided.forEach(el => oldIds.push(el.getAttribute("id")));
    oldIds.sort((a, b) => b.length - a.length);

    const suffix = "-fly-" + Math.random().toString(36).slice(2, 9);
    ided.forEach(el => el.setAttribute("id", el.getAttribute("id") + suffix));

    const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A reference is "#id" not immediately followed by another id character, so the prefix case
    // above is handled and "#x1" won't be matched inside "#x10"
    const patterns = oldIds.map(id => new RegExp("#" + escapeForRegex(id) + "(?![\\w-])", "g"));

    root.querySelectorAll("*").forEach(el => {
        for (const attr of Array.from(el.attributes))
        {
            if (attr.value.indexOf("#") === -1)
                continue;
            let value = attr.value;
            for (let i = 0; i < oldIds.length; i++)
                value = value.replace(patterns[i], "#" + oldIds[i] + suffix);
            if (value !== attr.value)
                el.setAttribute(attr.name, value);
        }
    });
}

/**
 * Snapshots the just-completed character and flies it into the progress counter, shrinking it away
 * as it lands - a small reward for finishing a character. The snapshot is deliberately deferred
 * until the flight starts (after a short "admire" beat) rather than taken the moment onComplete
 * fires: hanzi-writer is still animating the final stroke into place at that point, so an early
 * copy would freeze a half-drawn frame and, sitting on top, hide the writer's own settle animation.
 * By the time the beat is over the stroke has settled, so the copy matches the widget. A static
 * copy is lifted onto a fixed overlay placed exactly over the writer, the real character is cleared,
 * and the copy flies to the counter, timed to land right as the next character loads. Purely
 * cosmetic and fully guarded - it must never break a round. Skipped by the caller under reduced
 * motion.
 * @param { HTMLElement } counterEl - The progress counter element the copy flies into
 */
function flyCharacterToCounter(counterEl)
{
    if (counterEl === null)
        return;

    // Wait out most of the post-complete pause before snapshotting, so hanzi-writer has finished
    // settling the final stroke; the copy then flies for the remaining stretch, landing as the next
    // character loads
    const admireDelay = Math.max(0, window.WRITER_SLEEP_AFTER_COMPLETE - window.WRITER_FLY_TO_COUNTER_DURATION);
    setTimeout(() => {
        const writerSvg = $("character-target-div");
        if (writerSvg === null)
            return;

        const writerRect = writerSvg.getBoundingClientRect();

        // Build the static snapshot from the (now settled) live writer SVG
        const snapshot = writerSvg.cloneNode(true);
        snapshot.removeAttribute("id");
        snapshot.removeAttribute("class");
        // Drop the background grid lines - we only want the character itself
        snapshot.querySelectorAll("line").forEach(l => l.remove());
        // hanzi-writer draws each stroke as a thick, round-capped path clipped to the stroke's
        // outline, so the clip-paths are essential - without them the strokes render fat and bubbly.
        // Keep the defs/clip-paths but rewrite their ids to be unique: the snapshot lives in the
        // document alongside the live writer, and url(#id) resolves to the first match, so shared
        // ids would have the two fight over each other's clip-paths
        uniquifyElementIds(snapshot);
        snapshot.setAttribute("width", writerRect.width);
        snapshot.setAttribute("height", writerRect.height);

        // Overlay placed exactly over the writer, so the copy is pixel-identical as it lifts off
        const overlay = addElement("div", "", "", "fly-overlay", "", document.body);
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.setProperty("left", writerRect.left + "px");
        overlay.style.setProperty("top", writerRect.top + "px");
        overlay.style.setProperty("width", writerRect.width + "px");
        overlay.style.setProperty("height", writerRect.height + "px");
        overlay.appendChild(snapshot);

        const counterRect = counterEl.getBoundingClientRect();
        const dx = (counterRect.left + counterRect.width / 2) - (writerRect.left + writerRect.width / 2);
        const dy = (counterRect.top + counterRect.height / 2) - (writerRect.top + writerRect.height / 2);

        // Clear the real character now that the copy covers it, so the writer field is left empty as
        // the copy lifts off (the writer instance is reused for the next character a moment later)
        try
        {
            if (window.writer !== null)
                window.writer.hideCharacter({ duration: 0 });
        }
        catch (_) { /* writer may already be gone on the last card - the copy still flies */ }

        const anim = overlay.animate([
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0.15 }
        ], {
            duration: window.WRITER_FLY_TO_COUNTER_DURATION,
            easing: "ease-in",
            fill: "forwards"
        });
        anim.finished.then(() => overlay.remove(), () => overlay.remove());
    }, admireDelay);
}

/**
 * Plays a short pulse on the progress counter as its value ticks up. This is the whole reward under
 * reduced motion, and punctuates the flying copy's arrival otherwise
 * @param { HTMLElement } counterEl - The progress counter element to pulse
 */
function blinkCounter(counterEl)
{
    if (counterEl === null)
        return;
    counterEl.classList.remove("counter-blink");
    // Force a reflow so the animation restarts even on back-to-back completions
    void counterEl.offsetWidth;
    counterEl.classList.add("counter-blink");
    counterEl.addEventListener("animationend", () => counterEl.classList.remove("counter-blink"), { once: true });
}

/**
 * Floats a "+ N" off the character writer and up out of the top of the viewport as gems are
 * earned. Purely cosmetic and fully guarded — like the flying character copy it must never be able
 * to break a round, so every lookup degrades instead of throwing. Skipped under reduced motion,
 * where the gems still land, just without the flourish
 * @param { number } amount - The number of gems awarded, rendered into the label
 */
function floatGemsGain(amount)
{
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        return;

    // Start centred on the writer. On the very last completion of a round the writer element is
    // already gone, so fall back to the rectangle captured just before it was removed, and finally
    // to three quarters down the viewport when neither is available
    let centreX;
    let centreY;
    const writerSvg = $("character-target-div");
    if (writerSvg !== null)
    {
        const rect = writerSvg.getBoundingClientRect();
        centreX = rect.left + rect.width / 2;
        centreY = rect.top + rect.height / 2;
    }
    else if (window.lastWriterRect !== null && window.lastWriterRect !== undefined)
    {
        // lastWriterRect is stored in page coordinates (it has the scroll offset baked in), but the
        // label is position:fixed — take the scroll back out so it lands where the writer was seen
        centreX = window.lastWriterRect.left - window.scrollX + window.lastWriterRect.width / 2;
        centreY = window.lastWriterRect.top - window.scrollY + window.lastWriterRect.height / 2;
    }
    else
    {
        centreX = window.innerWidth / 2;
        centreY = window.innerHeight * 0.75;
    }

    const label = addElement("div", lc.gems_gain.replace("{gems}", amount), "", "gems-gain", "", document.body);
    label.setAttribute("aria-hidden", "true");
    label.style.setProperty("left", centreX + "px");
    label.style.setProperty("top", centreY + "px");

    // Rise clear of the top edge before fading out. The element is centred on its own origin by the
    // stylesheet's translate(-50%, -50%), so the flight distance is just how far down it started
    const anim = label.animate([
        { transform: "translate(-50%, -50%)", opacity: 0 },
        { transform: "translate(-50%, -50%)", opacity: 1, offset: 0.15 },
        { transform: `translate(-50%, calc(-50% - ${centreY + label.offsetHeight}px))`, opacity: 0 }
    ], {
        duration: window.GEMS_GAIN_FLOAT_DURATION,
        easing: "ease-out",
        fill: "forwards"
    });
    anim.finished.then(() => label.remove(), () => label.remove());
}

/**
 * Awards gems for a completed item and plays the floating "+ N". Mutates window.profileData in
 * place without saving, exactly like updateDailyStreak and recordSessionActivity — the completion
 * path in writerOnComplete calls saveProfileData once at the end of the round
 */
function awardItemGems()
{
    window.profileData.gems += window.GEMS_PER_ITEM;

    // Keep the app-bar readout honest as the round runs — this is where the gem count changes most
    if (window.renderHeaderStats)
        window.renderHeaderStats();

    // The gems are banked first and the flourish is contained: a cosmetic animation must never be
    // able to abort the round it is celebrating, and this runs deep inside writerOnComplete where a
    // throw would strand the session mid-character
    try
    {
        floatGemsGain(window.GEMS_PER_ITEM);
    }
    catch (e)
    {
        console.error("Error: failed to play the gems animation", e);
    }
}

/**
 * Records one completed revision session against today's local calendar day for the activity
 * calendar on the account page. Keyed by the same timezone-independent localDayIndex the streak
 * uses, so a flat day -> count map covers any number of years and slices per-year trivially. Like
 * updateDailyStreak this does NOT save — the completion path in main-page.js calls saveProfileData
 * right after
 */
function recordSessionActivity()
{
    let data = window.profileData;
    if (!data.activityByDay)
        data.activityByDay = {};

    const day = localDayIndex(new Date());
    data.activityByDay[day] = (data.activityByDay[day] || 0) + 1;
}

/**
 * The session writer's onLoadCharDataError handler. A character with no stroke data (a card saved
 * before the editor validated it, or a database that failed to download) can never be drawn, so the
 * round moves past it instead of waiting on a quiz that will never start
 * @param { * } err - The load error hanzi-writer reports
 */
function writerOnMissingCharacter(err)
{
    console.warn("Warning: skipping a character with no stroke data", err);
    writerOnComplete({ skipped: true });
}

/**
 * Adds the round time elapsed since the last flush to the profile, so a round that is abandoned or
 * backgrounded still records the time actually spent in it. No-op outside a round
 */
function flushSessionTime()
{
    if (!window.bInTest)
        return;

    const now = Date.now();
    const elapsed = now - window.sessionTime;
    window.profileData.totalTimeInSessions += elapsed;
    window.roundActiveTime += elapsed;
    window.sessionTime = now;
}

// Madman10K: This function is fucking depressing I want to kill myself by just thinking that I have to modify anything here
async function writerOnComplete(result)
{
    // A skipped character (see writerOnMissingCharacter) advances the round like a completed one, but
    // nothing is drawn, scored, paid or counted for it
    const bSkipped = result !== null && typeof result === "object" && result.skipped === true;

    // Reward animation: snapshot the finished character and fly it into the progress counter, then
    // blink the counter as it ticks up. Kicked off up front so it runs regardless of which branch
    // below advances the session. Skipped under reduced motion, where only the counter pulses
    const counterEl = $("character-info-widget-errors");
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!bSkipped)
    {
        if (!reducedMotion)
            flyCharacterToCounter(counterEl);
        // The counter value updates when the next character loads, after WRITER_SLEEP_AFTER_COMPLETE -
        // pulse it then, in step with the flying copy's arrival
        setTimeout(() => blinkCounter(counterEl), window.WRITER_SLEEP_AFTER_COMPLETE);
    }

    // Go to the next card
    ++window.currentIndex;

    let data = window.profileData;

    // Calculate how many points to add to your knowledge
    const strokeNum = bSkipped ? 0 : window.writer._character.strokes.length;
    window.totalPhraseStrokes += strokeNum;

    // Accumulate every stroke the user drew this session (cards and phrase characters alike, and
    // each repeat in extensive mode) - this is the denominator for the recap accuracy percentage
    window.totalSessionStrokes += strokeNum;

    if (bSkipped)
    {
        // Nothing to score
    }
    else if (!window.bInPhrase)
    {
        data.cards[(window.currentIndex - 1)].knowledge = computeScore(strokeNum, window.errors, data.cards[(window.currentIndex - 1)].knowledge);
        // A card pays out per character. Characters drawn as part of a phrase deliberately do not —
        // the phrase pays out once, as a whole, when its last character lands (see below)
        awardItemGems();
    }
    else
    {
        const phraseChars = toCharacters(data.phrases[window.currentPhraseIndex].phrase);
        for (const card of data.cards)
        {
            if (phraseChars[(window.currentIndex - 1)] === card.character)
            {
                card.knowledge = computeScore(strokeNum, window.errors, card.knowledge);
                break;
            }
        }
    }

    // Reset the errors
    window.errors = 0;

    // Basically sleep. This is so we wait until the finished character animation finishes, but also because the animation
    // will not feel great if we just skip directly without some time with no animation after it plays.
    await new Promise(r => setTimeout(r, bSkipped ? window.WRITER_SKIP_MISSING_DELAY : window.WRITER_SLEEP_AFTER_COMPLETE));

    // This if statement handles switching to the next card
    if (!window.bInPhrase)
    {
        if (window.currentIndex < sessionRevisionCount(data.cards))
        {
            // If we just had a goto statement in this retarded language
            const f = () => {
                ++window.cardsReviewedCounter;
                let ref = data.cards[window.currentIndex];
                // With the variant: the round's first card always carried it, every later one didn't,
                // so Kanji and Hanja cards were quizzed in their Chinese form
                quizSessionCharacter(ref.character + (ref.variant || ""), ref);
                changeSidebarText(null, 0, ref, sessionRevisionCount(data.cards));
            }

            if (window.gameModifiers.extensive)
            {
                for (; window.currentIndex < sessionRevisionCount(data.cards); ++window.currentIndex)
                {
                    if (data.cards[window.currentIndex].knowledge <= window.extensiveModeLevel)
                    {
                        f();
                        return;
                    }
                }
            }
            else
            {
                f();
                return;
            }
        }
        window.totalPhraseStrokes = 0;
        window.currentIndex = 0;
        window.bInPhrase = true;
        $("phrase-info-widget").style.display = "block"; // Show the phrase info widget
    }

    // This code would be way more understandable and clearer if Javascript just had a goto statement
    if (window.currentPhraseIndex < sessionRevisionCount(data.phrases))
    {
        if (window.currentIndex >= toCharacters(data.phrases[window.currentPhraseIndex].phrase).length)
        {
            data.phrases[window.currentPhraseIndex].knowledge = computeScore(window.totalPhraseStrokes, window.totalPhraseErrors, data.phrases[window.currentPhraseIndex].knowledge);

            // The phrase is finished: pay out for it as a whole, the counterpart to the per-card
            // award above. Together they make a full session worth GEMS_PER_ITEM * (8 + 8). A phrase
            // whose every character was skipped was never written, so it earns nothing
            if (window.totalPhraseStrokes > 0)
                awardItemGems();

            // Both phrase totals start over for the next phrase; carrying the strokes over made every
            // later phrase look longer than it was and so scored its errors too leniently
            window.currentIndex = 0;
            ++window.currentPhraseIndex;
            window.totalPhraseErrors = 0;
            window.totalPhraseStrokes = 0;
        }

        // If the index is lower than the length
        if (window.currentPhraseIndex < sessionRevisionCount(data.phrases))
        {
            // A goto statement would have made this way simpler and way more readable
            if (window.gameModifiers.extensive)
            {
                for (; window.currentPhraseIndex < sessionRevisionCount(data.phrases); ++window.currentPhraseIndex)
                {
                    if (data.phrases[window.currentPhraseIndex].knowledge <= window.extensiveModeLevel)
                    {
                        resetPlayForPhrases(data);
                        return;
                    }
                }
            }
            else
            {
                resetPlayForPhrases(data);
                return;
            }
        }
    }

    if (window.extensiveModeLevel > 0 && window.gameModifiers.extensive)
    {
        --window.extensiveModeLevel;
        fisherYates(data.cards);
        fisherYates(data.phrases);

        for (; window.extensiveModeLevel >= 0; --window.extensiveModeLevel)
        {
            const cardCount = sessionRevisionCount(data.cards);
            for (let i = 0; i < cardCount; ++i)
            {
                if (data.cards[i].knowledge <= window.extensiveModeLevel)
                {
                    ++window.cardsReviewedCounter;
                    resetSessionData();
                    window.bInTest = true;
                    // writerOnComplete scores data.cards[currentIndex - 1] after incrementing the index,
                    // and carries on through the cards after it, so it has to point at the card being
                    // drawn rather than stay at the 0 resetSessionData left it at
                    window.currentIndex = i;

                    let ref = data.cards[i];
                    quizSessionCharacter(ref.character + (ref.variant || ""), ref);
                    changeSidebarText(null, 0, ref, cardCount);
                    return;
                }
            }
            const phraseCount = sessionRevisionCount(data.phrases);
            for (let i = 0; i < phraseCount; ++i)
            {
                if (data.phrases[i].knowledge <= window.extensiveModeLevel)
                {
                    resetSessionData();
                    $("phrase-info-widget").style.display = "block"

                    window.bInTest = true;
                    window.bInPhrase = true;

                    window.currentPhraseIndex = i;
                    resetPlayForPhrases(data);
                    return;
                }
            }
        }
    }

    // The round is over: remove the writer and hide the sidebar (the finished-round deck is shown
    // full-width). Capture the writer's rectangle first as a fallback fire target, in case it is
    // ever needed before a slide rect is available
    const writerRect = $("character-target-div").getBoundingClientRect();
    window.lastWriterRect = {
        left: writerRect.left + window.scrollX,
        top: writerRect.top + window.scrollY,
        width: writerRect.width,
        height: writerRect.height
    };
    $("character-target-div").remove();
    $("main-content").classList.remove("in-session");
    setSessionProgressVisible(false);

    // Save user data. The recap reports the round's active time, which excludes any stretch the tab
    // spent hidden (see the visibility handler in mainPageMain)
    flushSessionTime();
    const st = window.roundActiveTime;

    // A day only counts towards the daily streak when a round is fully completed. Persisted by the
    // saveProfileData call below. Starting or extending a streak gets a little celebration,
    // played on the streak slide itself from inside showFinishedSessionPage
    const bStreakAdvanced = updateDailyStreak();

    // The app bar shows the streak on every page, including this one; awardItemGems keeps the gem
    // half current during the round, and this is the one moment the streak half changes
    if (window.renderHeaderStats)
        window.renderHeaderStats();

    // Tally this completed session against today for the account-page activity calendar. Also
    // persisted by the saveProfileData call below
    recordSessionActivity();

    showFinishedSessionPage(st, bStreakAdvanced);

    // Reset data
    resetSessionData();
    window.cardsReviewedCounter = 1;
    window.phrasesReviewedCounter = 0;
    window.totalSessionErrors = 0;
    window.totalSessionStrokes = 0;
    window.extensiveModeLevel = window.MAX_KNOWLEDGE_LEVEL;

    // Recreate initial view
    saveProfileData(data).catch(() => {});
    fisherYates(data.cards);
    fisherYates(data.phrases);

    // A phone round swapped the header's links for an Exit link; put them back
    if (window.linkChildren !== null)
    {
        $("main-page-header").replaceChildren(...window.linkChildren);
        window.linkChildren = null;
    }
    document.body.classList.remove("session-immersive");
}

/**
 * The horizontal border width of the writer's frame. The writer is sized to the frame's inner box,
 * otherwise it is not truly centred. Read per side: the computed value of the border-width shorthand
 * is not available in every browser
 * @returns { number } - The combined left and right border width in pixels
 */
function writerBorderWidth()
{
    const frame = $("character-target-div");
    if (frame === null)
        return 0;

    const style = window.getComputedStyle(frame);
    return (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
}

/**
 * Wires the progress strip's "End round" control. Leaving mid-round is a plain navigation back to the
 * landing page — exactly what the mobile Exit link has always done — so no partial round is recorded.
 */
function setupSessionEndButton()
{
    const button = $("session-end-button");
    if (button === null)
        return;

    runEventAfterAnimation(button, "click", function() {
        // Record the time spent so far before leaving. Wait for the write, since navigating straight
        // away can abort it
        flushSessionTime();
        saveProfileData(window.profileData).catch(() => {}).then(() => {
            location.href = window.pageUrl("index");
        });
    });
}

function createStartButton()
{
    // Called for its side effects: getDrawElementHeight sizes the info widget and <main>. The round
    // itself re-measures once its chrome is on screen (see the click handler below)
    getDrawElementHeight();

    // Get start button, create if exists. It belongs to the idle block (the ring, heading and queue
    // line above it); the block is only absent if the markup changed, in which case fall back to the
    // section so the button still exists for the tutorial to wait on
    let startButton = $("start-button");
    if (startButton === null)
        startButton = addElement("button", lc.start_button_text, "start-button", "card-button-edit centered large-button-text", "", $("session-idle") || $("start-button-writer-section"));

    // The button used to be sized to the writer's square footprint, which made it a several-hundred
    // pixel block. It is a normal button now.
    renderSessionIdle();

    // When the button is clicked, we will create the writer view
    runEventAfterAnimation(startButton, "click", function(_)
    {
        // On a phone, make the experience more immersive by removing all buttons from the header, except
        // for the main page link. Also, add an exit button, even though it does the same as clicking
        // the main page link. Decided by the layout breakpoint rather than the user agent, so tablets
        // and phones get the layout the stylesheet actually gives them
        if (window.matchMedia(PHONE_LAYOUT_QUERY).matches)
        {
            // The wordmark is no longer the list's first child — it lives outside #main-page-header
            // in the app bar precisely so it survives this swap, so the whole list is replaced by
            // the Exit link rather than keeping children[0]
            const buttonList = $("main-page-header");
            window.linkChildren = [ ...buttonList.children ];

            const el = document.createElement("li");
            const link = document.createElement("a");
            link.className = "nav-link";
            link.textContent = lc.session_exit;
            link.setAttribute("href", window.pageUrl("index"));

            el.appendChild(link);
            buttonList.replaceChildren(el);

            // The phone tab bar would otherwise sit under the writer offering four ways to leave
            // mid-round; hide it for the duration and restore it in resetSessionData
            document.body.classList.add("session-immersive");
        }

        // Remove the start session button and set the global to indicate that we're in a test
        $("start-button").remove();
        window.bInTest = true;

        // Reveal the sidebar for the duration of the revision round (see styles/pages/index.css). It is removed
        // again in writerOnComplete when we switch to the finished-round slide deck
        $("main-content").classList.add("in-session");

        // The progress strip is measured by getDrawElementHeight, so it has to be visible before the
        // writer is sized below — otherwise the writer is laid out for a viewport that is 53px taller
        setSessionProgressVisible(true);

        // Re-measure now that the round's chrome is on screen. The height captured at the top of
        // createStartButton() described the idle page, which has no progress strip and (per
        // index.css) no divider above the footer, so reusing it oversizes the writer by both
        const sessionDrawHeight = getDrawElementHeight();

        // Append HTML for the writer background, which is just a star. insertAdjacentHTML parses only
        // this fragment and appends it, rather than innerHTML += which reserializes and reparses the
        // section's existing DOM (and would drop any listeners already bound inside it)
        const page = $("start-button-writer-section");
        page.insertAdjacentHTML("beforeend", `
            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" id="character-target-div" class="centered character-div character-prop">
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="#DDD" />
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="#DDD" />
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#DDD" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#DDD" />
            </svg>
        `);

        let data = window.profileData;

        // Subtract the writer border, since the element will not be truly centered otherwise
        const borderWidth = writerBorderWidth();
        window.writer = createWriter('character-target-div', data.cards[window.currentIndex].character + data.cards[window.currentIndex].variant, {
            width: sessionDrawHeight - borderWidth,
            height: sessionDrawHeight - borderWidth,
            showCharacter: false,
            showHintAfterMisses: window.WRITER_SHOW_HINT_ON_ERRORS,
            onLoadCharDataError: writerOnMissingCharacter,
        });
        ignoreWriterFailure(window.writer.quiz({
            onMistake: writerOnMistake,
            onComplete: writerOnComplete,
            onCorrectStroke: writerOnCorrectStroke,
        }));

        // Modify sidebar text, as well as statistics data
        setWriterState(data.cards[window.currentIndex]);
        changeSidebarText(null, 0, data.cards[window.currentIndex], sessionRevisionCount(data.cards));
        const now = Date.now();
        window.sessionTime = now;
        window.roundActiveTime = 0;
        window.extensiveModeLevel = window.MAX_KNOWLEDGE_LEVEL;

        data.sessions++;
        data.lastDate = now;
    });
}

function mainPageMain()
{
    getDrawElementHeight();
    setupSessionEndButton();

    // If there are no cards there, create a widget to inform the user that they need to create a deck
    if (window.profileData.cards.length === 0)
    {
        // The whole idle block goes, not just the button: its ring and "what is queued" line describe
        // a round that cannot be started yet
        const idle = $("session-idle");
        if (idle !== null)
            idle.remove();
        else
            $("start-button").remove();

        let link = document.createElement("a");
        link.href = window.pageUrl("deck")
        link.appendChild(document.createTextNode(lc.no_cards_link_deck));

        // Keep the whole sentence in one inline span so it flows/wraps naturally; the h1 then just
        // centres that single span both horizontally and vertically (see .no-cards-message)
        let message = document.createElement("span");
        message.textContent = lc.no_cards_text
        message.appendChild(link);
        message.appendChild(document.createTextNode(lc.no_cards_text_postfix))

        let el = document.createElement("h1");
        el.className = "centered no-cards-message"
        el.appendChild(message);

        $("start-button-writer-section").appendChild(el);
        return;
    }

    createStartButton();

    // Function to be called on the window resize event. This is needed because of a number of custom calculations we perform
    // to compute the width and height of the writer widget/start button from Javascript
    const notify = function() {
        // Called for the side effect too: getDrawElementHeight sizes the info widget and main
        const newDrawElementHeight = getDrawElementHeight();
        if (window.bInTest)
        {
            // Same border subtraction as when the writer was created, or every resize grows it
            const size = newDrawElementHeight - writerBorderWidth();
            window.writer.updateDimensions({ width: size, height: size });
        }
        else
            renderSessionIdle();
    };

    // notify recomputes geometry through getDrawElementHeight (layout reads + writes) and can call
    // writer.updateDimensions, so running it on every resize event the browser fires during a window
    // drag thrashes layout. Debounce it so it runs once the resize settles, mirroring the deck page's
    // DECK_RESIZE_DEBOUNCE_MS
    let resizeTimer = null;
    window.addEventListener("resize", function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(notify, MAIN_PAGE_RESIZE_DEBOUNCE_MS);
    });

    // getDrawElementHeight measures the header/footer chrome, but this can run before the Ubuntu
    // webfont has loaded and before twemoji has swapped the app bar's emoji for images. Both change the
    // chrome's height afterwards, which would leave the page sized for stale chrome (the "works half
    // the time / needs a refresh" symptom noted on getDrawElementHeight), so recompute once each has
    // settled. This runs after the profile loads, by which point the load event has often fired
    // already, so check for that rather than only listening
    if (document.fonts && document.fonts.ready)
        document.fonts.ready.then(notify);
    if (document.readyState === "complete")
        notify();
    else
        window.addEventListener("load", notify, { once: true });

    // Keep an unfinished round's progress (time spent, knowledge changes, gems) when the tab is hidden
    // or closed. visibilitychange is the last event mobile browsers reliably deliver, and pagehide
    // covers a desktop close; an IndexedDB write from beforeunload was usually torn down with the page.
    // Time the tab spends hidden is not counted: the clock restarts when it becomes visible again.
    // Only mid-round: an idle page has nothing unsaved, and saving there would also wake other tabs
    document.addEventListener("visibilitychange", function()
    {
        if (!window.bInTest)
            return;

        if (document.visibilityState === "hidden")
        {
            flushSessionTime();
            saveProfileData(window.profileData).catch(() => {});
        }
        else
            window.sessionTime = Date.now();
    });
    window.addEventListener("pagehide", function()
    {
        if (!window.bInTest)
            return;

        flushSessionTime();
        saveProfileData(window.profileData).catch(() => {});
    });

    // Shuffle the cards
    fisherYates(window.profileData.cards);
    fisherYates(window.profileData.phrases);
}

// Wait until index.js has loaded the profile data from IndexedDB before starting the practice page
window.storageReady.then(() => mainPageMain());
