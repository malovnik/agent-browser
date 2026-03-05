# agent-browser

Text-first browser for AI agents. Replaces screenshot-based browsing with semantic page representation and automatic action discovery.

## What it does

Instead of sending screenshots to an LLM (4,800+ tokens per page), agent-browser parses the accessibility tree and returns a structured text snapshot (~200-300 tokens) with:

- **Page classification** — auto-detects page type (login, search, article, product, form, etc.)
- **Action discovery** — groups interactive elements into semantic categories (LOGIN FORM, SEARCH, NAVIGATION)
- **Element refs** — every interactive element gets a ref (`@e1`, `@e2`) for direct manipulation

### Predictive Browsing Engine

Unique features not found in competing tools:

- **Page Diff** — track changes between states, return only deltas (~80-90% fewer tokens)
- **Intent Filtering** — filter snapshots by agent intent (login, search, buy, navigate)
- **Action Flows** — auto-discover multi-step workflows (login, search, form fill) executable in one call
- **Smart Extraction** — built-in extractors for articles, links, headings, images, tables, metadata

## Installation

```bash
npm install
npm run build
```

## Usage as MCP Server

Register globally for Claude Code:

```bash
claude mcp add --scope user agent-browser -- npx --prefix /path/to/agent-browser tsx src/bin/cli.ts
```

### CLI flags

```
--headed          Run with visible browser window
--chrome-path     Path to Chrome executable
--user-data-dir   Chrome user data directory
```

## MCP Tools (21)

### Core

| Tool | Description |
|------|-------------|
| `navigate` | Go to URL, return semantic snapshot |
| `snapshot` | Current page state with action discovery |
| `snapshot_compact` | Minimal token snapshot |
| `click` | Click element by ref |
| `fill` | Type into input field |
| `select` | Select dropdown option |
| `scroll` | Scroll up/down |
| `evaluate` | Run JavaScript |
| `screenshot` | Visual screenshot (use sparingly) |
| `back` / `forward` | Browser history |
| `tabs` / `new_tab` / `switch_tab` / `close_tab` | Tab management |
| `close_browser` | Shutdown |

### Predictive Browsing Engine

| Tool | Description |
|------|-------------|
| `snapshot_intent` | Snapshot filtered by intent (login, search, buy, navigate, read_content, fill_form, extract_data) |
| `diff` | Only changes since last snapshot |
| `extract` | Extract content: article_text, links, headings, images, table_data, metadata |
| `get_flows` | Discover available multi-step workflows |
| `execute_flow` | Run a workflow with parameters (e.g. login with email+password) |

## Architecture

```
src/
  browser/engine.ts      — CDP connection via puppeteer-core
  intelligence/
    analyzer.ts          — Accessibility tree → PageElement[]
    classifier.ts        — Heuristic page type detection
    actions.ts           — Semantic action group discovery
    differ.ts            — Page state diff engine
    intent.ts            — Intent-aware element filtering
    flows.ts             — Multi-step workflow detection
    extractor.ts         — Smart content extraction
  renderer/text.ts       — PageState → optimized text
  mcp/server.ts          — MCP server (21 tools)
  index.ts               — AgentBrowser main class
```

## Token comparison

| Site | agent-browser | Playwright snapshot |
|------|--------------|-------------------|
| pikabu.ru | ~250 tokens | ~4,800 tokens |
| google.com | ~180 tokens | ~3,200 tokens |

17x average reduction in context usage.
