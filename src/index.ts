import type { Page } from "puppeteer-core";
import { BrowserEngine } from "./browser/engine.js";
import { DomAnalyzer } from "./intelligence/analyzer.js";
import { ActionDiscoverer } from "./intelligence/actions.js";
import { PageClassifier } from "./intelligence/classifier.js";
import { PageDiffer } from "./intelligence/differ.js";
import { SmartExtractor, type ExtractionTarget, type ExtractionResult } from "./intelligence/extractor.js";
import { FlowGenerator, type ActionFlow } from "./intelligence/flows.js";
import { IntentFilter_, type Intent } from "./intelligence/intent.js";
import { TextRenderer, estimateTokens } from "./renderer/text.js";
import type {
  BrowserConfig,
  ClickResult,
  FillResult,
  PageState,
  ScrollResult,
  TabInfo,
} from "./types.js";

export class AgentBrowser {
  private engine: BrowserEngine;
  private analyzer: DomAnalyzer;
  private classifier: PageClassifier;
  private discoverer: ActionDiscoverer;
  private renderer: TextRenderer;
  private differ: PageDiffer;
  private extractor: SmartExtractor;
  private flowGenerator: FlowGenerator;
  private intentFilter: IntentFilter_;
  private lastState: PageState | null = null;

  constructor(config: BrowserConfig = {}) {
    this.engine = new BrowserEngine(config);
    this.analyzer = new DomAnalyzer();
    this.classifier = new PageClassifier();
    this.discoverer = new ActionDiscoverer();
    this.renderer = new TextRenderer();
    this.differ = new PageDiffer();
    this.extractor = new SmartExtractor();
    this.flowGenerator = new FlowGenerator();
    this.intentFilter = new IntentFilter_();
  }

  async launch(): Promise<void> {
    await this.engine.launch();
  }

  async connect(browserUrl: string): Promise<void> {
    await this.engine.connectToExisting(browserUrl);
  }

  async navigate(url: string): Promise<string> {
    const start = Date.now();
    await this.engine.navigate(url);
    const state = await this.buildPageState(start);
    return this.renderer.render(state);
  }

  async snapshot(): Promise<string> {
    const start = Date.now();
    const state = await this.buildPageState(start);
    return this.renderer.render(state);
  }

  async snapshotCompact(): Promise<string> {
    const start = Date.now();
    const state = await this.buildPageState(start);
    return this.renderer.renderCompact(state);
  }

  async click(ref: string): Promise<ClickResult> {
    const page = this.engine.getActivePage();
    const element = this.findElementByRef(ref);
    if (!element) {
      return { success: false, navigationOccurred: false };
    }

    const urlBefore = page.url();

    try {
      await this.executeOnElement(page, ref, "click");
      await this.waitBriefly(page);

      const urlAfter = page.url();
      const navigationOccurred = urlBefore !== urlAfter;

      return {
        success: true,
        navigationOccurred,
        newUrl: navigationOccurred ? urlAfter : undefined,
      };
    } catch {
      return { success: false, navigationOccurred: false };
    }
  }

  async fill(ref: string, value: string): Promise<FillResult> {
    const page = this.engine.getActivePage();
    const element = this.findElementByRef(ref);
    if (!element) {
      return { success: false, previousValue: "", newValue: "" };
    }

    try {
      const previousValue = await this.getElementValue(page, ref);
      await this.executeOnElement(page, ref, "clear");
      await this.executeOnElement(page, ref, "type", value);

      return {
        success: true,
        previousValue: previousValue ?? "",
        newValue: value,
      };
    } catch {
      return { success: false, previousValue: "", newValue: "" };
    }
  }

  async select(ref: string, value: string): Promise<FillResult> {
    const page = this.engine.getActivePage();
    const element = this.findElementByRef(ref);
    if (!element) {
      return { success: false, previousValue: "", newValue: "" };
    }

    try {
      const previousValue = await this.getElementValue(page, ref);
      await this.executeOnElement(page, ref, "select", value);

      return {
        success: true,
        previousValue: previousValue ?? "",
        newValue: value,
      };
    } catch {
      return { success: false, previousValue: "", newValue: "" };
    }
  }

