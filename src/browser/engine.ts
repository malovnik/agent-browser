import { existsSync } from "node:fs";
import puppeteer, {
  type Browser,
  type Page,
  type Target,
} from "puppeteer-core";
import type { BrowserConfig, TabInfo } from "../types.js";

const DEFAULT_CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

function findChrome(): string | undefined {
  const candidates = DEFAULT_CHROME_PATHS[process.platform] ?? [];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

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

    const executablePath = this.config.executablePath ?? findChrome();
    if (!executablePath) {
      throw new Error(
        "Chrome/Chromium not found. Set executablePath in config or install Chrome."
      );
    }

    const args = [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-extensions",
      ...(this.config.args ?? []),
    ];

    if (this.config.userDataDir) {
      args.push(`--user-data-dir=${this.config.userDataDir}`);
    }

    this.browser = await puppeteer.launch({
      executablePath,
      headless: this.config.headless,
      defaultViewport: this.config.defaultViewport,
      args,
    });

    const existingPages = await this.browser.pages();
    if (existingPages.length > 0) {
      const page = existingPages[0];
      const id = this.generatePageId();
      this.pages.set(id, page);
      this.activePageId = id;
    }

    this.browser.on("targetcreated", (target: Target) => {
      this.handleNewTarget(target);
    });

    this.browser.on("targetdestroyed", (target: Target) => {
      this.handleDestroyedTarget(target);
    });
  }

  async connectToExisting(browserUrl: string): Promise<void> {
    this.browser = await puppeteer.connect({
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
    const page = this.getActivePage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await this.waitForStable(page);
    return page;
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
    return page.evaluate(expression) as Promise<T>;
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

  private generatePageId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private async handleNewTarget(target: Target): Promise<void> {
    if (target.type() === "page") {
      const page = await target.page();
      if (page) {
        const id = this.generatePageId();
        this.pages.set(id, page);
      }
    }
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
