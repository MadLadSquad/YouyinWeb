'use strict';
// The footer language switcher. Mirrors theme-selector.js: it builds the custom select widget (via
// createCustomSelect from select-box.js) and handles redirecting to the chosen locale's subdirectory.
// Loaded in the footer before index.js; setLanguage/setLanguageBox are invoked from index.js#main(),
// by which point the $ helper and createCustomSelect are both defined

/**
 * Redirects the user when selecting a new language from the language select box
 * @param { string } localStorageLang - Current language
 * @param { string|null } previous - Previous language
 */
function redirectWithLanguage(localStorageLang, previous)
{
    let url = location.href.split("/");
    // Skip [1] because it will be empty because of the second / in https://
    let redirect = url[0] + "//" + url[2] + "/" + localStorageLang + "/";

    // If the 4th segment (index 3) is a supported locale, we skip it
    const hasLocaleSegment = SUPPORTED_LOCALES.some((l) => l.value === url[3]);
    let startIdx = 3;
    if (previous !== null || hasLocaleSegment)
        startIdx = 4;

    for (let i = startIdx; i < url.length; i++)
        if (url[i] !== "")
            redirect += url[i] + "/";

    const destination = redirect.slice(0, -1);

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

// Locales that actually ship with the site — each needs a Translations/<locale>.yaml and gets
// built into its own subdirectory. Keep in sync with sw.js's LOCALES when adding a language
const SUPPORTED_LOCALES = [
    { value: "en_US", text: "🇬🇧   EN" },
    { value: "bg_BG", text: "🇧🇬   BG" },
];

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
    else if (!location.href.includes(localStorageLang))
    {
        redirectWithLanguage(localStorageLang, null);
        return;
    }
    // The switcher is shown in the footer on every page and duplicated in the account settings card,
    // so reflect the active locale on every instance
    for (const selectWidget of document.querySelectorAll(".lang-select-widget"))
        selectWidget.value = localStorageLang;
}

function setLanguageBox()
{
    const localStorageLang = window.localStorage.getItem("language") || "en_US";

    // Wire up every language switcher instance (footer on all pages, plus the account settings card).
    // createCustomSelect builds an independent popup per button; changing the language redirects to
    // the new locale's subdirectory, so the instances never need to stay in sync live
    for (const selectWidget of document.querySelectorAll(".lang-select-widget"))
        createCustomSelect(selectWidget, "Language select box", SUPPORTED_LOCALES, localStorageLang, function(newValue) {
            let old = window.localStorage.getItem("language");
            window.localStorage.setItem("language", newValue);
            redirectWithLanguage(newValue, old);
        });
}
