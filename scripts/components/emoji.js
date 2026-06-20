'use strict';
/**
 * Replaces Unicode emojis under `root` with Twitter Emoji (Twemoji) SVG images. twemoji.parse
 * does the DOM traversal itself, skipping script/style/form elements and leaving the
 * <img class="emoji"> elements it inserts alone
 * @param {Node} root - The root element to parse
 */
function parseEmojis(root)
{
    if (!window.twemoji || root.nodeType !== Node.ELEMENT_NODE)
        return;

    window.twemoji.parse(root, {
        base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/',
        folder: 'svg',
        ext: '.svg'
    });
}

/**
 * Initializes universal Twemoji replacement across the site, parsing the initial page content
 * and setting up a MutationObserver to parse dynamically added content.
 */
function initEmojiReplacement()
{
    // twemoji.min.js is loaded with defer, so it may not have executed yet when index.js's main()
    // calls this (a deferred head script runs after the regular body scripts). Rather than silently
    // skip emoji replacement for the whole page, wait for the script to finish loading and retry.
    // Once it has executed, window.twemoji is set and we fall straight through
    if (!window.twemoji)
    {
        const script = document.querySelector('script[src*="twemoji"]');
        if (script)
        {
            script.addEventListener("load", initEmojiReplacement, { once: true });
            return;
        }
        console.warn("Twemoji library not loaded; falling back to native emojis.");
        return;
    }

    // Initial parse of the body
    parseEmojis(document.body);

    // Watch for dynamically added content. We parse each mutation's target (the parent whose
    // children changed) rather than the added nodes themselves, because bare text nodes (e.g.
    // from addTextNode) can only be parsed through their parent element. This needs no
    // disconnect/reconnect guard: re-parsing is a no-op for already-replaced emojis, so the
    // mutations caused by our own replacements die out after one extra pass.
    const observer = new MutationObserver((mutations) => {
        const targets = new Set();
        for (const mutation of mutations)
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0)
                targets.add(mutation.target);

        for (const target of targets)
            parseEmojis(target);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
