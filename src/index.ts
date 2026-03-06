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

    const elements = await this.analyzer.analyze(page);
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
          const SKIP_CLS = /\b(sidebar|nav|footer|header|menu|advert|banner|lang|language|interlanguage|toc|table-of-contents|cookie|consent|popup|modal)\b/i;
          const SKIP_ID = /\b(sidebar|nav|footer|header|menu|lang|language|toc|tableofcontents|cookie|consent)\b/i;

          const candidates = document.querySelectorAll(
            "article, main, [role='main'], [role='article'], .post, .content, .post-content, .entry-content, .story, .article-body, .article__body, .mw-parser-output, td.postcolor, #bodyContent, .tm-article-body"
          );
          let contentRoot: Element = document.body;
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

          const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              const p = node.parentElement;
              if (!p) return NodeFilter.FILTER_REJECT;
              if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
              if (SKIP_CLS.test(p.className?.toString?.() ?? "")) return NodeFilter.FILTER_REJECT;
              if (SKIP_ID.test(p.id ?? "")) return NodeFilter.FILTER_REJECT;
              const t = node.textContent?.trim();
              if (!t || t.length < 3) return NodeFilter.FILTER_REJECT;
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
    const refIndex = parseInt(ref.replace("@e", ""), 10);

    await page.evaluate(
      (params: { refIndex: number; action: string; value?: string }) => {
        const interactiveSelectors = [
          "a[href]",
          "button",
          "input:not([type=hidden])",
          "select",
          "textarea",
          '[role="button"]',
          '[role="link"]',
          '[role="textbox"]',
          '[role="searchbox"]',
          '[role="combobox"]',
          '[role="checkbox"]',
          '[role="radio"]',
        ].join(",");

        const allElements = document.querySelectorAll(interactiveSelectors);
        const element = allElements[params.refIndex - 1] as HTMLElement | undefined;
        if (!element) throw new Error(`Element ${params.refIndex} not found`);

        switch (params.action) {
          case "click":
            element.click();
            break;
          case "type": {
            const input = element as HTMLInputElement;
            input.focus();
            input.value = params.value ?? "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
          case "clear": {
            const inp = element as HTMLInputElement;
            inp.focus();
            inp.value = "";
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            break;
          }
          case "select": {
            const sel = element as HTMLSelectElement;
            const option = Array.from(sel.options).find(
              (o) => o.value === params.value || o.textContent?.trim() === params.value
            );
            if (option) {
              sel.value = option.value;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
            }
            break;
          }
        }
      },
      { refIndex, action, value }
    );
  }

  private async getElementValue(page: Page, ref: string): Promise<string> {
    const refIndex = parseInt(ref.replace("@e", ""), 10);
    return page.evaluate((idx: number) => {
      const selectors = [
        "a[href]",
        "button",
        "input:not([type=hidden])",
        "select",
        "textarea",
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="searchbox"]',
        '[role="combobox"]',
        '[role="checkbox"]',
        '[role="radio"]',
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
