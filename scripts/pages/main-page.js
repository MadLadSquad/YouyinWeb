'use strict';

// ------------------- CONSTANT BLOCK EDIT IF RUNNING ON A CUSTOM SYSTEM ------------------
window.MAX_POINTS_ON_CHARACTER = 0.05;
window.ADD_POINTS_ON_ERROR_3_4 = 0.0375;            // 3/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_2 = 0.025;             // 1/2 or 2/4 of 0.05
window.ADD_POINTS_ON_ERROR_1_4 = 0.0125;            // 1/4 of 0.05

// Hard cap on how many cards and how many phrases may be revised in a single play session. Decks
// larger than this are shuffled and only the first entries are revised, so each session draws a
// random subset of at most this many cards and (separately) this many phrases
window.MAX_SESSION_REVISION_ITEMS = 8;

window.WRITER_SLEEP_AFTER_COMPLETE = 1200;          // In ms
// How long the completed-character "fly into the progress counter" animation lasts. It is timed to
// land right as the next character loads (after WRITER_SLEEP_AFTER_COMPLETE), so the snapshot sits
// invisibly on top during the admire beat, then flies for the last stretch of the pause
window.WRITER_FLY_TO_COUNTER_DURATION = 650;        // In ms

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
    const parentBottom = html.getBoundingClientRect().bottom;
    const lastChildBottom = html.lastElementChild.getBoundingClientRect().bottom;
    // The header (incl. its margin-top) and the hr between main and footer also eat vertical space
    // outside main, so subtract them too — otherwise the page overflows the viewport.
    const headerBottom = document.querySelector("header").getBoundingClientRect().bottom;
    const hrHeight = $("main-page-hr").getBoundingClientRect().height;
    const listWidgetHeight = listWidget.getBoundingClientRect().height;
    const footerHeight = footer.getBoundingClientRect().height;
    const mainWidth = mainEl.getBoundingClientRect().width;
    const sectionPaddingLeft = getComputedStyle(startButtonWriterSection).paddingLeft.replace("px", "") * 2;
    const viewportHeight = window.innerHeight;

    // The list widget causes problems, so we account for the space it (and the chrome) occupies
    const unusedSpace = parentBottom - lastChildBottom;
    window.bMobile = navigator.userAgent.toLowerCase().includes("mobile");

    const isPortrait = window.matchMedia("(orientation: portrait)").matches;
    if (isPortrait)
    {
        // Calculate a static maximum height for the card info box
        const targetInfoHeight = 120;
        listWidget.style.setProperty("height", targetInfoHeight + "px");

        // Calculate the writer height to fit the remaining space
        const availableWriterHeight = viewportHeight - headerBottom - footerHeight - hrHeight - unusedSpace - targetInfoHeight - 16;
        let finalHeight = Math.min(mainWidth - sectionPaddingLeft, availableWriterHeight);
        if (finalHeight < 100)
            finalHeight = 100;

        return finalHeight;
    }

    let finalHeight = viewportHeight - unusedSpace + listWidgetHeight;
    if (window.bMobile)
        finalHeight -= (footerHeight + headerBottom + hrHeight);
    else
        finalHeight -= (listWidgetHeight + footerHeight + headerBottom + hrHeight);

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
        return;
    }
    definitionParagraph.style.display = "block";
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

        if (i === stats.length - 1)
            addFinishContinueButton(slide);
        else
            slideInFinishStat(stats, i + 1, container, slide);
    }, { once: true });
}

/**
 * Slides the Continue button in below the final stat. It shares that slide (a centred column), so
 * it sits under the text rather than covering it, and dismisses the finished-round screen on click.
 * @param { HTMLElement } slide - The final stat slide to append the button to
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

    // One entry per stat slide, in arrival order. The streak slide is flagged so we can burst the
    // fire over it. The Continue button is not a slide of its own - it lands below the final stat.
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
    if (bStreakAdvanced)
    {
        const streak = window.profileData.streak;
        const text = (streak === 1 ? lc.finish_page_streak_increased_one : lc.finish_page_streak_increased)
            .replace("{streak}", streak);
        stats.push({ text: text, streak: true });
    }

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
        data.cards[(window.currentIndex - 1)].knowledge = computeScore(strokeNum, window.errors, data.cards[(window.currentIndex - 1)].knowledge);
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

    // Save user data
    const now = Date.now();
    const st = (now - window.sessionTime);
    data.totalTimeInSessions += st;
    window.sessionTime = now;

    // A day only counts towards the daily streak when a round is fully completed. Persisted by the
    // saveProfileData call below. Starting or extending a streak gets a little celebration,
    // played on the streak slide itself from inside showFinishedSessionPage
    const bStreakAdvanced = updateDailyStreak();

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
        $("main-page-header").replaceChildren(...window.linkChildren);
}

function createStartButton()
{
    // Get the desired element height. These calculations will be used for the start button and
    // drawing widget
    const drawElementHeight = getDrawElementHeight();

    // Get start button, create if exists
    let startButton = $("start-button");
    if (startButton === null)
        startButton = addElement("button", lc.start_button_text, "start-button", "card-button-edit centered character-prop large-button-text", "", $("start-button-writer-section"));

    // Set the button width
    startButton.style.setProperty("width", drawElementHeight + "px");
    startButton.style.setProperty("height", drawElementHeight + "px");

    // When the button is clicked, we will create the writer view
    runEventAfterAnimation(startButton, "click", function(_)
    {
        // Make the experience more immersive by removing all buttons from the header, except for the main page link.
        // Also, add an exit button, even though it does the same as clicking the main page link.
        if (window.bMobile)
        {
            const buttonList = $("main-page-header");
            window.linkChildren = [ ...buttonList.children ];
            const headerHome = buttonList.children[0];

            buttonList.replaceChildren(headerHome);

            const el = document.createElement("li");
            const link = document.createElement("a");
            link.textContent = "Exit"
            link.setAttribute("href", "./index.html");

            el.appendChild(link);
            buttonList.appendChild(el);
        }

        // Remove the start session button and set the global to indicate that we're in a test
        $("start-button").remove();
        window.bInTest = true;

        // Reveal the sidebar for the duration of the revision round (see styles/pages/index.css). It is removed
        // again in writerOnComplete when we switch to the finished-round slide deck
        $("main-content").classList.add("in-session");

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
            width: drawElementHeight - borderWidth,
            height: drawElementHeight - borderWidth,
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

    // If there are no cards there, create a widget to inform the user that they need to create a deck
    if (window.profileData.cards.length === 0)
    {
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
        const newDrawElementHeight = getDrawElementHeight();
        const startButton = $("start-button");
        if (bInTest)
        {
            window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
        }
        else if (startButton !== null)
        {
            startButton.style.setProperty("width", newDrawElementHeight + "px");
            startButton.style.setProperty("height", newDrawElementHeight + "px");
        }
        //window.writer.updateDimensions({ width: newDrawElementHeight, height: newDrawElementHeight });
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
window.youyinStorageReady.then(() => mainPageMain());
