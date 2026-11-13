
{{- /* Built by Hugo (published to /sw.js by layouts/_partials/root-files.html).

  The pre-cache list used to be three hand-maintained arrays here, cross-multiplied by locale, that
  had to be edited — and CACHE_NAME bumped — every time a script or stylesheet was added. It is now
  derived from the asset pipeline itself, so it cannot drift from what was actually published, and
  CACHE_NAME is the hash of that list: any change to any bundle's content changes a fingerprinted
  URL, which changes the hash, which invalidates the cache exactly when it should be. */ -}}
{{- $slugs := slice "index" "deck" "account" "marketplace" "deck-edit-card" "privacy" "licenses" "404" -}}
{{- $urls := slice -}}
{{- $shared := slice -}}
{{- range $li, $lang := hugo.Sites -}}
  {{- $dir := $lang.Params.dir -}}
  {{- range $slugs -}}
    {{- $a := partialCached "assets.html" (dict "loc" $dir "slug" .) $dir . -}}
    {{- $urls = $urls | append $a.core $a.page -}}
    {{- if eq $li 0 -}}{{- $shared = $shared | append $a.css $a.boot $a.themesData -}}{{- range $a.fonts -}}{{- $shared = $shared | append . -}}{{- end -}}{{- end -}}
    {{- /* Page URLs. The home page is served by its directory URL, so it is listed as "/<loc>/"
           rather than as a document — an explicit index entry would duplicate that URL and make
           cache.addAll() reject, failing the whole install. */ -}}
    {{- if eq . "404" -}}
      {{- $urls = $urls | append (printf "/%s/404.html" $dir) -}}
    {{- else -}}
      {{- $urls = $urls | append (partial "url.html" (dict "slug" (cond (eq . "index") "" .) "loc" $dir)) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- /* The root mirrors the default locale (see build.sh), but it only serves crawlers and visitors
       without JavaScript, who never run this worker: everyone else is redirected into a locale directory
       by setLanguage(). Only "/" is cached, because the installed app starts there (manifest start_url)
       and has to reach that redirect offline, plus the 404 page the offline fallback below serves. */ -}}
{{- $urls = $urls | append "/" "/404.html" -}}
{{- range (uniq $shared) -}}{{- $urls = $urls | append . -}}{{- end -}}
{{- /* Root-level static files that no bundle references. */ -}}
{{- range (slice "/manifest.json" "/favicon.svg" "/icon-192.png" "/icon-512.png") -}}
  {{- $urls = $urls | append . -}}
{{- end -}}
{{- $urls = uniq $urls -}}

// The app shell cache. Its name is the hash of the precache list, so a deploy that changes any bundle
// gets a fresh cache and the activate handler drops the old one.
const CACHE_NAME = 'static-{{ delimit $urls "|" | hash.FNV32a }}';

// Runtime data fetched from the CDN (the marketplace decks and the twemoji SVGs). Kept apart from the
// shell and not versioned by deploy, so shipping a new build doesn't throw away data that did not
// change. Entries are keyed by URL and replaced as fresher copies are fetched. Bump the version only
// when what this cache holds changes shape: activate deletes every other cache. (v1 also held the
// character database and opaque emoji responses, neither of which is cached any more.)
const DATA_CACHE_NAME = 'data-v2';

// Same-origin app shell: always served from our own host, so these are reliable and cached
// atomically — a failure here means a genuinely broken build worth surfacing. Generated from the
// asset pipeline; see the comment at the top of this file. Third-party code and the webfont are
// vendored into these bundles at build time (params.vendor in hugo.yaml), so nothing cross-origin
// needs precaching.
const STATIC_ASSETS = {{ $urls | jsonify (dict "indent" "    ") | safeJS }};

// Installs the service worker and caches the page shells, bundles and fonts
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Clean up superseded shell caches on activation. The data cache is kept
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Hosts whose responses are safe to cache long-term as they are requested: jsDelivr, which serves the
// twemoji SVGs, plus any extra hosts listed in params.additional_cdn_hosts in hugo.yaml (such as the
// one serving the character database and the public deck marketplace).
const CDN_HOSTS = {{ slice "cdn.jsdelivr.net" | append (site.Params.additional_cdn_hosts | default slice) | jsonify | safeJS }};

// The public deck repository (params.marketplace_cdn_url in hugo.yaml)
const CDN_PATH = '{{ site.Params.marketplace_cdn_url }}';

// The character database (manifest + chunks; params.char_data_url in hugo.yaml). The page downloads
// it and keeps it in IndexedDB, which is what makes it available offline, so the worker leaves these
// requests alone: caching them as well stored the whole database a second time
const CHARACTER_DATA_PREFIX = '{{ site.Params.char_data_url }}/character-map-chunks';

