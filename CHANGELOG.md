# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-03-06

### Fixed

- **Wikipedia content preview** — Showed language sidebar instead of article text. Root cause: TreeWalker checked only direct parent element, not ancestors. Now walks up to 6 ancestors checking skip patterns. Added priority selectors (`.mw-parser-output`, `.tm-article-body`, etc.) that bypass text-length scoring
- **JSON in content preview** — Yandex.Market ad widget JSON (`{"widgets":...}`) leaked into preview text. Added filter: text nodes starting with `{` containing `"` are now rejected
- **Ad block filtering** — Added `monetize|promo|sponsor|ad-|ads-` to skip patterns for content preview ancestor walk

## [0.2.3] - 2026-03-06

### Added

- **Auto-dismiss modals** — Cookie consent banners, sign-in popups, and blocking overlays (`aria-modal="true"`) are automatically detected and dismissed after page load. Three-tier strategy: (1) known consent SDK selectors (OneTrust, CookieBot, Didomi, etc.), (2) text/aria-label pattern matching on buttons inside modal containers, (3) fallback scan of `[aria-modal]`/`[role="dialog"]` overlays. Supports English and Russian button labels

### Tested

- Booking.com: sign-in modal (`aria-modal`) blocked page to 3 elements → auto-dismiss restores full 177 elements
- Airbnb: cookie/translation modal blocked page to 2 elements → auto-dismiss restores full 131 elements

## [0.2.2] - 2026-03-06

### Fixed

- **Navigate retry on redirect** — Sites with JS redirects (Ozon, Booking) caused "Execution context was destroyed" errors. Navigate now retries once after waiting 1s for the redirect to settle
- **SPA content loading** — Heavy SPAs (YouTube, Gosuslugi) showed 0 elements because content loaded via XHR after DOM ready. Added `waitForNetworkIdle` (500ms idle, 5s timeout) before DOM stability check
- **Content preview quality** — Wikipedia showed language sidebar instead of article text; 4PDA showed iframe HTML. Expanded exclusion filters for language/toc/cookie/consent/modal blocks. Added Wikipedia, Habr, and generic article body selectors

### Changed

- Documentation updated: all integration examples now use `node dist/bin/cli.js` instead of `npx tsx` (avoids esbuild `__name` issue, faster startup)
- CLI flag docs: default is headed mode; `--headless` flag to opt into headless

### Tested

- Verified on 38 diverse websites: news (BBC, NYT, Reuters), forums (Stack Overflow, Habr, HN), e-commerce (Amazon, Ozon, Avito, Booking), video (Twitch), crypto (CoinMarketCap), docs (Python, Tailwind), social (Product Hunt, Figma), government (GOV.UK), medical (WebMD), recipes (AllRecipes), and more

## [0.2.1] - 2026-03-06

### Fixed

- **esbuild `__name` runtime error** — `page.evaluate()` callbacks failed with "__name is not defined" when running via tsx. Triple fix: arrow functions in evaluate callbacks, `__name` polyfill via `evaluateOnNewDocument`, and switch to `node dist/` (tsc has no `__name` wrapper)
- **Cloudflare bypass** — Replaced puppeteer-extra + stealth with puppeteer-real-browser (rebrowser-patches at CDP level). Headed mode by default for TLS fingerprint passthrough
- **Cloudflare timeout** — Navigate catches 30s timeout, detects "Just a moment..." title, waits up to 60s for challenge completion
- **Content preview showing nav menus** — Replaced naive `article || main || body` with scoring: finds largest content block via querySelectorAll
- **Scroll amount** — Scroll tool now accepts optional `amount` parameter (default 600px)

## [0.2.0] - 2026-03-06

### Added

- **Feed Items Extraction** — new `extract(feed_items)` target that auto-detects repeated DOM structures (posts, cards, threads) and extracts title, URL, preview text, and stats from each item
- **Feed Page Type** — classifier now detects feed/timeline pages (Reddit, Pikabu, Habr, HN, etc.) via URL patterns, title keywords, and element heuristics (many headings + many links)
- **Content Preview in Snapshots** — `snapshot` and `snapshot_compact` now include a 500-char text preview for article and feed pages, so agents can see page content without extra tool calls

### Fixed

- **Article Text Extraction** — replaced fragile hardcoded CSS selectors with a content scoring algorithm that scores blocks by text density, paragraph count, and semantic tags. No more grabbing sidebar content instead of the article
- **Links Extraction** — smart main area detection with fallback: if the detected main area has fewer than 5 links, falls back to document.body. Added deduplication and filtering of javascript:/anchor-only hrefs
- **Evaluate Auto-IIFE** — expressions containing `const`/`let`/`class` declarations are now automatically wrapped in an IIFE to prevent "Identifier already declared" errors on repeated calls

## [0.1.0] - 2026-03-05

### Added

- Core browser engine with CDP connection via puppeteer-core
- Accessibility tree parsing into structured `PageElement[]`
- Heuristic page type classification (login, search, article, product, form, etc.)
- Semantic action discovery with auto-grouping (LOGIN FORM, SEARCH, NAVIGATION)
- Token-optimized text renderer (~200-300 tokens per page vs ~4,800+ for screenshots)
- MCP server with 21 tools over stdio transport
- CLI with `--headless`, `--chrome-path`, `--user-data-dir` flags

### Predictive Browsing Engine

- **Page Diff** — track state changes between snapshots, return only deltas
- **Intent Filtering** — filter snapshots by agent intent (login, search, buy, etc.)
- **Action Flows** — auto-discover multi-step workflows executable in one call
- **Smart Extraction** — built-in extractors for articles, links, headings, images, tables, metadata
