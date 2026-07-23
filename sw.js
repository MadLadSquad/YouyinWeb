const CACHE_NAME = 'static-v15';

// The site is built once per locale, so every page and script exists at the root and once per
// locale directory — generate the pre-cache list instead of hand-maintaining each combination
const LOCALES = ['en_US', 'bg_BG'];
// index.html is deliberately absent: the directory URLs ('./' and './<locale>/') already serve
// it, and the CI's URL rewriting would otherwise turn an index.html entry into a duplicate of
// the directory URL — cache.addAll() rejects duplicate entries, failing the whole install
const PAGES = [
    'deck.html',
    'account.html',
    'marketplace.html',
    'deck-edit-card.html',
    '404.html'
];
const SCRIPTS = [
    'scripts/data/browser-support.js',
    'scripts/data/theme.js',
    'scripts/data/themes-data.js',
    'scripts/data/character-database.js',
    'scripts/index.js',
    'scripts/components/char-loading-ui.js',
    'scripts/components/daily-streak.js',
    'scripts/components/activity-calendar.js',
    'scripts/components/tutorial.js',
    'scripts/components/tutorial/main-page.js',
    'scripts/components/tutorial/marketplace.js',
    'scripts/components/tutorial/deck.js',
    'scripts/components/tutorial/deck-new.js',
    'scripts/components/tutorial/account.js',
    'scripts/components/writer.js',
    'scripts/components/language-selector.js',
    'scripts/components/select-box.js',
    'scripts/components/theme-selector.js',
    'scripts/components/emoji.js',
    'scripts/components/card-search.js',
    'scripts/data/i18n.js',
    'scripts/pages/main-page.js',
    'scripts/pages/account.js',
    'scripts/pages/deck.js',
    'scripts/pages/deck-new.js',
    'scripts/pages/marketplace.js',
    'scripts/utils/IME.js',
    'scripts/utils/format.js',
    'scripts/utils/fuzzy-match.js'
];
const ROOT_ONLY_ASSETS = [
    'styles/components/base.css',
    'styles/components/header.css',
    'styles/components/select-box.css',
    'styles/components/card.css',
    'styles/components/button.css',
    'styles/components/activity-calendar.css',
    'styles/components/writer.css',
    'styles/components/page-search.css',
    'styles/components/char-loading.css',
    'styles/components/tutorial.css',
    'styles/pages/index.css',
    'styles/pages/deck.css',
    'styles/pages/deck-edit.css',
    'styles/pages/account.css',
    'styles/pages/marketplace.css',
    'favicon.png',
    'favicon-new.png',
    'icon-192.png',
    'icon-512.png',
    'manifest.json'
];

// Same-origin app shell: always served from our own host, so these are reliable and cached
// atomically — a failure here means a genuinely broken build worth surfacing
const STATIC_ASSETS = [
    './',
    ...PAGES.map((page) => './' + page),
    ...SCRIPTS.map((script) => './' + script),
    ...ROOT_ONLY_ASSETS.map((asset) => './' + asset),

    // Language subdirectories and assets
    ...LOCALES.flatMap((locale) => [
        `./${locale}/`,
        ...PAGES.map((page) => `./${locale}/${page}`),
        ...SCRIPTS.map((script) => `./${locale}/${script}`),
    ]),
];

// Cross-origin CDN libraries: these can be blocked by content/privacy extensions, fail to resolve
// on restricted networks, or be unreachable in some regions. They must be cached best-effort —
// rolling them into the atomic addAll() above would let a single blocked request reject the whole
// install, breaking the PWA (and spamming a registration error) on every page for affected users
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/@twemoji/api@15.1.0/dist/twemoji.min.js',
    'https://cdn.jsdelivr.net/npm/hanzi-writer/dist/hanzi-writer.min.js',
    'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css',
    'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js',
    'https://fonts.googleapis.com/css2?family=Ubuntu&display=swap'
];

// Installs the service worker and caches basic page shells and styles
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('Service Worker: Pre-caching static assets');
            // Required app shell, atomic
            await cache.addAll(STATIC_ASSETS);
            // Optional CDN assets, best-effort so a blocked/unreachable one can't fail the install.
            // Each is fetched with a timeout so a hanging CDN can't stall activation either
            const cdnResults = await Promise.allSettled(CDN_ASSETS.map(async (url) => {
                const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                await cache.put(url, response);
            }));
            cdnResults.forEach((result, i) => {
                if (result.status === 'rejected') {
                    console.warn('Service Worker: Skipped uncacheable CDN asset', CDN_ASSETS[i], result.reason);
                }
            });
        }).then(() => self.skipWaiting())
    );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Hosts whose responses are safe to cache long-term (versioned, effectively immutable content)