  async scroll(direction: "up" | "down", amount?: number): Promise<ScrollResult> {
    const page = this.engine.getActivePage();
    const pixels = amount ?? 600;
    const delta = direction === "down" ? pixels : -pixels;

    const result = await page.evaluate((d: number) => {
      window.scrollBy(0, d);
      return {
        scrolledTo: window.scrollY,
        pageHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    }, delta);

    return result;
  }

  async screenshot(): Promise<Buffer> {
    return this.engine.screenshot();
  }

  async evaluate<T>(expression: string): Promise<T> {
    return this.engine.evaluate<T>(expression);
  }

  async back(): Promise<string> {
    await this.engine.goBack();
    const start = Date.now();
    const state = await this.buildPageState(start);
    return this.renderer.render(state);
  }

  async forward(): Promise<string> {
    await this.engine.goForward();
    const start = Date.now();
    const state = await this.buildPageState(start);
    return this.renderer.render(state);
  }

  async tabs(): Promise<TabInfo[]> {
    return this.engine.getTabs();
  }

  async newTab(url?: string): Promise<string> {
    const tabId = await this.engine.newTab(url);
    return tabId;
  }

  async switchTab(tabId: string): Promise<string> {
    await this.engine.switchTab(tabId);
    const start = Date.now();
    const state = await this.buildPageState(start);
    return this.renderer.render(state);
  }

  async closeTab(tabId: string): Promise<void> {
    await this.engine.closeTab(tabId);
  }

  async close(): Promise<void> {
    await this.engine.close();
  }

  async pressKey(key: string): Promise<void> {
    await this.engine.pressKey(key);
  }

  async hover(ref: string): Promise<{ success: boolean }> {
    const element = this.findElementByRef(ref);
    if (!element?.backendNodeId) return { success: false };
    try {
      await this.engine.hoverByNodeId(element.backendNodeId);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async uploadFile(ref: string, filePath: string): Promise<{ success: boolean }> {
    const element = this.findElementByRef(ref);
    if (!element?.backendNodeId) return { success: false };
    try {
      await this.engine.uploadFileByNodeId(element.backendNodeId, filePath);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async waitForText(text: string, timeoutMs = 10_000): Promise<{ found: boolean }> {
    const found = await this.engine.waitForText(text, timeoutMs);
    return { found };
  }

  async snapshotWithIntent(intent: Intent): Promise<string> {
    const start = Date.now();
    const state = await this.buildPageState(start);
    const filtered = this.intentFilter.filterByIntent(state, intent);
    return this.renderer.render(filtered);
  }

  async diff(): Promise<string | null> {
    const start = Date.now();
    const state = await this.buildPageState(start);
    const pageDiff = this.differ.computeDiff(state);
    if (!pageDiff) return null;
    return this.differ.renderDiff(pageDiff);
  }

  async extract(target: ExtractionTarget): Promise<ExtractionResult> {
    const page = this.engine.getActivePage();
    return this.extractor.extract(page, target);
  }

  async getFlows(): Promise<ActionFlow[]> {
    if (!this.lastState) {
      const start = Date.now();
      await this.buildPageState(start);
    }
    return this.flowGenerator.generateFlows(this.lastState!);
  }

  async executeFlow(flowId: string, params: Record<string, string>): Promise<string> {
    const flows = await this.getFlows();
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return `Flow "${flowId}" not found. Available: ${flows.map((f) => f.id).join(", ")}`;

    const missing = flow.requiredParams.filter((p) => !params[p]);
    if (missing.length > 0) return `Missing required params: ${missing.join(", ")}`;

    const page = this.engine.getActivePage();
    const results: string[] = [`Executing flow: ${flow.name}`];

    for (const step of flow.steps) {
      switch (step.action) {
        case "fill": {
          if (!step.ref || !step.paramKey) break;
          const value = params[step.paramKey];
          if (value) {
            await this.fill(step.ref, value);
            results.push(`Filled ${step.ref} with "${value}"`);
          }
          break;
        }
        case "click": {
          if (!step.ref) break;
          const clickResult = await this.click(step.ref);
          results.push(`Clicked ${step.ref}: ${clickResult.success ? "ok" : "failed"}`);
          break;
        }
        case "select": {
          if (!step.ref || !step.paramKey) break;
          const value = params[step.paramKey];
          if (value) {
            await this.select(step.ref, value);
            results.push(`Selected "${value}" in ${step.ref}`);
          }
          break;
        }
        case "wait": {
          await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 1500)));
          results.push("Waited for navigation");
          break;
        }
      }
    }

    const snapshot = await this.snapshot();
    results.push("\n" + snapshot);
    return results.join("\n");
  }

  getLastState(): PageState | null {
    return this.lastState;
  }

  private async buildPageState(startTime: number): Promise<PageState> {
    const page = this.engine.getActivePage();
    const url = page.url();
    const title = await page.title();

    // Retry accessibility tree analysis for SPAs that load content asynchronously
    let elements = await this.analyzer.analyze(page);
    if (elements.length === 0) {
      await new Promise((r) => setTimeout(r, 800));
      elements = await this.analyzer.analyze(page);
    }
    if (elements.length === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      elements = await this.analyzer.analyze(page);
    }
    const pageType = this.classifier.classify(url, title, elements);
    const actionGroups = this.discoverer.discover(pageType, elements);

    const interactiveElements = elements.filter(
      (e) =>
        e.role === "button" ||
        e.role === "link" ||
        e.role === "textbox" ||
        e.role === "searchbox" ||
        e.role === "combobox" ||
        e.role === "checkbox" ||
        e.role === "radio"
    );

    let contentPreview: string | undefined;
    if (pageType === "article" || pageType === "feed") {
      try {
        contentPreview = await page.evaluate(() => {
          const SKIP = new Set(["NAV", "HEADER", "FOOTER", "ASIDE", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG"]);
          const SKIP_CLS = /\b(sidebar|nav|footer|header|menu|advert|banner|lang|language|interlanguage|toc|table-of-contents|cookie|consent|popup|modal|mw-editsection|ad-|ads-|monetize|promo|sponsor)\b/i;
          const SKIP_ID = /\b(sidebar|nav|footer|header|menu|lang|language|toc|tableofcontents|cookie|consent|siteSub|contentSub|mw-panel)\b/i;

          const PRIORITY_SELECTORS = [
            ".mw-parser-output",
            ".tm-article-body",
            ".article-body",
            ".article__body",
            ".post-content",
            ".entry-content",
            ".story-body",
          ];

          let contentRoot: Element | null = null;
          for (const sel of PRIORITY_SELECTORS) {
            const el = document.querySelector(sel);
            if (el && (el.textContent?.trim().length ?? 0) > 200) {
              contentRoot = el;
              break;
            }
          }

          if (!contentRoot) {
            const candidates = document.querySelectorAll(
              "article, main, [role='main'], [role='article'], .post, .content, .post-content, .entry-content, .story, .article-body, .article__body, td.postcolor, #bodyContent"
            );
            let bestLen = 0;
            for (const el of candidates) {
              if (SKIP.has(el.tagName)) continue;
              if (SKIP_CLS.test(el.className?.toString?.() ?? "")) continue;
              const text = el.textContent?.trim() ?? "";
              if (text.length > bestLen) {
                bestLen = text.length;
                contentRoot = el;
              }
            }
          }

          if (!contentRoot) contentRoot = document.body;

          const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              const p = node.parentElement;
              if (!p) return NodeFilter.FILTER_REJECT;
              if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;

              let ancestor: Element | null = p;
              for (let i = 0; i < 6 && ancestor && ancestor !== contentRoot; i++) {
                const cls = ancestor.className?.toString?.() ?? "";
                const id = ancestor.id ?? "";
                if (SKIP_CLS.test(cls) || SKIP_ID.test(id) || SKIP.has(ancestor.tagName)) {
                  return NodeFilter.FILTER_REJECT;
                }
                ancestor = ancestor.parentElement;
              }

              const t = node.textContent?.trim();
              if (!t || t.length < 3) return NodeFilter.FILTER_REJECT;
              if (t.startsWith("{") && t.includes('"')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            },
          });
          const parts: string[] = [];
          let len = 0;
          while (walker.nextNode() && len < 500) {
            const t = walker.currentNode.textContent?.trim() ?? "";
            parts.push(t);
            len += t.length;
          }
          return parts.join(" ").replace(/\s+/g, " ").substring(0, 500);
        });
      } catch {
        contentPreview = undefined;
      }
    }

    const state: PageState = {
      url,
      title,
      pageType,
      actionGroups,
      elements,
      meta: {
        tokenEstimate: 0,
        totalElements: elements.length,
        interactiveElements: interactiveElements.length,
        loadTimeMs: Date.now() - startTime,
        contentPreview,
      },
    };

    const renderedText = this.renderer.render(state);
    state.meta.tokenEstimate = estimateTokens(renderedText);

    this.lastState = state;
    return state;
  }

  private findElementByRef(ref: string) {
    if (!this.lastState) return null;
    return this.lastState.elements.find((e) => e.ref === ref) ?? null;
  }

  private async executeOnElement(
    page: Page,
    ref: string,
    action: "click" | "type" | "clear" | "select",
    value?: string
  ): Promise<void> {
    const element = this.findElementByRef(ref);

    // Primary path: use CDP backendNodeId for reliable element resolution
    if (element?.backendNodeId) {
      await this.executeByBackendNodeId(page, element.backendNodeId, action, value);
      return;
    }

    // Fallback: index-based DOM query (for elements without backendNodeId)
    const refIndex = parseInt(ref.replace("@e", ""), 10);
    await page.evaluate(
      (params: { refIndex: number; action: string; value?: string }) => {
        const interactiveSelectors = [
          "a[href]", "button", "input:not([type=hidden])",
          "select", "textarea", '[role="button"]', '[role="link"]',
          '[role="textbox"]', '[role="searchbox"]', '[role="combobox"]',
          '[role="checkbox"]', '[role="radio"]',
        ].join(",");
        const el = document.querySelectorAll(interactiveSelectors)[params.refIndex - 1] as HTMLElement | undefined;
        if (!el) throw new Error(`Element ${params.refIndex} not found`);
        switch (params.action) {
          case "click": el.click(); break;
          case "type": {
            const inp = el as HTMLInputElement;
            inp.focus(); inp.value = params.value ?? "";
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
          case "clear": {
            const inp = el as HTMLInputElement;
            inp.focus(); inp.value = "";
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            break;
          }
          case "select": {
            const sel = el as HTMLSelectElement;
            const opt = Array.from(sel.options).find(o => o.value === params.value || o.textContent?.trim() === params.value);
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
            break;
          }
        }
      },
      { refIndex, action, value }
    );
  }

  private async executeByBackendNodeId(
    page: Page,
    backendNodeId: number,
    action: "click" | "type" | "clear" | "select",
    value?: string
  ): Promise<void> {
    const client = await page.createCDPSession();
    try {
      const { object } = await client.send("DOM.resolveNode", { backendNodeId });
      const objectId = object.objectId;
      if (!objectId) throw new Error(`Could not resolve backendNodeId ${backendNodeId}`);

      switch (action) {
        case "click":
          await client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: "function() { this.click(); }",
            returnByValue: true,
          });
          break;
        case "clear":
          await client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: `function() {
              this.focus();
              this.value = "";
              this.dispatchEvent(new Event("input", { bubbles: true }));
            }`,
            returnByValue: true,
          });
          break;
        case "type":
          await client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: `function(v) {
              this.focus();
              this.value = v;
              this.dispatchEvent(new Event("input", { bubbles: true }));
              this.dispatchEvent(new Event("change", { bubbles: true }));
            }`,
            arguments: [{ value }],
            returnByValue: true,
          });
          break;
        case "select":
          await client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: `function(v) {
              const opt = Array.from(this.options).find(o => o.value === v || o.textContent.trim() === v);
              if (opt) { this.value = opt.value; this.dispatchEvent(new Event("change", { bubbles: true })); }
            }`,
            arguments: [{ value }],
            returnByValue: true,
          });
          break;
      }
    } finally {
      await client.detach();
    }
  }

  private async getElementValue(page: Page, ref: string): Promise<string> {
    const element = this.findElementByRef(ref);

    if (element?.backendNodeId) {
      const client = await page.createCDPSession();
      try {
        const { object } = await client.send("DOM.resolveNode", { backendNodeId: element.backendNodeId });
        if (!object.objectId) return "";
        const { result } = await client.send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: "function() { return this.value ?? ''; }",
          returnByValue: true,
        });
        return String(result.value ?? "");
      } catch {
        return "";
      } finally {
        await client.detach();
      }
    }

    const refIndex = parseInt(ref.replace("@e", ""), 10);
    return page.evaluate((idx: number) => {
      const selectors = [
        "a[href]", "button", "input:not([type=hidden])",
        "select", "textarea", '[role="button"]', '[role="link"]',
        '[role="textbox"]', '[role="searchbox"]', '[role="combobox"]',
        '[role="checkbox"]', '[role="radio"]',
      ].join(",");
      const el = document.querySelectorAll(selectors)[idx - 1] as HTMLInputElement | undefined;
      return el?.value ?? "";
    }, refIndex);
  }

  private async waitBriefly(page: Page): Promise<void> {
    await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 500)));
  }
}

export type {
  BrowserConfig,
  ClickResult,
  FillResult,
  PageState,
  PageElement,
  ActionGroup,
  DiscoveredAction,
  PageType,
  ActionType,
  TabInfo,
  ScrollResult,
  PageMeta,
} from "./types.js";

export type { ExtractionTarget, ExtractionResult } from "./intelligence/extractor.js";
export type { ActionFlow, FlowStep } from "./intelligence/flows.js";
export type { Intent } from "./intelligence/intent.js";
export type { PageDiff } from "./intelligence/differ.js";
