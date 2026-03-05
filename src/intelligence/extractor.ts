import type { Page } from "puppeteer-core";

export type ExtractionTarget =
  | "article_text"
  | "links"
  | "headings"
  | "images"
  | "table_data"
  | "metadata";

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
    }
  }

  private async extractArticleText(page: Page): Promise<ExtractionResult> {
    const text = await page.evaluate(() => {
      const selectors = [
        "article",
        '[role="article"]',
        ".post-content",
        ".article-content",
        ".story__content",
        ".entry-content",
        "main article",
        ".content-body",
        ".post-body",
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 100) {
          return el.textContent.trim();
        }
      }

      const paragraphs = document.querySelectorAll("main p, article p, .content p");
      if (paragraphs.length > 0) {
        return Array.from(paragraphs)
          .map((p) => p.textContent?.trim())
          .filter(Boolean)
          .join("\n\n");
      }

      const main = document.querySelector("main, [role=main], #content, .content");
      if (main) return main.textContent?.trim() ?? "";

      return document.body.innerText.substring(0, 5000);
    });

    return {
      target: "article_text",
      data: text,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }

  private async extractLinks(page: Page): Promise<ExtractionResult> {
    const links = await page.evaluate(() => {
      const mainArea = document.querySelector("main, [role=main], article, .content") ?? document.body;
      const anchors = mainArea.querySelectorAll("a[href]");
      return Array.from(anchors)
        .map((a) => ({
          text: a.textContent?.trim() ?? "",
          href: (a as HTMLAnchorElement).href,
        }))
        .filter((l) => l.text.length > 0 && !l.href.startsWith("javascript:"))
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
}