const CDN_HOSTS = [
    'fonts.gstatic.com',
    'fonts.googleapis.com',
    'cdn.jsdelivr.net',

    // Insert additional CDN hosts that we can cache from the uvproj.yaml file
    {{ if {{ != {{ additional_cdn_hosts }} none }}
        {{ additional_cdn_hosts }}
    }}
];

// The default CDN path from uvproj.yaml
const CDN_PATH = '{{ marketplace_cdn_url }}';

// The character database (manifest + chunks) is downloaded and persisted by the page (into
// IndexedDB), but the service worker still caches whatever chunks it sees go by so they remain
// available offline. It is fetched network-first so a package update is actually picked up — a
// cache-first copy would pin the database forever. Both the manifest and the chunks come from
// jsDelivr and carry the repository name in the path. Value defined in uvproj.yaml
const CHARACTER_DATA_REPO = '{{ char_data_url }}';

// Network-first for same-origin requests so new deploys are picked up immediately, with the
// cache as an offline fallback. Cross-origin CDN assets are cache-first since they don't change
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http'))
        return;

    if (url.origin === self.location.origin) {
        event.respondWith(handleSameOriginRequest(event.request));
    } else {
        event.respondWith(handleCdnRequest(event.request, url));
    }
});

// Cache key for a same-origin request. Query strings on this site are client-side state only —
// deck-edit-card.html?new, ?edit=N and ?phrase-new all serve the byte-identical document, and the
// page reads the parameters itself — so navigations are keyed by path alone. Without this a cached
// page is never found again (a ?edit=N request misses the plain entry and falls through to the 404
// page offline), and every distinct parameter value would add its own copy of the same document to
// the cache. Assets never carry query strings here, so they keep their exact URL as the key
function cacheKeyFor(request) {
    if (request.mode !== 'navigate')
        return request;

    const url = new URL(request.url);
    url.search = '';
    return url.href;
}

async function handleSameOriginRequest(request) {
    const cacheKey = cacheKeyFor(request);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(cacheKey, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        // Offline: serve from the cache, accounting for extensionless vs .html URL mismatches
        // between the local and production builds. Read through the versioned cache rather than
        // caches.match, which searches every cache and could answer from a superseded version
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return cachedResponse;

        const fallbackResponse = await matchUrlFallback(request, cache);
        if (fallbackResponse) return fallbackResponse;

        // Last resort for page navigations: the 404 page (or its locale-prefixed copy). Asset
        // requests fall through and fail like a normal network error instead of receiving HTML
        if (request.mode === 'navigate') {
            return (await cache.match('./404.html')) || (await cache.match('./en_US/404.html'));
        }
        throw err;
    }
}

async function handleCdnRequest(request, url) {
    // Network-first for the mutable deck repository (so marketplace updates are picked up) and the
    // character database (so package updates land), falling back to the cache only when offline
    if (url.href.startsWith(CDN_PATH) || url.href.startsWith(CHARACTER_DATA_REPO)) {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch (err) {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(request);
            if (cachedResponse) return cachedResponse;
            throw err;
        }
    }

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(request);
    // Opaque (no-cors) responses report status 0, so check the type as well before caching
    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque') && CDN_HOSTS.includes(url.host)) {
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

// Helper to handle extensionless / html routes matching. The extension is added to or removed from
// the *pathname*, not the raw URL — slicing the URL string would chop into a query string instead of
// the extension ("…/deck-edit-card.html?edit=1" -> "…/deck-edit-card.html?e") and never match
async function matchUrlFallback(request, cache) {
    const url = new URL(request.url);
    // Pages are cached by path alone (see cacheKeyFor), so drop the query before deriving the
    // alternative path — otherwise the rewritten URL could never match a cached entry either
    url.search = '';

    // Check if .html can be added/removed to find a match
    if (url.pathname.endsWith('.html')) {
        url.pathname = url.pathname.slice(0, -'.html'.length);
        return (await cache.match(url.href)) || null;
    } else if (!url.pathname.includes('.') && !url.pathname.endsWith('/')) {
        url.pathname += '.html';
        return (await cache.match(url.href)) || null;
    }
    return null;
}
