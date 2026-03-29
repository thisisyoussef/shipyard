/**
 * Preview Harness — Standalone app that renders all three views
 * with a simple tab switcher using mock data.
 *
 * Open via /preview.html on the Vite dev server.
 */

import { useCallback, useRef, useState } from "react";
import type {
  CodeBrowserReadResponse,
  CodeBrowserTreeResponse,
} from "../../src/ui/contracts.js";
import { NavBar } from "./shell/index.js";
import { DashboardView, EditorView, KanbanView } from "./views/index.js";
import { buildDashboardCatalog } from "./dashboard-catalog.js";
import {
  createInitialDashboardPreferences,
  setDashboardActiveTab,
  toggleDashboardProductStar,
} from "./dashboard-preferences.js";
import { useRouter } from "./use-router.js";
import type { Route } from "./router.js";
import type { CodeBrowserClient } from "./code-browser-client.js";
import { resolveWorkbenchComposerBehavior } from "./ultimate-composer.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  LatestDeployViewModel,
  PendingUploadReceiptViewModel,
  PreviewStateViewModel,
  ProjectBoardViewModel,
  SessionRunSummaryViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
  TurnViewModel,
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
      privatePreviewUrl:
        "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22margin%3A0%3Bfont-family%3AGeorgia%2Cserif%3Bbackground%3Alinear-gradient(135deg%2C%23f8f3e4%200%25%2C%23f1e2b5%2048%25%2C%23142036%2048%25%2C%230d1730%20100%25)%3Bdisplay%3Agrid%3Bplace-items%3Acenter%3Bheight%3A100vh%3B%22%3E%3Cdiv%20style%3D%22width%3A82%25%3Bpadding%3A24px%3Bbackground%3Argba(255%2C255%2C255%2C0.88)%3Bborder-radius%3A24px%3Bbox-shadow%3A0%2024px%2072px%20rgba(10%2C18%2C34%2C0.24)%3B%22%3E%3Ch1%20style%3D%22margin%3A0%200%2012px%3Bfont-size%3A42px%3Bcolor%3A%23142036%3B%22%3ECraft%20Your%20Vision%3C%2Fh1%3E%3Cp%20style%3D%22margin%3A0%3Bfont-size%3A18px%3Bline-height%3A1.5%3Bcolor%3A%233f4d67%3B%22%3EBuild%20a%20polished%20launch%20canvas%20with%20live%20AI-guided%20iteration.%3C%2Fp%3E%3C%2Fdiv%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
      publicDeploymentUrl: "https://craft-your-vision.vercel.app",
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
      privatePreviewUrl: null,
      publicDeploymentUrl:
        "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22margin%3A0%3Bfont-family%3AArial%2Csans-serif%3Bbackground%3Alinear-gradient(180deg%2C%230f172a%200%25%2C%231f3b5a%20100%25)%3Bcolor%3Awhite%3Bdisplay%3Agrid%3Bplace-items%3Acenter%3Bheight%3A100vh%3B%22%3E%3Cdiv%20style%3D%22width%3A76%25%3Bdisplay%3Agrid%3Bgap%3A12px%3B%22%3E%3Cdiv%20style%3D%22height%3A18px%3Bwidth%3A32%25%3Bbackground%3Argba(255%2C255%2C255%2C0.2)%3Bborder-radius%3A999px%3B%22%3E%3C%2Fdiv%3E%3Cdiv%20style%3D%22height%3A88px%3Bbackground%3Argba(255%2C255%2C255%2C0.12)%3Bborder-radius%3A20px%3B%22%3E%3C%2Fdiv%3E%3Cdiv%20style%3D%22display%3Agrid%3Bgrid-template-columns%3A1fr%201fr%3Bgap%3A12px%3B%22%3E%3Cdiv%20style%3D%22height%3A132px%3Bbackground%3Argba(255%2C255%2C255%2C0.12)%3Bborder-radius%3A20px%3B%22%3E%3C%2Fdiv%3E%3Cdiv%20style%3D%22height%3A132px%3Bbackground%3Argba(255%2C255%2C255%2C0.12)%3Bborder-radius%3A20px%3B%22%3E%3C%2Fdiv%3E%3C%2Fdiv%3E%3C%2Fdiv%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
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

