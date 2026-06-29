'use strict';
// GitHub/Monkeytype-style activity heatmap for the account page. Renders a year grid where each day
// fills more strongly the more revision sessions the user completed that day, plus a year sidebar to
// browse previous years. Reads window.profileData.activityByDay (a flat localDayIndex -> count map
// written on session completion by recordSessionActivity in daily-streak.js).
//
// Theme sync is intentionally pure CSS: cells carry a data-level attribute and styles/components/
// activity-calendar.css derives their colour from the theme's CSS custom properties via color-mix,
// so the grid retints automatically (with the 400ms theme fade) when the theme changes — no JS.

/**
 * Maps the number of completed sessions on a day to one of five intensity levels (0 = none .. 4 =
 * heaviest), mirroring GitHub's contribution scale. Thresholds are fixed and intentionally simple
 * @param { number } count - Sessions completed that day
 * @returns { number } - Level 0..4
 */
function activityLevel(count)
{
    if (!count) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 5) return 3;
    return 4;
}

/**
 * Small DOM helper local to the widget: creates an element, optionally classes it and appends it to
 * a parent. Kept separate from index.js's addElement, whose positional id/data arguments aren't a
 * good fit for the many small, id-less nodes this grid builds
 * @param { string } tag - Element tag name
 * @param { string } className - Class to apply (falsy to skip)
 * @param { HTMLElement } parent - Parent to append to (falsy to skip)
 * @returns { HTMLElement } - The created element
 */
function acElement(tag, className, parent)
{
    const el = document.createElement(tag);
    if (className)
        el.className = className;
    if (parent)
        parent.appendChild(el);
    return el;
}

/**
 * Builds the localized hover tooltip for a single day cell, picking the singular/plural/empty
 * wording from the lc strings (see scripts/data/i18n.js)
 * @param { Date } date - The calendar day
 * @param { number } count - Sessions completed that day
 * @returns { string } - Tooltip text
 */
function activityTooltip(date, count)
{
    const day = date.toLocaleDateString(lc.locale, { year: "numeric", month: "long", day: "numeric" });
    let template;
    if (count === 0)
        template = lc.activity_tooltip_none;
    else if (count === 1)
        template = lc.activity_tooltip_one;
    else
        template = lc.activity_tooltip;

    return template.replace("{count}", count).replace("{date}", day);
}

/**
 * Splits a calendar year into week columns (the layout unit of the grid). Each week is a 7-slot
 * array indexed by getDay() (0 = Sunday .. 6 = Saturday); slots outside the rendered range are null
 * so the first and last weeks render with blank leading/trailing cells, like GitHub. A new column
 * starts on every Sunday. Future days are never rendered: the current year stops at today (past
 * years run through December)
 * @param { number } year - The calendar year
 * @param { Object } activity - The activityByDay map (localDayIndex -> count)
 * @returns { Array<Array<?{date: Date, count: number}>> } - Week columns
 */
function activityWeeksForYear(year, activity)
{
    const weeks = [];
    let week = new Array(7).fill(null);

    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const cursor = new Date(year, 0, 1);

    // Cap at today so future days stay blank rather than rendering as empty dots. Past years end on
    // Dec 31; the current year ends on today (today's local midnight still precedes the live time)
    const today = new Date();
    const end = today < dec31 ? today : dec31;

    while (cursor <= end)
    {
        const weekday = cursor.getDay();

        // Every Sunday opens a fresh column; the year's very first day never does, so a year that
        // starts on a Sunday doesn't emit an empty leading column
        if (weekday === 0 && cursor.getTime() !== jan1.getTime())
        {
            weeks.push(week);
            week = new Array(7).fill(null);
        }

        week[weekday] = { date: new Date(cursor), count: activity[localDayIndex(cursor)] || 0 };
        cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);

    return weeks;
}

/**
 * (Re)builds the heatmap grid for one year into the given graph element: the month labels row, the
 * weekday labels column and the day cells. Replaces any previous contents so it can be called on
 * every year switch
 * @param { HTMLElement } graph - The .activity-graph container
 * @param { number } year - The year to render
 * @param { Object } activity - The activityByDay map
 */
