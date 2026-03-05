import type { ActionGroup, ActionType, DiscoveredAction, PageElement, PageType } from "../types.js";

export class ActionDiscoverer {
  discover(pageType: PageType, elements: PageElement[]): ActionGroup[] {
    const groups: ActionGroup[] = [];

    const authGroup = this.discoverAuthActions(elements);
    if (authGroup) groups.push(authGroup);

    const searchGroup = this.discoverSearchActions(elements);
    if (searchGroup) groups.push(searchGroup);

    const formGroups = this.discoverFormActions(elements, pageType);
    groups.push(...formGroups);

    const navGroup = this.discoverNavigationActions(elements);
    if (navGroup) groups.push(navGroup);

    const buttonGroup = this.discoverButtonActions(elements, groups);
    if (buttonGroup) groups.push(buttonGroup);

    return groups;
  }

  private discoverAuthActions(elements: PageElement[]): ActionGroup | null {
    const passwordFields = elements.filter(
      (e) =>
        (e.role === "textbox" && e.type === "password") ||
        e.name.toLowerCase().includes("password")
    );

    if (passwordFields.length === 0) return null;

    const emailFields = elements.filter(
      (e) =>
        e.role === "textbox" &&
        (e.type === "email" ||
          e.name.toLowerCase().includes("email") ||
          e.name.toLowerCase().includes("username") ||
          e.placeholder?.toLowerCase().includes("email") ||
          e.placeholder?.toLowerCase().includes("username"))
    );

    const submitButtons = elements.filter(
      (e) =>
        e.role === "button" &&
        /sign.?in|log.?in|submit|enter|continue/i.test(e.name)
    );

    const socialButtons = elements.filter(
      (e) =>
        e.role === "button" &&
        /google|github|facebook|apple|microsoft|twitter|oauth/i.test(e.name)
    );

    const actions: DiscoveredAction[] = [];

    for (const field of emailFields) {
      actions.push({
        ref: field.ref,
        command: `fill(${field.ref}, "your-email")`,
        description: field.name || field.placeholder || "Email/username input",
        element: field,
      });
    }

    for (const field of passwordFields) {
      actions.push({
        ref: field.ref,
        command: `fill(${field.ref}, "your-password")`,
        description: field.name || "Password input",
        element: field,
      });
    }

    for (const btn of submitButtons) {
      actions.push({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name || "Submit login",
        element: btn,
      });
    }

    const group: ActionGroup = {
      id: "auth_login",
      label: "Login Form",
      type: "auth_flow",
      elements: actions,
    };

    if (socialButtons.length > 0) {
      const socialGroup: ActionGroup = {
        id: "auth_social",
        label: "Social Sign-In",
        type: "auth_flow",
        elements: socialButtons.map((btn) => ({
          ref: btn.ref,
          command: `click(${btn.ref})`,
          description: `Sign in with ${btn.name}`,
          element: btn,
        })),
      };
      return group;
    }

    return group;
  }

  private discoverSearchActions(elements: PageElement[]): ActionGroup | null {
    const searchBoxes = elements.filter(
      (e) =>
        e.role === "searchbox" ||
        (e.role === "textbox" &&
          (e.name.toLowerCase().includes("search") ||
            e.placeholder?.toLowerCase().includes("search") ||
            e.type === "search"))
    );

    if (searchBoxes.length === 0) return null;

    const searchButtons = elements.filter(
      (e) =>
        e.role === "button" && /search|find|go|submit/i.test(e.name)
    );

    const actions: DiscoveredAction[] = [];

    for (const box of searchBoxes) {
      actions.push({
        ref: box.ref,
        command: `fill(${box.ref}, "search query")`,
        description: box.name || box.placeholder || "Search input",
        element: box,
      });
    }

    for (const btn of searchButtons) {
      actions.push({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name || "Search button",
        element: btn,
      });
    }

    return {
      id: "search",
      label: "Search",
      type: "search",
      elements: actions,
    };
  }

  private discoverFormActions(elements: PageElement[], pageType: PageType): ActionGroup[] {
    const alreadyHandledRefs = new Set<string>();
    const inputFields = elements.filter(
      (e) =>
        (e.role === "textbox" || e.role === "combobox" || e.role === "checkbox" || e.role === "radio") &&
        e.type !== "password" &&
        !e.name.toLowerCase().includes("search")
    );

    if (inputFields.length < 2) return [];

    const groups: ActionGroup[] = [];

    const formActions: DiscoveredAction[] = inputFields.map((field) => {
      alreadyHandledRefs.add(field.ref);
      const command =
        field.role === "checkbox" || field.role === "radio"
          ? `click(${field.ref})`
          : field.role === "combobox"
            ? `select(${field.ref}, "value")`
            : `fill(${field.ref}, "value")`;

      return {
        ref: field.ref,
        command,
        description: field.name || field.placeholder || `${field.role} input`,
        element: field,
      };
    });

    const submitButtons = elements.filter(
      (e) =>
        e.role === "button" &&
        /submit|send|save|create|update|confirm|apply|continue|next/i.test(e.name)
    );

    for (const btn of submitButtons) {
      formActions.push({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name || "Submit",
        element: btn,
      });
    }

    if (formActions.length > 0) {
      groups.push({
        id: "form_main",
        label: "Form",
        type: "form_submit",
        elements: formActions,
      });
    }

    return groups;
  }

  private discoverNavigationActions(elements: PageElement[]): ActionGroup | null {
    const links = elements.filter(
      (e) => e.role === "link" && e.name.trim().length > 0
    );

    if (links.length === 0) return null;

    const prioritizedLinks = links
      .filter((l) => {
        const name = l.name.toLowerCase();
        return !/^(#|javascript:|mailto:)/i.test(l.href ?? "") && name.length > 1;
      })
      .slice(0, 15);

    if (prioritizedLinks.length === 0) return null;

    return {
      id: "navigation",
      label: "Navigation",
      type: "navigation",
      elements: prioritizedLinks.map((link) => ({
        ref: link.ref,
        command: `click(${link.ref})`,
        description: link.name,
        element: link,
      })),
    };
  }

  private discoverButtonActions(
    elements: PageElement[],
    existingGroups: ActionGroup[]
  ): ActionGroup | null {
    const usedRefs = new Set<string>();
    for (const group of existingGroups) {
      for (const action of group.elements) {
        usedRefs.add(action.ref);
      }
    }

    const ungroupedButtons = elements.filter(
      (e) =>
        e.role === "button" &&
        !usedRefs.has(e.ref) &&
        e.name.trim().length > 0
    );

    if (ungroupedButtons.length === 0) return null;

    return {
      id: "actions",
      label: "Other Actions",
      type: "button",
      elements: ungroupedButtons.slice(0, 10).map((btn) => ({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name,
        element: btn,
      })),
    };
  }
}
