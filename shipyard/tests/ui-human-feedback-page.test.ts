import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  resolveUiPage,
  selectSessionScopedValue,
  shouldCancelBusyInstructionOnSubmit,
} from "../ui/src/App.js";
import { HumanFeedbackPage } from "../ui/src/HumanFeedbackPage.js";
import type {
  PreviewStateViewModel,
  SessionStateViewModel,
  TurnViewModel,
} from "../ui/src/view-models.js";

const sessionState: SessionStateViewModel = {
  sessionId: "session-human-123",
  targetLabel: "ship-promptpack-ultimate",
  targetDirectory: "/tmp/ship-promptpack-ultimate",
  activePhase: "code",
  workspaceDirectory: "/tmp/shipyard-workspace",
  turnCount: 12,
  startedAt: "2026-03-27T20:00:00.000Z",
  lastActiveAt: "2026-03-27T20:05:00.000Z",
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
    projectName: "ship-promptpack-ultimate",
    previewCapability: {
      status: "available",
      kind: "dev-server",
      runner: "npm",
      scriptName: "dev",
      command: "npm run dev -- --host 127.0.0.1 --port <port>",
      reason: "Detected a local React dev script.",
      autoRefresh: "native-hmr",
    },
  },
  projectRulesLoaded: true,
  tracePath: "/tmp/shipyard/.shipyard/traces/session-human-123.jsonl",
};

const previewState: PreviewStateViewModel = {
  status: "running",
  summary: "Preview is running on loopback.",
  url: "http://127.0.0.1:4174",
  logTail: ["VITE v8.0.2 ready in 162 ms"],
  lastRestartReason: null,
};

const turns: TurnViewModel[] = [
  {
    id: "turn-12",
    instruction: "ultimate continue Improve the weekly planning flow",
    status: "working",
    startedAt: "2026-03-27T20:05:00.000Z",
    summary: "Reviewing contrast issues and weekly workflow gaps.",
    contextPreview: [],
    agentMessages: [],
    langSmithTrace: null,
    activity: [],
  },
  {
    id: "turn-11",
    instruction: "Fix white headings on light cards",
    status: "success",
    startedAt: "2026-03-27T19:57:00.000Z",
    summary: "Queued a global contrast pass for the next simulator cycle.",
    contextPreview: [],
    agentMessages: [],
    langSmithTrace: null,
    activity: [],
  },
];
const runningUltimateState = {
  active: true,
  phase: "running" as const,
  currentBrief: "Improve the weekly planning flow",
  turnCount: 3,
  pendingFeedbackCount: 1,
  startedAt: "2026-03-27T20:00:00.000Z",
  lastCycleSummary: "Cycle 3 tightened the docs typography and card contrast.",
};

describe("resolveUiPage", () => {
  it("routes the dedicated human feedback path to the alternate page", () => {
    expect(resolveUiPage("/")).toBe("workbench");
    expect(resolveUiPage("/human-feedback")).toBe("human-feedback");
    expect(resolveUiPage("/human-feedback/")).toBe("human-feedback");
    expect(resolveUiPage("/sessions/demo")).toBe("workbench");
  });

  it("never treats the human feedback page like a busy-turn cancel surface", () => {
    expect(shouldCancelBusyInstructionOnSubmit("workbench", "agent-busy")).toBe(true);
    expect(shouldCancelBusyInstructionOnSubmit("workbench", "agent-busy", true)).toBe(false);
    expect(shouldCancelBusyInstructionOnSubmit("human-feedback", "agent-busy")).toBe(false);
    expect(shouldCancelBusyInstructionOnSubmit("human-feedback", "ready")).toBe(false);
  });

  it("falls back to the live session artifacts when deferred values still belong to the previous project", () => {
    expect(
      selectSessionScopedValue({
        currentSessionId: "session-beta",
        deferredSessionId: "session-alpha",
        liveValue: ["beta turn"],
        deferredValue: ["alpha turn"],
      }),
    ).toEqual(["beta turn"]);

    expect(
      selectSessionScopedValue({
        currentSessionId: "session-alpha",
        deferredSessionId: "session-alpha",
        liveValue: ["alpha turn"],
        deferredValue: ["alpha turn", "older alpha turn"],
      }),
    ).toEqual(["alpha turn", "older alpha turn"]);
  });
});

describe("HumanFeedbackPage", () => {
  it("renders the dedicated ultimate-mode relay UI", () => {
    const markup = renderToStaticMarkup(
      createElement(HumanFeedbackPage, {
        sessionState,
        previewState,
        turns,
        connectionState: "agent-busy",
        agentStatus: "Ultimate mode is active.",
        ultimateState: runningUltimateState,
        instruction: "Please tighten the docs typography and keep contrast high.",
        submitLabel: "Queue feedback",
        submitDisabled: false,
        helpText: "Press Cmd/Ctrl+Enter to queue the note for the active ultimate loop.",
        textareaRef: createRef<HTMLTextAreaElement>(),
        notice: {
          tone: "success",
          title: "Feedback queued",
          detail: "Shipyard accepted the note for the next simulator cycle.",
        },
        onInstructionChange: () => undefined,
        onInstructionKeyDown: () => undefined,
        onSubmit: () => undefined,
        onRefreshStatus: () => undefined,
      }),
    );

    expect(markup).toContain("Feed the loop from the human side");
    expect(markup).toContain("Queue feedback");
    expect(markup).toContain("Open full workbench");
    expect(markup).toContain("Open current preview");
    expect(markup).toContain("Ultimate mode is active.");
    expect(markup).toContain("Recent loop activity");
    expect(markup).toContain("Please tighten the docs typography and keep contrast high.");
    expect(markup).toContain("Shipyard accepted the note for the next simulator cycle.");
    expect(markup).toContain("http://127.0.0.1:4174");
  });

  it("explains when the page cannot send feedback yet", () => {
    const markup = renderToStaticMarkup(
      createElement(HumanFeedbackPage, {
        sessionState: null,
        previewState: {
          ...previewState,
          url: null,
          status: "unavailable",
        },
        turns: [],
        connectionState: "disconnected",
        agentStatus: "Waiting for Shipyard to reconnect.",
        ultimateState: {
          ...runningUltimateState,
          active: false,
          phase: "idle" as const,
          currentBrief: null,
          pendingFeedbackCount: 0,
          turnCount: 0,
          lastCycleSummary: null,
        },
        instruction: "",
        submitLabel: "Queue feedback",
        submitDisabled: false,
        helpText: "Press Cmd/Ctrl+Enter to queue the note for the active ultimate loop.",
        textareaRef: createRef<HTMLTextAreaElement>(),
        notice: null,
        onInstructionChange: () => undefined,
        onInstructionKeyDown: () => undefined,
        onSubmit: () => undefined,
        onRefreshStatus: () => undefined,
      }),
    );

    expect(markup).toContain("No active Shipyard session yet");
    expect(markup).toContain(
      "Shipyard needs an active session before this page can send feedback.",
    );
    expect(markup).toContain("Waiting for an active target");
    expect(markup).toContain('disabled=""');
  });
});
