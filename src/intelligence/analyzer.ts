import type { Page } from "puppeteer-core";
import type { PageElement } from "../types.js";

interface RawAccessibilityNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  children?: RawAccessibilityNode[];
  properties?: Array<{ name: string; value: { value?: unknown } }>;
}

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "treeitem",
]);

const SKIP_ROLES = new Set([
  "none",
  "presentation",
  "generic",
  "group",
  "list",
  "listitem",
  "paragraph",
  "Section",
  "StaticText",
  "LineBreak",
]);

const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "search",
  "form",
  "region",
]);

export class DomAnalyzer {
  private refCounter = 0;

  async analyze(page: Page): Promise<PageElement[]> {
    this.refCounter = 0;

    const accessibilityTree = await this.getAccessibilityTree(page);
    const elements: PageElement[] = [];

    this.walkTree(accessibilityTree, elements);

    const domEnrichedElements = await this.enrichFromDom(page, elements);
    return domEnrichedElements;
  }

  private async getAccessibilityTree(page: Page): Promise<RawAccessibilityNode> {
    const client = await page.createCDPSession();
    try {
      const { nodes } = await client.send("Accessibility.getFullAXTree");

      const nodeMap = new Map<string, RawAccessibilityNode & { childIds?: string[]; nodeId?: string }>();
      for (const node of nodes) {
        const mapped: RawAccessibilityNode & { childIds?: string[]; nodeId?: string } = {
          role: node.role?.value ?? "none",
          name: node.name?.value ?? "",
          value: node.value?.value,
          description: node.description?.value,
          properties: node.properties,
          children: [],
          childIds: node.childIds,
          nodeId: node.nodeId,
        };
        nodeMap.set(node.nodeId, mapped);
      }

      for (const [, node] of nodeMap) {
        if (node.childIds) {
          node.children = node.childIds
            .map((id: string) => nodeMap.get(id))
            .filter(Boolean) as RawAccessibilityNode[];
        }
      }

      const root = nodeMap.get(nodes[0]?.nodeId);
      return root ?? { role: "none", name: "", children: [] };
    } finally {
      await client.detach();
    }
  }

  private walkTree(node: RawAccessibilityNode, elements: PageElement[]): void {
    const isInteractive = INTERACTIVE_ROLES.has(node.role);
    const isLandmark = LANDMARK_ROLES.has(node.role);
    const hasName = node.name.trim().length > 0;
    const isHeading = node.role === "heading";

    if (isInteractive && (hasName || node.role === "textbox" || node.role === "searchbox")) {
      elements.push(this.toPageElement(node));
    } else if (isLandmark && hasName) {
      elements.push(this.toPageElement(node));
    } else if (isHeading && hasName) {
      elements.push(this.toPageElement(node));
    }

    if (node.children) {
      for (const child of node.children) {
        this.walkTree(child, elements);
      }
    }
  }

  private toPageElement(node: RawAccessibilityNode): PageElement {
    this.refCounter++;
    const ref = `@e${this.refCounter}`;

    const element: PageElement = {
      ref,
      tag: this.roleToTag(node.role),
      role: node.role,
      name: node.name.trim(),
    };

    if (node.value !== undefined) {
      element.value = String(node.value);
    }

    const props = node.properties ?? [];
    for (const prop of props) {
      switch (prop.name) {
        case "disabled":
          element.disabled = prop.value.value === true;
          break;
        case "required":
          element.required = prop.value.value === true;
          break;
        case "checked":
          element.checked = prop.value.value === true || prop.value.value === "true";
          break;
      }
    }

    return element;
  }

  private roleToTag(role: string): string {
    const mapping: Record<string, string> = {
      button: "button",
      link: "a",
      textbox: "input",
      searchbox: "input",
      combobox: "select",
      checkbox: "input",
      radio: "input",
      switch: "input",
      slider: "input",
      spinbutton: "input",
      heading: "h",
      navigation: "nav",
      banner: "header",
      contentinfo: "footer",
      main: "main",
      complementary: "aside",
      search: "form",
      form: "form",
    };
    return mapping[role] ?? role;
  }

  private async enrichFromDom(page: Page, elements: PageElement[]): Promise<PageElement[]> {
    if (elements.length === 0) return elements;

    try {
      const domData = await page.evaluate(() => {
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

        const domElements = document.querySelectorAll(interactiveSelectors);
        const data: Array<{
          tag: string;
          type: string;
          placeholder: string;
          href: string;
          ariaLabel: string;
          name: string;
          options: string[];
        }> = [];

        for (const el of domElements) {
          const htmlEl = el as HTMLElement;
          const inputEl = el as HTMLInputElement;
          const selectEl = el as HTMLSelectElement;
          const anchorEl = el as HTMLAnchorElement;

          data.push({
            tag: el.tagName.toLowerCase(),
            type: inputEl.type ?? "",
            placeholder: inputEl.placeholder ?? "",
            href: anchorEl.href ?? "",
            ariaLabel: htmlEl.getAttribute("aria-label") ?? "",
            name: htmlEl.getAttribute("name") ?? inputEl.name ?? "",
            options:
              el.tagName === "SELECT"
                ? Array.from(selectEl.options).map((o) => o.textContent?.trim() ?? o.value)
                : [],
          });
        }
        return data;
      });

      let domIdx = 0;
      for (const element of elements) {
        if (domIdx >= domData.length) break;
        const dom = domData[domIdx];
        if (!dom) continue;

        if (element.role === "textbox" || element.role === "searchbox") {
          element.type = dom.type || "text";
          if (dom.placeholder) element.placeholder = dom.placeholder;
        }
        if (element.role === "link" && dom.href) {
          element.href = dom.href;
        }
        if (element.role === "combobox" && dom.options.length > 0) {
          element.options = dom.options;
        }
        if (dom.ariaLabel && !element.ariaLabel) {
          element.ariaLabel = dom.ariaLabel;
        }

        domIdx++;
      }
    } catch {
      /* DOM enrichment is best-effort */
    }

    return elements;
  }
}
