const CACHE_NAME = 'youyin-static-v6';

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
    'scripts/data/theme.js',
    'scripts/data/character-database.js',
    'scripts/index.js',
    'scripts/components/char-loading-ui.js',
    'scripts/components/daily-streak.js',
    'scripts/components/writer.js',
    'scripts/components/language-selector.js',
    'scripts/components/card-search.js',
    'scripts/data/i18n.js',
    'scripts/pages/main-page.js',
    'scripts/pages/deck.js',
    'scripts/pages/deck-new.js',
    'scripts/pages/marketplace.js',
    'scripts/utils/IME.js',
    'scripts/utils/format.js',
    'scripts/utils/fuzzy-match.js'
];
const ROOT_ONLY_ASSETS = [
    'main.css',
    'char-loading.css',
    'deck.css',
    'marketplace.css',
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
    'https://fonts.googleapis.com/css2?family=Ubuntu&display=swap'
];

// Installs the service worker and caches basic page shells and styles
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('Youyin Service Worker: Pre-caching static assets');
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
                    console.warn('Youyin Service Worker: Skipped uncacheable CDN asset', CDN_ASSETS[i], result.reason);
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
                        console.log('Youyin Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Hosts whose responses are safe to cache long-term (versioned, effectively immutable content)
const CDN_HOSTS = ['fonts.gstatic.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'];

// jsDelivr serves the public deck repository from the mutable @latest tag, so its contents (the
// marketplace map and the decks themselves) can change without the URL changing. These must be
// fetched network-first, otherwise a stale cached copy would hide newly published decks
const MUTABLE_CDN_PATH = '/gh/MadLadSquad/YouyinPublicDeckRepository';

// The character database (manifest + chunks) is downloaded and persisted by the page (into
// IndexedDB), but the service worker still caches whatever chunks it sees go by so they remain
// available offline. It is fetched network-first so a package update is actually picked up — a
// cache-first copy would pin the database forever. Both the manifest and the chunks come from
// jsDelivr and carry the repository name in the path
const CHARACTER_DATA_REPO = 'hanzi-writer-data-youyin';

// Network-first for same-origin requests so new deploys are picked up immediately, with the
// cache as an offline fallback. Cross-origin CDN assets are cache-first since they don't change
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;

    if (url.origin === self.location.origin) {
        event.respondWith(handleSameOriginRequest(event.request));
    } else {
        event.respondWith(handleCdnRequest(event.request, url));
    }
});

async function handleSameOriginRequest(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        // Offline: serve from the cache, accounting for extensionless vs .html URL mismatches
        // between the local and production builds
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        const fallbackResponse = await matchUrlFallback(request);
        if (fallbackResponse) return fallbackResponse;

        // Last resort for page navigations: the 404 page (or its locale-prefixed copy). Asset
        // requests fall through and fail like a normal network error instead of receiving HTML
        if (request.mode === 'navigate') {
            return (await caches.match('./404.html')) || (await caches.match('./en_US/404.html'));
        }
        throw err;
    }
}

async function handleCdnRequest(request, url) {
    // Network-first for the mutable deck repository (so marketplace updates are picked up) and the
    // character database (so package updates land), falling back to the cache only when offline
    if (url.pathname.startsWith(MUTABLE_CDN_PATH) || url.pathname.includes(CHARACTER_DATA_REPO)) {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch (err) {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) return cachedResponse;
            throw err;
        }
    }

    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(request);
    // Opaque (no-cors) responses report status 0, so check the type as well before caching
    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque') && CDN_HOSTS.includes(url.host)) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

// Helper to handle extensionless / html routes matching
async function matchUrlFallback(request) {
    const staticCache = await caches.open(CACHE_NAME);
    const url = new URL(request.url);

    // Check if .html can be added/removed to find a match
    if (url.pathname.endsWith('.html')) {
        const cleanUrl = request.url.slice(0, -5);
        const match = await staticCache.match(cleanUrl);
        if (match) return match;
    } else if (!url.pathname.includes('.') && !url.pathname.endsWith('/')) {
        const htmlUrl = request.url + '.html';
        const match = await staticCache.match(htmlUrl);
        if (match) return match;
    }
    return null;
}
