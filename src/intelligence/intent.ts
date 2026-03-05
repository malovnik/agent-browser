import type { PageState, PageType } from "../types.js";

export type Intent =
  | "login"
  | "search"
  | "read_content"
  | "fill_form"
  | "navigate"
  | "buy"
  | "extract_data";

interface IntentFilter {
  keepRoles: Set<string>;
  keepGroupTypes: Set<string>;
  namePatterns?: RegExp[];
}

const INTENT_FILTERS: Record<Intent, IntentFilter> = {
  login: {
    keepRoles: new Set(["textbox", "button"]),
    keepGroupTypes: new Set(["auth_flow"]),
    namePatterns: [/email|password|username|sign.?in|log.?in|login|continue|google|apple|github|passkey/i],
  },
  search: {
    keepRoles: new Set(["searchbox", "combobox", "textbox", "button"]),
    keepGroupTypes: new Set(["search"]),
    namePatterns: [/search|find|query|go/i],
  },
  read_content: {
    keepRoles: new Set(["heading", "link"]),
    keepGroupTypes: new Set(["navigation"]),
  },
  fill_form: {
    keepRoles: new Set(["textbox", "combobox", "checkbox", "radio", "button"]),
    keepGroupTypes: new Set(["form_submit", "auth_flow"]),
  },
  navigate: {
    keepRoles: new Set(["link", "button"]),
    keepGroupTypes: new Set(["navigation", "button"]),
  },
  buy: {
    keepRoles: new Set(["button", "textbox", "link"]),
    keepGroupTypes: new Set(["form_submit", "button"]),
    namePatterns: [/buy|add.?to.?cart|purchase|checkout|price|pay/i],
  },
  extract_data: {
    keepRoles: new Set(["heading", "link"]),
    keepGroupTypes: new Set([]),
  },
};

export class IntentFilter_ {
  filterByIntent(state: PageState, intent: Intent): PageState {
    const filter = INTENT_FILTERS[intent];
    if (!filter) return state;

    const filteredElements = state.elements.filter((el) => {
      if (filter.keepRoles.has(el.role)) {
        if (filter.namePatterns) {
          return filter.namePatterns.some((p) =>
            p.test(el.name) || p.test(el.placeholder ?? "") || p.test(el.ariaLabel ?? "")
          );
        }
        return true;
      }
      return false;
    });

    const filteredGroups = state.actionGroups
      .filter((g) => filter.keepGroupTypes.has(g.type))
      .map((group) => {
        if (!filter.namePatterns) return group;
        return {
          ...group,
          elements: group.elements.filter((action) =>
            filter.namePatterns!.some((p) =>
              p.test(action.description) || p.test(action.element.name)
            )
          ),
        };
      })
      .filter((g) => g.elements.length > 0);

    return {
      ...state,
      elements: filteredElements,
      actionGroups: filteredGroups,
      meta: {
        ...state.meta,
        totalElements: filteredElements.length,
        interactiveElements: filteredElements.filter((e) =>
          ["button", "textbox", "searchbox", "combobox", "checkbox", "radio", "link"].includes(e.role)
        ).length,
      },
    };
  }

  suggestIntent(pageType: PageType): Intent | null {
    const mapping: Partial<Record<PageType, Intent>> = {
      login: "login",
      search: "search",
      article: "read_content",
      form: "fill_form",
      product_detail: "buy",
      product_listing: "navigate",
      checkout: "fill_form",
    };
    return mapping[pageType] ?? null;
  }
}
