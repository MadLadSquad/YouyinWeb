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
window.sessionTime = 0;

window.bMobile = false;

window.linkChildren = null;

window.extensiveModeLevel = 4;

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
    window.bMobile = navigator.userAgent.toLowerCase().includes("mobile");

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
 * Builds the round-summary card that forms the final slide: an accuracy ring, the round's three
 * headline numbers, and the gems and streak chips. Everything shown is already computed for the
 * per-stat slides that precede it; nothing new is tracked.
 * @param { HTMLElement } slide - The slide to build into
 * @param { Object } entry - The summary descriptor { accuracy, items, errors, time, gems, streak }
 */
function buildFinishSummary(slide, entry)
{
    const card = addElement("div", "", "", "finish-summary", "", slide);

    // Accuracy ring. Radius 52 to match the idle screen's goal ring, so the two read as one family
    const ring = addElement("div", "", "", "finish-summary-ring", "", card);
    const circumference = 2 * Math.PI * 52;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
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
            // Drawn from empty; the CSS transition below fills it once the slide has landed
            circle.style.setProperty("stroke-dashoffset", circumference.toFixed(1));
            slide.addEventListener("animationend", () => {
                circle.style.setProperty("stroke-dashoffset",
                    (circumference * (1 - entry.accuracy / 100)).toFixed(1));
            }, { once: true });
        }
        svg.appendChild(circle);
    }
    ring.appendChild(svg);

    const ringInner = addElement("div", "", "", "finish-summary-ring-inner", "", ring);
    addElement("span", `${entry.accuracy}%`, "", "t-num finish-summary-accuracy", "", ringInner);
    addElement("span", lc.finish_page_accuracy, "", "stat-label", "", ringInner);

    addElement("h3", entry.text, "", "finish-summary-title", "", card);

    const stats = addElement("div", "", "", "finish-summary-stats", "", card);
    // Reuses the exact labels the individual slides just showed, so the summary reads as a recap
    const rows = [
        { label: lc.finish_page_characters_reviewed, value: entry.characters },
        { label: lc.finish_page_phrases_reviewed, value: entry.phrases },
        { label: lc.finish_page_session_len, value: entry.time }
    ];
    for (const row of rows)
    {
        const tile = addElement("div", "", "", "finish-summary-stat", "", stats);
        addElement("span", row.label, "", "stat-label", "", tile);
        addElement("span", row.value, "", "t-num-sm", "", tile);
    }

    const chips = addElement("div", "", "", "finish-summary-chips", "", card);
    addElement("span", lc.gems_gain.replace("{gems}", entry.gems), "", "chip chip-accent", "", chips);
    if (entry.streakText !== "")
        addElement("span", entry.streakText, "", "chip", "", chips);

    return card;
}

/**
 * Expands the finished-round stage into whatever vertical space is actually free below it.
 *
 * The stage starts out the size of the writer it replaces, which is a square: on a phone that square
 * is bounded by the screen's *width*, so it stops well short of the bottom of the screen and the
 * recap ends up sitting high with a band of dead space under it. The slides centre their contents in
 * the stage, so handing the stage the leftover height is all it takes to centre the recap on the
 * screen. Landscape and desktop are width-generous and height-bound, so there the writer square is
 * already about as tall as the space allows and this is a no-op.
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
        container.style.setProperty("height", Math.floor(available) + "px");
}

/**
 * Makes sure the slide deck's stage is tall enough for whatever the given slide holds. The stage is
 * sized to the square the writer occupied, which is the right footprint for the one-line stat
 * slides but not for the summary: on a small phone in portrait that square is barely taller than
 * the card, and since the stage clips (overflow:hidden) and the slide centres its content, the ring
 * lost its top and the Continue button lost its bottom. Growing the stage pushes the page down
 * instead, which scrolls. Measures the slide's actual children (the summary card and the Continue
 * button, both already built by the time this runs) rather than reserving a guessed button height.
 * @param { HTMLElement } slide - The summary slide (absolutely positioned, so it cannot grow it)
 */
