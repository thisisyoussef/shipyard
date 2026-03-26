import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShipyardWorkbench } from "../ui/src/ShipyardWorkbench.js";
import type { ComposerAttachment } from "../ui/src/panels/ComposerPanel.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  LatestDeployViewModel,
  PendingUploadReceiptViewModel,
  ProjectBoardViewModel,
  SessionRunSummaryViewModel,
  PreviewStateViewModel,
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
    {
      path: "/tmp/shipyard-demo-alt",
      name: "shipyard-demo-alt",
      description: "An alternate demo target.",
      language: "typescript",
      framework: "Express",
      hasProfile: false,
    },
  ],
  enrichmentStatus: {
    status: "complete" as const,
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
    {
      projectId: "/tmp/shipyard-demo-alt",
      targetPath: "/tmp/shipyard-demo-alt",
      targetName: "shipyard-demo-alt",
      description: "An alternate demo target.",
      activePhase: "code",
      status: "agent-busy",
      agentStatus: "Running a background verification pass.",
      hasProfile: false,
      lastActiveAt: "2026-03-24T12:04:00.000Z",
      turnCount: 4,
    },
  ],
};

const runningPreviewState: PreviewStateViewModel = {
  status: "running",
  summary: "Preview is running on loopback.",
  url: "http://127.0.0.1:4173",
  logTail: ["VITE v5.0.8 ready in 145 ms"],
  lastRestartReason: null,
};

const turns: TurnViewModel[] = [
  {
    id: "turn-2",
    instruction: "inspect package.json",
    status: "success",
    startedAt: "2026-03-24T12:05:00.000Z",
    summary: "Read the package manifest and confirmed the scripts.",
    contextPreview: ["Use the package scripts as the source of truth."],
    agentMessages: ["Read the package manifest and confirmed the scripts."],
    langSmithTrace: {
      projectName: "shipyard",
      runId: "run-123",
      traceUrl: "https://smith.langchain.com/runs/run-123",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    },
    activity: [
      {
        id: "event-2",
        kind: "tool",
        title: "read file",
        detail: "path: package.json",
        tone: "working",
        toolName: "read_file",
        callId: "call-read-1",
      },
      {
        id: "event-3",
        kind: "tool",
        title: "read file finished",
        detail: "Read package.json (18 lines).",
        tone: "success",
        toolName: "read_file",
        callId: "call-read-1",
        detailBody: "Read package.json\nLines: 18\nHash: demo1234",
      },
    ],
  },
  {
    id: "turn-1",
    instruction: "legacy hidden turn",
    status: "error",
    startedAt: "2026-03-24T12:04:00.000Z",
    summary: "Connection error. Waiting to retry...",
    contextPreview: ["Honor the surgical editing contract."],
    agentMessages: ["Connection error. Waiting to retry..."],
    langSmithTrace: null,
    activity: [
      {
        id: "event-1",
        kind: "error",
        title: "Agent error",
        detail: "Connection error. Waiting to retry...",
        tone: "danger",
      },
    ],
  },
];

const fileEvents: FileEventViewModel[] = [
  {
    id: "file-2",
    path: "package.json",
    status: "diff",
    title: "Diff preview",
    summary: "Normalized the package scripts.",
    toolName: "read_file",
    callId: "call-read-1",
    turnId: "turn-2",
    diffLines: [
      {
        id: "pkg-diff-0",
        kind: "meta",
        text: "@@ -1,5 +1,5 @@",
      },
      {
        id: "pkg-diff-1",
        kind: "remove",
        text: "-\"test\": \"echo old\"",
      },
      {
        id: "pkg-diff-2",
        kind: "add",
        text: "+\"test\": \"vitest run\"",
      },
    ],
  },
];

const contextHistory: ContextReceiptViewModel[] = [
  {
    id: "context-1",
    text:
      "Honor the surgical editing contract. Keep edits anchored, avoid whole-file rewrites, and rerun the smallest verification command after each patch. If the anchor fails, reread before retrying.",
    submittedAt: "2026-03-24T12:03:00.000Z",
    turnId: "turn-1",
  },
];

const pendingUploads: PendingUploadReceiptViewModel[] = [
  {
    id: "upload-1",
    originalName: "brief.md",
    storedRelativePath: ".shipyard/uploads/session-ui-123/brief.md",
    sizeBytes: 128,
    mediaType: "text/markdown",
    previewText: "# Brief",
    previewSummary: "Markdown preview available.",
    uploadedAt: "2026-03-24T12:04:30.000Z",
  },
];

const latestDeploy: LatestDeployViewModel = {
  status: "success",
  platform: "vercel",
  available: true,
  unavailableReason: null,
  productionUrl: "https://shipyard-demo.vercel.app",
  summary: "Production deploy completed on Vercel.",
  logExcerpt: "Production: https://shipyard-demo.vercel.app",
  command: "vercel deploy --prod --yes --token [redacted]",
  requestedAt: "2026-03-24T12:06:00.000Z",
  completedAt: "2026-03-24T12:08:00.000Z",
};

