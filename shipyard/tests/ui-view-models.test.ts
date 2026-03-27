import { describe, expect, it } from "vitest";

import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import {
  addPendingUploads,
  applyBackendMessage,
  clearPendingUploads,
  appendPendingUploadReceipts,
  consumePendingUploadsForInstruction,
  createInitialWorkbenchState,
  prepareInstructionSubmission,
  queueInstructionTurn,
  removePendingUpload,
  type UploadReceiptViewModel,
} from "../ui/src/view-models.js";

function createUploadReceipt(
  overrides?: Partial<UploadReceiptViewModel>,
): UploadReceiptViewModel {
  return {
    id: "upload-1",
    originalName: "spec.md",
    storedRelativePath: ".shipyard/uploads/session-restore/spec-abc123.md",
    sizeBytes: 148,
    mediaType: "text/markdown",
    previewText: "# Hosted upload spec\n\nKeep edits narrow and explain tradeoffs.",
    previewSummary: "Markdown preview available.",
    uploadedAt: "2026-03-24T12:04:00.000Z",
    ...overrides,
  };
}

describe("ui view models", () => {
  it("injected context is attached to the next instruction and then cleared from draft state", () => {
    const submission = prepareInstructionSubmission(
      "inspect package.json",
      "  Follow the package scripts before changing anything.  ",
    );

    expect(submission).toEqual({
      instruction: "inspect package.json",
      injectedContext: ["Follow the package scripts before changing anything."],
      contextPreview: ["Follow the package scripts before changing anything."],
      clearedContextDraft: "",
    });

    let state = createInitialWorkbenchState();
    state = queueInstructionTurn(
      state,
      submission?.instruction ?? "",
      submission?.contextPreview ?? [],
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
      detail: [
        "Read package.json",
        "Lines: 12",
        "Hash: abcd1234",
      ].join("\n"),
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
          detailBody: "Read package.json\nLines: 12\nHash: abcd1234",
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
      summary: "Applied targeted edit to src/app.ts",
      diff: [
        "diff --git a/src/app.ts b/src/app.ts",
        "@@ -1,3 +1,3 @@",
        " export function App() {",
        "-  return 'before';",
        "+  return 'after';",
        " }",
      ].join("\n"),
      beforePreview: "return 'before';",
      afterPreview: "return 'after';",
      addedLines: 1,
      removedLines: 1,
    });

    expect(state.turns[0]?.activity[0]).toMatchObject({
      kind: "edit",
      title: "src/app.ts",
      detail: "Applied targeted edit to src/app.ts",
      path: "src/app.ts",
      beforePreview: "return 'before';",
      afterPreview: "return 'after';",
      addedLines: 1,
      removedLines: 1,
    });
    expect(state.fileEvents[0]).toMatchObject({
      path: "src/app.ts",
      status: "diff",
      title: "Diff preview",
      summary: "Applied targeted edit to src/app.ts",
      turnId: "turn-1",
      beforePreview: "return 'before';",
      afterPreview: "return 'after';",
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

  it("stores LangSmith trace metadata on the completed turn when present", () => {
    let state = createInitialWorkbenchState();

    state = queueInstructionTurn(state, "inspect package.json", []);
    state = applyBackendMessage(state, {
      type: "agent:done",
      status: "success",
      summary: "Turn finished cleanly.",
      langSmithTrace: {
        projectName: "shipyard",
        runId: "run-123",
        traceUrl: "https://smith.langchain.com/runs/run-123",
        projectUrl: "https://smith.langchain.com/projects/shipyard",
      },
    });

    expect(state.turns[0]).toMatchObject({
      status: "success",
      summary: "Turn finished cleanly.",
      langSmithTrace: {
        runId: "run-123",
        traceUrl: "https://smith.langchain.com/runs/run-123",
      },
    });
  });

  it("surfaces the execution fingerprint in the done activity and footer status", () => {
    let state = createInitialWorkbenchState();

    state = queueInstructionTurn(state, "inspect package.json", []);
    state = applyBackendMessage(state, {
      type: "agent:done",
      status: "success",
      summary: "Turn finished cleanly.",
      executionFingerprint: {
        surface: "ui",
        phase: "code",
        planningMode: "planner",
        targetProfile: "yes",
        preview: "yes",
        previewStatus: "running",
        browserEval: "yes",
        browserEvaluationStatus: "passed",
        model: "anthropic/claude-opus-4-6",
        modelProvider: "anthropic",
        modelName: "claude-opus-4-6",
      },
    });

    expect(state.agentStatus).toBe(
      "surface=ui phase=code planningMode=planner targetProfile=yes preview=yes browserEval=yes model=anthropic/claude-opus-4-6",
    );
    expect(state.turns[0]?.summary).toBe("Turn finished cleanly.");
    expect(state.turns[0]?.activity.at(-1)).toMatchObject({
      kind: "done",
      detail: "Turn finished cleanly.",
      detailBody:
        "surface=ui phase=code planningMode=planner targetProfile=yes preview=yes browserEval=yes model=anthropic/claude-opus-4-6",
    });
  });

  it("tracks cancelled turns distinctly from runtime errors", () => {
    let state = createInitialWorkbenchState();

    state = queueInstructionTurn(state, "inspect package.json", []);
    state = applyBackendMessage(state, {
      type: "agent:text",
      text: "Turn 1 cancelled: Operator interrupted the active turn.",
    });
    state = applyBackendMessage(state, {
      type: "agent:done",
      status: "cancelled",
      summary: "Operator interrupted the active turn.",
    });

    expect(state.activeTurnId).toBeNull();
    expect(state.latestError).toBeNull();
    expect(state.agentStatus).toBe("Operator interrupted the active turn.");
    expect(state.turns[0]).toMatchObject({
      instruction: "inspect package.json",
      status: "cancelled",
      summary: "Operator interrupted the active turn.",
    });
  });

  it("updates the project board without disturbing the active turn snapshot", () => {
    let state = queueInstructionTurn(
      createInitialWorkbenchState(),
      "inspect package.json",
      [],
    );

    state = applyBackendMessage(
      state,
      {
        type: "projects:state",
        state: {
          activeProjectId: "/tmp/beta-app",
          openProjects: [
            {
              projectId: "/tmp/alpha-app",
              targetPath: "/tmp/alpha-app",
              targetName: "alpha-app",
              description: "Busy alpha project.",
              activePhase: "code",
              status: "agent-busy",
              agentStatus: "Running alpha task",
              hasProfile: true,
              lastActiveAt: "2026-03-26T12:00:00.000Z",
              turnCount: 3,
            },
            {
              projectId: "/tmp/beta-app",
              targetPath: "/tmp/beta-app",
              targetName: "beta-app",
              description: "Ready beta project.",
              activePhase: "code",
              status: "ready",
              agentStatus: "Ready for the next instruction.",
              hasProfile: false,
              lastActiveAt: "2026-03-26T12:02:00.000Z",
              turnCount: 1,
            },
          ],
        },
      } as unknown as Parameters<typeof applyBackendMessage>[1],
    );

    expect(state.projectBoard).toMatchObject({
      activeProjectId: "/tmp/beta-app",
      openProjects: [
        expect.objectContaining({
          targetPath: "/tmp/alpha-app",
          status: "agent-busy",
        }),
        expect.objectContaining({
          targetPath: "/tmp/beta-app",
          status: "ready",
        }),
      ],
    });
    expect(state.turns[0]).toMatchObject({
      instruction: "inspect package.json",
      status: "working",
    });
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
      activePhase: "code",
      workspaceDirectory: "/tmp/shipyard-workspace",
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
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
      discoverySummary: "typescript (React) via pnpm",
      projectRulesLoaded: true,
      sessionHistory: [
        {
          sessionId: "session-restore",
          targetLabel: "shipyard",
          targetDirectory: "/tmp/shipyard",
          activePhase: "code",
          startedAt: "2026-03-24T12:00:00.000Z",
          lastActiveAt: "2026-03-24T12:05:00.000Z",
          turnCount: 1,
          latestInstruction: "inspect package.json",
          latestSummary: "Recovered state.",
          latestStatus: "success",
          isCurrent: true,
        },
      ],
      workbenchState: snapshot,
    });

    expect(rehydrated.turns[0]).toMatchObject({
      instruction: "inspect package.json",
      contextPreview: ["Keep the current layout intact."],
    });
    expect(rehydrated.contextHistory[0]).toMatchObject({
      text: "Keep the current layout intact.",
    });
    expect(rehydrated.sessionHistory[0]).toMatchObject({
      sessionId: "session-restore",
      latestInstruction: "inspect package.json",
      isCurrent: true,
    });
    expect(rehydrated.agentStatus).toBe("Recovered session history after reload.");
  });

  it("rehydrates pending uploads and consumes them into the next instruction handoff", () => {
    const uploadReceipt = createUploadReceipt();
    const snapshot = appendPendingUploadReceipts(
      createInitialWorkbenchState(),
      [uploadReceipt],
    );

    const rehydrated = applyBackendMessage(createInitialWorkbenchState(), {
      type: "session:state",
      runtimeMode: "ui",
      connectionState: "ready",
      sessionId: "session-upload",
      targetLabel: "shipyard",
      targetDirectory: "/tmp/shipyard",
      activePhase: "code",
      workspaceDirectory: "/tmp/shipyard-workspace",
      turnCount: 0,
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
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
      discoverySummary: "typescript (React) via pnpm",
      projectRulesLoaded: true,
      sessionHistory: [],
      workbenchState: snapshot,
    });

    expect(rehydrated.pendingUploads).toEqual([uploadReceipt]);

    const submission = prepareInstructionSubmission(
      "inspect the uploaded spec",
      "  Honor the existing package scripts.  ",
      rehydrated.pendingUploads,
    );

    expect(submission).toMatchObject({
      instruction: "inspect the uploaded spec",
      injectedContext: ["Honor the existing package scripts."],
      contextPreview: [
        "Honor the existing package scripts.",
        `Upload: ${uploadReceipt.originalName} -> ${uploadReceipt.storedRelativePath}`,
      ],
      clearedContextDraft: "",
    });

    const consumed = consumePendingUploadsForInstruction(
      rehydrated,
      submission?.injectedContext,
    );

    expect(consumed.nextState.pendingUploads).toEqual([]);
    expect(consumed.contextPreview).toEqual([
      "Honor the existing package scripts.",
      `Upload: ${uploadReceipt.originalName} -> ${uploadReceipt.storedRelativePath}`,
    ]);
    expect(consumed.injectedContext).toHaveLength(2);
    expect(consumed.injectedContext?.[0]).toBe(
      "Honor the existing package scripts.",
    );
    expect(consumed.injectedContext?.[1]).toContain(
      `Original filename: ${uploadReceipt.originalName}`,
    );
    expect(consumed.injectedContext?.[1]).toContain(
      `Stored path: ${uploadReceipt.storedRelativePath}`,
    );
    expect(consumed.injectedContext?.[1]).toContain(uploadReceipt.previewText);
  });

  it("fresh ready snapshots replace the initial connecting placeholder", () => {
    const rehydrated = applyBackendMessage(createInitialWorkbenchState(), {
      type: "session:state",
      runtimeMode: "ui",
      connectionState: "ready",
      sessionId: "session-ready",
      targetLabel: "shipyard",
      targetDirectory: "/tmp/shipyard",
      activePhase: "target-manager",
      workspaceDirectory: "/tmp/shipyard-workspace",
      turnCount: 0,
      startedAt: "2026-03-24T12:00:00.000Z",
      lastActiveAt: "2026-03-24T12:05:00.000Z",
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
        previewCapability: createUnavailablePreviewCapability(
          "Greenfield target; no supported local preview has been detected yet.",
        ),
      },
      discoverySummary: "greenfield target",
      projectRulesLoaded: false,
      sessionHistory: [],
      workbenchState: createInitialWorkbenchState(),
    });

    expect(rehydrated.agentStatus).toBe("Ready for the next instruction.");
  });

  it("stores live preview state updates in the session-backed workbench model", () => {
    let state = createInitialWorkbenchState();

    state = applyBackendMessage(state, {
      type: "preview:state",
      preview: {
        status: "running",
        summary: "Local preview is running.",
        url: "http://127.0.0.1:4173",
        logTail: [
          "VITE v5.0.8 ready in 145 ms",
        ],
        lastRestartReason: null,
      },
    });

    expect(state.previewState).toMatchObject({
      status: "running",
      summary: "Local preview is running.",
      url: "http://127.0.0.1:4173",
      logTail: ["VITE v5.0.8 ready in 145 ms"],
      lastRestartReason: null,
    });
  });

  it("tracks deploy state updates separately from preview state", () => {
    let state = createInitialWorkbenchState();

    state = applyBackendMessage(state, {
      type: "deploy:state",
      deploy: {
        status: "deploying",
        platform: "vercel",
        available: false,
        unavailableReason: "A deploy is already in progress.",
        productionUrl: null,
        summary: "Deploying the current target to Vercel.",
        logExcerpt: null,
        command: null,
        requestedAt: "2026-03-25T14:00:00.000Z",
        completedAt: null,
      },
    });

    expect(state.latestDeploy).toMatchObject({
      status: "deploying",
      platform: "vercel",
      available: false,
      unavailableReason: "A deploy is already in progress.",
      summary: "Deploying the current target to Vercel.",
      requestedAt: "2026-03-25T14:00:00.000Z",
      completedAt: null,
    });
    expect(state.agentStatus).toBe("Deploying the current target to Vercel.");
    expect(state.latestError).toBeNull();

    state = applyBackendMessage(state, {
      type: "deploy:state",
      deploy: {
        status: "error",
        platform: "vercel",
        available: true,
        unavailableReason: null,
        productionUrl: "https://shipyard-demo.vercel.app",
        summary: "Deploy failed. Review the provider output excerpt and retry.",
        logExcerpt: "Error: build command exited with status 1",
        command: "vercel deploy --prod --yes --token [redacted]",
        requestedAt: "2026-03-25T14:00:00.000Z",
        completedAt: "2026-03-25T14:03:00.000Z",
      },
    });

    expect(state.latestDeploy).toMatchObject({
      status: "error",
      available: true,
      productionUrl: "https://shipyard-demo.vercel.app",
      command: "vercel deploy --prod --yes --token [redacted]",
    });
    expect(state.latestError).toBe(
      "Deploy failed. Review the provider output excerpt and retry.",
    );
  });

  it("tracks target manager state and enrichment progress in the reducer", () => {
    let state = createInitialWorkbenchState();

    state = applyBackendMessage(state, {
      type: "target:state",
      state: {
        currentTarget: {
          path: "/tmp/targets",
          name: "No target selected",
          description: "Select or create a target to begin.",
          language: null,
          framework: null,
          hasProfile: false,
        },
        availableTargets: [
          {
            path: "/tmp/targets/alpha-app",
            name: "alpha-app",
            description: "React sandbox",
            language: "typescript",
            framework: "React",
            hasProfile: true,
          },
        ],
        enrichmentStatus: {
          status: "idle",
          message: null,
        },
      },
    });
    state = applyBackendMessage(state, {
      type: "target:enrichment_progress",
      status: "queued",
      message: "Analyzing this target in the background.",
    });

    expect(state.targetManager).toMatchObject({
      enrichmentStatus: {
        status: "queued",
        message: "Analyzing this target in the background.",
      },
    });
    expect(state.agentStatus).toBe("Analyzing this target in the background.");

    state = applyBackendMessage(state, {
      type: "target:enrichment_progress",
      status: "in-progress",
      message: "Analyzing project structure.",
    });

    expect(state.targetManager).toMatchObject({
      currentTarget: {
        name: "No target selected",
      },
      availableTargets: [
        {
          name: "alpha-app",
          framework: "React",
        },
      ],
      enrichmentStatus: {
        status: "in-progress",
        message: "Analyzing project structure.",
      },
    });
    expect(state.agentStatus).toBe("Analyzing project structure.");
  });

  it("tracks pending uploaded files until the next turn consumes them", () => {
    let state = createInitialWorkbenchState();

    state = addPendingUploads(state, [
      {
        id: "upload-1",
        originalName: "brief.md",
        storedRelativePath: ".shipyard/uploads/session-1/brief.md",
        sizeBytes: 128,
        mediaType: "text/markdown",
        previewText: "# Brief",
        previewSummary: "Markdown preview available.",
        uploadedAt: "2026-03-25T10:00:00.000Z",
      },
    ]);

    expect(state.pendingUploads).toHaveLength(1);
    expect(state.pendingUploads[0]).toMatchObject({
      originalName: "brief.md",
      storedRelativePath: ".shipyard/uploads/session-1/brief.md",
    });

    state = removePendingUpload(state, "upload-1");
    expect(state.pendingUploads).toHaveLength(0);

    state = addPendingUploads(state, [
      {
        id: "upload-2",
        originalName: "notes.txt",
        storedRelativePath: ".shipyard/uploads/session-1/notes.txt",
        sizeBytes: 64,
        mediaType: "text/plain",
        previewText: "remember this",
        previewSummary: "Text preview available.",
        uploadedAt: "2026-03-25T10:01:00.000Z",
      },
    ]);
    state = clearPendingUploads(state);

    expect(state.pendingUploads).toHaveLength(0);
  });
});
