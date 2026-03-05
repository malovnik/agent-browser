<p align="center">
  <h1 align="center">agent-browser</h1>
  <p align="center">The first text-first browser built for AI agents</p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#why-agent-browser">Why</a> &bull;
  <a href="#integration">Integration</a> &bull;
  <a href="#tools-reference">Tools</a> &bull;
  <a href="#architecture">Architecture</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="docs/README.ru.md">Русский</a>
</p>

---

## The Problem

Every AI browser tool today works the same way: take a screenshot, send pixels to an LLM, hope it figures out what to click. This wastes thousands of tokens on visual noise, is slow, and breaks on dynamic pages.

**agent-browser** takes a fundamentally different approach. It reads the page the way a screen reader does — through the accessibility tree — and returns a semantic text snapshot with auto-discovered actions. No screenshots. No selectors. No scripts.

## What Makes It Different

| | agent-browser | Playwright MCP | Browser Use | Stagehand |
|---|---|---|---|---|
| Primary input | Accessibility tree | Accessibility tree | Screenshots | Screenshots + HTML |
| Tokens per page | **~200-300** | ~1,500-3,000 | ~4,800+ | ~2,000+ |
| Action discovery | Auto-grouped semantic actions | Raw element list | None | AI-inferred |
| Page classification | Built-in heuristic | None | None | None |
| Page diff (deltas only) | Built-in | None | None | None |
| Intent filtering | Built-in (7 intents) | None | None | None |
| Multi-step flows | Auto-detected, 1-call execution | None | None | None |
| Content extraction | 6 built-in extractors | None | None | None |
| Language | TypeScript | TypeScript | Python | TypeScript |

### Token Usage Comparison

| Site | agent-browser | Playwright MCP |
|------|--------------|----------------|
| News article | ~250 tokens | ~4,800 tokens |
| Google search | ~180 tokens | ~3,200 tokens |
| Login page | ~150 tokens | ~2,100 tokens |

**17x average reduction** in context window usage.

## Key Features

### Semantic Action Discovery

Instead of a flat list of elements, agent-browser groups them into meaningful categories:

```
=== ACTIONS ===
[LOGIN FORM]
  fill(@e1) — Email input
  fill(@e2) — Password input
  click(@e3) — Sign in button

[SOCIAL SIGN-IN]
  click(@e4) — Continue with Google
  click(@e5) — Continue with Apple

[NAVIGATION]
  click(@e6) — Home
  click(@e7) — About
  click(@e8) — Pricing
```

### Predictive Browsing Engine

Four capabilities not found in any competing tool:

1. **Page Diff** — After the first snapshot, get only what changed. ~80-90% fewer tokens.
2. **Intent Filtering** — Tell the browser your goal (login, search, buy). Get only relevant elements.
3. **Action Flows** — Auto-detects multi-step workflows (login, search, checkout). Execute with one call.
4. **Smart Extraction** — Extract articles, links, headings, images, tables, metadata without writing selectors.

## Quick Start

### Prerequisites

- Node.js 18+
- Google Chrome or Chromium installed locally

### Install

```bash
git clone https://github.com/malovnik/agent-browser.git
cd agent-browser
npm install
npm run build
```

### Connect to Your AI Tool

See [Integration](#integration) below for your specific tool.

## Integration

agent-browser runs as an [MCP](https://modelcontextprotocol.io/) server over stdio. Any MCP-compatible client can connect to it.

### Claude Desktop

Edit the config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

With visible browser window, add `"--headed"` to the end of the `args` array.

Restart Claude Desktop after saving. The 21 tools will appear in the tool picker (hammer icon).

### Claude Code

```bash
claude mcp add --scope user agent-browser -- npx --prefix /path/to/agent-browser tsx src/bin/cli.ts
```

With visible browser window:

```bash
claude mcp add --scope user agent-browser -- npx --prefix /path/to/agent-browser tsx src/bin/cli.ts --headed
```

### OpenClaw (ClawBot)

Add to your `openclaw.json`:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"],
      "transport": "stdio"
    }
  }
}
```

Or via CLI:

```bash
openclaw config set mcpServers.agent-browser.command "npx"
openclaw config set mcpServers.agent-browser.args '["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]'
```

### Cursor

Create or edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-scoped):

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

Or add via Cursor Settings > Tools & MCP > New MCP Server.

### VS Code Copilot (1.99+)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "agent-browser": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

### Cline (VS Code)

Click the MCP Servers icon in the Cline pane > Configure > "Configure MCP Servers" and add:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"],
      "disabled": false
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` or open it via the MCPs icon > Configure in the Cascade panel:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

### Continue.dev

Create a JSON config file in `.continue/mcpServers/agent-browser.json` in your workspace:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

