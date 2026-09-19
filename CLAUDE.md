# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code), Gemini and other AI agents when working with code in this repository.

To understand this file, interpret all strings that mention (except when explicitly documenting these variables) `{{ cannonical_url }}`, `{{ trademark }}`, `{{ marketplace_url }}`, `{{ marketplace_cdn_url }}`, `{{ char_data_url }}` and others as the values of the `params:` section in `hugo.yaml`.

## Project overview

The web page is a static, multipage language-learning website that teaches users to *write* characters from various scripts (Chinese Hanzi, Japanese Kana/Kanji, Greek, Zhuyin, etc.). The application code is plain CSS/vanilla JS — no frameworks, no module system, no runtime bundler. The pages are built by **Hugo** (a single Go binary), which also concatenates, minifies and fingerprints every asset.

The deployed site is hosted on GitHub Pages at `{{ cannonical_url }}/`.

## Build / develop / deploy

The only build dependency is **Hugo extended 0.165+** (a single Go binary). There is no npm, no
package.json, no submodule and no compile step.

- **Build:** `./build.sh` — writes the whole site to `public/`.
- **Build + serve:** `./run.sh` (or `./build.sh --serve`) — serves `public/` on
  `http://localhost:8080`. `hugo server` is deliberately *not* used: it renders from memory under
  Hugo's lowercased locale directories, so the rename step below (and therefore every link) would
  not apply.
- **Build output:** `public/`, git-ignored. Never edit it directly.
- **CI deploy:** `.github/workflows/static.yml` installs Hugo, runs `./build.sh` and deploys
  `public/` to Pages. Nothing else — no post-processing, no `sed` passes.

`build.sh` does three things around the Hugo run:

1. Writes `data/lastmod.yaml` from git history, which dates the sitemap (this replaces the old
   `.github/update-sitemap-lastmod.py`).
2. Renames `public/en_us` → `public/en_US` and friends. Hugo lowercases the language *key* when it
   derives an output directory, and the cased names are part of the site's public URLs
   (`SUPPORTED_LOCALES` in `language-selector.js`, the `language` localStorage value, existing
   bookmarks). Every link in the templates is built from `params.dir` rather than `.RelPermalink`,
   so the rename is all that is needed.
3. Copies the default locale over the root, so `/` mirrors `/en_US/` exactly as the old build did.
   The root is the sitemap's `x-default` and the landing page for crawlers and for visitors without
   JavaScript; `setLanguage()` redirects everyone else into their locale directory.

It then fails the build if any `{{ ... }}` directive reached the output — a file that carries one
but is not run through `resources.ExecuteAsTemplate` would otherwise silently ship the literal text.

There are no unit tests and no linter. Don't add tooling without asking.

## Template system

Pages are Hugo layouts in `layouts/`, one per page, plus `baseof.html` and the partials in
`layouts/_partials/`. The pages carry no content of their own, so instead of content files they are
declared once in `layouts/_partials/pages.gotmpl` and instantiated per locale by the content
adapters in `content/<locale>/_content.gotmpl`.

- `{{ partial "t.html" (dict "k" "key") }}` — translation lookup. Add `"ctx" (dict "errors" 0)` to
  fill `{placeholder}`s, and `"loc" "bg_BG"` to read a specific locale.
- `{{ site.Params.trademark }}` — variables, from `hugo.yaml`'s `params:` section.
- `{{ partial "url.html" (dict "slug" "deck") }}` — an internal link in the current locale
  (`/en_US/deck/`). Always use this instead of writing a path; see the locale-casing note above.
- Translations live in `data/translations/<locale>.yaml` (`en_US`, `bg_BG`, `ro_RO`) as
  `key:` / `  other: "text"`. They are read through `data/` rather than Hugo's `i18n` function
  because `i18n` is bound to the language being rendered, and `assets/sw.js` has to enumerate
  *every* locale's bundles from one render pass.
