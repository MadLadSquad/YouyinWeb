# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code), Gemini and other AI agents when working with code in this repository.

To understand this file, interpret all strings that mention(except when explicitly documenting these variables)`{{ cannonical_url }}`, `{{ trademark }}`, `{{ marketplace_url }}`, `{{ marketplace_cdn_url }}`, `{{ char_data_url }}` and others as the values of the variables array in the uvproj.yaml file.

## Project overview

The web page is a static, multipage language-learning website that teaches users to *write* characters from various scripts (Chinese Hanzi, Japanese Kana/Kanji, Greek, Zhuyin, etc.). It is plain HTML/CSS/vanilla JS — no frameworks, no bundler at runtime. The source HTML files are *templates* that are processed at build time by `UVKBuildTool` (a C++ tool brought in as a git submodule).

The deployed site is hosted on GitHub Pages at `{{ cannonical_url }}/`.

## Build / develop / deploy

There is no npm/yarn build step in this repo — the build tool is a separately-compiled C++ binary.

- **First-time setup:** `./install.sh` — clones submodules, copies `UBTCustomFunctions/` into the UBT source tree, then builds `UVKBuildTool` via CMake (needs `libyaml-cpp-dev`). Outputs go to `UVKBuildTool/build/`.
- **Build + serve locally:** `./run.sh` — runs `UVKBuildTool --build ../../build ../../` from `UVKBuildTool/build/`. Per `uvproj.yaml`, the tool then rewrites local URLs and starts `python3 -m http.server 8080` automatically.
- **Build output:** lives in `build/` at the repo root. The processed HTML files there are what gets served — never edit them directly.
- **CI deploy:** `.github/workflows/static.yml` runs the same build, then `ci-clean.sh` (deletes source `.html`, `Components/`, `Translations/`, `UBTCustomFunctions/`, `UVKBuildTool/`, `.github/` and promotes `build/*` to the repo root), then minifies JS with `terser` and CSS with `csso`, rewrites `./` → `{{ cannonical_url }}/` and strips `.html` extensions, then deploys to Pages.

There are no unit tests, no linter, and no package.json. Don't add tooling without asking.

## Template system

HTML files are not plain HTML — they're processed by UVKBuildTool using directives configured in `uvproj.yaml`:

- `{{ include path/to/file.tmpl.html }}` — inline another template. Shared chrome lives in `Components/*.tmpl.html` (`head`, `header`, `footer`).
- `{{ _ key }}` — translation lookup. The key is resolved against the active locale's `Translations/<locale>.yaml` (`en_US.yaml`, `bg_BG.yaml`, …). The translation system can interpolate via `{{ list a b c }}` for positional `{}` substitutions inside the translated string.
- `{{ trademark }}` — variable substitution from `uvproj.yaml`'s `variables:` section. Uses the site's name even.
- **Brand name in strings:** never hardcode the site's name inside translation strings. Write the placeholder `{brand}` instead (e.g. `text: "Welcome to {brand}"`); the build substitutes it with the `trademark` variable's value from `uvproj.yaml`, even for a bare `{{ _ key }}` lookup with no explicit `{{ list }}`. This keeps the product name in one place so the site can be renamed by editing only `uvproj.yaml`. Other literal placeholders that *are* filled at runtime by JS (e.g. `{streak}`, see `i18n.js`) follow the same `{name}` convention but are substituted in the browser, not at build time.
- `.tmpl.html` files (see `intermediate-extensions` in `uvproj.yaml`) are partials only — they don't produce standalone output.

**`scripts/data/i18n.js` is special:** it contains `lc.foo = "{{ _ foo }}"` lines so that runtime JS code can read translated strings via the global `lc` object. When code needs a translated string from JS (not just from HTML), add the key here as well as to the YAML translation files.

The CI deploy step strips `.html` extensions from URLs, and `.htaccess` rewrites extensionless requests back to `.html`. Internal links should be written as `./page.html` in source; the build/CI handles production URL rewriting.

## Runtime architecture

The app is a set of independent pages (`index.html`, `deck.html`, `marketplace.html`, `account.html`, `404.html`, plus `deck-edit-card.html` opened from the deck page), each loading its own JS file. There is **no module system** — every page also loads `scripts/index.js` (implicitly via `Components/footer.tmpl.html` shared chrome) which defines globals on `window` that the page scripts rely on:

