'use strict';
// Owns applying a colour theme before first paint. This file is loaded synchronously in the <head>
// (before the stylesheets) so the saved theme's colours are set before the first paint and there is no flash
// of unstyled colours. Only the *active* theme's palette is needed to paint, so the full ~190-theme
// catalogue lives in a separate file (themes-data.js) loaded lazily by loadThemeCatalogue() — that
// keeps ~60 KB of unused palette data off every page's critical render path.
//
// Each theme is a palette: values for the 7 CSS custom properties the stylesheets read, plus the two
// hanzi-writer stroke colours. Applying a theme injects a :root <style> block at runtime.

// The default palette, inlined so a first visit (or a cache miss) paints correct colours without the
// catalogue. Mirrors the "default" entry in themes-data.js — keep the two in sync.
window.defaultTheme = {
    name: "Default",
    background: "#ffffff",
    accent: "#c87e74",
    border: "#CCC",
    text: "#000000",
    error: "#c62828",
    buttonActive: "#a56961",
    cardText: "#444444",
    strokeColor: "#545454",
    outlineColor: "#c8c8c8",
};

// localStorage keys: the chosen theme id, and a cache of its resolved palette so a return visit can
// paint the active theme without loading the full catalogue
window.THEME_KEY = "theme";
window.THEME_PALETTE_KEY = "themePalette";

// URL of this very script, captured at load time (document.currentScript is only valid during initial
// evaluation). Used to resolve themes-data.js as a sibling, so the lazy load works regardless of the
// locale subdirectory the page is served from
const THEME_SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";

/**
 * Applies a palette object by injecting its colours as CSS variables into a :root <style> block and
 * syncing the hanzi-writer colours (recolouring any live writer). This is the lower half of theming:
 * it needs only the palette, not the catalogue, so it works at boot from a cached palette as well as
 * from the picker. Does not persist anything.
 * @param { Object } t - A palette object (the colour fields; see defaultTheme)
 * @param { string } id - The theme id, recorded on <html data-theme> as a styling hook
 */
window.applyPalette = function (t, id)
{
    let style = document.getElementById("site-theme-style");
    if (style === null)
    {
        style = document.createElement("style");
        style.id = "site-theme-style";
        document.head.appendChild(style);
    }

    style.textContent = ":root{" +
        "--main-background-colour:" + t.background + ";" +
        "--main-accent-colour:" + t.accent + ";" +
        "--main-border-colour:" + t.border + ";" +
        "--main-text-colour:" + t.text + ";" +
        "--main-error-colour:" + t.error + ";" +
        "--deck-button-active-colour:" + t.buttonActive + ";" +
        "--deck-card-text-colour:" + t.cardText + ";" +
        "}";

    // Keep the hanzi-writer colours in sync with the theme. The radical highlight follows the
    // accent; the filled strokes (strokeColor) and the faint unfilled guide (outlineColor) come
    // from per-theme overrides, falling back to hanzi-writer's own defaults if a theme omits them.
    window.WRITER_RADICAL_COLOUR = t.accent;
    window.WRITER_STROKE_COLOUR = t.strokeColor || "#555";
    window.WRITER_OUTLINE_COLOUR = t.outlineColor || "#DDD";

    // If a writer is already on screen (e.g. previewing a theme mid-session), recolour it live.
    // The radical is only recoloured when it's currently shown: main-page.js sets radicalColor to
    // null to hide it at higher knowledge levels, and we must not force a hidden radical back on.
    if (window.writer && typeof window.writer.updateColor === "function")
    {
        window.writer.updateColor("strokeColor", window.WRITER_STROKE_COLOUR, { duration: 0 });
        window.writer.updateColor("outlineColor", window.WRITER_OUTLINE_COLOUR, { duration: 0 });
        if (window.writer._options && window.writer._options.radicalColor)
            window.writer.updateColor("radicalColor", window.WRITER_RADICAL_COLOUR, { duration: 0 });
    }

    document.documentElement.setAttribute("data-theme", id);

    // Briefly cross-fade the colours on every change *after* the initial page paint (the first
    // call happens before the stylesheets render, so there's nothing to fade from). The transition
    // itself lives in styles/components/base.css, gated behind the "theme-transition" class; we add it for the
    // duration of the fade and pull it back off so normal interaction never pays for it.
    if (window.__themeReady)
    {
        const root = document.documentElement;
        root.classList.add("theme-transition");
        window.clearTimeout(window.__themeTransitionTimer);
        window.__themeTransitionTimer = window.setTimeout(function () {
            root.classList.remove("theme-transition");
        }, 400);
    }
    window.__themeReady = true;
};