const sessionHistory: SessionRunSummaryViewModel[] = [
  {
    sessionId: "session-ui-123",
    targetLabel: "shipyard",
    targetDirectory: "/tmp/shipyard-demo",
    activePhase: "code",
    startedAt: "2026-03-24T12:00:00.000Z",
    lastActiveAt: "2026-03-24T12:05:00.000Z",
    turnCount: 2,
    latestInstruction: "inspect package.json",
    latestSummary: "Read the package manifest and confirmed the scripts.",
    latestStatus: "success",
    isCurrent: true,
  },
  {
    sessionId: "session-ui-122",
    targetLabel: "shipyard",
    targetDirectory: "/tmp/shipyard-demo",
    activePhase: "code",
    startedAt: "2026-03-24T11:30:00.000Z",
    lastActiveAt: "2026-03-24T11:45:00.000Z",
    turnCount: 5,
    latestInstruction: "fix the failing preview",
    latestSummary: "Preview restarted cleanly.",
    latestStatus: "success",
    isCurrent: false,
  },
];

function renderWorkbench(overrides?: {
  connectionState?: "connecting" | "ready" | "agent-busy" | "disconnected" | "error";
  agentStatus?: string;
  contextDraft?: string;
  primaryView?: "chat" | "preview" | "live";
  previewState?: PreviewStateViewModel;
  latestDeploy?: LatestDeployViewModel;
  targetManager?: TargetManagerViewModel;
  projectBoard?: ProjectBoardViewModel | null;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  composerAttachments?: ComposerAttachment[];
}) {
  return renderToStaticMarkup(
    createElement(ShipyardWorkbench, {
      sessionState,
      sessionHistory,
      targetManager: overrides?.targetManager ?? targetManager,
      turns,
      fileEvents,
      previewState: overrides?.previewState ?? runningPreviewState,
      latestDeploy: overrides?.latestDeploy ?? latestDeploy,
      contextHistory,
      pendingUploads,
      projectBoard: overrides?.projectBoard ?? projectBoard,
      connectionState: overrides?.connectionState ?? "ready",
      agentStatus: overrides?.agentStatus ?? "Ready for the next instruction.",
      instruction: "",
      contextDraft: overrides?.contextDraft ?? "",
      composerNotice: null,
      composerAttachments:
        overrides?.composerAttachments ??
        pendingUploads.map((receipt) => ({
          id: receipt.id,
          label: receipt.originalName,
          detail: `${receipt.storedRelativePath} · ${receipt.previewSummary}`,
          status: "attached" as const,
        })),
      instructionInputRef: createRef<HTMLTextAreaElement>(),
      contextInputRef: createRef<HTMLTextAreaElement>(),
      onInstructionChange: () => undefined,
      onContextChange: () => undefined,
      onInstructionKeyDown: () => undefined,
      onContextKeyDown: () => undefined,
      onClearContext: () => undefined,
      onAttachFiles: () => undefined,
      onSubmitInstruction: () => undefined,
      onCancelInstruction: () => undefined,
      onRemoveAttachment: () => undefined,
      onRequestTargetSwitch: () => undefined,
      onRequestTargetCreate: () => undefined,
      onRequestSessionResume: () => undefined,
      onActivateProject: () => undefined,
      onRefreshStatus: () => undefined,
      onCopyTracePath: () => undefined,
      traceButtonLabel: "Copy trace path",
      leftSidebarOpen: overrides?.leftSidebarOpen ?? true,
      rightSidebarOpen: overrides?.rightSidebarOpen ?? true,
      initialPrimaryView: overrides?.primaryView,
      onToggleLeftSidebar: () => undefined,
      onToggleRightSidebar: () => undefined,
    }),
  );
}