- **Storage:** All deck/session *profile* state lives in **IndexedDB** (database `site`, object store `profile`) under two keys. UI-only settings (`theme`, `language`) and the onboarding-tutorial state (`tutorialDone`, `tutorialStep`, `tutorialMode`) deliberately stay in `localStorage` — they're tiny and read synchronously before render.
  - `cardData` — `{ sessions, streak, lastDate, lastStreakDay, lastLevelReduceDay, totalTimeInSessions, activityByDay, cards: [...], phrases: [...] }`. See `example-schema.json`. `cards` are single characters; `phrases` are multi-character sequences. `activityByDay` is a flat `localDayIndex -> session-count` map (written by `recordSessionActivity` in `scripts/pages/main-page.js`) that powers the account-page activity heatmap. Card objects have a `variant` field that distinguishes Chinese/Kanji/Hanja rendering of the same codepoint (legacy decks without it are migrated by `fixLegacyCharacterVariants` in `scripts/index.js`).
  - `gameModifiers` — `{ extensive, levelReduce }`. `scripts/index.js#main()` defensively initializes both keys in memory (and saves them back) if either is missing. `saveProfileData(obj)` / `saveGameModifiers()` write the in-memory global to IndexedDB and **return a promise** — `await` it (or `.then`) before navigating/reloading, otherwise the page teardown can abort the write.
  - **Async load + gating:** IndexedDB is asynchronous, so `main()` is `async` and exposes `window.storageReady`. To optimize load sequence, startup is split across readiness signals:
    - `window.profileReady` resolves once the profile and modifiers are loaded and the footer select boxes are initialized (enables deck shells/streaks to render immediately).
    - `window.charDataReady` resolves once the character stroke database is ready in memory.
    - `window.storageReady` remains the final "everything is loaded" promise that resolves when `main()` completes.
    Every page-script entry point that needs character data must run inside `window.storageReady.then(...)` or wait for `charDataReady`.
  - **Browser-support gate:** `scripts/data/browser-support.js` is the first script on every page (top of `head.tmpl.html`, before `theme.js` and before `<body>`). If a privacy/lockdown profile blocks the APIs the app hard-depends on (e.g. IndexedDB), it sets `window.UNSUPPORTED` and renders a blocking overlay. `main()` checks this flag first and returns a never-resolving promise, so none of the readiness promises ever resolve and every page script stays dormant. The JavaScript-disabled case is handled separately by the `<noscript>` block in `header.tmpl.html`.
  - **Legacy migration:** `loadProfileData()` reads IndexedDB first; if a key is empty but the old `localStorage` entry exists, it copies it into IndexedDB and removes the `localStorage` key (one-time move). If IndexedDB is entirely unavailable, it falls back to reading `localStorage` in memory for the session.
- **Globals & API Structure:**
  - **`scripts/index.js` (Core Globals & Storage):** `MAX_KNOWLEDGE_LEVEL`, time unit constants (`HOUR_UNIX`, `MINUTE_UNIX`, `SECOND_UNIX`), `window.profileData`, `window.gameModifiers`, storage promises (`storageReady`, `profileReady`, `charDataReady`), IndexedDB wrappers (`openDB`, `idbGet`, `idbPut`, `idbDelete`), DOM/animation helpers (`$`, `addElement`, `addTextNode`, `toCharacters`, `runEventAfterAnimation`), and profile persistence (`saveProfileData`, `saveGameModifiers`).
  - **`scripts/components/writer.js` (HanziWriter Wrappers):** `CARD_WRITER_SIZE`, `PHRASE_CARD_WRITER_SIZE`, `createWriter`, `createCardWriter`, and the database loader `charDataLoader`. Note that `charDataLoader` reads synchronously from the in-memory `window.characterData` map populated by `scripts/data/character-database.js` instead of triggering network requests.
  - **`scripts/data/character-database.js` (Database Sync):** `window.characterData`, `loadCharacterDataFromIDB`, `fetchUpstreamManifest`, `downloadChunks`, `firstTimeDownload`, and `backgroundUpdate` which keep the stroke data updated from CDN chunks and cached locally.
  - **`scripts/components/language-selector.js` (Language Selection):** `setLanguage`, `setLanguageBox`, `redirectWithLanguage`, and `SUPPORTED_LOCALES`.
  - **`scripts/components/select-box.js` (Popup Plumbing):** `createPopupController` and the shared `window.popupControllers` registry — the single document-level click/keydown handling for all button-triggered popups (language/variant/theme). Each closed popup is `display:none` to avoid mobile overflow.
  - **`scripts/data/theme.js` (Theme Injection):** `applyPalette`, `applyTheme`, `cacheThemePalette`, `loadThemeCatalogue`, and `defaultTheme` (loaded synchronously in `<head>`). Paints the active theme at boot from a small cached palette; the full ~190-palette catalogue lives in `scripts/data/themes-data.js` (`window.themes`) and is loaded **lazily** via `loadThemeCatalogue()` (when the theme picker opens or a one-time palette-cache heal runs), keeping the bulky table off the critical render path. The `default` entry is mirrored in both files — keep them in sync.
  - **`scripts/components/theme-selector.js` (Theme UI):** theme select-picker popup.
  - **`scripts/components/daily-streak.js` (Streak & Daily Resets):** `localDayIndex`, `renderStreakField`, `updateDailyStreak`, `checkStreakExpiry`, `applyDailyLevelReduction`, and the midnight scheduler (`msUntilNextLocalMidnight`, `scheduleDailyMidnightCheck`).
  - **`scripts/components/activity-calendar.js` (Activity Heatmap):** GitHub/Monkeytype-style year heatmap on the account page, built from `profileData.activityByDay`. Cell colour is pure-CSS (a `data-level` attribute + `color-mix` in `styles/components/activity-calendar.css`) so it retints with the theme automatically.
  - **`scripts/components/char-loading-ui.js` (Download UI):** builders for the blocking first-visit download modal and the non-blocking background-update pill, driven by the download logic in `character-database.js`.
  - **`scripts/components/emoji.js` (Twemoji):** `parseEmojis` / `initEmojiReplacement` — replaces native emoji with Twemoji SVGs site-wide (library loaded `defer` from jsDelivr; a `MutationObserver` covers dynamically added content).
  - **`scripts/utils/fuzzy-match.js` + `scripts/components/card-search.js` (Search):** `fuzzyMatch` (case-insensitive subsequence matcher) plus shared query normalisation (`normaliseSearchQuery`, `stripDiacritics`), multi-field matching, debounce and results-fade wiring for the deck and marketplace search bars.
  - **`scripts/utils/format.js` (Formatting):** localized string formatters like `getLocalisedTimePostfix`.
  - **`scripts/pages/main-page.js` (Practice Logic):** `fisherYates` helper for card/phrase shuffling; `recordSessionActivity` (writes `activityByDay`).
