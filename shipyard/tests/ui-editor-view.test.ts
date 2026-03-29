import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveWorkbenchComposerBehavior } from "../ui/src/ultimate-composer.js";
import { EditorView } from "../ui/src/views/EditorView.js";
import type { ComposerAttachment } from "../ui/src/panels/ComposerPanel.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  LatestDeployViewModel,
  PendingUploadReceiptViewModel,
  ProjectBoardViewModel,
  PreviewStateViewModel,
  SessionRunSummaryViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
  TurnViewModel,
} from "../ui/src/view-models.js";

const sessionState: SessionStateViewModel = {
  sessionId: "session-ui-123",
  targetLabel: "shipyard",
  targetDirectory: "/tmp/shipyard-demo",
  activePhase: "code",
  workspaceDirectory: "/tmp/shipyard-workspace",
  turnCount: 2,
  startedAt: "2026-03-24T12:00:00.000Z",
  lastActiveAt: "2026-03-24T12:05:00.000Z",
  discoverySummary: "typescript (React) via pnpm",
  discovery: {
    isGreenfield: false,
    language: "typescript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      build: "vite build",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json", "tsconfig.json"],
    topLevelDirectories: ["src", "tests"],
    projectName: "shipyard",
    previewCapability: {
      status: "available",
      kind: "dev-server",
      runner: "pnpm",
      scriptName: "dev",
      command: "pnpm run dev -- --host 127.0.0.1 --port <port>",
      reason: "Detected a Vite dev script.",
      autoRefresh: "native-hmr",
    },
  },
  projectRulesLoaded: true,
  tracePath: "/tmp/shipyard-demo/.shipyard/traces/session-ui-123.jsonl",
};

const targetManager: TargetManagerViewModel = {
  currentTarget: {
    path: "/tmp/shipyard-demo",
    name: "shipyard",
    description: "The active React workspace.",
    language: "typescript",
    framework: "React",
    hasProfile: true,
  },
  availableTargets: [
    {
      path: "/tmp/shipyard-demo",
      name: "shipyard",
      description: "The active React workspace.",
      language: "typescript",
      framework: "React",
      hasProfile: true,
    },
  ],
  enrichmentStatus: {
    status: "complete",
    message: "Target profile saved.",
  },
};

const projectBoard: ProjectBoardViewModel = {
  activeProjectId: "/tmp/shipyard-demo",
  openProjects: [
    {
      projectId: "/tmp/shipyard-demo",
      targetPath: "/tmp/shipyard-demo",
      targetName: "shipyard",
      description: "The active React workspace.",
      activePhase: "code",
      status: "ready",
      agentStatus: "Ready for the next instruction.",
      hasProfile: true,
      lastActiveAt: "2026-03-24T12:05:00.000Z",
      turnCount: 2,
    },
  ],
};

const turns: TurnViewModel[] = [
  {
    id: "turn-1",
    instruction: "inspect package.json",
    status: "success",
    startedAt: "2026-03-24T12:05:00.000Z",
    summary: "Read the package manifest and confirmed the scripts.",
    contextPreview: [],
    agentMessages: ["Read the package manifest and confirmed the scripts."],
    langSmithTrace: null,
    activity: [],
  },
];

const fileEvents: FileEventViewModel[] = [
  {
    id: "file-1",
    path: "package.json",
    status: "diff",
    title: "Diff preview",
    summary: "Normalized the package scripts.",
    turnId: "turn-1",
    diffLines: [
      {
        id: "diff-1",
        kind: "add",
        text: "+\"test\": \"vitest run\"",
      },
    ],
  },
];

const previewState: PreviewStateViewModel = {
  status: "running",
  summary: "Preview is running on loopback.",
  url: "http://127.0.0.1:4173",
  logTail: ["VITE ready"],
  lastRestartReason: null,
};

const unavailablePreviewState: PreviewStateViewModel = {
  status: "unavailable",
  summary: "Preview is unavailable until the current target exposes a supported start script.",
  url: null,
  logTail: [],
  lastRestartReason: "No dev script detected.",
};

