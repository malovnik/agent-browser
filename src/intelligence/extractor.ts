import type { Page } from "puppeteer-core";

export type ExtractionTarget =
  | "article_text"
  | "links"
  | "headings"
  | "images"
  | "table_data"
  | "metadata"
  | "feed_items";

export interface ExtractionResult {
  target: ExtractionTarget;
  data: unknown;
  tokenEstimate: number;
}

export class SmartExtractor {
  async extract(page: Page, target: ExtractionTarget): Promise<ExtractionResult> {
    switch (target) {
      case "article_text":
        return this.extractArticleText(page);
      case "links":
        return this.extractLinks(page);
      case "headings":
        return this.extractHeadings(page);
      case "images":
        return this.extractImages(page);
      case "table_data":
        return this.extractTableData(page);
      case "metadata":
        return this.extractMetadata(page);
      case "feed_items":
        return this.extractFeedItems(page);
    }
  }

  private async extractArticleText(page: Page): Promise<ExtractionResult> {
    const text = await page.evaluate(() => {
      const EXCLUDE_TAGS = new Set(["NAV", "HEADER", "FOOTER", "ASIDE", "SCRIPT", "STYLE", "NOSCRIPT", "SVG"]);
      const EXCLUDE_ROLES = new Set(["navigation", "banner", "contentinfo", "complementary", "search"]);

      function isExcluded(el: Element): boolean {
        if (EXCLUDE_TAGS.has(el.tagName)) return true;
        const role = el.getAttribute("role");
        if (role && EXCLUDE_ROLES.has(role)) return true;
        const cls = el.className?.toString?.() ?? "";
        if (/\b(sidebar|nav|footer|header|menu|advert|promo|cookie|popup|modal|banner)\b/i.test(cls)) return true;
        const id = el.id ?? "";
        if (/\b(sidebar|nav|footer|header|menu|ad)\b/i.test(id)) return true;
        return false;
      }

      function getTextDensity(el: Element): number {
        const text = el.textContent?.trim() ?? "";
        const html = el.innerHTML ?? "";
        if (html.length === 0) return 0;
        return text.length / html.length;
      }

      function scoreBlock(el: Element): number {
        const text = el.textContent?.trim() ?? "";
        if (text.length < 50) return 0;

        let score = text.length;
        const density = getTextDensity(el);
        score *= density;

        const paragraphs = el.querySelectorAll("p");
        score += paragraphs.length * 50;

        const tag = el.tagName.toLowerCase();
        if (tag === "article" || el.getAttribute("role") === "article") score *= 2;
        if (tag === "main" || el.getAttribute("role") === "main") score *= 1.5;

        const links = el.querySelectorAll("a");
        const linkTextLen = Array.from(links).reduce((sum, a) => sum + (a.textContent?.length ?? 0), 0);
        if (text.length > 0 && linkTextLen / text.length > 0.5) score *= 0.3;

        return score;
      }

      const candidates = document.querySelectorAll(
        "article, [role='article'], main, [role='main'], section, .post, .story, .entry, .article, .content, .post-content, .story-block, .page-content, div[class*='content'], div[class*='post'], div[class*='story'], div[class*='article']"
      );

      let bestEl: Element | null = null;
      let bestScore = 0;

      for (const el of candidates) {
        if (isExcluded(el)) continue;
        let excluded = false;
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          if (isExcluded(parent)) { excluded = true; break; }
          parent = parent.parentElement;
        }
        if (excluded) continue;

        const score = scoreBlock(el);
        if (score > bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }

      if (bestEl) {
        const walker = document.createTreeWalker(bestEl, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (EXCLUDE_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
            const text = node.textContent?.trim();
            if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });

        const parts: string[] = [];
        let totalLen = 0;
        while (walker.nextNode() && totalLen < 10000) {
          const t = walker.currentNode.textContent?.trim() ?? "";
          if (t.length > 0) {
            parts.push(t);
            totalLen += t.length;
          }
        }
        return parts.join(" ").replace(/\s+/g, " ").substring(0, 10000);
      }

      const bodyText = document.body.innerText ?? "";
      return bodyText.substring(0, 5000);
    });

    return {
      target: "article_text",
      data: text,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractLinks(page: Page): Promise<ExtractionResult> {
    const links = await page.evaluate(() => {
      function getMainArea(): Element {
        const candidates = [
          document.querySelector("main"),
          document.querySelector("[role='main']"),
          document.querySelector("article"),
        ].filter(Boolean) as Element[];

        for (const c of candidates) {
          const anchors = c.querySelectorAll("a[href]");
          if (anchors.length >= 5) return c;
        }

        return document.body;
      }

      const mainArea = getMainArea();
      const anchors = mainArea.querySelectorAll("a[href]");
      const seen = new Set<string>();

      return Array.from(anchors)
        .map((a) => {
          const anchor = a as HTMLAnchorElement;
          return {
            text: a.textContent?.trim().replace(/\s+/g, " ") ?? "",
            href: anchor.href,
          };
        })
        .filter((l) => {
          if (l.text.length === 0) return false;
          if (l.href.startsWith("javascript:")) return false;
          if (l.href === "#" || l.href.endsWith("#")) return false;
          if (seen.has(l.href)) return false;
          seen.add(l.href);
          return true;
        })
        .slice(0, 50);
    });

    const text = links.map((l) => `${l.text} -> ${l.href}`).join("\n");
    return {
      target: "links",
      data: links,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractHeadings(page: Page): Promise<ExtractionResult> {
    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(hs).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim() ?? "",
      })).filter((h) => h.text.length > 0);
    });