describe("ShipyardWorkbench", () => {
  it("renders target manager controls inside the UIV3 shell", () => {
    const markup = renderWorkbench();

    expect(markup).toContain("SHIPYARD");
    expect(markup).toContain("Open projects");
    expect(markup).toContain("shipyard-demo-alt");
    expect(markup).toContain("Running a background verification pass.");
    expect(markup).toContain("The active React workspace.");
    expect(markup).toContain("Change target");
    expect(markup).toContain("Target profile saved.");
    expect(markup).toContain("activity");
    expect(markup).toContain("Previous runs");
    expect(markup).toContain("fix the failing preview");
    expect(markup).toContain("Files");
    expect(markup).toContain("Latest conversation");
    expect(markup).toContain("inspect package.json");
    expect(markup).toContain("Attach files");
    expect(markup).toContain("brief.md");
    expect(markup).toContain("Open trace");
    expect(markup).toContain('aria-label="Current location"');
  });

  it("renders the public app link and auto-publish status in the target header", () => {
    const markup = renderWorkbench({
      primaryView: "preview",
    });

    expect(markup).toContain("Open app");
    expect(markup).toContain("https://shipyard-demo.vercel.app");
    expect(markup).toContain("Production deploy completed on Vercel.");
    expect(markup).not.toContain("Deploy to Vercel");
    expect(markup).not.toContain("Hosted Shipyard URL");
  });

  it("keeps automatic publish guidance visible when hosted deploy prerequisites are missing", () => {
    const markup = renderWorkbench({
      latestDeploy: {
        ...latestDeploy,
        status: "idle",
        available: false,
        unavailableReason:
          "Configure VERCEL_TOKEN on the hosted Shipyard service to enable deploys.",
        productionUrl: null,
        summary:
          "Deploy unavailable until VERCEL_TOKEN is configured on the hosted Shipyard service.",
        logExcerpt: null,
        command: null,
        requestedAt: null,
        completedAt: null,
      },
    });

    expect(markup).toContain("Deploy unavailable until VERCEL_TOKEN is configured");
    expect(markup).toContain("Configure VERCEL_TOKEN on the hosted Shipyard service");
    expect(markup).not.toContain("Open app");
  });

  it("renders the attach-files control and pending attachment badges in the composer", () => {
    const markup = renderWorkbench({
      composerAttachments: [
        {
          id: "upload-1",
          label: "spec.md",
          detail: ".shipyard/uploads/session-ui-123/spec-abc123.md",
          status: "attached",
        },
        {
          id: "upload-2",
          label: "notes.txt",
          detail: "Upload failed: unsupported binary content.",
          status: "rejected",
          error: "Unsupported binary content.",
        },
      ],
    });

    expect(markup).toContain('aria-label="Attach files"');
    expect(markup).toContain("spec.md");
    expect(markup).toContain("notes.txt");
    expect(markup).toContain("unsupported binary content");
  });

  it("renders passive queued enrichment status without enrich buttons", () => {
    const markup = renderWorkbench({
      targetManager: {
        ...targetManager,
        currentTarget: {
          ...targetManager.currentTarget,
          description: null,
          hasProfile: false,
        },
        enrichmentStatus: {
          status: "queued",
          message: "Analyzing this target in the background.",
        },
      },
    });

    expect(markup).toContain("Analyzing this target in the background.");
    expect(markup).not.toContain("Enrich target");
    expect(markup).not.toContain("Retry enrichment");
  });

  it("removes the localhost preview panel from the hosted workbench", () => {
    const markup = renderWorkbench({
      primaryView: "preview",
    });

    expect(markup).not.toContain("Local preview");
    expect(markup).not.toContain("Open preview");
    expect(markup).not.toContain("http://127.0.0.1:4173");
    expect(markup).not.toContain("VITE v5.0.8 ready in 145 ms");
  });

  // SKIP: UIV3 rebuild - full panel rendering reimplemented in S02-S08
  it.skip("renders the current session, context, preview, activity, and file sidebars", () => {
    const markup = renderWorkbench();

    expect(markup).toContain("Connected to shipyard-workspace");
    expect(markup).toContain("The active React workspace.");
    expect(markup).toContain("Change target");
    expect(markup).toContain("Ready");
    expect(markup).toContain("Inject guidance");
    expect(markup).toContain("Cmd/Ctrl+Enter");
    expect(markup).toContain("Project signals");
    expect(markup).toContain("Local preview");
    expect(markup).toContain("http://127.0.0.1:4173");
    expect(markup).toContain("Preview is running on loopback.");
    expect(markup).toContain("/tmp/shipyard-workspace");
    expect(markup).toContain("Latest run");
    expect(markup).toContain("All runs");
    expect(markup).toContain("Diff-first sidebar");
    expect(markup).toContain("package.json");
    expect(markup).toContain('class="diff-line-label"');
    expect(markup).toContain(">ADD<");
    expect(markup).not.toContain("legacy hidden turn");
  });

  // SKIP: UIV3 rebuild - error state UI reimplemented in S04/S07
  it.skip("keeps error-state recovery cues and keyboard affordances visible", () => {
    const markup = renderWorkbench({
      connectionState: "error",
      agentStatus: "Connection error. Waiting to retry...",
      contextDraft: "Use the current scripts before editing anything.",
    });

    expect(markup).toContain('aria-label="Connection status: error"');
    expect(markup).toContain("needs attention");
    expect(markup).toContain("Queued for next turn");
    expect(markup).toContain("Context queued");
    expect(markup).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"');
    expect(markup).toContain('aria-keyshortcuts="Control+Enter Meta+Enter Escape"');
  });

  it("surfaces provider output excerpts in the target header after a failed publish", () => {
    const markup = renderWorkbench({
      latestDeploy: {
        ...latestDeploy,
        status: "error",
        summary: "Deploy failed. Review the provider output excerpt and retry.",
        logExcerpt:
          "src/App.tsx(2,8): error TS2882: Cannot find module or type declarations for side-effect import of './App.css'.",
      },
    });

    expect(markup).toContain("Provider output excerpt");
    expect(markup).toContain(
      "Cannot find module or type declarations for side-effect import of",
    );
    expect(markup).toContain("App.css");
  });
});
