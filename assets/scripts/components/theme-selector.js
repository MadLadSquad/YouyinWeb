'use strict';
/**
 * Builds the footer theme switcher: a button that toggles a searchable popup listing every
 * theme in window.themes. Selecting a theme applies it live (no reload) and persists
 * the choice under the "theme" localStorage key. Themes are applied by theme.js.
 */
function setThemeBox()
{
    // The theme switcher is shown in the footer on every page and duplicated in the account settings
    // card, so wire up every instance. Each builds its own popup; only one popup can be open at a
    // time (createPopupController enforces mutual exclusion) and every popup re-reads the persisted
    // theme on open, so the instances stay consistent without any live cross-syncing
    for (const button of document.querySelectorAll(".theme-button"))
        wireThemeButton(button);
}

function wireThemeButton(button)
{
    const current = window.localStorage.getItem("theme") || "default";

    // Build the popup container, search box and list. Identifiers are classes, not ids, so the
    // footer and account-card popups can coexist on the same page without colliding
    const popup = document.createElement("div");
    popup.className = "list-select-popup theme-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", lc.theme_button);

    const search = document.createElement("input");
    search.className = "list-select-search theme-popup-search";
    search.type = "text";
    search.placeholder = lc.theme_search_placeholder;
    search.setAttribute("aria-label", lc.theme_search_placeholder);
    popup.appendChild(search);

    const list = document.createElement("div");
    list.className = "list-select-list";
    popup.appendChild(list);

    // window.themes is loaded lazily (see theme.js / loadThemeCatalogue), so the catalogue isn't
    // available when setThemeBox runs on every page — defer anything that reads it to the first open.
    // Object key order can't be relied on (integer-like ids such as "8008" get hoisted to the front),
    // so sort explicitly: Default first, then by name.
    let themeIds = null;
    function ensureThemeIds()
    {
        if (themeIds !== null)
            return;
        themeIds = Object.keys(window.themes).sort(function (a, b) {
            if (a === "default") return -1;
            if (b === "default") return 1;
            return window.themes[a].name.localeCompare(window.themes[b].name);
        });
    }

    const options = {};

    // The site ships ~190 themes, and building a button (plus its hover/click listeners) for each is
    // the bulk of this function's work — yet the picker is rarely opened. Defer that to the first open
    // so an ordinary page load doesn't construct ~190 footer DOM nodes for a popup the user may never
    // touch. Everything below keys off `options`, which stays empty until buildOptions runs.
    let optionsBuilt = false;
    function buildOptions()
    {
        if (optionsBuilt)
            return;
        optionsBuilt = true;
        for (const id of themeIds)
        {
            const opt = document.createElement("button");
            opt.type = "button";
            opt.className = "list-select-option" + (id === current ? " active" : "");
            opt.textContent = window.themes[id].name;
            // Hovering previews a theme live, exactly like arrow-key navigation does.
            opt.addEventListener("mouseenter", function(){ setPreview(id, false); });
            opt.addEventListener("click", function(){ commitAndClose(id); });
            list.appendChild(opt);
            options[id] = opt;
        }
    }

    document.body.appendChild(popup);

    // committedId is the persisted theme; previewId is whatever is shown live while the popup
    // is open. Navigating (arrows/hover) only previews — Enter/click commit, Escape reverts.
    let committedId = current;
    let previewId = current;

    function setActiveHighlight(id)
    {
        for (const k in options)
            options[k].classList.toggle("active", k === id);
    }

    // Centre an option inside the scrollable list without touching page scroll (the popup is
    // position:fixed, so a plain scrollIntoView could move the whole page).
    function scrollToOption(opt)
    {
        const optRect = opt.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        list.scrollTop += (optRect.top - listRect.top) - (list.clientHeight - opt.clientHeight) / 2;
    }

    // Live-preview a theme without persisting it. `scroll` keeps the cursor visible during
    // keyboard navigation (skipped on hover, where scrolling under the mouse feels jumpy).
    function setPreview(id, scroll)
    {
        if (!options[id])
            return;
        previewId = id;
        window.applyTheme(id);
        setActiveHighlight(id);
        if (scroll)
            scrollToOption(options[id]);
    }

    function visibleIds()
    {
        return themeIds.filter(id => options[id].style.display !== "none");
    }

    // Move the preview cursor by `dir` (+1 down, -1 up) through the currently-visible themes.
    function movePreview(dir)
    {
        const vis = visibleIds();
        if (vis.length === 0)
            return;
        let idx = vis.indexOf(previewId);
        if (idx === -1)
            idx = dir > 0 ? -1 : 0;
        idx = Math.max(0, Math.min(vis.length - 1, idx + dir));
        setPreview(vis[idx], true);
    }

    function filter(query)
    {
        query = query.toLowerCase();
        for (const id in options)
            options[id].style.display =
                window.themes[id].name.toLowerCase().includes(query) ? "block" : "none";
    }

    // Opening re-reads the persisted theme (it may have changed since the page loaded) and resets
    // the search; closing reverts any un-committed live preview back to the committed theme.
    const controller = createPopupController(button, popup, function() {
        // The popup is position:fixed and lives on document.body, so anchor it to whichever button
        // opened it — otherwise every instance would open at the same fixed viewport spot and the
        // account-card switcher would appear to open the footer's popup. Centre it horizontally on
        // the button (CSS keeps the translate(-50%)).
        const GAP = 8;
        const rect = button.getBoundingClientRect();
        popup.style.left = `${rect.left + rect.width / 2}px`;

        // Prefer opening above the button (the original footer design), but flip below when there
        // isn't enough room above — otherwise the search box (pinned to the popup's top) and the
        // first themes would clip off the top of the viewport. The popup's natural max height is
        // CSS min(22rem, 60vh); compare that against the space on each side to pick a direction.
        const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const maxHeight = Math.min(22 * remPx, 0.6 * window.innerHeight);
        const spaceAbove = rect.top - GAP;
        const spaceBelow = window.innerHeight - rect.bottom - GAP;
        const openAbove = spaceAbove >= maxHeight || spaceAbove >= spaceBelow;

        if (openAbove)
        {
            popup.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
            popup.style.top = "auto";
        }
        else
        {
            popup.style.top = `${rect.bottom + GAP}px`;
            popup.style.bottom = "auto";
        }

        // Never let the popup exceed the room on the chosen side: cap its height to that space so the
        // search box stays visible and the theme list scrolls (it already has overflow-y: auto)
        popup.style.maxHeight = `${Math.min(maxHeight, openAbove ? spaceAbove : spaceBelow)}px`;

        // And keep it within the viewport horizontally on narrow screens (shared with the language
        // and variant selectors), so a button near a screen edge can't clip the popup off-side
        clampPopupHorizontally(popup, rect);

        // Load the catalogue (lazily, once) then build the option list the first time the picker opens.
        // On later opens it's already loaded, so this resolves in a microtask and the popup fills
        // immediately; on the very first open the list briefly appears empty while the file loads.
        window.loadThemeCatalogue().then(function () {
            ensureThemeIds();
            buildOptions();
            committedId = window.localStorage.getItem("theme") || "default";
            previewId = committedId;
            setActiveHighlight(committedId);
            search.value = "";
            filter("");
            search.focus();

            // Scroll the current theme into view once the list has been laid out.
            if (options[committedId])
                requestAnimationFrame(function(){ scrollToOption(options[committedId]); });
        }).catch(function (e) { console.error(e); });
    }, function() {
        if (previewId !== committedId)
            window.applyTheme(committedId);
        previewId = committedId;
        setActiveHighlight(committedId);
    });

    // Persist `id` as the chosen theme and close without reverting (preview and committed ids are
    // equal by the time the close callback runs, so its revert is a no-op).
    function commitAndClose(id)
    {
        window.applyTheme(id);
        window.localStorage.setItem("theme", id);
        // Cache the chosen palette so the next boot can paint it without loading the catalogue. The
        // default theme is painted from theme.js's inline copy, so clear its cache entry instead.
        if (id === "default")
            window.localStorage.removeItem(window.THEME_PALETTE_KEY);
        else if (window.themes && window.themes[id])
            window.cacheThemePalette(window.themes[id]);
        committedId = id;
        previewId = id;
        setActiveHighlight(id);
        controller.close();
    }

    // Filtering also previews the top match, so a search immediately shows a candidate theme.
    search.addEventListener("input", function(){
        filter(this.value);
        const vis = visibleIds();
        if (vis.length > 0)
            setPreview(vis[0], true);
    });

    // Keyboard control while the popup is open: arrows preview, Enter commits. Escape and outside
    // clicks are handled by the shared popup machinery — closing reverts the preview via the
    // controller's close callback. Listening on the popup is enough because opening focuses the
    // search box, so key events always originate inside it.
    popup.addEventListener("keydown", function(e){
        if (e.key === "ArrowDown")
        {
            e.preventDefault();
            movePreview(1);
        }
        else if (e.key === "ArrowUp")
        {
            e.preventDefault();
            movePreview(-1);
        }
        else if (e.key === "Enter")
        {
            e.preventDefault();
            commitAndClose(previewId);
            button.focus();
        }
    });
}