    const text = headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n");
    return {
      target: "headings",
      data: headings,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractImages(page: Page): Promise<ExtractionResult> {
    const images = await page.evaluate(() => {
      const mainArea = document.querySelector("main, article, .content") ?? document.body;
      const imgs = mainArea.querySelectorAll("img[src]");
      return Array.from(imgs)
        .map((img) => ({
          src: (img as HTMLImageElement).src,
          alt: (img as HTMLImageElement).alt || "",
          width: (img as HTMLImageElement).naturalWidth,
          height: (img as HTMLImageElement).naturalHeight,
        }))
        .filter((i) => i.width > 50 && i.height > 50)
        .slice(0, 20);
    });

    const text = images.map((i) => `[${i.width}x${i.height}] ${i.alt || "no alt"}: ${i.src}`).join("\n");
    return {
      target: "images",
      data: images,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractTableData(page: Page): Promise<ExtractionResult> {
    const tables = await page.evaluate(() => {
      const allTables = document.querySelectorAll("table");
      return Array.from(allTables).slice(0, 5).map((table) => {
        const headers = Array.from(table.querySelectorAll("th")).map(
          (th) => th.textContent?.trim() ?? ""
        );
        const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim() ?? "")
        );
        return { headers, rows: rows.slice(0, 50) };
      });
    });

    const text = tables
      .map((t) => {
        const header = t.headers.join(" | ");
        const rows = t.rows.map((r) => r.join(" | ")).join("\n");
        return `${header}\n${rows}`;
      })
      .join("\n\n");

    return {
      target: "table_data",
      data: tables,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractMetadata(page: Page): Promise<ExtractionResult> {
    const meta = await page.evaluate(() => {
      const getMeta = (name: string) =>
        document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
          ?.getAttribute("content") ?? "";

      return {
        title: document.title,
        description: getMeta("description") || getMeta("og:description"),
        ogTitle: getMeta("og:title"),
        ogImage: getMeta("og:image"),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
        author: getMeta("author"),
        publishedTime: getMeta("article:published_time"),
        keywords: getMeta("keywords"),
        lang: document.documentElement.lang,
      };
    });

    const text = Object.entries(meta)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    return {
      target: "metadata",
      data: meta,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractFeedItems(page: Page): Promise<ExtractionResult> {
    const items = await page.evaluate(() => {
      function findRepeatingContainers(): Element[] {
        const classCount = new Map<string, Element[]>();

        const allElements = document.querySelectorAll("article, [data-story-id], [data-post-id], [data-id], .post, .story, .card, .item, .entry, .feed-item, .thread, .topic, .result");
        for (const el of allElements) {
          const key = `${el.tagName}.${Array.from(el.classList).sort().join(".")}`;
          if (!classCount.has(key)) classCount.set(key, []);
          classCount.get(key)!.push(el);
        }

        let bestGroup: Element[] = [];
        for (const [, group] of classCount) {
          if (group.length >= 3 && group.length > bestGroup.length) {
            bestGroup = group;
          }
        }

        if (bestGroup.length >= 3) return bestGroup;

        const parents = new Map<Element, { children: Element[]; tag: string; cls: string }>();
        const contentElements = document.querySelectorAll("main *, [role='main'] *, body > div > div *");
        for (const el of contentElements) {
          const parent = el.parentElement;
          if (!parent) continue;
          const childTag = el.tagName;
          const childCls = Array.from(el.classList).sort().join(".");
          if (!parents.has(parent)) parents.set(parent, { children: [], tag: childTag, cls: childCls });
          const info = parents.get(parent)!;
          if (info.tag === childTag && info.cls === childCls) {
            info.children.push(el);
          }
        }

        for (const [, info] of parents) {
          if (info.children.length >= 3 && info.children.length > bestGroup.length) {
            bestGroup = info.children;
          }
        }

        return bestGroup;
      }

      function extractItem(el: Element): {
        title: string;
        url: string;
        preview: string;
        stats: string;
      } | null {
        const heading = el.querySelector("h1, h2, h3, h4, h5, h6, [class*='title'] a, a[class*='title']");
        const firstLink = el.querySelector("a[href]") as HTMLAnchorElement | null;

        const titleEl = heading ?? firstLink;
        const title = titleEl?.textContent?.trim().replace(/\s+/g, " ") ?? "";
        if (title.length === 0) return null;

        let url = "";
        if (titleEl && titleEl.tagName === "A") {
          url = (titleEl as HTMLAnchorElement).href;
        } else if (titleEl) {
          const innerLink = titleEl.querySelector("a[href]") as HTMLAnchorElement | null;
          url = innerLink?.href ?? firstLink?.href ?? "";
        } else if (firstLink) {
          url = firstLink.href;
        }

        const fullText = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
        const preview = fullText.substring(0, 200);

        const numbers = fullText.match(/\d[\d.,KkМм]*(?:\s*(?:комментар|comment|like|view|просмотр|рейтинг|upvote|point|share))?/gi);
        const stats = numbers ? numbers.slice(0, 4).join(" | ") : "";

        return { title: title.substring(0, 200), url, preview, stats };
      }

      const containers = findRepeatingContainers();
      if (containers.length === 0) {
        return { items: [], count: 0 };
      }

      const items: Array<{ title: string; url: string; preview: string; stats: string }> = [];
      for (const el of containers.slice(0, 30)) {
        const item = extractItem(el);
        if (item && item.title.length > 3) {
          items.push(item);
        }
      }

      return { items: items.slice(0, 20), count: containers.length };
    });

    const feedItems = items.items as Array<{ title: string; url: string; preview: string; stats: string }>;
    const text = feedItems
      .map((item, i) => {
        let line = `${i + 1}. ${item.title}`;
        if (item.url) line += `\n   ${item.url}`;
        if (item.stats) line += `\n   [${item.stats}]`;
        return line;
      })
      .join("\n");

    return {
      target: "feed_items",
      data: items,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }
}