/**
 * Applies a theme by id from the loaded catalogue (window.themes), falling back to the default
 * palette for unknown ids. Used by the theme picker, where the catalogue is already loaded. The boot
 * path below paints from a cached palette instead, so it never needs the catalogue. Persists nothing.
 * @param { string } id - Key into window.themes
 */
window.applyTheme = function (id)
{
    const catalogue = window.themes || {};
    window.applyPalette(catalogue[id] || window.defaultTheme, id);
};

/**
 * Persists a palette to the cache so the next boot can paint the active theme without the catalogue.
 * Best-effort: storage may be full or disabled, in which case the cache is simply skipped.
 * @param { Object } t - The palette object to cache
 */
window.cacheThemePalette = function (t)
{
    try
    {
        window.localStorage.setItem(window.THEME_PALETTE_KEY, JSON.stringify(t));
    }
    catch (e)
    {
        // The palette cache is only an optimization; losing it just means a later catalogue load
    }
};

/**
 * Lazily loads the full theme catalogue (themes-data.js) the first time it's needed — when the theme
 * picker opens, or for the one-time cache heal below. Resolves once window.themes is populated,
 * and dedupes concurrent/repeat calls. Resolved relative to this script so it works under any locale.
 * @returns { Promise<void> }
 */
window.loadThemeCatalogue = function ()
{
    if (window.themes)
        return Promise.resolve();
    if (window.__cataloguePromise)
        return window.__cataloguePromise;

    window.__cataloguePromise = new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = new URL("themes-data.js", THEME_SCRIPT_SRC).href;
        script.onload = function () { resolve(); };
        script.onerror = function () { reject(new Error("Error: failed to load theme catalogue")); };
        document.head.appendChild(script);
    });
    return window.__cataloguePromise;
};

// Apply the saved theme immediately, before the stylesheets paint, to avoid a colour flash. The catalogue
// isn't loaded at boot, so paint from the saved theme's cached palette (written by the picker on its
// last commit); fall back to the inline default on a first visit or a cache miss.
(function () {
    // localStorage access throws in some privacy/lockdown profiles. Degrade to the default palette
    // rather than throwing — browser-support.js surfaces the blocking message; theming must not be
    // what breaks first. (The palette-cache read below is already guarded.)
    let id = "default";
    try
    {
        id = window.localStorage.getItem(window.THEME_KEY) || "default";
    }
    catch (e)
    {
        // Storage blocked: paint the inline default below
    }

    if (id === "default")
    {
        window.applyPalette(window.defaultTheme, "default");
        return;
    }

    let palette = null;
    try
    {
        const cached = JSON.parse(window.localStorage.getItem(window.THEME_PALETTE_KEY) || "null");
        if (cached && typeof cached === "object")
            palette = cached;
    }
    catch (e)
    {
        // Corrupt cache entry: fall through to the default + heal path below
    }

    if (palette)
    {
        window.applyPalette(palette, id);
        return;
    }

    // Cache miss with a non-default theme saved (e.g. a returning user from before palettes were
    // cached). Paint the default now so first paint isn't blocked, then heal the cache once by loading
    // the catalogue in the background and cross-fading to the real theme. Future visits hit the cache
    // and never load the catalogue.
    window.applyPalette(window.defaultTheme, id);
    window.loadThemeCatalogue().then(function () {
        const t = window.themes[id];
        if (t)
        {
            window.cacheThemePalette(t);
            window.applyPalette(t, id);
        }
    }).catch(function (e) { console.warn(e); });
})();