- **Per-page scripts (under `scripts/pages/` and `scripts/utils/`):**
  - `scripts/pages/main-page.js` — the practice session: drives `hanzi-writer` (loaded from jsDelivr CDN) to grade strokes, advances the user through cards/phrases, computes errors and time-spent.
  - `scripts/pages/deck.js` / `scripts/pages/deck-new.js` — renders the deck page (stats card + lists of cards and phrases) and the new/edit-card flow.
  - `scripts/pages/account.js` — the account page: profile stats, game-modifier settings (`setupGameModifiers`), the activity calendar, and data management (`clearAccountData`).
  - `scripts/pages/marketplace.js` — loads deck lists from `https://cdn.jsdelivr.net/gh/MadLadSquad/YouyinPublicDeckRepository@latest/...` and imports them into the user's deck (IndexedDB).
  - `scripts/utils/IME.js` — Romaji↔Kana and pinyin tone-mark conversion using `soundTables` (loaded from data files).
- **Onboarding tutorial (`scripts/components/tutorial.js` + `scripts/components/tutorial/*.js`):** A first-visit, cross-page guided tour. Because it spans pages and waits on real events (character-database download, a marketplace import committing, a practice session finishing), it's a small state machine persisted in `localStorage` (`tutorialStep`/`Done`/`Mode`): each page renders the slice matching the current step, awaits the action, advances, then navigates on. `tutorial.js` is the cross-page core (state machine, shared helpers, Driver.js wrapper, per-page `tutDispatch`); the per-page stage functions live in `scripts/components/tutorial/` (`main-page.js`, `marketplace.js`, `deck.js`, `deck-new.js`, `account.js`) and load only on their page. Element highlighting uses **Driver.js** (`window.driver.js.driver`, loaded from jsDelivr alongside `driver.css`).

When adding strings that get rendered from JS into the DOM, you must (a) add the translation entry to every `Translations/<locale>.yaml`, and (b) expose it through `scripts/data/i18n.js` as `lc.<key> = "{{ _ key }}"`. Strings used only inside HTML templates only need step (a).

## Other notable things

- The character stroke database is downloaded once in chunks, cached in IndexedDB, and held in memory; there is no per-character network fetch during sessions.
- Marketplace decks live in `YouyinPublicDeckRepository` (also fetched at runtime via jsDelivr).
- `UBTCustomFunctions/` is copied into the UBT source tree at build time — it's a C++ extension hook for the build tool, currently a no-op stub.
- Service worker (`sw.js`) caches static assets, script files, and key CDN dependencies (`hanzi-writer.min.js`, etc.) to enable offline capability as a PWA. Its pre-cache lists (`PAGES`/`SCRIPTS`/`ROOT_ONLY_ASSETS`) are generated per-locale; **bump `CACHE_NAME` and add any new script/style/page to these lists** when you add files. `index.html` is deliberately omitted (the directory URL serves it; an entry would collide after CI URL rewriting and break `cache.addAll`).
- **SEO / AI discoverability:** `robots.txt` (welcomes general and AI/LLM crawlers), `llms.txt` (LLM-oriented site summary), and `sitemap.xml` live at the repo root. `head.tmpl.html` carries Open Graph/Twitter meta and JSON-LD structured data (translated via `{{ _ site-description }}`/`og_locale`). `.github/update-sitemap-lastmod.py` runs in the `update-deps.yml` workflow to refresh each `<lastmod>` from git history (a page's date only moves when its template, shared chrome, or translations changed).
- `.gitignore` is C++-flavored (for the submodule build); standard web-dev artifacts are not listed.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
