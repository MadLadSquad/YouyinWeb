'use strict';
/**
 * Builds the footer theme switcher: a button that toggles a searchable popup listing every
 * theme in window.youyinThemes. Selecting a theme applies it live (no reload) and persists
 * the choice under the "youyinTheme" localStorage key. Themes are applied by theme.js.
 */
function setThemeBox()
{
    const button = $("theme-button");
    if (button === null)
        return;

    const current = window.localStorage.getItem("youyinTheme") || "default";

    // Build the popup container, search box and list
    const popup = document.createElement("div");
    popup.id = "theme-popup";
    popup.className = "list-select-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", lc.theme_button);

    const search = document.createElement("input");
    search.id = "theme-popup-search";
    search.className = "list-select-search";
    search.type = "text";
    search.placeholder = lc.theme_search_placeholder;
    search.setAttribute("aria-label", lc.theme_search_placeholder);
    popup.appendChild(search);

    const list = document.createElement("div");
    list.id = "theme-popup-list";
    list.className = "list-select-list";
    popup.appendChild(list);

    // One button per theme. Object key order can't be relied on (integer-like ids such as
    // "8008" get hoisted to the front), so sort explicitly: Default first, then by name.
    const themeIds = Object.keys(window.youyinThemes).sort(function (a, b) {
        if (a === "default") return -1;
        if (b === "default") return 1;
        return window.youyinThemes[a].name.localeCompare(window.youyinThemes[b].name);
    });

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
            opt.textContent = window.youyinThemes[id].name;
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
                window.youyinThemes[id].name.toLowerCase().includes(query) ? "block" : "none";
    }

    // Opening re-reads the persisted theme (it may have changed since the page loaded) and resets
    // the search; closing reverts any un-committed live preview back to the committed theme.
    const controller = createPopupController(button, popup, function() {
        // Build the (large) option list lazily the first time the picker opens
        buildOptions();
        committedId = window.localStorage.getItem("youyinTheme") || "default";
        previewId = committedId;
        setActiveHighlight(committedId);
        search.value = "";
        filter("");
        search.focus();

        // Scroll the current theme into view once the list has been laid out.
        if (options[committedId])
            requestAnimationFrame(function(){ scrollToOption(options[committedId]); });
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
        window.localStorage.setItem("youyinTheme", id);
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
