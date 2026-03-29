/**
 * Preview Harness — Standalone app that renders all three views
 * with a simple tab switcher using mock data.
 *
 * Open via /preview.html on the Vite dev server.
 */

import { useCallback, useState } from "react";
import { NavBar } from "./shell/index.js";
import { UltimateBadge } from "./shell/index.js";
import { DashboardView, EditorView, KanbanView } from "./views/index.js";
import { buildDashboardCatalog } from "./dashboard-catalog.js";
import {
  createInitialDashboardPreferences,
  setDashboardActiveTab,
  toggleDashboardProductStar,
} from "./dashboard-preferences.js";
import { useRouter } from "./use-router.js";
import type { Route } from "./router.js";
import type {
  ProjectBoardViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
} from "./view-models.js";

// ── Mock Data ──────────────────────────────────

const MOCK_TARGET_MANAGER: TargetManagerViewModel = {
  currentTarget: {
    name: "Craft Your Vision",
    path: "/projects/craft-vision",
    language: "TypeScript",
    framework: "React",
    hasProfile: true,
    description: "AI-powered design tool",
  },
  availableTargets: [
    {
      name: "Craft Your Vision",
      path: "/projects/craft-vision",
      language: "TypeScript",
      framework: "React",
      description: "AI-powered design tool",
      hasProfile: true,
    },
    {
      name: "Papyr Connect",
      path: "/projects/papyr-connect",
      language: "TypeScript",
      framework: "Next.js",
      description: "Business networking platform",
      hasProfile: true,
    },
    {
      name: "Papyr Apparel Studio",
      path: "/projects/papyr-apparel",
      language: "TypeScript",
      framework: "React",
      description: "Production-first apparel partner",
      hasProfile: false,
    },
    {
      name: "Beez Freeze Quick Order",
      path: "/projects/beez-freeze",
      language: "TypeScript",
      framework: "React",
      description: "Fresh drinks ordering app",
      hasProfile: false,
    },
    {
      name: "Al Amanah Redesign",
      path: "/projects/al-amanah",
      language: "TypeScript",
      framework: "React",
      description: "Transport company website",
      hasProfile: true,
    },
  ],
  enrichmentStatus: { status: "complete", message: "Ready" },
};

const MOCK_PROJECT_BOARD: ProjectBoardViewModel = {
  activeProjectId: "project-craft-vision",
  openProjects: [
    {
      projectId: "project-craft-vision",
      targetPath: "/projects/craft-vision",
      targetName: "Craft Your Vision",
      description: "AI-powered design tool",
      activePhase: "code",
      status: "ready",
      agentStatus: "Ready",
      hasProfile: true,
      lastActiveAt: "2026-03-28T12:10:00.000Z",
      turnCount: 11,
    },
    {
      projectId: "project-papyr-connect",
      targetPath: "/projects/papyr-connect",
      targetName: "Papyr Connect",
      description: "Business networking platform",
      activePhase: "code",
      status: "agent-busy",
      agentStatus: "Background work in progress",
      hasProfile: true,
      lastActiveAt: "2026-03-28T12:06:00.000Z",
      turnCount: 8,
    },
  ],
};

const MOCK_SESSION_STATE: SessionStateViewModel = {
  sessionId: "preview-session",
  targetLabel: "Craft Your Vision",
  targetDirectory: "/projects/craft-vision",
  activePhase: "code",
  workspaceDirectory: "/projects",
  turnCount: 11,
  startedAt: "2026-03-28T11:00:00.000Z",
  lastActiveAt: "2026-03-28T12:10:00.000Z",
  discoverySummary: "React app ready for iteration",
  discovery: {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      dev: "vite",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: [],
    topLevelDirectories: [],
    projectName: "Craft Your Vision",
    previewCapability: {
      status: "available",
      kind: "dev-server",
      runner: "pnpm",
      scriptName: "dev",
      command: "pnpm dev",
      reason: "Ready",
      autoRefresh: "native-hmr",
    },
  },
  projectRulesLoaded: true,
  tracePath: "/tmp/preview.ndjson",
};

// ── Component ──────────────────────────────────

export function PreviewHarness() {
  const { route, navigate } = useRouter();
  const [heroPrompt, setHeroPrompt] = useState("");
  const [preferences, setPreferences] = useState(() =>
    createInitialDashboardPreferences(),
  );
  const editorRoute =
    route.view === "editor"
      ? route
      : {
          view: "editor" as const,
          productId: "/projects/craft-vision",
        };

  const handleNavigate = useCallback(
    (next: Route) => {
      navigate(next);
    },
    [navigate],
  );

  const handleCreateProduct = useCallback(
    () => {
      // eslint-disable-next-line no-console
      console.log("[PreviewHarness] createProduct");
    },
    [],
  );

  const handleSubmitHeroPrompt = useCallback((prompt: string) => {
    // eslint-disable-next-line no-console
    console.log("[PreviewHarness] heroPrompt", prompt);
  }, []);

  const dashboardCatalog = buildDashboardCatalog({
    targetManager: MOCK_TARGET_MANAGER,
    projectBoard: MOCK_PROJECT_BOARD,
    sessionState: MOCK_SESSION_STATE,
    preferences,
  });

  const handleUltimateClick = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log("[PreviewHarness] ultimate click");
  }, []);

  // ── View dispatch ──────────────────────────────

  let view: React.ReactNode;

  switch (route.view) {
    case "editor":
      view = (
        <EditorView
          productId={route.productId}
          productName="Craft Your Vision"
          scaffoldType="react-ts"
          onNavigate={handleNavigate}
        />
      );
      break;
    case "board":
      view = <KanbanView />;
      break;
    case "human-feedback":
      view = <div style={{ padding: "2rem", color: "var(--c-text-secondary, #888)" }}>Human Feedback view (not included in preview harness)</div>;
      break;
    case "dashboard":
    default:
      view = (
        <DashboardView
          heroPrompt={heroPrompt}
          heroBusy={false}
          activeTab={dashboardCatalog.activeTab}
          cards={dashboardCatalog.visibleCards}
          emptyState={dashboardCatalog.emptyState}
          notice={null}
          onHeroPromptChange={setHeroPrompt}
          onSubmitHeroPrompt={handleSubmitHeroPrompt}
          onSelectTab={(tab) =>
            setPreferences((currentPreferences) =>
              setDashboardActiveTab(currentPreferences, tab)
            )}
          onOpenProduct={(productId) =>
            handleNavigate({
              view: "editor",
              productId,
            })}
          onToggleStar={(productId) =>
            setPreferences((currentPreferences) =>
              toggleDashboardProductStar(currentPreferences, productId)
            )}
          onCreateProduct={handleCreateProduct}
        />
      );
      break;
  }

  return (
    <div className="preview-harness" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <NavBar
        currentView={route.view}
        editorRoute={editorRoute}
        onNavigate={handleNavigate}
        boardDisabled={false}
        ultimateActive={true}
        ultimateDisabled={false}
        onUltimateClick={handleUltimateClick}
      />
      <UltimateBadge
        active={true}
        turnCount={7}
        currentBrief="Build a landing page"
        onSendFeedback={(text) => {
          // eslint-disable-next-line no-console
          console.log("[PreviewHarness] ultimateFeedback", text);
        }}
        onStop={() => {
          // eslint-disable-next-line no-console
          console.log("[PreviewHarness] ultimate stop");
        }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>{view}</main>
    </div>
  );
}
