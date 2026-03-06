# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- CLI with `--headed`, `--chrome-path`, `--user-data-dir` flags

### Predictive Browsing Engine

- **Page Diff** — track state changes between snapshots, return only deltas
- **Intent Filtering** — filter snapshots by agent intent (login, search, buy, etc.)
- **Action Flows** — auto-discover multi-step workflows executable in one call
- **Smart Extraction** — built-in extractors for articles, links, headings, images, tables, metadata
