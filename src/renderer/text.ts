import type { ActionGroup, PageState } from "../types.js";

export class TextRenderer {
  render(state: PageState): string {
    const sections: string[] = [];

    sections.push(this.renderHeader(state));

    if (state.actionGroups.length > 0) {
      sections.push(this.renderActions(state.actionGroups));
    } else {
      sections.push("=== NO INTERACTIVE ELEMENTS DETECTED ===");
    }

    sections.push(this.renderMeta(state));

    return sections.join("\n\n");
  }

  renderCompact(state: PageState): string {
    const lines: string[] = [
      `[${state.pageType.toUpperCase()}] ${state.title}`,
      state.url,
      "",
    ];

    for (const group of state.actionGroups) {
      for (const action of group.elements) {
        lines.push(`  ${action.command} — ${action.description}`);
      }
    }

    lines.push(`\n(${state.meta.interactiveElements} elements, ~${state.meta.tokenEstimate} tokens)`);
    return lines.join("\n");
  }

  private renderHeader(state: PageState): string {
    return [
      "=== PAGE STATE ===",
      `URL: ${state.url}`,
      `Type: ${state.pageType}`,
      `Title: ${state.title}`,
    ].join("\n");
  }

  private renderActions(groups: ActionGroup[]): string {
    const lines: string[] = ["=== ACTIONS ==="];

    for (const group of groups) {
      lines.push(`[${group.label.toUpperCase()}]`);

      for (const action of group.elements) {
        const disabled = action.element.disabled ? " (disabled)" : "";
        const required = action.element.required ? " *" : "";
        lines.push(`  ${action.command}${required} — ${action.description}${disabled}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  private renderMeta(state: PageState): string {
    return [
      "=== META ===",
      `Elements: ${state.meta.totalElements} | Interactive: ${state.meta.interactiveElements} | Tokens: ~${state.meta.tokenEstimate}`,
    ].join("\n");
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