Continue automatically picks up JSON configs from `.continue/mcpServers/` directory. MCP tools are available in agent mode.

### Any MCP Client

agent-browser communicates over stdio using the [Model Context Protocol](https://modelcontextprotocol.io/). Start the server:

```bash
npx tsx src/bin/cli.ts
```

Connect your client to stdin/stdout of this process.

### Programmatic Usage (Node.js / TypeScript)

```typescript
import { AgentBrowser } from "./src/index.js";

const browser = new AgentBrowser({ headless: true });
await browser.launch();

// Navigate and get semantic snapshot
const snapshot = await browser.navigate("https://example.com");
console.log(snapshot);

// Extract article text
const article = await browser.extract("article_text");
console.log(article.data);

// Execute a discovered flow
const flows = await browser.getFlows();
const result = await browser.executeFlow("login", {
  email: "user@example.com",
  password: "secret",
});

await browser.close();
```

### CLI Flags

| Flag | Description |
|------|-------------|
| `--headed` | Run with visible browser window (default: headless) |
| `--chrome-path=PATH` | Path to Chrome/Chromium executable |
| `--user-data-dir=PATH` | Chrome user data directory (persists sessions/cookies) |
| `--help` | Show help message |

## Tools Reference

### Core (15 tools)

| Tool | Description |
|------|-------------|
| `navigate` | Go to URL, return semantic snapshot with discovered actions |
| `snapshot` | Get current page state with action discovery |
| `snapshot_compact` | Minimal token snapshot |
| `click` | Click an element by ref (e.g. `@e1`) |
| `fill` | Type text into an input field by ref |
| `select` | Select a dropdown option by ref |
| `scroll` | Scroll the page up or down |
| `evaluate` | Execute JavaScript in the browser |
| `screenshot` | Take a visual screenshot (use sparingly) |
| `back` | Navigate back in history |
| `forward` | Navigate forward in history |
| `tabs` | List all open tabs |
| `new_tab` | Open a new tab |
| `switch_tab` | Switch to a tab by ID |
| `close_tab` | Close a tab by ID |
| `close_browser` | Shut down the browser |

### Predictive Browsing Engine (6 tools)

| Tool | Description |
|------|-------------|
| `snapshot_intent` | Snapshot filtered by intent: `login`, `search`, `read_content`, `fill_form`, `navigate`, `buy`, `extract_data` |
| `diff` | Get only changes since last snapshot (requires baseline) |
| `extract` | Extract content: `article_text`, `links`, `headings`, `images`, `table_data`, `metadata` |
| `get_flows` | Discover available multi-step workflows on current page |
| `execute_flow` | Execute a flow with parameters (e.g. `{email: "...", password: "..."}`) |

## Architecture

```
src/
  bin/cli.ts               CLI entry point, parses flags, starts MCP server
  browser/engine.ts        CDP connection via puppeteer-core, tab management
  intelligence/
    analyzer.ts            Accessibility tree -> PageElement[]
    classifier.ts          Heuristic page type detection (10 types)
    actions.ts             Semantic action group discovery
    differ.ts              Page state diff engine (delta snapshots)
    intent.ts              Intent-aware element filtering (7 intents)
    flows.ts               Multi-step workflow auto-detection
    extractor.ts           Smart content extraction (6 targets)
  renderer/text.ts         PageState -> token-optimized text
  mcp/server.ts            MCP server with 21 tools
  index.ts                 AgentBrowser main class (public API)
  types.ts                 TypeScript interfaces
```

### How It Works

```
1. Chrome (CDP)
      |
2. Accessibility Tree (via CDP Accessibility.getFullAXTree)
      |
3. DomAnalyzer -> PageElement[] (structured, typed elements)
      |
4. PageClassifier -> PageType (login, search, article, ...)
      |
5. ActionDiscoverer -> ActionGroup[] (LOGIN FORM, SEARCH, NAVIGATION, ...)
      |
6. TextRenderer -> Optimized text for LLM (~200-300 tokens)
```

### Why TypeScript (Not Rust/Go)

We evaluated rewriting in Rust and Go. The conclusion: **no meaningful performance gain**.

- **95%+ of execution time** is CDP I/O (network roundtrips to Chrome). This is I/O-bound, not CPU-bound. TypeScript handles I/O as well as Rust or Go.
- **puppeteer-core** is the most mature CDP client library in any language. Rust alternatives (chromiumoxide) and Go alternatives (chromedp) are less mature and have smaller ecosystems.
- **MCP SDK** is TypeScript-native. A rewrite would require maintaining protocol bindings.
- The intelligence layer (classifier, analyzer, differ) accounts for <5% of execution time.
- TypeScript enables faster iteration, easier contributions, and better compatibility with the MCP ecosystem.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
