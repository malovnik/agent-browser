#!/usr/bin/env node

import { startMcpServer } from "../mcp/server.js";
import type { BrowserConfig } from "../types.js";

const args = process.argv.slice(2);

const config: BrowserConfig = {
  headless: args.includes("--headless"),
};

const execPathArg = args.find((a) => a.startsWith("--chrome-path="));
if (execPathArg) {
  config.executablePath = execPathArg.split("=")[1];
}

const userDataArg = args.find((a) => a.startsWith("--user-data-dir="));
if (userDataArg) {
  config.userDataDir = userDataArg.split("=")[1];
}

if (args.includes("--help")) {
  console.log(`
agent-browser — AI-first browser with semantic action discovery

Usage:
  agent-browser [options]

Options:
  --headless            Run in headless mode (default: headed for best anti-detection)
  --chrome-path=PATH    Path to Chrome/Chromium executable
  --user-data-dir=PATH  Path to Chrome user data directory (for sessions)
  --help                Show this help message

The server communicates via MCP over stdio.
Connect it to Claude Code or any MCP-compatible client.
`);
  process.exit(0);
}

startMcpServer(config).catch((err) => {
  console.error("Failed to start agent-browser MCP server:", err);
  process.exit(1);
});