- **Plurals:** a few keys have a baked `<key>` / `<key>_one` pair (e.g. `streak_days_count`), which
  the JS picks between at runtime. This deliberately avoids go-i18n's plural categories: Romanian's
  CLDR rules add a `few` form the source wording has no text for.
- **Brand name in strings:** never hardcode the site's name inside translation strings. Write the
  placeholder `{brand}` instead (e.g. `other: "Welcome to {brand}"`); the `t.html` partial
  substitutes `params.trademark` on every lookup, so the product name lives only in `hugo.yaml`.
  Other literal placeholders that *are* filled at runtime by JS (e.g. `{streak}`, see `i18n.js`)
  follow the same `{name}` convention but are substituted in the browser, not at build time.

**`assets/scripts/data/i18n.js` is special:** it is a Hugo template of
`lc.foo = {{ partial "t.html" (dict "k" "foo" "loc" $.loc) | jsonify }};` lines, built once per
locale, so runtime JS code can read translated strings via the global `lc` object. It names its
locale explicitly because the asset pipeline builds all three locales from a single render pass.
When code needs a translated string from JS (not just from HTML), add the key here as well as to the
translation files. `jsonify` emits the JS string literal, so a translation containing a quote or a
backslash is safe.

Three other scripts also carry build-time variables and are run through the template engine:
`data/theme.js` (the fingerprinted `themes-data.js` URL), `data/character-database.js` and
`pages/marketplace.js` (CDN URLs). They are listed in `$templated` in
`layouts/_partials/assets.html`; anything else with a `{{ ... }}` in it must be added there too.

## Asset pipeline

`layouts/_partials/assets.html` builds every bundle. Each is concatenated, minified and
fingerprinted, so a page costs **four requests** (document, boot, CSS, core, page) instead of the
~32 the old unbundled build made:

- **`boot`** — `browser-support.js` + `theme.js`. A blocking `<script>` in `<head>`: the gate must
  run before any storage access, and the theme before the stylesheet paints.
- **`app.css`** — every stylesheet plus the vendored `driver.css` and the generated `@font-face`
  rules, in one locale-independent bundle. `driver.css` must stay before `tutorial.css` so the
  theme-aware `.tutorial-popover` overrides win the cascade.
- **`core.<locale>`** — `i18n.js` and the shared chrome, in the order the old shared footer loaded
  them. The only locale-varying bundle.
- **`page.<slug>`** — the page's own scripts. `window.bootstrap()` sits between the two halves,
  exactly where the shared footer used to start `main()`: the scripts before it only *define* things
  `main()`'s async continuations reach for, and the ones after it read `window.storageReady` at
  their top level. Adding a page means adding an entry to the `$pages` table here.

**Third-party code is vendored at build time.** `params.vendor` in `hugo.yaml` pins hanzi-writer,
driver.js, twemoji and (via `data/font.yaml`) the Ubuntu webfont; `resources.GetRemote` fetches them
during the build and they are concatenated into the bundles above. The running site therefore makes **no cross-origin request** for code, styles or fonts. Two
runtime data sources are still remote by design — the character database and the marketplace decks, both on jsDelivr — as are the emoji SVGs
twemoji swaps in. Bump a version by editing `hugo.yaml`. Note that `params.vendor` keys must be
lowercase: Hugo lowercases config map keys, so a camelCase lookup silently returns nil.

URLs are directory URLs (`/en_US/deck/`), which GitHub Pages serves natively — the old build's
`.html`-stripping `sed` pass and the `.htaccess` rewrite are gone (`.htaccess` has been deleted). Never write a page path by hand
in a template (use `url.html`) or in JS (use `window.pageUrl(slug, query)`).

## Runtime architecture

The app is a set of independent pages (`index`, `deck`, `marketplace`, `account`, `privacy`, `licenses`, `404`, plus `deck-edit-card` opened from the deck page). There is **no module system**: the scripts communicate through globals on `window`, and the bundler simply concatenates them in a fixed order (no two of them declare the same top-level name). Every page loads `assets/scripts/index.js` via the shared core bundle, which defines the globals the page scripts rely on:

