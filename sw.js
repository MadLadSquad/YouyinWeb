const CACHE_NAME = 'youyin-static-v2';
const CHAR_CACHE_NAME = 'youyin-chars-v1';
const CHARACTER_MAP_URL = 'https://raw.githubusercontent.com/MadLadSquad/hanzi-writer-data-youyin/master/character-map.json';
const CHARACTER_FETCH_BASE = 'https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/';

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
    'theme.js',
    'index.js',
    'daily-streak.js',
    'i18n.js',
    'main-page.js',
    'deck.js',
    'deck-new.js',
    'marketplace.js',
    'IME.js'
];
const ROOT_ONLY_ASSETS = [
    'main.css',
    'deck.css',
    'marketplace.css',
    'favicon.png',
    'favicon-new.png',
    'icon-192.png',
    'icon-512.png',
    'manifest.json'
];

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

    // Static CDN libraries
    'https://cdn.jsdelivr.net/npm/@twemoji/api@15.1.0/dist/twemoji.min.js',
    'https://cdn.jsdelivr.net/npm/hanzi-writer/dist/hanzi-writer.min.js',
    'https://fonts.googleapis.com/css2?family=Ubuntu&display=swap'
];

// Installs the service worker and caches basic page shells and styles
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Youyin Service Worker: Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== CHAR_CACHE_NAME) {
                        console.log('Youyin Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()).then(() => {
            // Start background character synchronization once activated
            syncCharacterDatabase();
        })
    );
});

// Listen for messages from client pages to manually start/resume sync
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_CHARACTERS') {
        syncCharacterDatabase();
    }
});

// Keep track of sync state to prevent overlapping sync loops
let isSyncing = false;

async function syncCharacterDatabase() {
    if (isSyncing) return;
    isSyncing = true;

    console.log('Youyin Service Worker: Checking for character database updates...');
    try {
        const response = await fetch(CHARACTER_MAP_URL);
        if (!response.ok) {
            isSyncing = false;
            return;
        }

        const newMapText = await response.text();
        const staticCache = await caches.open(CACHE_NAME);

        // Get the previously cached character-map.json
        const cachedMapResponse = await staticCache.match(CHARACTER_MAP_URL);
        let needsUpdate = false;

        if (cachedMapResponse) {
            const oldMapText = await cachedMapResponse.text();
            if (oldMapText !== newMapText) {
                console.log('Youyin Service Worker: Character map update detected!');
                needsUpdate = true;
            } else {
                console.log('Youyin Service Worker: Character database is up to date.');
            }
        } else {
            console.log('Youyin Service Worker: Initial character database caching started.');
            needsUpdate = true;
        }

        if (needsUpdate) {
            const characterList = JSON.parse(newMapText);
            // Cache the updated character-map.json
            await staticCache.put(CHARACTER_MAP_URL, new Response(newMapText));
            // Download missing characters progressively in the background
            //await updateCharacterDatabase(characterList);
        }
    } catch (err) {
        console.error('Youyin Service Worker: Error syncing character database:', err);
    } finally {
        isSyncing = false;
    }
}

// Progressively download character data in small batches
async function updateCharacterDatabase(characterList) {
    const charCache = await caches.open(CHAR_CACHE_NAME);
    const total = characterList.length;
    let loaded = 0;
    
    const BATCH_SIZE = 10;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    console.log(`Youyin Service Worker: Starting download of ${total} character files in batches of ${BATCH_SIZE}...`);

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = characterList.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (char) => {
            const url = `${CHARACTER_FETCH_BASE}${encodeURIComponent(char)}.json`;
            
            // Check if already cached to save bandwidth
            const cached = await charCache.match(url);
            if (!cached) {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        await charCache.put(url, res);
                    }
                } catch (e) {
                    // Silent warning; we can retry on next wakeup
                }
            }
        }));

        loaded = Math.min(i + BATCH_SIZE, total);
        
        // Broadcast progress to active client pages
        broadcastProgress(loaded, total);

        // Yield control to the browser thread
        await delay(100);
    }

    console.log('Youyin Service Worker: Character database sync completed successfully.');
}

// Notify all clients of the download progress
function broadcastProgress(loaded, total) {
    self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
            client.postMessage({
                type: 'CHARACTER_SYNC_PROGRESS',
                loaded,
                total
            });
        });
    });
}

// Hosts whose responses are safe to cache long-term (versioned, effectively immutable content)
const CDN_HOSTS = ['fonts.gstatic.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'];

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