function growFinishStage(slide)
{
    const stage = slide.parentElement;
    if (stage === null)
        return;

    const PADDING = 24;
    const gap = parseFloat(window.getComputedStyle(slide).rowGap) || 0;

    let needed = PADDING;
    for (let i = 0; i < slide.children.length; i++)
        needed += slide.children[i].getBoundingClientRect().height + (i > 0 ? gap : 0);

    if (needed > stage.getBoundingClientRect().height)
        stage.style.setProperty("height", `${Math.ceil(needed)}px`);
}

/**
 * Shows the finished-round stats one slide at a time. Each slide slides in from the right over the
 * previous one (slides are opaque), and the covered slide is then removed so only the current stat
 * stays on screen. The streak slide, if present, is the last one, and its fire celebration kicks
 * off as it begins sliding over. The final stat stays put and addFinishContinueButton drops the
 * Continue button in below it.
 * @param { Array } stats - Per-slide { text, streak? } descriptors
 * @param { number } i - Current index into the stats array
 * @param { HTMLElement } container - The deck stage the slides stack inside
 * @param { HTMLElement | null } previous - The slide to remove once this one has covered it
 */
function slideInFinishStat(stats, i, container, previous)
{
    if (i >= stats.length)
        return;

    const entry = stats[i];
    let slide = addElement("div", "", "", "finish-slide slide-able", "", container);

    // The last slide is the round summary rather than another single line. It rides the same
    // slide-from-right animation and the same animationend chain as every other slide — only its
    // contents differ — so the sequence and its timing are unchanged.
    // The Continue button is built into it here, before it animates, so the recap and the button
    // arrive together in one movement instead of the button sliding in separately afterwards.
    if (entry.card)
    {
        buildFinishSummary(slide, entry);
        addFinishContinueButton(slide);
        growFinishStage(slide);
    }
    else
        addElement("h3", entry.text, "", "", "", slide);

    // The fire celebration starts the moment the streak slide begins sliding over. The slide itself
    // is still off to the right at this point, so aim the burst at the stage it is sliding into
    if (entry.streak)
    {
        slide.addEventListener("animationstart", (_) => {
            const r = container.getBoundingClientRect();
            playStreakFireAnimation({
                left: r.left + window.scrollX,
                top: r.top + window.scrollY,
                width: r.width,
                height: r.height
            });
        }, { once: true });
    }

    slide.addEventListener("animationend", (_) => {
        // The incoming slide has fully covered the previous one, so drop it now
        if (previous !== null)
            previous.remove();

        // The last slide already carries its Continue button, so there is nothing left to chain
        if (i < stats.length - 1)
            slideInFinishStat(stats, i + 1, container, slide);
    }, { once: true });
}

/**
 * Appends the Continue button below the round summary. It shares that slide (a centred column), so
 * it sits under the recap rather than covering it, slides in with it, and dismisses the
 * finished-round screen on click.
 * @param { HTMLElement } slide - The summary slide to append the button to
 */
function addFinishContinueButton(slide)
{
    const button = addElement("button", lc.finish_page_continue, "", "card-button-edit finish-continue", "", slide);
    runEventAfterAnimation(button, "click", (_) => {
        $("finished-session-section").remove();
        createStartButton();
        resetSidebar();
    });
}