function buildActivityGraph(graph, year, activity)
{
    graph.replaceChildren();
    const weeks = activityWeeksForYear(year, activity);

    // Top-left spacer keeps the month row aligned with the cells and the weekday column aligned with
    // the rows inside the 2x2 CSS grid
    acElement("div", "activity-corner", graph);

    // Month labels: one slot per week column (same width + gap as the cells below, so they line up).
    // Label a month above the first week in which its days appear
    const monthsRow = acElement("div", "activity-months", graph);
    let lastMonth = -1;
    for (const week of weeks)
    {
        const slot = acElement("div", "activity-month-slot", monthsRow);
        const firstReal = week.find((cell) => cell !== null);
        if (firstReal)
        {
            const month = firstReal.date.getMonth();
            if (month !== lastMonth)
            {
                slot.textContent = firstReal.date.toLocaleDateString(lc.locale, { month: "short" });
                lastMonth = month;
            }
        }
    }

    // Weekday labels down the left: only Mon/Wed/Fri are shown (like GitHub) to save space. Jan 1
    // 2023 was a Sunday, so new Date(2023, 0, 1 + wd) is a date whose weekday is wd
    const weekdays = acElement("div", "activity-weekdays", graph);
    for (let wd = 0; wd < 7; wd++)
    {
        const label = acElement("div", "activity-weekday", weekdays);
        if (wd === 1 || wd === 3 || wd === 5)
            label.textContent = new Date(2023, 0, 1 + wd).toLocaleDateString(lc.locale, { weekday: "short" });
    }

    // Day cells, column by column. Empty slots (outside the year) stay invisible but hold their space
    const cells = acElement("div", "activity-cells", graph);
    for (const week of weeks)
    {
        const column = acElement("div", "activity-week", cells);
        for (let wd = 0; wd < 7; wd++)
        {
            const cell = acElement("div", "activity-cell", column);
            const day = week[wd];
            if (day === null)
            {
                cell.classList.add("activity-cell-empty");
            }
            else
            {
                cell.setAttribute("data-level", activityLevel(day.count));
                cell.title = activityTooltip(day.date, day.count);
            }
        }
    }
}

/**
 * Builds the "Less [][][][][] More" intensity legend. The swatches reuse the same data-level styling
 * as real cells, so they stay theme-synced for free
 * @returns { HTMLElement } - The legend element
 */
function buildActivityLegend()
{
    const legend = acElement("div", "activity-legend", null);

    const less = acElement("span", "activity-legend-label", legend);
    less.textContent = lc.activity_legend_less;

    for (let level = 0; level <= 4; level++)
        acElement("div", "activity-cell activity-legend-swatch", legend).setAttribute("data-level", level);

    const more = acElement("span", "activity-legend-label", legend);
    more.textContent = lc.activity_legend_more;

    return legend;
}

/**
 * Renders the full activity calendar (grid + year sidebar) into the given container. Safe to call
 * more than once — it clears the container first. Needs only window.profileData, so the account page
 * calls it from a youyinProfileReady microtask
 * @param { string } containerId - ID of the element to render into
 */
function renderActivityCalendar(containerId)
{
    const container = $(containerId);
    if (container === null)
        return;

    container.replaceChildren();

    const activity = (window.profileData && window.profileData.activityByDay) || {};
    const currentYear = new Date().getFullYear();

    // Years that have any activity, plus the current year (so a brand-new user still sees this
    // year). localDayIndex packs the LOCAL Y/M/D through Date.UTC, so reverse it with the UTC getter
    const years = new Set([currentYear]);
    for (const key in activity)
        years.add(new Date(Number(key) * 86400000).getUTCFullYear());
    const yearList = Array.from(years).sort((a, b) => b - a);

    const calendar = acElement("div", "activity-calendar", container);

    const body = acElement("div", "activity-body", calendar);
    const scroll = acElement("div", "activity-scroll", body);
    const graph = acElement("div", "activity-graph", scroll);
    body.appendChild(buildActivityLegend());

    // Year sidebar (a scrollable/wrapping row on mobile via CSS). Only render it when there's more
    // than one year to choose from — a single-year picker is just noise
    const yearButtons = {};
    if (yearList.length > 1)
    {
        const sidebar = acElement("div", "activity-years", calendar);
        for (const year of yearList)
        {
            const button = acElement("button", "activity-year-button", sidebar);
            button.type = "button";
            button.textContent = year;
            button.addEventListener("click", () => selectYear(year));
            yearButtons[year] = button;
        }
    }

    function selectYear(year)
    {
        for (const key in yearButtons)
            yearButtons[key].classList.toggle("active", Number(key) === year);

        buildActivityGraph(graph, year, activity);

        // Always jump to the right edge so the most recent weeks (today, for the current year) are in
        // view first. Reading scrollWidth forces the just-built layout, so this lands correctly
        scroll.scrollLeft = scroll.scrollWidth;
    }

    selectYear(currentYear);
}
