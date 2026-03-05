# Contributing to agent-browser

Thanks for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/malovnik/agent-browser.git
cd agent-browser
npm install
```

### Running in Development

```bash
npm run dev              # Start MCP server with tsx (hot reload)
npm run dev -- --headed  # With visible browser
npm run build            # Compile TypeScript
```

### Type Checking

```bash
npx tsc --noEmit
```

## Project Structure

- `src/browser/` — Chrome connection via CDP (puppeteer-core)
- `src/intelligence/` — Page analysis, classification, action discovery
- `src/renderer/` — Text output formatting
- `src/mcp/` — MCP server and tool definitions
- `src/index.ts` — Public API (AgentBrowser class)
- `src/types.ts` — Shared TypeScript interfaces

## Guidelines

- TypeScript strict mode. No `any` types.
- No TODO/FIXME comments in committed code.
- Test changes against real websites before submitting.
- Keep token output minimal — every token counts for AI agents.

## Adding a New MCP Tool

1. Add the method to `AgentBrowser` class in `src/index.ts`
2. Register the tool in `src/mcp/server.ts` using `server.tool()`
3. Add types to `src/types.ts` if needed
4. Update the tool count in README

## Adding a New Intelligence Module

1. Create the module in `src/intelligence/`
2. Import and instantiate it in `AgentBrowser` constructor
3. Expose public methods through `AgentBrowser`
4. Wire up MCP tools if the module should be user-facing

## Pull Requests

- Keep PRs focused on a single change
- Include a clear description of what and why
- Make sure `npx tsc --noEmit` passes with no errors
