import { describe, expect, it } from "vitest";

import {
  applyBackendMessage,
  createInitialWorkbenchState,
  prepareInstructionSubmission,
  queueInstructionTurn,
} from "../ui/src/view-models.js";

describe("ui view models", () => {
  it("injected context is attached to the next instruction and then cleared from draft state", () => {
    const submission = prepareInstructionSubmission(
      "inspect package.json",
      "  Follow the package scripts before changing anything.  ",
    );

    expect(submission).toEqual({
      instruction: "inspect package.json",
      injectedContext: ["Follow the package scripts before changing anything."],
      clearedContextDraft: "",
    });

    let state = createInitialWorkbenchState();
    state = queueInstructionTurn(
      state,
      submission?.instruction ?? "",
      submission?.injectedContext ?? [],
    );

    expect(state.turns[0]).toMatchObject({
      instruction: "inspect package.json",
      contextPreview: ["Follow the package scripts before changing anything."],
    });
    expect(state.contextHistory[0]).toMatchObject({
      text: "Follow the package scripts before changing anything.",
      turnId: "turn-1",
    });
  });

  it("tool events append to the active turn activity log", () => {
    let state = createInitialWorkbenchState();

    state = queueInstructionTurn(state, "inspect package.json", [
      "Follow the spec before editing.",
    ]);
    state = applyBackendMessage(state, {
      type: "agent:tool_call",
      callId: "call-read",
      toolName: "read_file",
      summary: "path: package.json",
    });
    state = applyBackendMessage(state, {
      type: "agent:tool_result",
      callId: "call-read",
      toolName: "read_file",
      success: true,
      summary: "Read package.json (12 lines, hash abcd1234).",
    });

    expect(state.activeTurnId).toBe("turn-1");
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "turn-1",
      instruction: "inspect package.json",
      status: "working",
      activity: [
        {
          kind: "tool",
          title: "read file",
          detail: "path: package.json",
          tone: "working",
          toolName: "read_file",
          callId: "call-read",
        },
        {
          kind: "tool",
          title: "read file finished",
          detail: "Read package.json (12 lines, hash abcd1234).",
          tone: "success",
          toolName: "read_file",
          callId: "call-read",
        },
      ],
    });
    expect(state.fileEvents[0]).toMatchObject({
      path: "package.json",
      status: "success",
      title: "read file",
      summary: "Read package.json (12 lines, hash abcd1234).",
      toolName: "read_file",
      callId: "call-read",
      turnId: "turn-1",
    });
  });

  it("edit events render compact diffs with add/remove styling", () => {
    let state = createInitialWorkbenchState();

    state = queueInstructionTurn(state, "patch src/app.ts", []);
    state = applyBackendMessage(state, {
      type: "agent:edit",
      path: "src/app.ts",
      summary: "Updated the greeting copy.",
      diff: [
        "diff --git a/src/app.ts b/src/app.ts",
        "@@ -1,3 +1,3 @@",
        " export function App() {",
        "-  return 'before';",
        "+  return 'after';",
        " }",
      ].join("\n"),
    });

    expect(state.fileEvents[0]).toMatchObject({
      path: "src/app.ts",
      status: "diff",
      title: "Diff preview",
      summary: "Updated the greeting copy.",
      turnId: "turn-1",
    });
    expect(state.fileEvents[0]?.diffLines).toEqual([
      {
        id: "diff-0",
        kind: "meta",
        text: "diff --git a/src/app.ts b/src/app.ts",
      },
      {
        id: "diff-1",
        kind: "meta",
        text: "@@ -1,3 +1,3 @@",
      },
      {
        id: "diff-2",
        kind: "context",
        text: " export function App() {",
      },
      {
        id: "diff-3",
        kind: "remove",
        text: "-  return 'before';",
      },
      {
        id: "diff-4",
        kind: "add",
        text: "+  return 'after';",
      },
      {
        id: "diff-5",
        kind: "context",
        text: " }",
      },
    ]);
  });

  it("page reload restores the same session snapshot", () => {
    const snapshot = queueInstructionTurn(
      createInitialWorkbenchState(),
      "inspect package.json",
      ["Keep the current layout intact."],
    );

    const rehydrated = applyBackendMessage(createInitialWorkbenchState(), {
      type: "session:state",
      runtimeMode: "ui",
      connectionState: "ready",
      sessionId: "session-restore",
      targetLabel: "shipyard",
      targetDirectory: "/tmp/shipyard",
      turnCount: 1,
      startedAt: "2026-03-24T12:00:00.000Z",
      lastActiveAt: "2026-03-24T12:05:00.000Z",
      discovery: {
        isGreenfield: false,
        language: "typescript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
        },
        hasReadme: true,
        hasAgentsMd: true,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "shipyard",
      },
      discoverySummary: "typescript (React) via pnpm",
      projectRulesLoaded: true,
      workbenchState: snapshot,
    });

    expect(rehydrated.turns[0]).toMatchObject({
      instruction: "inspect package.json",
      contextPreview: ["Keep the current layout intact."],
    });
    expect(rehydrated.contextHistory[0]).toMatchObject({
      text: "Keep the current layout intact.",
    });
    expect(rehydrated.agentStatus).toBe("Recovered session history after reload.");
  });
});