- **Storage:** All deck/session *profile* state lives in **IndexedDB** (database `site`, object store `profile`) under two keys. UI-only settings (`theme`, `language`), the onboarding-tutorial state (`tutorialDone`, `tutorialStep`, `tutorialMode`) and the privacy-consent answer (`privacyAccepted`) deliberately stay in `localStorage` — they're tiny and read synchronously before render.
  - `cardData` — `{ sessions, streak, lastDate, lastStreakDay, lastLevelReduceDay, totalTimeInSessions, activityByDay, gems, streakFreezes, streakGoal, cards: [...], phrases: [...] }`. See `example-schema.json`. `cards` are single characters; `phrases` are multi-character sequences. `activityByDay` is a flat `localDayIndex -> session-count` map (written by `recordSessionActivity` in `assets/scripts/pages/main-page.js`) that powers the account-page activity heatmap. `gems`/`streakFreezes`/`streakGoal` back the gem economy (see the streak-freeze section below); a `streakGoal` of `0` means the user has never chosen one. Card objects have a `variant` field that distinguishes Chinese/Kanji/Hanja rendering of the same codepoint (legacy decks without it are migrated by `fixLegacyCharacterVariants` in `assets/scripts/index.js`).
  - `gameModifiers` — `{ extensive, levelReduce }`. `assets/scripts/index.js#main()` defensively initializes both keys in memory if either is missing. `saveProfileData(obj)` / `saveGameModifiers()` write the in-memory global to IndexedDB and **return a promise** — `await` it (or `.then`) before navigating/reloading, otherwise the page teardown can abort the write, and give fire-and-forget calls a `.catch(() => {})` because a failed write rejects. Both are **no-ops until the privacy policy has been accepted** (`privacyConsentGiven()`), which is what keeps the consent-exempt privacy and licenses pages from writing anything.
  - **Startup repairs:** `main()` fills in defaults and runs the field migrations in memory only, recording whether anything changed; `persistStartupChanges` writes them (and moves legacy `localStorage` data into IndexedDB) once consent has been given.
  - **Cross-tab consistency:** every save writes the whole in-memory profile, so a stale tab could undo another tab's write. Successful saves are announced on a `BroadcastChannel`, and a tab that hears one reloads as soon as it is visible and idle (not mid-round, not in the card editor).
  - **Deck imports:** the file import on the deck page and the marketplace import both go through `mergeDeckIntoProfile` in `index.js`, which validates and normalises every entry, rejects the whole file if any entry is unusable, and skips cards (character + variant) and phrases the user already has.
  - **Async load + gating:** IndexedDB is asynchronous, so `main()` is `async` and exposes `window.storageReady`. To optimize load sequence, startup is split across readiness signals:
    - `window.profileReady` resolves once the profile and modifiers are loaded and the footer select boxes are initialized (enables deck shells/streaks to render immediately).
    - `window.charDataReady` resolves once the character stroke database is ready in memory.
    - `window.storageReady` remains the final "everything is loaded" promise that resolves when `main()` completes.
    Every page-script entry point that needs character data must run inside `window.storageReady.then(...)` or wait for `charDataReady`.
  - **Missing stroke data:** `charDataLoader` in `writer.js` reports a character that isn't in the database through hanzi-writer's error callback instead of staying silent (which left the writer waiting forever). `createWriter` installs a no-op `onLoadCharDataError`; the practice page passes `writerOnMissingCharacter`, which skips the character without scoring it. The card editor refuses to save a card that isn't exactly one character, has no stroke data (when the database is loaded) or duplicates an existing card.
  - **Browser-support gate:** `assets/scripts/data/browser-support.js` is first in the render-blocking `boot` bundle, ahead of `theme.js` and of `<body>`. If a privacy/lockdown profile blocks the APIs the app hard-depends on (e.g. IndexedDB), it sets `window.UNSUPPORTED` and renders a blocking overlay. `main()` checks this flag first and returns a never-resolving promise, so none of the readiness promises ever resolve and every page script stays dormant. The JavaScript-disabled case is handled separately by the `<noscript>` block in the header partial.
  - **Legacy migration:** `loadProfileData()` reads IndexedDB first; if a key is empty but the old `localStorage` entry exists, it reads that into memory, and `persistStartupChanges` copies it into IndexedDB and removes the `localStorage` key once consent has been given (one-time move). If IndexedDB is entirely unavailable, it falls back to reading `localStorage` in memory for the session.
