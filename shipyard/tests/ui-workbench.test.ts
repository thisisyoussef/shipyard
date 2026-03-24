import { createElement } from "react";
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
    id: "turn-1",
    instruction: "inspect src/app.ts",
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
    id: "file-1",
    path: "src/app.ts",
    status: "diff",
    title: "Diff preview",
    summary: "Updated the greeting copy.",
    turnId: "turn-1",
    diffLines: [
      {
        id: "diff-0",
        kind: "meta",
        text: "@@ -1,1 +1,1 @@",
      },
      {
        id: "diff-1",
        kind: "remove",
        text: "-return 'before';",
      },
      {
        id: "diff-2",
        kind: "add",
        text: "+return 'after';",
      },
    ],
  },
];

const contextHistory: ContextReceiptViewModel[] = [
  {
    id: "context-1",
    text: "Honor the surgical editing contract.",
    submittedAt: "2026-03-24T12:03:00.000Z",
    turnId: "turn-1",
  },
];

function renderWorkbench(overrides?: {
  connectionState?: "connecting" | "ready" | "agent-busy" | "disconnected" | "error";
  agentStatus?: string;
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
      contextDraft: "",
      onInstructionChange: () => undefined,
      onContextChange: () => undefined,
      onClearContext: () => undefined,
      onSubmitInstruction: () => undefined,
      onRefreshStatus: () => undefined,
      onCopyTracePath: () => undefined,
      traceButtonLabel: "Copy trace path",
    }),
  );
}

describe("ShipyardWorkbench", () => {
  it("app shell renders the five major panels", () => {
    const markup = renderWorkbench();

    expect(markup).toContain('class="top-bar"');
    expect(markup).toContain('aria-label="Session and context"');
    expect(markup).toContain('role="main"');
    expect(markup).toContain('aria-label="File activity"');
    expect(markup).toContain('class="status-bar"');
    expect(markup).toContain("Developer Workbench");
    expect(markup).toContain("Recent injections");
    expect(markup).toContain('class="section-header"');
    expect(markup).toContain('class="ui-badge"');
    expect(markup).toContain('class="status-dot"');
    expect((markup.match(/class="section-header"/g) ?? []).length).toBeGreaterThan(2);
  });

  it("connection and error states remain visible and keyboard accessible", () => {
    const markup = renderWorkbench({
      connectionState: "error",
      agentStatus: "Connection error. Waiting to retry...",
    });

    expect(markup).toContain('aria-label="Connection status: error"');
    expect(markup).toContain("Connection error. Waiting to retry...");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('<button type="submit" class="primary-action">');
    expect(markup).toContain("<summary>");
  });
});