const MOCK_TURNS: TurnViewModel[] = [
  {
    id: "preview-turn-1",
    instruction: "Inspect the package scripts and confirm the preview entrypoint.",
    status: "success",
    startedAt: "2026-03-28T12:12:00.000Z",
    summary: "Read the package manifest and confirmed the scripts.",
    contextPreview: ["Preserve the current Vite setup."],
    agentMessages: ["Read the package manifest and confirmed the scripts."],
    langSmithTrace: null,
    activity: [],
  },
];

const MOCK_FILE_EVENTS: FileEventViewModel[] = [
  {
    id: "preview-file-1",
    path: "package.json",
    status: "diff",
    title: "Diff preview",
    summary: "Normalized the package scripts.",
    turnId: "preview-turn-1",
    diffLines: [
      {
        id: "preview-diff-1",
        kind: "add",
        text: "+\"test\": \"vitest run\"",
      },
    ],
  },
];

const MOCK_PREVIEW_STATE: PreviewStateViewModel = {
  status: "running",
  summary: "Preview is running on loopback.",
  url: "http://127.0.0.1:4173",
  logTail: ["VITE ready"],
  lastRestartReason: null,
};

const MOCK_LATEST_DEPLOY: LatestDeployViewModel = {
  status: "success",
  platform: "vercel",
  available: true,
  unavailableReason: null,
  productionUrl: "https://craft-your-vision.vercel.app",
  summary: "Production deploy completed on Vercel.",
  logExcerpt: null,
  command: "vercel deploy --prod --yes --token [redacted]",
  requestedAt: "2026-03-28T12:14:00.000Z",
  completedAt: "2026-03-28T12:16:00.000Z",
};

const MOCK_CONTEXT_HISTORY: ContextReceiptViewModel[] = [];
const MOCK_PENDING_UPLOADS: PendingUploadReceiptViewModel[] = [];
const MOCK_SESSION_HISTORY: SessionRunSummaryViewModel[] = [];
const MOCK_ULTIMATE_STATE = {
  active: true,
  phase: "running" as const,
  currentBrief: "Build a landing page",
  turnCount: 7,
  pendingFeedbackCount: 1,
  startedAt: "2026-03-28T11:45:00.000Z",
  lastCycleSummary: "Cycle 7 tightened the headline hierarchy and CTA spacing.",
};

const MOCK_CODE_TREE: CodeBrowserTreeResponse = {
  projectId: "/projects/craft-vision",
  root: {
    path: ".",
    name: "craft-vision",
  },
  nodes: [
    {
      name: "src",
      type: "directory",
      path: "src",
      children: [
        {
          name: "App.tsx",
          type: "file",
          path: "src/App.tsx",
        },
      ],
    },
    {
      name: "package.json",
      type: "file",
      path: "package.json",
    },
  ],
};

const MOCK_CODE_FILES = new Map<string, CodeBrowserReadResponse>([
  [
    "src/App.tsx",
    {
      projectId: "/projects/craft-vision",
      path: "src/App.tsx",
      sizeBytes: 118,
      truncated: false,
      binary: false,
      contents: "export function App() {\n  return <main>Craft Your Vision</main>;\n}\n",
    },
  ],
  [
    "package.json",
    {
      projectId: "/projects/craft-vision",
      path: "package.json",
      sizeBytes: 96,
      truncated: false,
      binary: false,
      contents: "{\n  \"name\": \"craft-your-vision\",\n  \"scripts\": {\n    \"dev\": \"vite\"\n  }\n}\n",
    },
  ],
]);

const MOCK_CODE_BROWSER_CLIENT: CodeBrowserClient = {
  async loadTree() {
    return MOCK_CODE_TREE;
  },
  async readFile(_projectId, filePath) {
    return MOCK_CODE_FILES.get(filePath) ?? {
      projectId: "/projects/craft-vision",
      path: filePath,
      sizeBytes: 0,
      truncated: false,
      binary: false,
      contents: "",
    };
  },
};

