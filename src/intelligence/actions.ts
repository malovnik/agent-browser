import type { ActionGroup, DiscoveredAction, PageElement, PageType } from "../types.js";

export class ActionDiscoverer {
  private usedRefs = new Set<string>();

  discover(pageType: PageType, elements: PageElement[]): ActionGroup[] {
    this.usedRefs = new Set();
    const groups: ActionGroup[] = [];

    const authGroups = this.discoverAuthActions(elements);
    groups.push(...authGroups);

    const searchGroup = this.discoverSearchActions(elements);
    if (searchGroup) groups.push(searchGroup);

    const formGroups = this.discoverFormActions(elements);
    groups.push(...formGroups);

    const navGroup = this.discoverNavigationActions(elements);
    if (navGroup) groups.push(navGroup);

    const buttonGroup = this.discoverButtonActions(elements);
    if (buttonGroup) groups.push(buttonGroup);

    return groups;
  }

  private markUsed(...refs: string[]): void {
    for (const ref of refs) this.usedRefs.add(ref);
  }

  private isUsed(ref: string): boolean {
    return this.usedRefs.has(ref);
  }

  private discoverAuthActions(elements: PageElement[]): ActionGroup[] {
    const passwordFields = elements.filter(
      (e) =>
        e.role === "textbox" &&
        (e.type === "password" ||
          e.name.toLowerCase() === "password" ||
          e.placeholder?.toLowerCase() === "password")
    );

    if (passwordFields.length === 0) return [];

    const emailFields = elements.filter(
      (e) =>
        e.role === "textbox" &&
        e.type !== "password" &&
        (e.type === "email" ||
          /email|username|login/i.test(e.name) ||
          /email|username|login/i.test(e.placeholder ?? ""))
    );

    const socialPattern = /google|github|facebook|apple|microsoft|twitter|oauth|passkey/i;

    const socialButtons = elements.filter(
      (e) => e.role === "button" && socialPattern.test(e.name)
    );

    const socialRefs = new Set(socialButtons.map((b) => b.ref));

    const submitButtons = elements.filter(
      (e) =>
        e.role === "button" &&
        !socialRefs.has(e.ref) &&
        /sign.?in|log.?in|submit|enter|continue/i.test(e.name)
    );

    const groups: ActionGroup[] = [];
    const loginActions: DiscoveredAction[] = [];

    for (const field of emailFields) {
      this.markUsed(field.ref);
      loginActions.push({
        ref: field.ref,
        command: `fill(${field.ref}, "your-email")`,
        description: field.name || field.placeholder || "Email/username",
        element: field,
      });
    }

    for (const field of passwordFields) {
      this.markUsed(field.ref);
      loginActions.push({
        ref: field.ref,
        command: `fill(${field.ref}, "your-password")`,
        description: field.name || "Password",
        element: field,
      });
    }

    for (const btn of submitButtons) {
      this.markUsed(btn.ref);
      loginActions.push({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name || "Sign in",
        element: btn,
      });
    }

    if (loginActions.length > 0) {
      groups.push({
        id: "auth_login",
        label: "Login Form",
        type: "auth_flow",
        elements: loginActions,
      });
    }

    if (socialButtons.length > 0) {
      const socialActions = socialButtons.map((btn) => {
        this.markUsed(btn.ref);
        return {
          ref: btn.ref,
          command: `click(${btn.ref})`,
          description: btn.name,
          element: btn,
        };
      });

      groups.push({
        id: "auth_social",
        label: "Social Sign-In",
        type: "auth_flow",
        elements: socialActions,
      });
    }

    return groups;
  }

  private discoverSearchActions(elements: PageElement[]): ActionGroup | null {
    const searchBoxes = elements.filter(
      (e) =>
        !this.isUsed(e.ref) &&
        (e.role === "searchbox" ||
          e.role === "combobox" ||
          (e.role === "textbox" &&
            (/search/i.test(e.name) ||
              /search/i.test(e.placeholder ?? "") ||
              e.type === "search")))
    );

    if (searchBoxes.length === 0) return null;

    const searchButtons = elements.filter(
      (e) =>
        !this.isUsed(e.ref) &&
        e.role === "button" &&
        /search|find|go/i.test(e.name)
    );

    const actions: DiscoveredAction[] = [];

    for (const box of searchBoxes) {
      this.markUsed(box.ref);
      actions.push({
        ref: box.ref,
        command: `fill(${box.ref}, "search query")`,
        description: box.name || box.placeholder || "Search",
        element: box,
      });
    }

    for (const btn of searchButtons) {
      this.markUsed(btn.ref);
      actions.push({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name || "Search",
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

  private discoverFormActions(elements: PageElement[]): ActionGroup[] {
    const inputFields = elements.filter(
      (e) =>
        !this.isUsed(e.ref) &&
        (e.role === "textbox" || e.role === "combobox" || e.role === "checkbox" || e.role === "radio")
    );

    if (inputFields.length < 2) return [];

    const formActions: DiscoveredAction[] = inputFields.map((field) => {
      this.markUsed(field.ref);
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
        !this.isUsed(e.ref) &&
        e.role === "button" &&
        /submit|send|save|create|update|confirm|apply|continue|next/i.test(e.name)
    );

    for (const btn of submitButtons) {
      this.markUsed(btn.ref);
      formActions.push({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name || "Submit",
        element: btn,
      });
    }

    return [{
      id: "form_main",
      label: "Form",
      type: "form_submit",
      elements: formActions,
    }];
  }

  private discoverNavigationActions(elements: PageElement[]): ActionGroup | null {
    const links = elements.filter(
      (e) =>
        !this.isUsed(e.ref) &&
        e.role === "link" &&
        e.name.trim().length > 1
    );

    if (links.length === 0) return null;

    const prioritized = links
      .filter((l) => !/^(#|javascript:|mailto:)/i.test(l.href ?? ""))
      .slice(0, 15);

    if (prioritized.length === 0) return null;

    for (const link of prioritized) this.markUsed(link.ref);

    return {
      id: "navigation",
      label: "Navigation",
      type: "navigation",
      elements: prioritized.map((link) => ({
        ref: link.ref,
        command: `click(${link.ref})`,
        description: link.name,
        element: link,
      })),
    };
  }

  private discoverButtonActions(elements: PageElement[]): ActionGroup | null {
    const ungrouped = elements.filter(
      (e) =>
        !this.isUsed(e.ref) &&
        e.role === "button" &&
        e.name.trim().length > 0
    );

    if (ungrouped.length === 0) return null;

    return {
      id: "actions",
      label: "Other Actions",
      type: "button",
      elements: ungrouped.slice(0, 10).map((btn) => ({
        ref: btn.ref,
        command: `click(${btn.ref})`,
        description: btn.name,
        element: btn,
      })),
    };
  }
}
