export type PageType =
  | "login"
  | "search"
  | "product_listing"
  | "product_detail"
  | "checkout"
  | "form"
  | "navigation"
  | "article"
  | "feed"
  | "error"
  | "unknown";

export type ActionType =
  | "form_submit"
  | "search"
  | "navigation"
  | "button"
  | "select"
  | "text_input"
  | "file_upload"
  | "auth_flow"
  | "toggle"
  | "link";

export interface PageElement {
  ref: string;
  tag: string;
  role: string;
  name: string;
  type?: string;
  value?: string;
  placeholder?: string;
  options?: string[];
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  href?: string;
  ariaLabel?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  backendNodeId?: number;
}

export interface ActionGroup {
  id: string;
  label: string;
  type: ActionType;
  elements: DiscoveredAction[];
}

export interface DiscoveredAction {
  ref: string;
  command: string;
  description: string;
  element: PageElement;
}

export interface PageState {
  url: string;
  title: string;
  pageType: PageType;
  actionGroups: ActionGroup[];
  elements: PageElement[];
  meta: PageMeta;
}

export interface PageMeta {
  tokenEstimate: number;
  totalElements: number;
  interactiveElements: number;
  loadTimeMs: number;
  contentPreview?: string;
}

export interface BrowserConfig {
  headless?: boolean;
  executablePath?: string;
  defaultViewport?: { width: number; height: number };
  userDataDir?: string;
  args?: string[];
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface ScrollResult {
  scrolledTo: number;
  pageHeight: number;
  viewportHeight: number;
}

export interface ClickResult {
  success: boolean;
  navigationOccurred: boolean;
  newUrl?: string;
}

export interface FillResult {
  success: boolean;
  previousValue: string;
  newValue: string;
}
