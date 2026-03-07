import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentBrowser } from "../index.js";
import type { BrowserConfig } from "../types.js";

export function createMcpServer(config: BrowserConfig = {}): McpServer {
  const server = new McpServer({
    name: "agent-browser",
    version: "0.2.4",
  });

  let browser: AgentBrowser | null = null;

  async function ensureBrowser(): Promise<AgentBrowser> {
    if (!browser) {
      browser = new AgentBrowser(config);
      await browser.launch();
    }
    return browser;
  }

  server.tool(
    "navigate",
    "Navigate to a URL and get a semantic page snapshot with discovered actions",
    { url: z.string().describe("The URL to navigate to") },
    async ({ url }) => {
      const b = await ensureBrowser();
      const result = await b.navigate(url);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "snapshot",
    "Get the current page state with semantic action discovery. Returns page type, available actions grouped by category, and interactive elements.",
    {},
    async () => {
      const b = await ensureBrowser();
      const result = await b.snapshot();
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "snapshot_compact",
    "Get a compact page snapshot optimized for minimal token usage",
    {},
    async () => {
      const b = await ensureBrowser();
      const result = await b.snapshotCompact();
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "click",
    "Click an element by its ref (e.g. @e1, @e5). Use snapshot first to see available refs.",
    { ref: z.string().describe("Element reference like @e1") },
    async ({ ref }) => {
      const b = await ensureBrowser();
      const result = await b.click(ref);
      let text = result.success
        ? `Clicked ${ref} successfully.`
        : `Failed to click ${ref}.`;
      if (result.navigationOccurred) {
        text += ` Navigated to: ${result.newUrl}`;
        const snapshot = await b.snapshot();
        text += "\n\n" + snapshot;
      }
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "fill",
    "Fill a text input field by ref. Use snapshot to see available input refs.",
    {
      ref: z.string().describe("Element reference like @e1"),
      value: z.string().describe("Text to type into the field"),
    },
    async ({ ref, value }) => {
      const b = await ensureBrowser();
      const result = await b.fill(ref, value);
      const text = result.success
        ? `Filled ${ref} with "${value}" (was: "${result.previousValue}")`
        : `Failed to fill ${ref}`;
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "select",
    "Select an option in a dropdown by ref",
    {
      ref: z.string().describe("Element reference like @e1"),
      value: z.string().describe("Option value or text to select"),
    },
    async ({ ref, value }) => {
      const b = await ensureBrowser();
      const result = await b.select(ref, value);
      const text = result.success
        ? `Selected "${value}" in ${ref}`
        : `Failed to select in ${ref}`;
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "scroll",
    "Scroll the page up or down. Default 600px, use amount for larger scrolls (e.g. 2000 for ~3 pages).",
    {
      direction: z.enum(["up", "down"]).describe("Scroll direction"),
      amount: z.number().optional().describe("Pixels to scroll (default 600)"),
    },
    async ({ direction, amount }) => {
      const b = await ensureBrowser();
      const result = await b.scroll(direction, amount);
      const percent = Math.round((result.scrolledTo / (result.pageHeight - result.viewportHeight)) * 100);
      return {
        content: [{
          type: "text" as const,
          text: `Scrolled ${direction}. Position: ${percent}% (${result.scrolledTo}px / ${result.pageHeight}px)`,
        }],
      };
    }
  );

  server.tool(
    "screenshot",
    "Take a visual screenshot of the current page (use sparingly, prefer snapshot for efficiency)",
    {},
    async () => {
      const b = await ensureBrowser();
      const buffer = await b.screenshot();
      return {
        content: [{
          type: "image" as const,
          data: buffer.toString("base64"),
          mimeType: "image/png",
        }],
      };
    }
  );

  server.tool(
    "evaluate",
    "Execute JavaScript in the browser and return the result",
    { expression: z.string().describe("JavaScript expression to evaluate") },
    async ({ expression }) => {
      const b = await ensureBrowser();
      const result = await b.evaluate(expression);
      return {
        content: [{
          type: "text" as const,
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  server.tool(
    "back",
    "Navigate back in browser history and return page snapshot",
    {},
    async () => {
      const b = await ensureBrowser();
      const result = await b.back();
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "forward",
    "Navigate forward in browser history and return page snapshot",
    {},
    async () => {
      const b = await ensureBrowser();
      const result = await b.forward();
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "tabs",
    "List all open browser tabs",
    {},
    async () => {
      const b = await ensureBrowser();
      const tabList = await b.tabs();
      const text = tabList
        .map((t) => `${t.active ? ">" : " "} [${t.id}] ${t.title} (${t.url})`)
        .join("\n");
      return { content: [{ type: "text" as const, text: text || "No tabs open" }] };
    }
  );

  server.tool(
    "new_tab",
    "Open a new browser tab, optionally navigating to a URL",
    { url: z.string().optional().describe("URL to open in the new tab") },
    async ({ url }) => {
      const b = await ensureBrowser();
      const tabId = await b.newTab(url);
      let text = `New tab created: ${tabId}`;
      if (url) {
        const snapshot = await b.snapshot();
        text += "\n\n" + snapshot;
      }
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "switch_tab",
    "Switch to a different browser tab by ID",
    { tab_id: z.string().describe("Tab ID from tabs() output") },
    async ({ tab_id }) => {
      const b = await ensureBrowser();
      const result = await b.switchTab(tab_id);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "close_tab",
    "Close a browser tab by ID",
    { tab_id: z.string().describe("Tab ID to close") },
    async ({ tab_id }) => {
      const b = await ensureBrowser();
      await b.closeTab(tab_id);
      return { content: [{ type: "text" as const, text: `Tab ${tab_id} closed` }] };
    }
  );

  server.tool(
    "extract",
    "Extract structured content from the current page. Targets: article_text, links, headings, images, table_data, metadata, feed_items",
    {
      target: z.enum(["article_text", "links", "headings", "images", "table_data", "metadata", "feed_items"])
        .describe("What to extract from the page"),
    },
    async ({ target }) => {
      const b = await ensureBrowser();
      const result = await b.extract(target);
      const text = typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2);
      return {
        content: [{
          type: "text" as const,
          text: `[${target}] (~${result.tokenEstimate} tokens)\n\n${text}`,
        }],
      };
    }
  );

  server.tool(
    "snapshot_intent",
    "Get a page snapshot filtered by agent intent. Only shows elements relevant to the specified intent, dramatically reducing tokens.",
    {
      intent: z.enum(["login", "search", "read_content", "fill_form", "navigate", "buy", "extract_data"])
        .describe("Agent's current intent"),
    },
    async ({ intent }) => {
      const b = await ensureBrowser();
      const result = await b.snapshotWithIntent(intent);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "diff",
    "Get only the changes since the last snapshot. Returns null on first call (needs a baseline). Much more token-efficient than full snapshots for monitoring page changes.",
    {},
    async () => {
      const b = await ensureBrowser();
      const result = await b.diff();
      return {
        content: [{
          type: "text" as const,
          text: result ?? "No previous state to compare against. Call snapshot first to establish a baseline.",
        }],
      };
    }
  );

  server.tool(
    "get_flows",
    "Auto-discover available multi-step workflows on the current page (login, search, form fill). Returns executable flow definitions with required parameters.",
    {},
    async () => {
      const b = await ensureBrowser();
      const flows = await b.getFlows();
      if (flows.length === 0) {
        return { content: [{ type: "text" as const, text: "No multi-step flows detected on this page." }] };
      }
      const text = flows.map((f) => {
        const params = f.requiredParams.length > 0 ? `\n  Required params: ${f.requiredParams.join(", ")}` : "";
        const steps = f.steps.map((s, i) => `    ${i + 1}. ${s.action}${s.ref ? ` ${s.ref}` : ""} — ${s.description}`).join("\n");
        return `[${f.id}] ${f.name}: ${f.description}${params}\n  Steps:\n${steps}`;
      }).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "execute_flow",
    "Execute a discovered multi-step flow (login, search, form) with given parameters. Use get_flows first to see available flows and required params.",
    {
      flow_id: z.string().describe("Flow ID from get_flows (e.g. 'login', 'search', 'fill_form')"),
      params: z.record(z.string()).describe("Key-value params for the flow (e.g. {email: '...', password: '...'})"),
    },
    async ({ flow_id, params }) => {
      const b = await ensureBrowser();
      const result = await b.executeFlow(flow_id, params);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "press_key",
    "Press a keyboard key. Common keys: Enter, Escape, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Space, F5. Use after fill() to submit a form, or Escape to close a modal.",
    { key: z.string().describe("Key name (e.g. 'Enter', 'Escape', 'Tab', 'ArrowDown')") },
    async ({ key }) => {
      const b = await ensureBrowser();
      await b.pressKey(key);
      return { content: [{ type: "text" as const, text: `Pressed key: ${key}` }] };
    }
  );

  server.tool(
    "hover",
    "Hover the mouse over an element by ref. Use before snapshot to reveal dropdown menus, tooltips, or lazy-loaded content triggered by mouseover.",
    { ref: z.string().describe("Element reference like @e1") },
    async ({ ref }) => {
      const b = await ensureBrowser();
      const result = await b.hover(ref);
      if (!result.success) {
        return { content: [{ type: "text" as const, text: `Could not hover ${ref} — element not found or missing node info. Try snapshot first.` }] };
      }
      await new Promise((r) => setTimeout(r, 300));
      const snap = await b.snapshot();
      return { content: [{ type: "text" as const, text: `Hovered ${ref}.\n\n${snap}` }] };
    }
  );

  server.tool(
    "upload_file",
    "Upload a file to an input[type=file] element by ref. Use snapshot to find the file input ref first.",
    {
      ref: z.string().describe("Element reference of the file input, e.g. @e3"),
      file_path: z.string().describe("Absolute path to the file to upload"),
    },
    async ({ ref, file_path }) => {
      const b = await ensureBrowser();
      const result = await b.uploadFile(ref, file_path);
      if (!result.success) {
        return { content: [{ type: "text" as const, text: `Failed to upload file to ${ref}. Make sure the element is an input[type=file] and has a backendNodeId.` }] };
      }
      return { content: [{ type: "text" as const, text: `File uploaded to ${ref}: ${file_path}` }] };
    }
  );

  server.tool(
    "wait_for_text",
    "Wait until specific text appears on the page (useful after clicking, navigating, or submitting forms). Times out after the given milliseconds.",
    {
      text: z.string().describe("Text to wait for on the page"),
      timeout_ms: z.number().optional().describe("Timeout in milliseconds (default 10000)"),
    },
    async ({ text, timeout_ms }) => {
      const b = await ensureBrowser();
      const result = await b.waitForText(text, timeout_ms ?? 10_000);
      if (result.found) {
        const snap = await b.snapshot();
        return { content: [{ type: "text" as const, text: `Text "${text}" appeared on page.\n\n${snap}` }] };
      }
      return { content: [{ type: "text" as const, text: `Timeout: text "${text}" did not appear within ${timeout_ms ?? 10_000}ms.` }] };
    }
  );

  server.tool(
    "close_browser",
    "Close the browser completely",
    {},
    async () => {
      if (browser) {
        await browser.close();
        browser = null;
      }
      return { content: [{ type: "text" as const, text: "Browser closed" }] };
    }
  );

  return server;
}

export async function startMcpServer(config: BrowserConfig = {}): Promise<void> {
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
