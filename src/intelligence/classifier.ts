import type { PageElement, PageType } from "../types.js";

interface ClassificationSignal {
  pageType: PageType;
  confidence: number;
  reason: string;
}

const URL_PATTERNS: Array<{ pattern: RegExp; type: PageType; weight: number }> = [
  { pattern: /^https?:\/\/(www\.)?(google|bing|duckduckgo|yandex|baidu)\./i, type: "search", weight: 0.7 },
  { pattern: /\/(login|signin|sign-in|auth)\b/i, type: "login", weight: 0.6 },
  { pattern: /\/(register|signup|sign-up|join)\b/i, type: "login", weight: 0.5 },
  { pattern: /\/(search|results|query)\b/i, type: "search", weight: 0.5 },
  { pattern: /\/(products?|catalog|shop|store|category)\b/i, type: "product_listing", weight: 0.4 },
  { pattern: /\/(product|item|p)\/[\w-]+/i, type: "product_detail", weight: 0.5 },
  { pattern: /\/(cart|checkout|payment|order)\b/i, type: "checkout", weight: 0.6 },
  { pattern: /\/(contact|feedback|apply|form)\b/i, type: "form", weight: 0.4 },
  { pattern: /\/(article|post|blog|news|story)\/[\w-]+/i, type: "article", weight: 0.5 },
  { pattern: /\/(feed|timeline|hot|new|fresh|popular|trending|top|best|rising)\b/i, type: "feed", weight: 0.5 },
  { pattern: /^https?:\/\/(www\.)?(reddit|pikabu|habr|hackernews|lobste\.rs|lemmy)\./i, type: "feed", weight: 0.4 },
  { pattern: /\/(404|error|not-found)\b/i, type: "error", weight: 0.7 },
];

export class PageClassifier {
  classify(url: string, title: string, elements: PageElement[]): PageType {
    const signals: ClassificationSignal[] = [];

    this.classifyByUrl(url, signals);
    this.classifyByTitle(title, signals);
    this.classifyByElements(elements, signals);

    if (signals.length === 0) return "unknown";

    const scores = new Map<PageType, number>();
    for (const signal of signals) {
      const current = scores.get(signal.pageType) ?? 0;
      scores.set(signal.pageType, current + signal.confidence);
    }

    let bestType: PageType = "unknown";
    let bestScore = 0;
    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    return bestType;
  }

  private classifyByUrl(url: string, signals: ClassificationSignal[]): void {
    for (const { pattern, type, weight } of URL_PATTERNS) {
      if (pattern.test(url)) {
        signals.push({ pageType: type, confidence: weight, reason: `URL matches ${pattern}` });
      }
    }
  }

  private classifyByTitle(title: string, signals: ClassificationSignal[]): void {
    const lower = title.toLowerCase();

    const titleSignals: Array<{ keywords: string[]; type: PageType; weight: number }> = [
      { keywords: ["sign in", "log in", "login", "sign up", "register"], type: "login", weight: 0.5 },
      { keywords: ["search", "results for", "find"], type: "search", weight: 0.4 },
      { keywords: ["cart", "checkout", "payment", "order"], type: "checkout", weight: 0.5 },
      { keywords: ["404", "not found", "error", "page not found"], type: "error", weight: 0.6 },
      { keywords: ["feed", "timeline", "trending", "hot", "горячее", "лучшее", "свежее", "новое"], type: "feed", weight: 0.4 },
    ];

    for (const { keywords, type, weight } of titleSignals) {
      if (keywords.some((kw) => lower.includes(kw))) {
        signals.push({ pageType: type, confidence: weight, reason: `Title contains keyword` });
      }
    }
  }

  private classifyByElements(elements: PageElement[], signals: ClassificationSignal[]): void {
    const passwordFields = elements.filter(
      (e) => e.role === "textbox" && (e.type === "password" || e.name.toLowerCase().includes("password"))
    );
    const emailFields = elements.filter(
      (e) =>
        e.role === "textbox" &&
        (e.type === "email" || e.name.toLowerCase().includes("email") || e.placeholder?.toLowerCase().includes("email"))
    );

    if (passwordFields.length > 0 && emailFields.length > 0) {
      signals.push({ pageType: "login", confidence: 0.8, reason: "Has email + password fields" });
    } else if (passwordFields.length > 0) {
      signals.push({ pageType: "login", confidence: 0.6, reason: "Has password field" });
    }

    const searchBoxes = elements.filter(
      (e) => e.role === "searchbox" || e.role === "combobox" ||
        (e.role === "textbox" && (/search/i.test(e.name) || /search/i.test(e.placeholder ?? "")))
    );
    if (searchBoxes.length > 0) {
      signals.push({ pageType: "search", confidence: 0.4, reason: "Has search box" });
    }

    const links = elements.filter((e) => e.role === "link");
    const buttons = elements.filter((e) => e.role === "button");
    const inputs = elements.filter((e) => e.role === "textbox" || e.role === "combobox");

    if (links.length > 15 && inputs.length < 3) {
      signals.push({ pageType: "navigation", confidence: 0.4, reason: "Many links, few inputs" });
    }

    if (inputs.length > 3 && buttons.length >= 1) {
      signals.push({ pageType: "form", confidence: 0.3, reason: "Multiple input fields with submit" });
    }

    const headings = elements.filter((e) => e.role === "heading");
    if (headings.length >= 1 && links.length < 10 && inputs.length === 0) {
      signals.push({ pageType: "article", confidence: 0.3, reason: "Heading-dominant, few interactive elements" });
    }

    if (headings.length >= 3 && links.length > 20 && inputs.length < 3) {
      signals.push({ pageType: "feed", confidence: 0.5, reason: "Multiple headings with many links — feed pattern" });
    }
    if (buttons.length > 10 && headings.length >= 3 && links.length > 10) {
      signals.push({ pageType: "feed", confidence: 0.3, reason: "Many buttons + headings + links — interactive feed" });
    }

    const priceIndicators = elements.filter(
      (e) => /\$|€|£|₽|price|cost/i.test(e.name)
    );
    if (priceIndicators.length > 3) {
      signals.push({ pageType: "product_listing", confidence: 0.5, reason: "Multiple price indicators" });
    } else if (priceIndicators.length >= 1 && priceIndicators.length <= 3) {
      signals.push({ pageType: "product_detail", confidence: 0.3, reason: "Few price indicators" });
    }

    const cartButtons = elements.filter(
      (e) => e.role === "button" && /add to cart|buy|purchase|checkout/i.test(e.name)
    );
    if (cartButtons.length > 0) {
      const hasMultiplePrices = priceIndicators.length > 3;
      if (hasMultiplePrices) {
        signals.push({ pageType: "product_listing", confidence: 0.4, reason: "Cart buttons with multiple prices" });
      } else {
        signals.push({ pageType: "product_detail", confidence: 0.5, reason: "Cart button with single product context" });
      }
    }
  }
}