const latestDeploy: LatestDeployViewModel = {
  status: "success",
  platform: "vercel",
  available: true,
  unavailableReason: null,
  productionUrl: "https://shipyard-demo.vercel.app",
  summary: "Production deploy completed on Vercel.",
  logExcerpt: null,
  command: "vercel deploy --prod --yes --token [redacted]",
  requestedAt: "2026-03-24T12:06:00.000Z",
  completedAt: "2026-03-24T12:08:00.000Z",
};

const contextHistory: ContextReceiptViewModel[] = [];
const pendingUploads: PendingUploadReceiptViewModel[] = [];
const sessionHistory: SessionRunSummaryViewModel[] = [];
const idleUltimateState = {
  active: false,
  phase: "idle" as const,
  currentBrief: null,
  turnCount: 0,
  pendingFeedbackCount: 0,
  startedAt: null,
  lastCycleSummary: null,
};

function renderEditor(overrides?: {
  previewState?: PreviewStateViewModel;
  fileEvents?: FileEventViewModel[];
  initialActiveTab?: "preview" | "code" | "files";
  composerAttachments?: ComposerAttachment[];
}) {
  return renderToStaticMarkup(
    createElement(EditorView, {
      productId: "/tmp/shipyard-demo",
      productName: "shipyard",
      scaffoldType: "React",
      hostedEditorUrl: "http://127.0.0.1:3210",
      sessionState,
      sessionHistory,
      targetManager,
      projectBoard,
      turns,
      fileEvents: overrides?.fileEvents ?? fileEvents,
      previewState: overrides?.previewState ?? previewState,
      latestDeploy,
      contextHistory,
      pendingUploads,
      connectionState: "ready",
      agentStatus: "Ready for the next instruction.",
      ultimateState: idleUltimateState,
      instruction: "",
      contextDraft: "",
      composerBehavior: resolveWorkbenchComposerBehavior({
        connectionState: "ready",
        ultimateState: idleUltimateState,
        armed: false,
      }),
      composerNotice: null,
      composerAttachments: overrides?.composerAttachments ?? [],
      instructionInputRef: createRef<HTMLTextAreaElement>(),
      contextInputRef: createRef<HTMLTextAreaElement>(),
      leftSidebarOpen: true,
      rightSidebarOpen: false,
      initialLayout: {
        activeTab: overrides?.initialActiveTab ?? "preview",
        splitRatio: 40,
      },
      onInstructionChange: () => undefined,
      onContextChange: () => undefined,
      onInstructionKeyDown: () => undefined,
      onContextKeyDown: () => undefined,
      onClearContext: () => undefined,
      onAttachFiles: () => undefined,
      onToggleUltimateArmed: () => undefined,
      onSubmitInstruction: () => undefined,
      onCancelInstruction: () => undefined,
      onRemoveAttachment: () => undefined,
      onRequestSessionResume: () => undefined,
      onRequestTargetSwitch: () => undefined,
      onRequestTargetCreate: () => undefined,
      onActivateProject: () => undefined,
      onRefreshStatus: () => undefined,
      onCopyTracePath: () => undefined,
      onToggleLeftSidebar: () => undefined,
      onToggleRightSidebar: () => undefined,
      onNavigate: () => undefined,
      traceButtonLabel: "Copy trace path",
    }),
  );
}

describe("EditorView", () => {
  it("renders the live conversation and preview surfaces instead of mock editor content", () => {
    const markup = renderEditor({
      initialActiveTab: "preview",
    });

    expect(markup).toContain("Open projects");
    expect(markup).toContain("Latest conversation");
    expect(markup).toContain("Attach files");
    expect(markup).toContain("Preview ready");
    expect(markup).toContain("http://127.0.0.1:4173");
    expect(markup).not.toContain("Preview will appear here when a dev server is running");
    expect(markup).not.toContain("Ultimate mode: off");
  });

  it("renders explicit preview-unavailable and live file-diff states", () => {
    const previewMarkup = renderEditor({
      previewState: unavailablePreviewState,
      initialActiveTab: "preview",
    });
    const fileMarkup = renderEditor({
      initialActiveTab: "files",
    });

    expect(previewMarkup).toContain("Preview unavailable");
    expect(previewMarkup).toContain("No dev script detected.");
    expect(fileMarkup).toContain("package.json");
    expect(fileMarkup).toContain("Normalized the package scripts.");
  });
});
