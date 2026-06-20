'use strict';
// Loading UI for the character stroke database download. index.js drives the download (see
// firstTimeDownload / backgroundUpdate) and calls into these builders to render progress:
//   - the blocking, blurred modal shown on a first visit while the whole database downloads
//   - the small, non-blocking bottom-right pill shown while a background update fetches changed chunks
// These rely on globals defined elsewhere: addElement and the lc translation object (i18n.js)

/**
 * Builds and shows the full-screen blocking modal used while the character database downloads for the
 * first time. Blurs and covers the page so nothing is interactive until the download finishes
 * @returns { HTMLElement } - The overlay element (pass it to updateCharLoadOverlay/hideCharLoadOverlay)
 */
function showCharLoadOverlay()
{
    const overlay = document.createElement("div");
    overlay.className = "char-load-overlay";

    const box = addElement("div", "", "", "char-load-box", "", overlay);
    addElement("h2", lc.char_loading_title, "", "char-load-title", "", box);
    addElement("p", lc.char_loading_subtitle, "", "char-load-subtitle", "", box);

    const bar = addElement("div", "", "", "char-load-bar", "", box);
    overlay.fill = addElement("div", "", "", "char-load-bar-fill", "", bar);
    overlay.count = addElement("p", "0 / 0", "", "char-load-count", "", box);

    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Updates the blocking modal's progress bar and count
 * @param { HTMLElement } overlay - The overlay returned by showCharLoadOverlay
 * @param { number } done - Chunks downloaded so far
 * @param { number } total - Total chunks to download
 */
function updateCharLoadOverlay(overlay, done, total)
{
    overlay.fill.style.width = `${total > 0 ? (done / total) * 100 : 0}%`;
    overlay.count.textContent = `${done} / ${total}`;
}

/**
 * Removes the blocking modal
 * @param { HTMLElement } overlay - The overlay returned by showCharLoadOverlay
 */
function hideCharLoadOverlay(overlay)
{
    overlay.remove();
}

/**
 * Builds and shows the small, non-blocking bottom-right indicator used while a background update
 * downloads changed chunks. Does not cover or block page content
 * @returns { HTMLElement } - The pill element (pass it to updateCharUpdatePill/hideCharUpdatePill)
 */
function showCharUpdatePill()
{
    const pill = document.createElement("div");
    pill.className = "char-update-pill";

    addElement("span", lc.char_updating_label, "", "char-update-label", "", pill);
    const bar = addElement("div", "", "", "char-update-bar", "", pill);
    pill.fill = addElement("div", "", "", "char-update-bar-fill", "", bar);

    document.body.appendChild(pill);
    // Fade in on the next frame so the opacity transition runs
    requestAnimationFrame(() => pill.classList.add("visible"));
    return pill;
}

/**
 * Updates the background-update pill's progress bar
 * @param { HTMLElement } pill - The pill returned by showCharUpdatePill
 * @param { number } done - Chunks downloaded so far
 * @param { number } total - Total chunks to download
 */
function updateCharUpdatePill(pill, done, total)
{
    pill.fill.style.width = `${total > 0 ? (done / total) * 100 : 0}%`;
}

/**
 * Fades out and removes the background-update pill
 * @param { HTMLElement } pill - The pill returned by showCharUpdatePill
 */
function hideCharUpdatePill(pill)
{
    pill.classList.remove("visible");
    // Remove after the fade-out transition (duration kept in sync with char-loading.css)
    setTimeout(() => pill.remove(), 400);
}