// ── Component ──────────────────────────────────

export function PreviewHarness() {
  const { route, navigate } = useRouter();
  const [heroPrompt, setHeroPrompt] = useState("");
  const [preferences, setPreferences] = useState(() =>
    createInitialDashboardPreferences(),
  );
  const [instructionDraft, setInstructionDraft] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [ultimateArmed, setUltimateArmed] = useState(false);
  const instructionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const contextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRoute =
    route.view === "editor"
      ? route
      : {
          view: "editor" as const,
          productId: "/projects/craft-vision",
        };
  const boardRoute =
    route.view === "board"
      ? route
      : {
          view: "board" as const,
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
  const composerBehavior = resolveWorkbenchComposerBehavior({
    connectionState: "ready",
    ultimateState: MOCK_ULTIMATE_STATE,
    armed: ultimateArmed,
  });

  // ── View dispatch ──────────────────────────────

  let view: React.ReactNode;

  switch (route.view) {
    case "editor":
      view = (
        <EditorView
          productId={route.productId}
          productName="Craft Your Vision"
          scaffoldType="react-ts"
          hostedEditorUrl="http://127.0.0.1:3210"
          sessionState={MOCK_SESSION_STATE}
          sessionHistory={MOCK_SESSION_HISTORY}
          targetManager={MOCK_TARGET_MANAGER}
          projectBoard={MOCK_PROJECT_BOARD}
          turns={MOCK_TURNS}
          fileEvents={MOCK_FILE_EVENTS}
          previewState={MOCK_PREVIEW_STATE}
          latestDeploy={MOCK_LATEST_DEPLOY}
          contextHistory={MOCK_CONTEXT_HISTORY}
          pendingUploads={MOCK_PENDING_UPLOADS}
          connectionState="ready"
          agentStatus="Ready for the next instruction."
          ultimateState={MOCK_ULTIMATE_STATE}
          instruction={instructionDraft}
          contextDraft={contextDraft}
          composerBehavior={composerBehavior}
          composerNotice={null}
          composerAttachments={[]}
          instructionInputRef={instructionInputRef}
          contextInputRef={contextInputRef}
          leftSidebarOpen={leftSidebarOpen}
          rightSidebarOpen={false}
          onInstructionChange={setInstructionDraft}
          onContextChange={setContextDraft}
          onInstructionKeyDown={() => undefined}
          onContextKeyDown={() => undefined}
          onClearContext={() => setContextDraft("")}
          onAttachFiles={() => undefined}
          onToggleUltimateArmed={() => setUltimateArmed((current) => !current)}
          onSubmitInstruction={(event) => {
            event.preventDefault();
          }}
          onCancelInstruction={() => undefined}
          onRemoveAttachment={() => undefined}
          onRequestSessionResume={() => undefined}
          onRequestTargetSwitch={() => undefined}
          onRequestTargetCreate={() => undefined}
          onActivateProject={() => undefined}
          onRefreshStatus={() => undefined}
          onCopyTracePath={() => undefined}
          traceButtonLabel="Copy trace path"
          onToggleLeftSidebar={() => setLeftSidebarOpen((current) => !current)}
          onToggleRightSidebar={() => undefined}
          codeBrowserClient={MOCK_CODE_BROWSER_CLIENT}
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
        boardRoute={boardRoute}
        onNavigate={handleNavigate}
        ultimateState={MOCK_ULTIMATE_STATE}
        ultimateDisabled={false}
        onUltimateClick={handleUltimateClick}
        onSendUltimateFeedback={(text) => {
          // eslint-disable-next-line no-console
          console.log("[PreviewHarness] ultimateFeedback", text);
        }}
        onStopUltimate={() => {
          // eslint-disable-next-line no-console
          console.log("[PreviewHarness] ultimate stop");
        }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>{view}</main>
    </div>
  );
}