- **Globals & API Structure:**
  - **`assets/scripts/index.js` (Core Globals & Storage):** `MAX_KNOWLEDGE_LEVEL`, time unit constants (`HOUR_UNIX`, `MINUTE_UNIX`, `SECOND_UNIX`), `window.profileData`, `window.gameModifiers`, storage promises (`storageReady`, `profileReady`, `charDataReady`), IndexedDB wrappers (`openDB`, `idbGet`, `idbPut`, `idbDelete`), DOM/animation helpers (`$`, `addElement`, `addTextNode`, `toCharacters`, `runEventAfterAnimation`), `localDayIndex` (the timezone-independent day number every daily system uses), `downloadJSON`, deck import (`mergeDeckIntoProfile`), and profile persistence (`saveProfileData`, `saveGameModifiers`).
  - **`assets/scripts/components/writer.js` (HanziWriter Wrappers):** `CARD_WRITER_SIZE`, `PHRASE_CARD_WRITER_SIZE`, `createWriter`, `createCardWriter`, and the database loader `charDataLoader`. Note that `charDataLoader` reads synchronously from the in-memory `window.characterData` map populated by `assets/scripts/data/character-database.js` instead of triggering network requests.
  - **`assets/scripts/data/character-database.js` (Database Sync):** `window.characterData`, `loadCharacterDataFromIDB`, `fetchUpstreamManifest`, `downloadChunks`, `firstTimeDownload`, and `backgroundUpdate` which keep the stroke data updated from CDN chunks and cached locally.
  - **`assets/scripts/components/language-selector.js` (Language Selection):** `setLanguage`, `setLanguageBox`, `redirectWithLanguage`, and `SUPPORTED_LOCALES`.
  - **`assets/scripts/components/select-box.js` (Popup Plumbing):** `createPopupController` and the shared `window.popupControllers` registry — the single document-level click/keydown handling for all button-triggered popups (language/variant/theme). Each closed popup is `display:none` to avoid mobile overflow.
  - **`assets/scripts/data/theme.js` (Theme Injection):** `applyPalette`, `applyTheme`, `cacheThemePalette`, `loadThemeCatalogue`, and `defaultTheme` (loaded synchronously in `<head>`). Paints the active theme at boot from a small cached palette; the full ~190-palette catalogue lives in `assets/scripts/data/themes-data.js` (`window.themes`) and is loaded **lazily** via `loadThemeCatalogue()` (when the theme picker opens or a one-time palette-cache heal runs), keeping the bulky table off the critical render path. The `default` entry is mirrored in both files — keep them in sync.
  - **`assets/scripts/components/theme-selector.js` (Theme UI):** theme select-picker popup.
  - **`assets/scripts/components/daily-streak.js` (Streak & Daily Resets):** `renderStreakField`, `updateDailyStreak`, `checkStreakExpiry`, `applyDailyLevelReduction`, and the midnight scheduler (`msUntilNextLocalMidnight`, `scheduleDailyMidnightCheck`). `checkStreakExpiry` is the **only** place `streak` is ever zeroed, and therefore the only place streak freezes are spent — one per fully missed day, each advancing `lastStreakDay` (so the streak survives but never grows on a frozen day) until the wallet is empty.
  - **Gem economy:** 10 gems (`GEMS_PER_ITEM`) per completed card and per completed *whole* phrase, awarded by `awardItemGems` in `assets/scripts/pages/main-page.js` and floated up the screen by `floatGemsGain`. They buy streak freezes (max `MAX_STREAK_FREEZES`) from the account-page shop. The price comes from `streakFreezeCost(goal)` in `assets/scripts/index.js` — `STREAK_FREEZE_COST_DAYS` days of practice at the user's own daily goal, i.e. four days × `goal` rounds × `MAX_SESSION_REVISION_ITEMS × 2` items × 10 gems.
  - **`assets/scripts/components/privacy-consent.js` (Privacy Gate):** `privacyConsentGiven`, `showPrivacyConsentModal` and `awaitPrivacyConsent` — the blocking, first-thing-you-see modal that requires the user to accept `privacy.html` before the app does anything the policy describes. `main()` awaits it *before* `maybeStartTutorial` (which also leaves the privacy and licenses pages alone, so the policy opened from the modal isn't redirected away), before `resolveProfileReady` (so the tutorial, the streak-goal prompt and every page script stay dormant behind it) and before the service-worker registration and character-database download, which are additionally guarded by `privacyConsentGiven()`. The answer stored in `localStorage` is `PRIVACY_POLICY_VERSION`, not a bare flag — bump that constant after a material change to the policy to re-prompt everyone once. The privacy page itself is exempt from the modal (so the policy stays readable) but still counts as un-consented, so nothing downloads there either.
  - **`assets/scripts/components/streak-goal.js` (Daily Goal Prompt):** `streakGoalText` (shared wording of a goal value) and `showStreakGoalModal`, the blocking prompt that collects `profileData.streakGoal` when it is still `0`. Loaded on `index.html` and `account.html` only. Returning users are caught by its own `profileReady` gate; first-time users are handed off from the tutorial outro in `assets/scripts/components/tutorial/main-page.js` so the two never fight over the screen.
  - **`assets/scripts/components/activity-calendar.js` (Activity Heatmap):** GitHub-style year heatmap on the account page, built from `profileData.activityByDay`. Cell colour is pure-CSS (a `data-level` attribute + `color-mix` in `assets/styles/components/activity-calendar.css`) so it retints with the theme automatically.
  - **`assets/scripts/components/char-loading-ui.js` (Download UI):** builders for the blocking first-visit download modal and the non-blocking background-update pill, driven by the download logic in `character-database.js`.
  - **`assets/scripts/components/emoji.js` (Twemoji):** `parseEmojis` / `initEmojiReplacement` — replaces native emoji with Twemoji SVGs site-wide (the library is vendored into the core bundle and fetches the SVGs matching its own version from jsDelivr; a `MutationObserver` covers dynamically added content).
  - **`assets/scripts/utils/fuzzy-match.js` + `assets/scripts/components/card-search.js` (Search):** `fuzzyMatch` (case-insensitive subsequence matcher) plus shared query normalisation (`normaliseSearchQuery`, `stripDiacritics`), multi-field matching, debounce and results-fade wiring for the deck and marketplace search bars.
  - **`assets/scripts/utils/format.js` (Formatting):** localized string formatters like `getLocalisedTimePostfix`.
  - **`assets/scripts/pages/main-page.js` (Practice Logic):** `fisherYates` helper for card/phrase shuffling; `recordSessionActivity` (writes `activityByDay`).
- **Per-page scripts (under `assets/scripts/pages/` and `assets/scripts/utils/`):**
  - `assets/scripts/pages/main-page.js` — the practice session: drives the vendored `hanzi-writer` to grade strokes, advances the user through cards/phrases, computes errors and time-spent.
  - `assets/scripts/pages/deck.js` / `assets/scripts/pages/deck-new.js` — renders the deck page (stats card + lists of cards and phrases) and the new/edit-card flow.
  - `assets/scripts/pages/account.js` — the account page: profile stats, game-modifier settings (`setupGameModifiers`), the activity calendar, and data management (`clearAccountData`).
  - `assets/scripts/pages/marketplace.js` — loads deck lists from `https://cdn.jsdelivr.net/gh/MadLadSquad/YouyinPublicDeckRepository@latest/...` and imports them into the user's deck (IndexedDB).
  - `assets/scripts/utils/IME.js` — Romaji↔Kana and pinyin tone-mark conversion using `soundTables` (loaded from data files).
- **Onboarding tutorial (`assets/scripts/components/tutorial.js` + `assets/scripts/components/tutorial/*.js`):** A first-visit, cross-page guided tour. Because it spans pages and waits on real events (character-database download, a marketplace import committing, a practice session finishing), it's a small state machine persisted in `localStorage` (`tutorialStep`/`Done`/`Mode`): each page renders the slice matching the current step, awaits the action, advances, then navigates on. `tutorial.js` is the cross-page core (state machine, shared helpers, Driver.js wrapper, per-page `tutDispatch`); the per-page stage functions live in `assets/scripts/components/tutorial/` (`main-page.js`, `marketplace.js`, `deck.js`, `deck-new.js`, `account.js`) and load only on their page. Element highlighting uses **Driver.js** (`window.driver.js.driver`, vendored into the core bundle, with `driver.css` in `app.css`).

When adding strings that get rendered from JS into the DOM, you must (a) add the translation entry to every `data/translations/<locale>.yaml`, and (b) expose it through `assets/scripts/data/i18n.js` as `lc.<key> = {{ partial "t.html" (dict "k" "<key>" "loc" $.loc) | jsonify }};`. Strings used only inside layouts need step (a) only. A key missing from a locale falls back to `en_US` with a build warning; a key missing everywhere fails the build.

## Other notable things

- The character stroke database is downloaded once in chunks, cached in IndexedDB, and held in memory; there is no per-character network fetch during sessions.
- Marketplace decks live in `YouyinPublicDeckRepository` (also fetched at runtime via jsDelivr).
- Service worker (`assets/sw.js`) pre-caches the app shell for offline use as a PWA. Its `STATIC_ASSETS` list and its `CACHE_NAME` are **generated from the asset pipeline** — it enumerates every locale's bundles and hashes the result — so there is nothing to hand-maintain and no `CACHE_NAME` to bump. Third-party code is vendored into the bundles, so nothing cross-origin is precached. Runtime data from the hosts in `CDN_HOSTS` (jsDelivr plus `params.additional_cdn_hosts`) goes into a separate `data-v1` cache that survives deploys. Of the root mirror only `/` and `/404.html` are cached, because JavaScript users are always redirected into a locale directory. The home page is listed as its directory URL (`/en_US/`) rather than a document: a duplicate URL would make `cache.addAll` reject and fail the whole install.
- **SEO / AI discoverability:** `assets/robots.txt` (welcomes general and AI/LLM crawlers), `assets/llms.txt` (LLM-oriented site summary) and `assets/sitemap.xml` are templates published to the site root by `layouts/_partials/root-files.html`, alongside `sw.js` and `manifest.json`. `layouts/_partials/head.html` carries Open Graph/Twitter meta, `hreflang` alternates and JSON-LD structured data. Hugo's own sitemap is disabled: it emits Hugo's lowercased locale directories, and the `hreflang`/`x-default` entries have to be written by hand anyway. `<lastmod>` comes from `data/lastmod.yaml`, which `build.sh` regenerates from git (a page's date only moves when its layout, the shared chrome, or the translations changed).
- **Open-source licenses page:** `layouts/licenses.html` lists every third-party component from `data/licenses.yaml` with its full license text, fetched at build time by `layouts/_partials/license-text.html` (so the page makes no cross-origin request). Vendored entries (`vendor: <key>`, `font: true`) derive their version and license URL from `params.vendor` / `data/font.yaml`, so bumping a version updates the page automatically. **Adding a vendored library, a runtime data source or any other third-party asset means adding an entry there too**, plus its `licenses_used_for_<id>` translation in every locale. Like the privacy page, it is exempt from the privacy-consent modal (`onPrivacyPolicyPage` in `privacy-consent.js`).
- `.gitignore` covers Hugo's outputs: `public/` (the build), `resources/` (Hugo's cache of the fetched vendor libraries and compiled assets) and the generated `data/lastmod.yaml`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
