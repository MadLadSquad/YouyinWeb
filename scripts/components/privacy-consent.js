'use strict';

// The privacy-policy consent gate. Everything the app does that the policy actually describes —
// downloading the character database and the marketplace decks from a CDN, registering the service
// worker, writing decks and progress into IndexedDB, walking a first-time visitor through the
// onboarding tour — happens only after the user has read and accepted privacy.html.
//
// The gate lives in index.js's main() (see the call to awaitPrivacyConsent there): it sits ahead of
// maybeStartTutorial, ahead of resolveProfileReady (so the tutorial, the streak-goal prompt and every
// page script that waits on that promise stay dormant behind the modal) and ahead of both the service
// worker registration and the character-database download.
//
// Loaded from the shared footer before index.js, next to char-loading-ui.js: it only defines
// functions here, and by the time main() calls them addElement/$/lc all exist.

// The answer is stored in localStorage rather than the IndexedDB profile: it has to be readable
// synchronously before any storage-backed work starts, it survives "Clear account data" (which wipes
// decks, not the fact that the policy was read), and it belongs with the other pre-render flags the
// app already keeps there (theme, language, tutorial state).
const PRIVACY_CONSENT_KEY = "privacyAccepted";

// What was accepted, not just that something was. The stored value is compared against this, so
// bumping it after a material change to privacy.html re-prompts everyone exactly once. Keep it in
// step with the privacy_last_updated translation string.
const PRIVACY_POLICY_VERSION = "2026-08";

const PRIVACY_CONSENT_OVERLAY_ID = "privacy-consent-prompt";

/**
 * Whether the user has already accepted the current version of the policy
 * @returns { boolean } - True when the stored answer matches PRIVACY_POLICY_VERSION
 */
function privacyConsentGiven()
{
    return window.localStorage.getItem(PRIVACY_CONSENT_KEY) === PRIVACY_POLICY_VERSION;
}
window.privacyConsentGiven = privacyConsentGiven;

/**
 * Whether the current page is the privacy policy itself. It is the one page that must stay readable
 * without consent — the modal links to it, and putting the policy behind "accept the policy" would be
 * a closed loop. Matched by URL (via index.js's pageNameFromPath, which already handles the .html the
 * CI strips) so it doesn't depend on script load timing
 * @returns { boolean } - True on privacy.html
 */
function onPrivacyPolicyPage()
{
    return pageNameFromPath(location.pathname) === "privacy";
}

/**
 * The URL of the privacy policy in the user's language. The locale directory is spelled out rather
 * than relying on a relative "./privacy.html": the build rewrites every "./" in a script to the site
 * root (and CI strips the .html), so a relative path would always resolve to the English copy at the
 * root. setLanguage() runs before the gate, so the stored language is set and valid by now
 * @returns { string } - An absolute URL to the locale's privacy page
 */
function privacyPolicyUrl()
{
    const language = window.localStorage.getItem("language") || "en_US";
    return "./" + language + "/privacy.html";
}

/**
 * Shows the blocking consent modal and resolves once the user accepts. Like the streak-goal prompt it
 * reuses the .char-load-* modal chrome (char-loading.css is linked on every page) and deliberately has
 * no close affordance and no Esc handler: accepting is the only way out, which is the whole point
 * @returns { Promise<void> } - Resolves after the answer has been stored
 */
function showPrivacyConsentModal()
{
    return new Promise(function (resolve) {
        // Nothing else can be up this early, but a second overlay would trap the user behind a modal
        // whose button resolves a promise nobody is waiting on
        if (!document.body || $(PRIVACY_CONSENT_OVERLAY_ID) !== null)
        {
            resolve();
            return;
        }

        const overlay = document.createElement("div");
        overlay.id = PRIVACY_CONSENT_OVERLAY_ID;
        overlay.className = "char-load-overlay privacy-consent-overlay";
        overlay.setAttribute("role", "alertdialog");
        overlay.setAttribute("aria-modal", "true");

        const box = addElement("div", "", "", "char-load-box", "", overlay);
        addElement("h2", lc.privacy_consent_title, "", "char-load-title", "", box);
        addElement("p", lc.privacy_consent_body, "", "char-load-subtitle", "", box);

        // Opened in a new tab rather than navigated to: the modal is blocking, so sending the user
        // away to read the policy would mean losing this page and meeting the same modal again on
        // the way back
        const link = addElement("a", lc.privacy_consent_link, "", "privacy-consent-link", "", box);
        link.href = privacyPolicyUrl();
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const accept = addElement("button", lc.privacy_consent_accept, "privacy-consent-accept", "card-button-edit", "", box);
        accept.type = "button";
        accept.addEventListener("click", function () {
            window.localStorage.setItem(PRIVACY_CONSENT_KEY, PRIVACY_POLICY_VERSION);
            overlay.remove();
            resolve();
        });

        document.body.appendChild(overlay);
        accept.focus();
    });
}
window.showPrivacyConsentModal = showPrivacyConsentModal;

/**
 * The gate itself: resolves immediately when the policy has already been accepted (and on the policy
 * page, which is exempt), otherwise not until the modal is answered. Callers that reach the network
 * must still check privacyConsentGiven() afterwards — the privacy page gets past this without an
 * answer, and it is the answer, not the await, that grants permission
 * @returns { Promise<void> } - Resolves once the app may continue
 */
function awaitPrivacyConsent()
{
    if (privacyConsentGiven() || onPrivacyPolicyPage())
        return Promise.resolve();
    return showPrivacyConsentModal();
}
window.awaitPrivacyConsent = awaitPrivacyConsent;
