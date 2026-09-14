'use strict';
// Browser-support gate. This is the FIRST script that runs on every page — loaded at the top of
// Components/head.tmpl.html, before theme.js and before <body> exists — so it runs before any
// storage access, network request, or app code does.
//
// Two failure modes are communicated to the user. JavaScript being disabled entirely is handled by
// the <noscript> block in Components/header.tmpl.html (nothing here runs in that case). When
// JavaScript runs but a privacy/lockdown profile blocks the APIs the app hard-depends on, this
// module sets window.UNSUPPORTED and renders a blocking overlay explaining how to fix it.
//
// The single freeze point is the guard at the top of main() in scripts/index.js: when
// window.UNSUPPORTED is set, main() returns a promise that never resolves, so none of the
// readiness promises (profileReady / charDataReady / storageReady) ever resolve
// and every page script stays dormant — no IndexedDB writes, no CDN downloads, no SW registration.

(function () {
    // English fallbacks, used only if i18n.js (the global lc object) somehow hasn't populated. The
    // overlay renders at DOMContentLoaded, by which point the footer's i18n.js has normally run.
    const FALLBACK = {
        unsupported_title: "The app can't run in this browser",
        unsupported_privacy_body: "Your browser is blocking the storage this app needs to save your decks and settings. This usually means a privacy or lockdown profile is active. Disable Lockdown Mode, turn off strict privacy protections, or allow site data for this site, then reload.",
        unsupported_outdated_body: "Your browser is missing features that are essential for the app to run. Please update to a current version of a modern browser, then reload.",
        unsupported_reload: "Reload page"
    };

    function t(key)
    {
        return (window.lc && window.lc[key]) || FALLBACK[key];
    }

    // Records the failure (first one wins) and schedules the overlay. Called both synchronously from
    // detect() and asynchronously from the IndexedDB probe's onerror handler.
    function markUnsupported(info)
    {
        if (window.UNSUPPORTED)
            return;
        window.UNSUPPORTED = info;

        if (document.readyState === "loading")
            document.addEventListener("DOMContentLoaded", function () { showOverlay(info); });
        else
            showOverlay(info);
    }

    // Probes the capabilities the app hard-depends on. Returns null when everything works, or
    // { category, reasons } for the first blocking problem. "privacy" means storage is blocked
    // (lockdown / private / "block all site data"); "outdated" means the browser is too old to run
    // the app at all — the two need different remediation copy.
    function detect()
    {
        const reasons = [];

        // localStorage: read by theme.js synchronously in <head>; blocked profiles throw on access
        try
        {
            const k = "__site_probe__";
            window.localStorage.setItem(k, "1");
            window.localStorage.getItem(k);
            window.localStorage.removeItem(k);
        }
        catch (e)
        {
            reasons.push("localStorage");
        }

        // indexedDB: profile + character-database storage. Some profiles remove it, null it out, or
        // throw synchronously from open(). Async open failures are caught by the onerror handler.
        if (!("indexedDB" in window) || window.indexedDB === null)
        {
            reasons.push("indexedDB");
        }
        else
        {
            try
            {
                const req = window.indexedDB.open("__site_probe__");
                req.onerror = function ()
                {
                    markUnsupported({ category: "privacy", reasons: ["indexedDB"] });
                };
                req.onsuccess = function ()
                {
                    try
                    {
                        req.result.close();
                        window.indexedDB.deleteDatabase("__site_probe__");
                    }
                    catch (e)
                    {
                        // Best-effort cleanup of the probe database; nothing depends on it
                    }
                };
            }
            catch (e)
            {
                reasons.push("indexedDB");
            }
        }

        // Core JS the async startup and CDN downloads can't run without. Missing means an outdated
        // browser rather than a privacy profile.
        if (typeof window.Promise !== "function")
            reasons.push("Promise");
        if (typeof window.fetch !== "function")
            reasons.push("fetch");

        if (reasons.length === 0)
            return null;

        // Storage being blocked is the lockdown/privacy story; only a genuinely old browser (no
        // storage problem, just missing core JS) gets the "update your browser" message.
        const storageBlocked = reasons.indexOf("localStorage") !== -1 || reasons.indexOf("indexedDB") !== -1;
        return { category: storageBlocked ? "privacy" : "outdated", reasons: reasons };
    }

    // Builds and shows the blocking overlay. Reuses the themed loading-modal classes from
    // styles/components/char-loading.css (.char-load-*), which read the --main-* colour variables
    // theme.js injects — theme.js still applies the default palette even when localStorage is blocked
    // (its reads are defensive), so the overlay is themed in every case JS runs.
    function showOverlay(info)
    {
        if (!document.body || document.getElementById("site-unsupported"))
            return;

        const bodyKey = info.category === "outdated" ? "unsupported_outdated_body" : "unsupported_privacy_body";

        const overlay = document.createElement("div");
        overlay.id = "site-unsupported";
        overlay.className = "char-load-overlay";
        overlay.setAttribute("role", "alertdialog");
        overlay.setAttribute("aria-modal", "true");

        const box = document.createElement("div");
        box.className = "char-load-box";

        const title = document.createElement("h2");
        title.className = "char-load-title";
        title.textContent = t("unsupported_title");
        box.appendChild(title);

        const body = document.createElement("p");
        body.className = "char-load-subtitle";
        body.textContent = t(bodyKey);
        box.appendChild(body);

        const reload = document.createElement("button");
        reload.type = "button";
        reload.textContent = t("unsupported_reload");
        // Inline, theme-variable styling keeps the button self-contained (no dependency on a button
        // stylesheet that may load later), while still matching the active palette.
        reload.style.cssText =
            "margin-top:0.5rem;padding:0.5rem 1.25rem;cursor:pointer;font:inherit;" +
            "border-radius:8px;border:2px solid var(--main-accent-colour);" +
            "color:var(--main-background-colour);background-color:var(--main-accent-colour);";
        reload.addEventListener("click", function () { window.location.reload(); });
        box.appendChild(reload);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    const result = detect();
    if (result)
        markUnsupported(result);
})();
