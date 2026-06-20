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

    // Move by 1 index if it's not null
    for (let i = previous !== null ? 4 : 3; i < url.length; i++)
        if (url[i] !== "")
            redirect += url[i] + "/";

    location.href = redirect.slice(0, -1);
}

// Locales that actually ship with the site — each needs a Translations/<locale>.yaml and gets
// built into its own subdirectory. Keep in sync with sw.js's LOCALES when adding a language
const SUPPORTED_LOCALES = [
    { value: "en_US", text: "🇬🇧   EN" },
    { value: "bg_BG", text: "🇧🇬   BG" },
];

function setLanguage()
{
    let localStorageLang = window.localStorage.getItem("language");

    // Reset to English when nothing is stored, or when the stored locale doesn't ship (the
    // selector used to offer locales without translations) — redirecting to a locale directory
    // that doesn't exist would strand the user on a 404 page
    if (localStorageLang === null || !SUPPORTED_LOCALES.some((l) => l.value === localStorageLang))
    {
        localStorageLang = "en_US";
        window.localStorage.setItem("language", localStorageLang);
    }
    else if (!location.href.includes(localStorageLang))
    {
        redirectWithLanguage(localStorageLang, null);
        return;
    }
    let selectWidget = $("lang-select");
    if (selectWidget)
        selectWidget.value = localStorageLang;
}

function setLanguageBox()
{
    let selectWidget = $("lang-select");
    if (selectWidget === null)
        return;

    let localStorageLang = window.localStorage.getItem("language") || "en_US";

    createCustomSelect(selectWidget, "Language select box", SUPPORTED_LOCALES, localStorageLang, function(newValue) {
        let old = window.localStorage.getItem("language");
        window.localStorage.setItem("language", newValue);
        redirectWithLanguage(newValue, old);
    });
}
