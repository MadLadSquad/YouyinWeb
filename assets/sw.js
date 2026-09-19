
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
{{- range (slice "/manifest.json" "/favicon.png" "/favicon-new.png" "/icon-192.png" "/icon-512.png") -}}
  {{- $urls = $urls | append . -}}
{{- end -}}
{{- $urls = uniq $urls -}}

// The app shell cache. Its name is the hash of the precache list, so a deploy that changes any bundle
// gets a fresh cache and the activate handler drops the old one.
const CACHE_NAME = 'static-{{ delimit $urls "|" | hash.FNV32a }}';

// Runtime data fetched from the CDN (the character database, the marketplace decks, the twemoji SVGs).
// Kept apart from the shell and not versioned by deploy, so shipping a new build doesn't throw away
// data that did not change. Entries are keyed by URL and replaced as fresher copies are fetched.
const DATA_CACHE_NAME = 'data-v1';

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
// character database, the public deck marketplace and the twemoji SVGs, plus any extra hosts listed in
// params.additional_cdn_hosts in hugo.yaml.
const CDN_HOSTS = {{ slice "cdn.jsdelivr.net" | append (site.Params.additional_cdn_hosts | default slice) | jsonify | safeJS }};

// The public deck repository (params.marketplace_cdn_url in hugo.yaml)
const CDN_PATH = '{{ site.Params.marketplace_cdn_url }}';

// The character database (manifest + chunks) is downloaded and persisted by the page (into
// IndexedDB), but the service worker still caches whatever chunks it sees go by so they remain
// available offline. It is fetched network-first so a package update is actually picked up — a
// cache-first copy would pin the database forever. params.char_data_url in hugo.yaml
const CHARACTER_DATA_REPO = '{{ site.Params.char_data_url }}';

// Network-first for same-origin requests so new deploys are picked up immediately, with the
// cache as an offline fallback. Cross-origin CDN assets are cache-first since they don't change
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http'))
        return;

    if (url.origin === self.location.origin) {
        event.respondWith(handleSameOriginRequest(event.request));
    } else if (CDN_HOSTS.includes(url.host)) {
        event.respondWith(handleCdnRequest(event.request, url));
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
        // Offline: serve from the cache. Read through the versioned cache rather than caches.match,
        // which searches every cache and could answer from a superseded version
        const cache = await caches.open(CACHE_NAME);
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

async function handleCdnRequest(request, url) {
    const cache = await caches.open(DATA_CACHE_NAME);

    // Network-first for the mutable deck repository (so marketplace updates are picked up) and the
    // character database (so package updates land), falling back to the cache only when offline
    if (url.href.startsWith(CDN_PATH) || url.href.startsWith(CHARACTER_DATA_REPO)) {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch (err) {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) return cachedResponse;
            throw err;
        }
    }

    // Everything else on these hosts is a versioned, immutable URL (the twemoji SVGs): cache-first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(request);
    // Opaque (no-cors) responses report status 0, so check the type as well before caching
    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
        cache.put(request, networkResponse.clone());
    }
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
