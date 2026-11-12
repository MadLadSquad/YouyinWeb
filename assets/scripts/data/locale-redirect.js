'use strict';
// Early locale redirect, in the render-blocking boot bundle right after the browser-support gate.
//
// setLanguage() (language-selector.js) is what decides the locale, but it runs from main(), after the
// stylesheet, both app bundles and the IndexedDB read. A visitor whose language is already stored —
// every returning user, and every launch of the installed app, whose start_url is "/" — would render
// and boot the root page only to be sent elsewhere. This sends them straight on before the page
// renders. First visits (nothing stored yet) are still handled by setLanguage, which also owns language
// detection; this only acts on a stored, supported choice, so the two can never disagree. (The
// browser's preload scanner may already have requested the stylesheet and bundles, which the new page
// then gets from cache; what this saves is rendering the root and running the app on it.)
//
// The locale list is the build's own (hugo.yaml `languages:`), injected by layouts/_partials/assets.html.

(function () {
    const LOCALES = {{ .locales | jsonify }};

    let language = null;
    try
    {
        language = window.localStorage.getItem("language");
    }
    catch (e)
    {
        // Storage blocked: browser-support.js shows the blocking overlay instead
        return;
    }
    if (language === null || LOCALES.indexOf(language) === -1)
        return;

    // Same URL arithmetic as redirectWithLanguage: swap (or add) the locale segment, keep the rest of
    // the path, the query and the hash, and give directory URLs their trailing slash
    const segments = location.pathname.split("/").filter((segment) => segment !== "");
    if (segments.length > 0 && LOCALES.some((l) => l.toLowerCase() === segments[0].toLowerCase()))
    {
        if (segments[0] === language)
            return;
        segments.shift();
    }
    segments.unshift(language);

    const last = segments[segments.length - 1];
    location.replace("/" + segments.join("/") + (last.includes(".") ? "" : "/") + location.search + location.hash);
})();
