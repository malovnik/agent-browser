import type { ActionGroup, PageElement, PageState } from "../types.js";
import { estimateTokens } from "../renderer/text.js";

export interface PageDiff {
  urlChanged: boolean;
  oldUrl?: string;
  newUrl?: string;
  titleChanged: boolean;
  oldTitle?: string;
  newTitle?: string;
  typeChanged: boolean;
  oldType?: string;
  newType?: string;
  addedElements: PageElement[];
  removedElements: PageElement[];
  changedElements: Array<{ ref: string; field: string; oldValue: string; newValue: string }>;
  newActionGroups: ActionGroup[];
  removedActionGroups: string[];
  tokenEstimate: number;
}

export class PageDiffer {
  private previousState: PageState | null = null;

  computeDiff(currentState: PageState): PageDiff | null {
    if (!this.previousState) {
      this.previousState = currentState;
      return null;
    }

    const prev = this.previousState;
    const curr = currentState;

    const urlChanged = prev.url !== curr.url;
    const titleChanged = prev.title !== curr.title;
    const typeChanged = prev.pageType !== curr.pageType;

    const prevRefMap = new Map(prev.elements.map((e) => [e.ref, e]));
    const currRefMap = new Map(curr.elements.map((e) => [e.ref, e]));

    const prevBySignature = new Map(prev.elements.map((e) => [this.elementSignature(e), e]));
    const currBySignature = new Map(curr.elements.map((e) => [this.elementSignature(e), e]));

    const addedElements: PageElement[] = [];
    const removedElements: PageElement[] = [];
    const changedElements: Array<{ ref: string; field: string; oldValue: string; newValue: string }> = [];

    for (const [sig, el] of currBySignature) {
      if (!prevBySignature.has(sig)) {
        addedElements.push(el);
      }
    }

    for (const [sig, el] of prevBySignature) {
      if (!currBySignature.has(sig)) {
        removedElements.push(el);
      }
    }

    for (const [ref, currEl] of currRefMap) {
      const prevEl = prevRefMap.get(ref);
      if (!prevEl) continue;

      if (prevEl.value !== currEl.value && currEl.value !== undefined) {
        changedElements.push({
          ref,
          field: "value",
          oldValue: prevEl.value ?? "",
          newValue: currEl.value ?? "",
        });
      }
      if (prevEl.checked !== currEl.checked && currEl.checked !== undefined) {
        changedElements.push({
          ref,
          field: "checked",
          oldValue: String(prevEl.checked ?? false),
          newValue: String(currEl.checked ?? false),
        });
      }
      if (prevEl.disabled !== currEl.disabled && currEl.disabled !== undefined) {
        changedElements.push({
          ref,
          field: "disabled",
          oldValue: String(prevEl.disabled ?? false),
          newValue: String(currEl.disabled ?? false),
        });
      }
    }

    const prevGroupIds = new Set(prev.actionGroups.map((g) => g.id));
    const currGroupIds = new Set(curr.actionGroups.map((g) => g.id));

    const newActionGroups = curr.actionGroups.filter((g) => !prevGroupIds.has(g.id));
    const removedActionGroups = prev.actionGroups
      .filter((g) => !currGroupIds.has(g.id))
      .map((g) => g.label);

    this.previousState = currentState;

    const diff: PageDiff = {
      urlChanged,
      oldUrl: urlChanged ? prev.url : undefined,
      newUrl: urlChanged ? curr.url : undefined,
      titleChanged,
      oldTitle: titleChanged ? prev.title : undefined,
      newTitle: titleChanged ? curr.title : undefined,
      typeChanged,
      oldType: typeChanged ? prev.pageType : undefined,
      newType: typeChanged ? curr.pageType : undefined,
      addedElements,
      removedElements,
      changedElements,
      newActionGroups,
      removedActionGroups,
      tokenEstimate: 0,
    };

    diff.tokenEstimate = estimateTokens(this.renderDiff(diff));
    return diff;
  }

  renderDiff(diff: PageDiff): string {
    const lines: string[] = ["=== PAGE DIFF ==="];

    if (diff.urlChanged) {
      lines.push(`URL: ${diff.oldUrl} -> ${diff.newUrl}`);
    }
    if (diff.titleChanged) {
      lines.push(`Title: ${diff.oldTitle} -> ${diff.newTitle}`);
    }
    if (diff.typeChanged) {
      lines.push(`Type: ${diff.oldType} -> ${diff.newType}`);
    }

    if (diff.changedElements.length > 0) {
      lines.push("\nCHANGED:");
      for (const ch of diff.changedElements) {
        lines.push(`  ${ch.ref}.${ch.field}: "${ch.oldValue}" -> "${ch.newValue}"`);
      }
    }

    if (diff.addedElements.length > 0) {
      lines.push("\n+ NEW ELEMENTS:");
      for (const el of diff.addedElements.slice(0, 15)) {
        lines.push(`  + ${el.ref} [${el.role}] ${el.name}`);
      }
      if (diff.addedElements.length > 15) {
        lines.push(`  ... and ${diff.addedElements.length - 15} more`);
      }
    }

    if (diff.removedElements.length > 0) {
      lines.push("\n- REMOVED ELEMENTS:");
      for (const el of diff.removedElements.slice(0, 10)) {
        lines.push(`  - ${el.ref} [${el.role}] ${el.name}`);
      }
      if (diff.removedElements.length > 10) {
        lines.push(`  ... and ${diff.removedElements.length - 10} more`);
      }
    }

    if (diff.newActionGroups.length > 0) {
      lines.push("\n+ NEW ACTION GROUPS:");
      for (const group of diff.newActionGroups) {
        lines.push(`  [${group.label.toUpperCase()}]`);
        for (const action of group.elements) {
          lines.push(`    ${action.command} — ${action.description}`);
        }
      }
    }

    if (diff.removedActionGroups.length > 0) {
      lines.push(`\n- REMOVED GROUPS: ${diff.removedActionGroups.join(", ")}`);
    }

    if (!diff.urlChanged && !diff.titleChanged && !diff.typeChanged &&
        diff.addedElements.length === 0 && diff.removedElements.length === 0 &&
        diff.changedElements.length === 0) {
      lines.push("No changes detected.");
    }

    lines.push(`\n(diff ~${diff.tokenEstimate || "?"} tokens)`);
    return lines.join("\n");
  }

  reset(): void {
    this.previousState = null;
  }

  private elementSignature(el: PageElement): string {
    return `${el.role}:${el.name}:${el.tag}:${el.href ?? ""}`;
  }
}
