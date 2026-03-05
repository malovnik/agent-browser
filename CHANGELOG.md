# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
