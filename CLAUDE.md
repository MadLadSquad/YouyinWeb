# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Youyin (卣囙/yǒuyīn) is a static, multipage language-learning website that teaches users to *write* characters from various scripts (Chinese Hanzi, Japanese Kana/Kanji, Greek, Zhuyin, etc.). It is plain HTML/CSS/vanilla JS — no frameworks, no bundler at runtime. The source HTML files are *templates* that are processed at build time by `UVKBuildTool` (a C++ tool brought in as a git submodule).

The deployed site is hosted on GitHub Pages at `https://youyin.madladsquad.com/`.

## Build / develop / deploy

There is no npm/yarn build step in this repo — the build tool is a separately-compiled C++ binary.

- **First-time setup:** `./install.sh` — clones submodules, copies `UBTCustomFunctions/` into the UBT source tree, then builds `UVKBuildTool` via CMake (needs `libyaml-cpp-dev`). Outputs go to `UVKBuildTool/build/`.
- **Build + serve locally:** `./run.sh` — runs `UVKBuildTool --build ../../build ../../` from `UVKBuildTool/build/`. Per `uvproj.yaml`, the tool then rewrites local URLs and starts `python3 -m http.server 8080` automatically.
- **Build output:** lives in `build/` at the repo root. The processed HTML files there are what gets served — never edit them directly.
- **CI deploy:** `.github/workflows/static.yml` runs the same build, then `ci-clean.sh` (deletes source `.html`, `Components/`, `Translations/`, `UBTCustomFunctions/`, `UVKBuildTool/`, `.github/` and promotes `build/*` to the repo root), then minifies JS with `terser` and CSS with `csso`, rewrites `./` → `https://youyin.madladsquad.com/` and strips `.html` extensions, then deploys to Pages.

There are no unit tests, no linter, and no package.json. Don't add tooling without asking.

## Template system

HTML files are not plain HTML — they're processed by UVKBuildTool using directives configured in `uvproj.yaml`:

- `{{ include path/to/file.tmpl.html }}` — inline another template. Shared chrome lives in `Components/*.tmpl.html` (`head`, `header`, `footer`).
- `{{ _ key }}` — translation lookup. The key is resolved against the active locale's `Translations/<locale>.yaml` (`en_US.yaml`, `bg_BG.yaml`, …). The translation system can interpolate via `{{ list a b c }}` for positional `{}` substitutions inside the translated string.
- `{{ trademark }}` — variable substitution from `uvproj.yaml`'s `variables:` section.
- `.tmpl.html` files (see `intermediate-extensions` in `uvproj.yaml`) are partials only — they don't produce standalone output.

**`i18n.js` is special:** it contains `lc.foo = "{{ _ foo }}"` lines so that runtime JS code can read translated strings via the global `lc` object. When code needs a translated string from JS (not just from HTML), add the key here as well as to the YAML translation files.

The CI deploy step strips `.html` extensions from URLs, and `.htaccess` rewrites extensionless requests back to `.html`. Internal links should be written as `./page.html` in source; the build/CI handles production URL rewriting.

## Runtime architecture

The app is a set of independent pages (`index.html`, `deck.html`, `marketplace.html`, `account.html`, `404.html`, plus `deck-edit-card.html` opened from the deck page), each loading its own JS file. There is **no module system** — every page also loads `index.js` (often implicitly via shared chrome) which defines globals on `window` that the page scripts rely on:

- **Storage:** All deck/session state lives in `localStorage` under two keys:
  - `youyinCardData` — `{ sessions, streak, lastDate, totalTimeInSessions, cards: [...], phrases: [...] }`. See `example-schema.json`. `cards` are single characters; `phrases` are multi-character sequences. Card objects have a `variant` field that distinguishes Chinese/Kanji/Hanja rendering of the same codepoint (legacy decks without it are migrated by `fixLegacyCharacterVariants` in `index.js`).
  - `youyinGameModifiers` — `{ extensive, levelReduce }`. `index.js#main()` defensively initializes both keys in memory (and saves them back) if either is missing — no page reload involved. Be aware that `saveToLocalStorage` / `saveGameModifiers` mutate-then-save the global.
- **Globals defined in `index.js`:** tuning constants (`MAX_KNOWLEDGE_LEVEL`, `CARD_WRITER_SIZE`, etc.), `window.localStorageData`, `window.gameModifiers`, helpers (`$`, `addElement`, `addTextNode`, `runEventAfterAnimation`, `fisherYates`, `getLocalisedTimePostfix`), the character data loader (`charDataLoader` — fetches stroke data from `https://cdn.jsdelivr.net/gh/MadLadSquad/hanzi-writer-data-youyin/data/<char>.json`), and the language switcher.
- **Per-page scripts:**
  - `main-page.js` — the practice session: drives `hanzi-writer` (loaded from jsDelivr CDN) to grade strokes, advances the user through cards/phrases, computes errors and time-spent.
  - `deck.js` / `deck-new.js` — renders the deck page (stats card + lists of cards and phrases) and the new/edit-card flow.
  - `marketplace.js` — loads deck lists from `https://cdn.jsdelivr.net/gh/MadLadSquad/YouyinPublicDeckRepository@latest/...` and imports them into local storage.
  - `IME.js` — Romaji↔Kana and pinyin tone-mark conversion using `soundTables` (loaded from data files).

When adding strings that get rendered from JS into the DOM, you must (a) add the translation entry to every `Translations/<locale>.yaml`, and (b) expose it through `i18n.js` as `lc.<key> = "{{ _ key }}"`. Strings used only inside HTML templates only need step (a).

## Other notable things

- The character SVG/stroke database is the external `hanzi-writer-data-youyin` repo on jsDelivr — not bundled here.
- Marketplace decks live in `YouyinPublicDeckRepository` (also fetched at runtime via jsDelivr).
- `UBTCustomFunctions/` is copied into the UBT source tree at build time — it's a C++ extension hook for the build tool, currently a no-op stub.
- `.gitignore` is C++-flavored (for the submodule build); standard web-dev artifacts are not listed.