/**
 * Celebrates a user who just advanced their daily streak (started a new one or extended it): fire
 * emojis fly out from the bottom of the play field and burn out on the way up. The twemoji
 * MutationObserver picks the emojis up automatically, so they render as SVGs like everywhere else
 * on the site. Skipped entirely for users who prefer reduced motion
 * @param { Object } rect - Document-space { left, top, width, height } the burst covers. Defaults
 *                          to the writer area the play field occupied; the finished-round deck
 *                          passes the streak slide's rectangle so the fire plays over that slide
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

function showFinishedSessionPage(st, bStreakAdvanced)
{
    const result = getLocalisedTimePostfix(st);

    let mainContainer = $("start-button-writer-section");
    let container = addElement("section", "", "finished-session-section", "centered", "", mainContainer);
    // Give the deck the same footprint the writer had, so the stacked slides have room to overlap
    container.style.setProperty("height", getDrawElementHeight() + "px");
    growFinishStageToViewport(container);

    // One entry per stat slide, in arrival order. The streak slide is flagged so we can burst the
    // fire over it. The Continue button is not a slide of its own - it is built into the final
    // summary slide and slides in with it.
    const stats = [
        { text: lc.finish_page_header },
        { text: `${lc.finish_page_characters_reviewed}: ${window.cardsReviewedCounter}` },
        { text: `${lc.finish_page_phrases_reviewed}: ${window.phrasesReviewedCounter}` },
        { text: `${lc.finish_page_accuracy}: ${computeSessionAccuracy()}%` },
        { text: `${lc.finish_page_session_len}: ${formatDecimal(result.time)}${result.postfix}` }
    ];

    // Rounds that started or extended the daily streak get to brag about its new length. The
    // singular/plural wording was resolved at build time by the ui18n switch pattern; here we
    // only pick the right baked variant and fill in the count
    let streakText = "";
    if (bStreakAdvanced)
    {
        const streak = window.profileData.streak;
        streakText = (streak === 1 ? lc.finish_page_streak_increased_one : lc.finish_page_streak_increased)
            .replace("{streak}", streak);
        stats.push({ text: streakText, streak: true });
    }

    // The round summary lands last, after the individual stats have slid past. Gems are derived, not
    // tracked: awardItemGems pays GEMS_PER_ITEM per completed card and per completed whole phrase
    stats.push({
        card: true,
        text: lc.finish_page_header,
        accuracy: computeSessionAccuracy(),
        characters: window.cardsReviewedCounter,
        phrases: window.phrasesReviewedCounter,
        time: `${formatDecimal(result.time)}${result.postfix}`,
        gems: (window.cardsReviewedCounter + window.phrasesReviewedCounter) * window.GEMS_PER_ITEM,
        streakText: streakText
    });

    slideInFinishStat(stats, 0, container, null);
}

function setWriterState(ref)
{
    // Set the default writer state. Certain knowledge levels have certain features enabled/disabled
    window.writer._options.showHintAfterMisses = 3;
    window.writer.updateColor("radicalColor", null);
    if (ref.knowledge >= 3)
    {
        window.writer.hideOutline();
    }
    else if (ref.knowledge >= 2)
    {
        window.writer._options.showHintAfterMisses = window.WRITER_SHOW_HINT_ON_ERRORS_LVL_3;
        window.writer.hideOutline();
    }
    else if (ref.knowledge >= 1)
    {
        window.writer.showOutline();
    }
    else
    {
        window.writer.updateColor("radicalColor", window.WRITER_RADICAL_COLOUR);
        window.writer.showOutline();
    }
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
            setWriterState(card);
            break;
        }
    }
    // Revert to using the phrase score if no card is found
    if (card === null)
        setWriterState(currentPhrase);

    window.writer.setCharacter(phraseChars[window.currentIndex])
    window.writer.quiz();
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

// Madman10K: This function is fucking depressing I want to kill myself by just thinking that I have to modify anything here
async function writerOnComplete(_)
{
    // Reward animation: snapshot the finished character and fly it into the progress counter, then
    // blink the counter as it ticks up. Kicked off up front so it runs regardless of which branch
    // below advances the session. Skipped under reduced motion, where only the counter pulses
    const counterEl = $("character-info-widget-errors");
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion)
        flyCharacterToCounter(counterEl);
    // The counter value updates when the next character loads, after WRITER_SLEEP_AFTER_COMPLETE -
    // pulse it then, in step with the flying copy's arrival
    setTimeout(() => blinkCounter(counterEl), window.WRITER_SLEEP_AFTER_COMPLETE);

    // Go to the next card
    ++window.currentIndex;

    let data = window.profileData;

    // Calculate how many points to add to your knowledge
    const strokeNum = window.writer._character.strokes.length;
    window.totalPhraseStrokes += strokeNum;

    // Accumulate every stroke the user drew this session (cards and phrase characters alike, and
    // each repeat in extensive mode) - this is the denominator for the recap accuracy percentage
    window.totalSessionStrokes += strokeNum;

    if (!window.bInPhrase)
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
    await new Promise(r => setTimeout(r, window.WRITER_SLEEP_AFTER_COMPLETE));

    // This if statement handles switching to the next card
    if (!window.bInPhrase)
    {
        if (window.currentIndex < sessionRevisionCount(data.cards))
        {
            // If we just had a goto statement in this retarded language
            const f = () => {
                ++window.cardsReviewedCounter;
                let ref = data.cards[window.currentIndex];

                setWriterState(ref);
                window.writer.setCharacter(ref.character);

                window.writer.quiz();
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
            // award above. Together they make a full session worth GEMS_PER_ITEM * (8 + 8)
            awardItemGems();

            window.currentIndex = 0;
            ++window.currentPhraseIndex;
            window.totalPhraseErrors = 0;
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

                    let ref = data.cards[i];
                    setWriterState(ref);
                    window.writer.setCharacter(ref.character);

                    window.writer.quiz();
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

    // Save user data
    const now = Date.now();
    const st = (now - window.sessionTime);
    data.totalTimeInSessions += st;
    window.sessionTime = now;

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

    // Recreate initial view
    saveProfileData(data);
    fisherYates(data.cards);
    fisherYates(data.phrases);

    // On mobile, we remove all header elements when playing, so re-add them
    if (window.bMobile)
    {
        $("main-page-header").replaceChildren(...window.linkChildren);
        document.body.classList.remove("session-immersive");
    }
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
        location.href = "./index.html";
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
        // Make the experience more immersive by removing all buttons from the header, except for the main page link.
        // Also, add an exit button, even though it does the same as clicking the main page link.
        if (window.bMobile)
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
            link.setAttribute("href", "./index.html");

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

        // Get the width of the writer border, since the element will not be truly centered if we do not subtract from it
        const borderWidth = window.getComputedStyle($("character-target-div")).borderWidth.replace("px", "") * 2;
        window.writer = createWriter('character-target-div', data.cards[window.currentIndex].character + data.cards[window.currentIndex].variant, {
            width: sessionDrawHeight - borderWidth,
            height: sessionDrawHeight - borderWidth,
            showCharacter: false,
            showHintAfterMisses: window.WRITER_SHOW_HINT_ON_ERRORS,
        });
        window.writer.quiz({
            onMistake: writerOnMistake,
            onComplete: writerOnComplete,
            onCorrectStroke: writerOnCorrectStroke,
        });

        // Modify sidebar text, as well as statistics data
        setWriterState(data.cards[window.currentIndex]);
        changeSidebarText(null, 0, data.cards[window.currentIndex], sessionRevisionCount(data.cards));
        const now = Date.now();
        window.sessionTime = now;

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
        link.href = "./deck.html"
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
        if (bInTest)
            window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
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

    // getDrawElementHeight sizes the start button from getBoundingClientRect reads of the header/footer
    // chrome, but those are taken now - before the Ubuntu webfont loads and before twemoji swaps the
    // footer's 🎨 for an <img>. Both change the chrome's measured height afterwards, leaving the button
    // sized for stale (shorter) chrome so the landing page overflows the viewport on portrait (the
    // "works half the time / needs a refresh" symptom noted on getDrawElementHeight). Recompute once
    // each settles. window load also covers the deferred twemoji script having executed and its emoji
    // images having loaded.
    if (document.fonts && document.fonts.ready)
        document.fonts.ready.then(notify);
    window.addEventListener("load", notify);

    // Add this event to make sure to save any data if we close the tab
    window.addEventListener("beforeunload", function(_)
    {
        if (bInTest)
            window.profileData.totalTimeInSessions += (Date.now() - window.sessionTime);
        saveProfileData(window.profileData);
    });

    // Shuffle the cards
    fisherYates(window.profileData.cards);
    fisherYates(window.profileData.phrases);
}

// Wait until index.js has loaded the profile data from IndexedDB before starting the practice page
window.storageReady.then(() => mainPageMain());
