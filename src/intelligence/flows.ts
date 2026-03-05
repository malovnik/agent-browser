import type { PageState } from "../types.js";

export interface ActionFlow {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  requiredParams: string[];
  optionalParams: string[];
}

export interface FlowStep {
  action: "fill" | "click" | "select" | "wait";
  ref?: string;
  paramKey?: string;
  description: string;
}

export class FlowGenerator {
  generateFlows(state: PageState): ActionFlow[] {
    const flows: ActionFlow[] = [];

    const loginFlow = this.detectLoginFlow(state);
    if (loginFlow) flows.push(loginFlow);

    const searchFlow = this.detectSearchFlow(state);
    if (searchFlow) flows.push(searchFlow);

    const formFlow = this.detectFormFlow(state);
    if (formFlow) flows.push(formFlow);

    return flows;
  }

  private detectLoginFlow(state: PageState): ActionFlow | null {
    const authGroup = state.actionGroups.find((g) => g.type === "auth_flow" && g.id === "auth_login");
    if (!authGroup) return null;

    const emailAction = authGroup.elements.find((a) =>
      /email|username/i.test(a.description) && a.command.startsWith("fill")
    );
    const passwordAction = authGroup.elements.find((a) =>
      /password/i.test(a.description) && a.command.startsWith("fill")
    );
    const submitAction = authGroup.elements.find((a) =>
      a.command.startsWith("click")
    );

    if (!emailAction || !passwordAction) return null;

    const steps: FlowStep[] = [
      { action: "fill", ref: emailAction.ref, paramKey: "email", description: emailAction.description },
      { action: "fill", ref: passwordAction.ref, paramKey: "password", description: passwordAction.description },
    ];

    if (submitAction) {
      steps.push({ action: "click", ref: submitAction.ref, description: submitAction.description });
      steps.push({ action: "wait", description: "Wait for navigation after login" });
    }

    return {
      id: "login",
      name: "Login",
      description: "Fill email/username and password, then submit the login form",
      steps,
      requiredParams: ["email", "password"],
      optionalParams: [],
    };
  }

  private detectSearchFlow(state: PageState): ActionFlow | null {
    const searchGroup = state.actionGroups.find((g) => g.type === "search");
    if (!searchGroup) return null;

    const searchInput = searchGroup.elements.find((a) => a.command.startsWith("fill"));
    const searchButton = searchGroup.elements.find((a) => a.command.startsWith("click"));

    if (!searchInput) return null;

    const steps: FlowStep[] = [
      { action: "fill", ref: searchInput.ref, paramKey: "query", description: searchInput.description },
    ];

    if (searchButton) {
      steps.push({ action: "click", ref: searchButton.ref, description: searchButton.description });
    }

    steps.push({ action: "wait", description: "Wait for search results" });

    return {
      id: "search",
      name: "Search",
      description: "Enter a search query and submit",
      steps,
      requiredParams: ["query"],
      optionalParams: [],
    };
  }

  private detectFormFlow(state: PageState): ActionFlow | null {
    const formGroup = state.actionGroups.find((g) => g.type === "form_submit");
    if (!formGroup) return null;
    if (formGroup.elements.length < 2) return null;

    const steps: FlowStep[] = [];
    const requiredParams: string[] = [];

    let fieldIndex = 0;
    for (const action of formGroup.elements) {
      if (action.command.startsWith("fill") || action.command.startsWith("select")) {
        const paramKey = this.sanitizeParamKey(action.description, fieldIndex);
        steps.push({
          action: action.command.startsWith("fill") ? "fill" : "select",
          ref: action.ref,
          paramKey,
          description: action.description,
        });
        requiredParams.push(paramKey);
        fieldIndex++;
      } else if (action.command.startsWith("click")) {
        steps.push({ action: "click", ref: action.ref, description: action.description });
      }
    }

    if (steps.length < 2) return null;

    return {
      id: "fill_form",
      name: "Fill Form",
      description: `Fill and submit form with ${requiredParams.length} fields`,
      steps,
      requiredParams,
      optionalParams: [],
    };
  }

  private sanitizeParamKey(description: string, index: number): string {
    const cleaned = description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    return cleaned || `field_${index}`;
  }
}
