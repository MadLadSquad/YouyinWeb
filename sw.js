const CACHE_NAME = 'youyin-static-v1';
const CHAR_CACHE_NAME = 'youyin-chars-v1';
const CHARACTER_MAP_URL = 'https://raw.githubusercontent.com/MadLadSquad/hanzi-writer-data-youyin/master/character-map.json';
const CHARACTER_FETCH_BASE = 'https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/';

const STATIC_ASSETS = [
    './',
    './index.html',
    './deck.html',
    './account.html',
    './marketplace.html',
    './deck-edit-card.html',
    './404.html',
    './main.css',
    './deck.css',
    './marketplace.css',
    './theme.js',
    './index.js',
    './i18n.js',
    './main-page.js',
    './deck.js',
    './deck-new.js',
    './marketplace.js',
    './IME.js',
    './favicon.png',
    './favicon-new.png',
    './icon-192.png',
    './icon-512.png',
    './manifest.json',

    // Language subdirectories and assets
    './en_US/',
    './en_US/index.html',
    './en_US/deck.html',
    './en_US/account.html',
    './en_US/marketplace.html',
    './en_US/deck-edit-card.html',
    './en_US/404.html',
    './en_US/index.js',
    './en_US/i18n.js',
    './en_US/main-page.js',
    './en_US/deck.js',
    './en_US/deck-new.js',
    './en_US/marketplace.js',
    './en_US/IME.js',
    './en_US/theme.js',

    './bg_BG/',
    './bg_BG/index.html',
    './bg_BG/deck.html',
    './bg_BG/account.html',
    './bg_BG/marketplace.html',
    './bg_BG/deck-edit-card.html',
    './bg_BG/404.html',
    './bg_BG/index.js',
    './bg_BG/i18n.js',
    './bg_BG/main-page.js',
    './bg_BG/deck.js',
    './bg_BG/deck-new.js',
    './bg_BG/marketplace.js',
    './bg_BG/IME.js',
    './bg_BG/theme.js',

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

// Intercepts fetch requests to serve cached assets
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            // Try fallback for extensionless URLs or .html mismatches (local vs production)
            return matchUrlFallback(event.request).then((fallbackResponse) => {
                if (fallbackResponse) {
                    return fallbackResponse;
                }

                // If not in cache, fetch from network
                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        // Return remote response without caching (or handle external CDNs like Google Fonts)
                        if (url.host === 'fonts.gstatic.com' || url.host === 'fonts.googleapis.com' || url.host === 'cdn.jsdelivr.net') {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    }

                    // Dynamic caching for local assets not caught in pre-cache
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                }).catch(() => {
                    // Offline fallback: return a default 404 or offline message page
                    return caches.match('./404.html') || caches.match('./en_US/404.html');
                });
            });
        })
    );
});

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
