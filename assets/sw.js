
{{- /* Built by Hugo (published to /sw.js by layouts/_partials/root-files.html).

  The pre-cache list used to be three hand-maintained arrays here, cross-multiplied by locale, that
  had to be edited — and CACHE_NAME bumped — every time a script or stylesheet was added. It is now
  derived from the asset pipeline itself, so it cannot drift from what was actually published, and
  CACHE_NAME is the hash of that list: any change to any bundle's content changes a fingerprinted
  URL, which changes the hash, which invalidates the cache exactly when it should be. */ -}}
{{- $slugs := slice "index" "deck" "account" "marketplace" "deck-edit-card" "privacy" "404" -}}
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
{{- /* The root is a mirror of the default locale (see build.sh), so its pages are cached too. */ -}}
{{- range $slugs -}}
  {{- $urls = $urls | append (cond (eq . "index") "/" (cond (eq . "404") "/404.html" (printf "/%s/" .))) -}}
{{- end -}}
{{- range (uniq $shared) -}}{{- $urls = $urls | append . -}}{{- end -}}
{{- /* Root-level static files that no bundle references. */ -}}
{{- range (slice "/manifest.json" "/favicon.png" "/favicon-new.png" "/icon-192.png" "/icon-512.png") -}}
  {{- $urls = $urls | append . -}}
{{- end -}}
{{- $urls = uniq $urls -}}

const CACHE_NAME = 'static-{{ delimit $urls "|" | hash.FNV32a }}';

// Same-origin app shell: always served from our own host, so these are reliable and cached
// atomically — a failure here means a genuinely broken build worth surfacing. Generated from the
// asset pipeline; see the comment at the top of this file.
const STATIC_ASSETS = {{ $urls | jsonify (dict "indent" "    ") | safeJS }};

// Third-party code used to be pulled from jsDelivr and Google Fonts at runtime and cached here
// best-effort, because a blocked or unreachable CDN must not fail the install. Every library and
// the webfont are now fetched at build time and concatenated into our own bundles (see
// params.vendor in hugo.yaml), so they are already covered by STATIC_ASSETS and nothing
// cross-origin needs pre-caching. The runtime data hosts below are still cached opportunistically
// as they are requested.
const CDN_ASSETS = [];

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

// Hosts whose responses are safe to cache long-term as they are requested. The font and library
// hosts are gone — those are vendored into our own bundles now — leaving the two jsDelivr-backed
// data repositories (the character database and the public deck marketplace), which are fetched at
// runtime and are genuinely remote.
const CDN_HOSTS = [
    'cdn.jsdelivr.net',
{{ if ne site.Params.additional_cdn_hosts "none" }}
    {{ site.Params.additional_cdn_hosts }}
{{ end }}
];

// The default CDN path from uvproj.yaml
const CDN_PATH = '{{ site.Params.marketplace_cdn_url }}';

// The character database (manifest + chunks) is downloaded and persisted by the page (into
// IndexedDB), but the service worker still caches whatever chunks it sees go by so they remain
// available offline. It is fetched network-first so a package update is actually picked up — a
// cache-first copy would pin the database forever. Both the manifest and the chunks come from
// jsDelivr and carry the repository name in the path. Value defined in uvproj.yaml
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
