'use strict';
// The language switcher (app bar and account page). Mirrors theme-selector.js: it builds the custom
// select widget (via createCustomSelect from select-box.js) and handles redirecting to the chosen
// locale's subdirectory. Concatenated into the core bundle before index.js; setLanguage/setLanguageBox
// are invoked from index.js#main(), by which point the $ helper and createCustomSelect are both defined

/**
 * Redirects the user to the same page in another locale.
 *
 * Rewritten onto the URL API when the site moved to directory URLs ("/en_US/deck/"): the old
 * string-splitting version appended the trailing slash after the query string, turning
 * "/deck-edit-card/?edit=3" into "/deck-edit-card/?edit=3/". Working on URL parts keeps the query
 * and hash where they belong, and drops the `previous` argument the old index arithmetic needed.
 * @param { string } localStorageLang - The locale to switch to
 */
function redirectWithLanguage(localStorageLang)
{
    const url = new URL(location.href);
    const segments = url.pathname.split("/").filter((segment) => segment !== "");

    // A path may or may not already carry a locale: the site root mirrors the default locale, so
    // "/deck/" is as valid an origin for the switch as "/en_US/deck/". Matched case-insensitively so
    // a lowercased "/en_us/" is replaced rather than nested ("/en_US/en_us/")
    if (segments.length > 0 && localeFromSegment(segments[0]) !== null)
        segments.shift();

    segments.unshift(localStorageLang);

    // Pages are directory URLs and take a trailing slash; a real file (404.html) must not get one
    const last = segments[segments.length - 1];
    url.pathname = "/" + segments.join("/") + (last.includes(".") ? "" : "/");

    const destination = url.href;

    if (!('pageswap' in window) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    {
        document.body.classList.add('page-exiting');
        setTimeout(() => {
            location.href = destination;
        }, 200);
    }
    else
    {
        location.href = destination;
    }
}

// Locales that actually ship with the site — each needs a data/translations/<locale>.yaml, a
// content/<locale>/ directory and a `languages:` entry in hugo.yaml, and is built into its own
// subdirectory. Keep in sync with hugo.yaml and with the rename loop in build.sh
const SUPPORTED_LOCALES = [
    { value: "en_US", text: "🇬🇧   EN" },
    { value: "bg_BG", text: "🇧🇬   BG" },
    { value: "ro_RO", text: "🇷🇴   RO" },
];

/**
 * The supported locale a path segment names, compared case-insensitively. Hugo lowercases locale
 * directories and only build.sh renames them back, so `hugo server` serves the home page as
 * "/en_us/"; an exact comparison mistakes that for a page called "en_us", which sent the tutorial
 * gate into a redirect loop between "/" and "/en_us/"
 * @param { string } segment - A single path segment
 * @returns { string|null } - The canonically cased locale ("en_US"), or null if it isn't one
 */
function localeFromSegment(segment)
{
    if (!segment)
        return null;
    const lower = segment.toLowerCase();
    const locale = SUPPORTED_LOCALES.find((l) => l.value.toLowerCase() === lower);
    return locale ? locale.value : null;
}

/**
 * Detects the user's system language and matches it against SUPPORTED_LOCALES.
 * Returns the matching locale value, or null if no match is found.
 * @returns { string|null }
 */
function getSystemLanguage()
{
    const languages = navigator.languages || (navigator.language ? [navigator.language] : []);
    for (const lang of languages)
    {
        if (!lang)
            continue;

        // Try exact match first (case-insensitive, replacing '-' with '_')
        // e.g. "bg-BG" -> "bg_BG"
        const normalized = lang.replace('-', '_').toLowerCase();
        for (const locale of SUPPORTED_LOCALES)
        {
            if (locale.value.toLowerCase() === normalized)
                return locale.value;
        }

        // Try matching the 2-letter language code
        // e.g. "bg-BG" -> "bg", "en-US" -> "en"
        const baseLang = lang.split('-')[0].split('_')[0].toLowerCase();
        for (const locale of SUPPORTED_LOCALES)
        {
            const localeBase = locale.value.split('_')[0].toLowerCase();
            if (localeBase === baseLang)
                return locale.value;
        }
    }
    return null;
}

/**
 * Settles the stored language and moves the browser into its locale directory if it isn't already
 * there. Assigning location.href doesn't stop the caller, so the return value tells main() to stop
 * initializing a page that is being left — otherwise a later navigation can override this one
 * @returns { boolean } - True when a redirect has been started
 */
function setLanguage()
{
    let localStorageLang = window.localStorage.getItem("language");

    if (localStorageLang === null)
    {
        // First-time user, check system language
        const systemLang = getSystemLanguage();
        localStorageLang = systemLang !== null ? systemLang : "en_US";
        window.localStorage.setItem("language", localStorageLang);
    }
    else if (!SUPPORTED_LOCALES.some((l) => l.value === localStorageLang))
    {
        // If a language was previously saved but is no longer supported, fallback to English
        localStorageLang = "en_US";
        window.localStorage.setItem("language", localStorageLang);
    }
    // Compared against the first path segment exactly, so a lowercased "/en_us/" is also redirected
    // once to its canonical "/en_US/"
    else if (location.pathname.split("/").filter((segment) => segment !== "")[0] !== localStorageLang)
    {
        redirectWithLanguage(localStorageLang);
        return true;
    }
    // The switcher is shown in the app bar on every page and duplicated in the account settings card,
    // so reflect the active locale on every instance
    for (const selectWidget of document.querySelectorAll(".lang-select-widget"))
        selectWidget.value = localStorageLang;
    return false;
}

function setLanguageBox()
{
    const localStorageLang = window.localStorage.getItem("language") || "en_US";

    // Wire up every language switcher instance (app bar on all pages, plus the account settings card).
    // createCustomSelect builds an independent popup per button; changing the language redirects to
    // the new locale's subdirectory, so the instances never need to stay in sync live
    for (const selectWidget of document.querySelectorAll(".lang-select-widget"))
        createCustomSelect(selectWidget, "Language select box", SUPPORTED_LOCALES, localStorageLang, function(newValue) {
            window.localStorage.setItem("language", newValue);
            redirectWithLanguage(newValue);
        });
}