// Bundles, stylesheets, fonts and the theme catalogue are published under content-hashed names
// (fingerprinted by layouts/_partials/assets.html), so a given URL never changes and can be answered
// from the cache without asking the network
const FINGERPRINTED = /\.[0-9a-f]{64}\.(?:js|css|woff2)$/;

// How long a page navigation waits on the network before answering from the cache, when a cached copy
// exists. The network response still lands in the cache for next time
const NAVIGATION_TIMEOUT_MS = 3000;

// Network-first for pages and the other unversioned same-origin files, so new deploys are picked up
// immediately, with the cache as an offline fallback; cache-first for the fingerprinted assets.
// Cross-origin CDN assets are handled by handleCdnRequest
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http'))
        return;

    if (url.origin === self.location.origin) {
        if (FINGERPRINTED.test(url.pathname))
            event.respondWith(handleImmutableRequest(event));
        else
            event.respondWith(handleSameOriginRequest(event));
    } else if (CDN_HOSTS.includes(url.host) && !url.href.startsWith(CHARACTER_DATA_PREFIX)) {
        event.respondWith(handleCdnRequest(event, url));
    }
    // Anything else goes straight to the network without the worker in the way
});

// Cache key for a same-origin request. Query strings on this site are client-side state only —
// /deck-edit-card/?new, ?edit=N and ?phrase-new all serve the byte-identical document, and the
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

// Stores a response without holding up the one being returned, while keeping the worker alive until
// the write has finished
function cachePut(event, cache, key, response) {
    event.waitUntil(cache.put(key, response).catch(() => {}));
}

async function handleImmutableRequest(event) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(event.request);
    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic')
        cachePut(event, cache, event.request, networkResponse.clone());
    return networkResponse;
}

async function handleSameOriginRequest(event) {
    const request = event.request;
    const cacheKey = cacheKeyFor(request);
    const cache = await caches.open(CACHE_NAME);

    const network = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic')
            cachePut(event, cache, cacheKey, networkResponse.clone());
        return networkResponse;
    });

    try {
        // A page with a cached copy doesn't wait out a bad connection: after the timeout the cached
        // copy is served, and the network response, if it comes, still refreshes the cache
        if (request.mode === 'navigate') {
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                event.waitUntil(network.catch(() => {}));
                const timeout = new Promise((resolve) => setTimeout(() => resolve(cachedResponse), NAVIGATION_TIMEOUT_MS));
                return await Promise.race([network.catch(() => cachedResponse), timeout]);
            }
        }
        return await network;
    } catch (err) {
        // Offline: serve from the cache. Read through the versioned cache rather than caches.match,
        // which searches every cache and could answer from a superseded version
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return cachedResponse;

        const fallbackResponse = await matchUrlFallback(request, cache);
        if (fallbackResponse) return fallbackResponse;

        // Last resort for page navigations: the 404 page (or its locale-prefixed copy). Asset
        // requests fall through and fail like a normal network error instead of receiving HTML
        if (request.mode === 'navigate') {
            return (await cache.match('/404.html')) || (await cache.match('/en_US/404.html'));
        }
        throw err;
    }
}

async function handleCdnRequest(event, url) {
    const request = event.request;
    const cache = await caches.open(DATA_CACHE_NAME);

    // Network-first for the mutable deck repository, so marketplace updates are picked up, falling
    // back to the cache only when offline
    if (url.href.startsWith(CDN_PATH)) {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200)
                cachePut(event, cache, request, networkResponse.clone());
            return networkResponse;
        } catch (err) {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) return cachedResponse;
            throw err;
        }
    }

    // Everything else on these hosts is a versioned, immutable URL (the twemoji SVGs): cache-first.
    // Only readable (CORS) responses are kept. emoji.js requests the SVGs with crossorigin for this:
    // an opaque response is charged several megabytes of quota apiece by Chromium, whatever its size
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200)
        cachePut(event, cache, request, networkResponse.clone());
    return networkResponse;
}

// Pages are served from directory URLs ("/en_US/deck/"). A request for the same page spelled without
// the trailing slash ("/en_US/deck") or as a document ("/en_US/deck.html") is answered from the
// directory entry. Works on the pathname, and drops the query for the same reason cacheKeyFor does
async function matchUrlFallback(request, cache) {
    const url = new URL(request.url);
    url.search = '';

    const last = url.pathname.split('/').pop();
    if (url.pathname.endsWith('.html'))
        url.pathname = url.pathname.slice(0, -'.html'.length) + '/';
    else if (last !== '' && !last.includes('.'))
        url.pathname += '/';
    else
        return null;

    return (await cache.match(url.href)) || null;
}
