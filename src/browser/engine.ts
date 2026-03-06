import { connect as connectReal } from "puppeteer-real-browser";
import puppeteerCore, {
  type Browser,
  type Page,
  type Target,
} from "puppeteer-core";
import type { BrowserConfig, TabInfo } from "../types.js";

export class BrowserEngine {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private activePageId: string | null = null;
  private config: BrowserConfig;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: true,
      defaultViewport: { width: 1280, height: 800 },
      ...config,
    };
  }

  async launch(): Promise<void> {
    if (this.browser) return;

    const args = [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      ...(this.config.args ?? []),
    ];

    if (this.config.userDataDir) {
      args.push(`--user-data-dir=${this.config.userDataDir}`);
    }

    const { browser, page } = await connectReal({
      headless: this.config.headless as boolean,
      turnstile: true,
      args,
      disableXvfb: true,
    });

    this.browser = browser as unknown as Browser;

    const realPage = page as unknown as Page;
    if (this.config.defaultViewport) {
      await realPage.setViewport(this.config.defaultViewport);
    }
    await this.injectPagePolyfills(realPage);

    const id = this.generatePageId();
    this.pages.set(id, realPage);
    this.activePageId = id;

    this.browser.on("targetcreated", (target: Target) => {
      this.handleNewTarget(target);
    });

    this.browser.on("targetdestroyed", (target: Target) => {
      this.handleDestroyedTarget(target);
    });
  }

  async connectToExisting(browserUrl: string): Promise<void> {
    this.browser = await puppeteerCore.connect({
      browserURL: browserUrl,
      defaultViewport: this.config.defaultViewport,
    });

    const existingPages = await this.browser.pages();
    for (const page of existingPages) {
      const id = this.generatePageId();
      this.pages.set(id, page);
      if (!this.activePageId) this.activePageId = id;
    }
  }

  getActivePage(): Page {
    if (!this.activePageId || !this.pages.has(this.activePageId)) {
      throw new Error("No active page. Navigate to a URL first.");
    }
    return this.pages.get(this.activePageId)!;
  }

  async navigate(url: string): Promise<Page> {
    await this.ensureBrowser();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const page = this.getActivePage();

        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "";
          const isTimeout = msg.includes("timeout");
          const isContextDestroyed =
            msg.includes("Execution context was destroyed") ||
            msg.includes("most likely because of a navigation");
          if (!isTimeout && !isContextDestroyed) throw err;
          if (isContextDestroyed && attempt === 0) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
        }

        const title = await page.title();
        if (title === "Just a moment...") {
          await this.waitForCloudflare(page);
        }

        await this.waitForNetworkIdle(page);
        await this.waitForStable(page);
        return page;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        const isContextDestroyed =
          msg.includes("Execution context was destroyed") ||
          msg.includes("most likely because of a navigation");
        if (isContextDestroyed && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    return this.getActivePage();
  }

  async newTab(url?: string): Promise<string> {
    await this.ensureBrowser();
    const page = await this.browser!.newPage();
    const id = this.generatePageId();
    this.pages.set(id, page);
    this.activePageId = id;

    if (url) {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await this.waitForStable(page);
    }

    return id;
  }

  async closeTab(tabId: string): Promise<void> {
    const page = this.pages.get(tabId);
    if (!page) return;

    await page.close();
    this.pages.delete(tabId);

    if (this.activePageId === tabId) {
      const remaining = Array.from(this.pages.keys());
      this.activePageId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
  }

  async switchTab(tabId: string): Promise<void> {
    if (!this.pages.has(tabId)) {
      throw new Error(`Tab ${tabId} not found`);
    }
    this.activePageId = tabId;
    await this.pages.get(tabId)!.bringToFront();
  }

  async getTabs(): Promise<TabInfo[]> {
    const tabs: TabInfo[] = [];
    for (const [id, page] of this.pages) {
      tabs.push({
        id,
        url: page.url(),
        title: await page.title(),
        active: id === this.activePageId,
      });
    }
    return tabs;
  }

  async goBack(): Promise<void> {
    const page = this.getActivePage();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await this.waitForStable(page);
  }

  async goForward(): Promise<void> {
    const page = this.getActivePage();
    await page.goForward({ waitUntil: "domcontentloaded" });
    await this.waitForStable(page);
  }

  async screenshot(): Promise<Buffer> {
    const page = this.getActivePage();
    return (await page.screenshot({ type: "png", fullPage: false })) as Buffer;
  }

  async evaluate<T>(expression: string): Promise<T> {
    const page = this.getActivePage();
    const needsWrap = /\b(const|let|class)\s/.test(expression) && !/^\s*\(/.test(expression);
    const wrapped = needsWrap ? `(() => {\n${expression}\n})()` : expression;
    return page.evaluate(wrapped) as Promise<T>;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
      this.activePageId = null;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (!this.browser) {
      await this.launch();
    }
  }

  private async waitForStable(page: Page, timeout = 3000): Promise<void> {
    try {
      await page.evaluate((ms: number) => {
        return new Promise<void>((resolve) => {
          let timer: ReturnType<typeof setTimeout>;
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              observer.disconnect();
              resolve();
            }, 500);
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
          });
          timer = setTimeout(() => {
            observer.disconnect();
            resolve();
          }, ms);
        });
      }, timeout);
    } catch {
      /* page might not have body yet, that's ok */
    }
  }

  private async waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
    try {
      await (page as unknown as { waitForNetworkIdle: (opts: { idleTime: number; timeout: number }) => Promise<void> })
        .waitForNetworkIdle({ idleTime: 500, timeout });
    } catch {
      /* timeout is fine — some sites have persistent connections */
    }
  }

  private async waitForCloudflare(page: Page, timeout = 60_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const title = await page.title();
      if (title !== "Just a moment...") return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  private generatePageId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private async handleNewTarget(target: Target): Promise<void> {
    if (target.type() === "page") {
      const page = await target.page();
      if (page) {
        await this.injectPagePolyfills(page);
        const id = this.generatePageId();
        this.pages.set(id, page);
      }
    }
  }

  private async injectPagePolyfills(page: Page): Promise<void> {
    await page.evaluateOnNewDocument("if(typeof __name==='undefined'){window.__name=(fn)=>fn}");
    await page.evaluate("if(typeof __name==='undefined'){window.__name=function(fn){return fn}}");
  }

  private handleDestroyedTarget(target: Target): void {
    for (const [id, page] of this.pages) {
      if (page.isClosed()) {
        this.pages.delete(id);
        if (this.activePageId === id) {
          const remaining = Array.from(this.pages.keys());
          this.activePageId =
            remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
      }
    }
  }
}
