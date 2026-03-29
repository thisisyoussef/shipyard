import type { DashboardTabId } from "./dashboard-preferences.js";
import type { EditorWorkspaceTab } from "./editor-preferences.js";

const dashboardTabs = new Set<DashboardTabId>([
  "my-products",
  "recent",
  "starred",
]);
const editorTabs = new Set<EditorWorkspaceTab>([
  "preview",
  "code",
  "files",
]);

export interface PreviewHarnessState {
  dashboardTab: DashboardTabId;
  editorTab: EditorWorkspaceTab;
}

function normalizeDashboardTab(value: string | null): DashboardTabId {
  return dashboardTabs.has(value as DashboardTabId)
    ? value as DashboardTabId
    : "my-products";
}

function normalizeEditorTab(value: string | null): EditorWorkspaceTab {
  return editorTabs.has(value as EditorWorkspaceTab)
    ? value as EditorWorkspaceTab
    : "preview";
}

export function resolvePreviewHarnessState(search: string): PreviewHarnessState {
  const parameters = new URLSearchParams(search);

  return {
    dashboardTab: normalizeDashboardTab(parameters.get("dashboardTab")),
    editorTab: normalizeEditorTab(parameters.get("editorTab")),
  };
}
