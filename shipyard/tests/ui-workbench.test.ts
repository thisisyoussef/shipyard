import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShipyardWorkbench } from "../ui/src/ShipyardWorkbench.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  SessionStateViewModel,
  TurnViewModel,
} from "../ui/src/view-models.js";

const sessionState: SessionStateViewModel = {
  sessionId: "session-ui-123",
  targetLabel: "shipyard",
  targetDirectory: "/tmp/shipyard-demo",
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
  },
  projectRulesLoaded: true,
  tracePath: "/tmp/shipyard-demo/.shipyard/traces/session-ui-123.jsonl",
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

function renderWorkbench(overrides?: {
  connectionState?: "connecting" | "ready" | "agent-busy" | "disconnected" | "error";
  agentStatus?: string;
  contextDraft?: string;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
}) {
  return renderToStaticMarkup(
    createElement(ShipyardWorkbench, {
      sessionState,
      turns,
      fileEvents,
      contextHistory,
      connectionState: overrides?.connectionState ?? "ready",
      agentStatus: overrides?.agentStatus ?? "Ready for the next instruction.",
      instruction: "",
      contextDraft: overrides?.contextDraft ?? "",
      composerNotice: null,
      instructionInputRef: createRef<HTMLTextAreaElement>(),
      contextInputRef: createRef<HTMLTextAreaElement>(),
      onInstructionChange: () => undefined,
      onContextChange: () => undefined,
      onInstructionKeyDown: () => undefined,
      onContextKeyDown: () => undefined,
      onClearContext: () => undefined,
      onSubmitInstruction: () => undefined,
      onRefreshStatus: () => undefined,
      onCopyTracePath: () => undefined,
      traceButtonLabel: "Copy trace path",
      leftSidebarOpen: overrides?.leftSidebarOpen ?? true,
      rightSidebarOpen: overrides?.rightSidebarOpen ?? true,
      onToggleLeftSidebar: () => undefined,
      onToggleRightSidebar: () => undefined,
    }),
  );
}

describe("ShipyardWorkbench", () => {
  it("renders the current session, context, activity, and file sidebars without crashing", () => {
    const markup = renderWorkbench();

    expect(markup).toContain("Connected to shipyard-workspace");
    expect(markup).toContain("Inject guidance");
    expect(markup).toContain("Cmd/Ctrl+Enter");
    expect(markup).toContain("Project signals");
    expect(markup).toContain("/tmp/shipyard-workspace");
    expect(markup).toContain("Latest run");
    expect(markup).toContain("All runs");
    expect(markup).toContain("Diff-first sidebar");
    expect(markup).toContain("package.json");
    expect(markup).toContain('class="diff-line-label"');
    expect(markup).toContain(">ADD<");
    expect(markup).not.toContain("legacy hidden turn");
  });

  it("keeps error-state recovery cues and keyboard affordances visible", () => {
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
});
