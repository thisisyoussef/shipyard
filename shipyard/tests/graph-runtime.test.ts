import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import { createTurnCancelledError } from "../src/engine/cancellation.js";
import type { ContextEnvelope } from "../src/engine/state.js";
import {
  createAgentGraphState,
  createAgentRuntimeGraph,
  createAgentRuntimeNodes,
  determineActingLoopBudget,
  routeAfterAct,
  routeAfterVerify,
  runAgentRuntime,
  runFallbackRuntime,
} from "../src/engine/graph.js";
import { createCodePhase } from "../src/phases/code/index.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import type {
  LangSmithTraceReference,
  RunWithLangSmithTraceOptions,
  RunWithLangSmithTraceResult,
} from "../src/tracing/langsmith.js";
import * as langsmith from "../src/tracing/langsmith.js";
import { CheckpointManager } from "../src/checkpoints/manager.js";
import type {
  BrowserEvaluationPlan,
  EvaluationPlan,
  PreviewState,
} from "../src/artifacts/types.js";
import {
  clearTrackedReadHashes,
  getTrackedReadHash,
  hashContents,
} from "../src/tools/file-state.js";

const createdDirectories: string[] = [];

interface MockAnthropicClient {
  messages: {
    create: (request: MessageCreateParamsNonStreaming) => Promise<Message>;
  };
}

function createContextEnvelope(): ContextEnvelope {
  return {
    stable: {
      discovery: {
        isGreenfield: false,
        language: "TypeScript",
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
      projectRules: "",
      availableScripts: {
        test: "vitest run",
      },
    },
    task: {
      currentInstruction: "Inspect src/app.ts",
      injectedContext: [],
      targetFilePaths: [],
    },
    runtime: {
      recentToolOutputs: [],
      recentErrors: [],
      currentGitDiff: null,
    },
    session: {
      rollingSummary: "",
      retryCountsByFile: {},
      blockedFiles: [],
      latestHandoff: null,
      activeTask: null,
    },
  };
}

function createPreviewState(
  overrides: Partial<PreviewState> = {},
): PreviewState {
  return {
    status: "unavailable" as const,
    summary: "No preview is available for this target.",
    url: null,
    logTail: [],
    lastRestartReason: null,
    ...overrides,
  };
}

function createAssistantMessage(options: {
  content: unknown[];
  stopReason: Message["stop_reason"];
  model?: Model;
}): Message {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    container: null,
    content: options.content as Message["content"],
    model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
    role: "assistant",
    stop_reason: options.stopReason,
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 42,
      output_tokens: 19,
      server_tool_use: null,
      service_tier: "standard",
    },
  };
}

function createMockAnthropicClient(responses: Message[]): MockAnthropicClient {
  let callIndex = 0;

  return {
    messages: {
      async create() {
        const response = responses[callIndex];
        callIndex += 1;

        if (!response) {
          throw new Error("No mock Claude response configured.");
        }

        return response;
      },
    },
  };
}

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-graph-"));
  createdDirectories.push(directory);
  return directory;
}

function mockLangSmithTrace(trace: LangSmithTraceReference): void {
  vi.spyOn(langsmith, "getLangSmithConfig").mockReturnValue({
    enabled: true,
    project: trace.projectName,
    endpoint: "https://api.smith.langchain.com",
    apiKey: "lsv2_test_123",
    workspaceId: null,
  });
  vi
    .spyOn(langsmith, "getLangSmithCallbacksForCurrentTrace")
    .mockResolvedValue(undefined);
  vi.spyOn(langsmith, "runWithLangSmithTrace").mockImplementation(
    async <Args extends unknown[], Result>(
      options: RunWithLangSmithTraceOptions<Args, Result>,
    ): Promise<RunWithLangSmithTraceResult<Result>> => ({
      result: await options.fn(...options.args),
      trace,
    }),
  );
}

function createInitialState(targetDirectory = "/tmp/shipyard-graph") {
  return createAgentGraphState({
    sessionId: "session-123",
    instruction: "Inspect src/app.ts",
    contextEnvelope: createContextEnvelope(),
    previewState: createPreviewState(),
    targetDirectory,
    phaseConfig: createCodePhase(),
  });
}

describe("Phase 4 graph runtime contract", () => {
  afterEach(async () => {
    clearTrackedReadHashes();
    vi.restoreAllMocks();

    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("graph state can represent retries, blocked files, last edited file, and final result", () => {
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix src/app.ts",
      contextEnvelope: createContextEnvelope(),
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
      retryCountsByFile: {
        "src/app.ts": 3,
      },
      blockedFiles: ["src/app.ts"],
      lastEditedFile: "src/app.ts",
      finalResult: "Blocked after repeated failures.",
      status: "done",
    });

    expect(state.retryCountsByFile["src/app.ts"]).toBe(3);
    expect(state.blockedFiles).toEqual(["src/app.ts"]);
    expect(state.lastEditedFile).toBe("src/app.ts");
    expect(state.finalResult).toBe("Blocked after repeated failures.");
    expect(state.status).toBe("done");
  });

  it("status helpers route act to verify when an edit occurred", () => {
    expect(routeAfterAct({ status: "verifying" })).toBe("verify");
  });

  it("status helpers route verify failure to recover", () => {
    expect(routeAfterVerify({ status: "recovering" })).toBe("recover");
  });

  it("plan node delegates broad instructions to the explorer before acting", async () => {
    const contextReport = {
      query: "Fix the auth flow",
      findings: [
        {
          filePath: "src/auth.ts",
          excerpt: "export async function authenticate() {}",
          relevanceNote: "This file owns the auth entry point.",
        },
      ],
    };
    const runExplorerSubagent = vi.fn(async () => contextReport);
    const runPlannerSubagent = vi.fn(async () => ({
      instruction: "Fix the auth flow",
      goal: "Repair the auth flow without widening scope.",
      deliverables: ["Update the auth entry point."],
      acceptanceCriteria: ["Authentication succeeds for valid credentials."],
      verificationIntent: ["Run the auth-focused tests."],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Regression risk in authentication state handling."],
    }));
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runExplorerSubagent,
        runPlannerSubagent,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix the auth flow",
      contextEnvelope: createContextEnvelope(),
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    });

    const update = await nodes.plan(state);
    const explorerCall = runExplorerSubagent.mock.calls.at(0) as
      | unknown[]
      | undefined;

    expect(runExplorerSubagent).toHaveBeenCalledTimes(1);
    expect(runPlannerSubagent).toHaveBeenCalledTimes(1);
    expect(explorerCall?.[0]).toContain("Fix the auth flow");
    expect(explorerCall?.[1]).toBe("/tmp/shipyard-graph");
    expect(update.contextReport).toEqual(contextReport);
    expect(update.executionSpec).toEqual(
      expect.objectContaining({
        goal: "Repair the auth flow without widening scope.",
        targetFilePaths: ["src/auth.ts"],
      }),
    );
    expect(update.taskPlan).toEqual(
      expect.objectContaining({
        targetFilePaths: ["src/auth.ts"],
      }),
    );
    expect(update.planningMode).toBe("planner");
    expect(update.status).toBe("acting");
  });

  it("plan node skips explorer and planner when the instruction already names an exact path", async () => {
    const runExplorerSubagent = vi.fn();
    const runPlannerSubagent = vi.fn();
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runExplorerSubagent,
        runPlannerSubagent,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Update src/app.ts to rename the counter export.",
      contextEnvelope: createContextEnvelope(),
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    });

    const update = await nodes.plan(state);

    expect(runExplorerSubagent).not.toHaveBeenCalled();
    expect(runPlannerSubagent).not.toHaveBeenCalled();
    expect(update.contextReport).toBeNull();
    expect(update.executionSpec).toEqual(
      expect.objectContaining({
        instruction: "Update src/app.ts to rename the counter export.",
        targetFilePaths: ["src/app.ts"],
      }),
    );
    expect(update.taskPlan).toEqual(
      expect.objectContaining({
        targetFilePaths: ["src/app.ts"],
      }),
    );
    expect(update.planningMode).toBe("lightweight");
  });

  it("plan node keeps bootstrap-ready doc-seeded targets on the lightweight path", async () => {
    const runExplorerSubagent = vi.fn();
    const runPlannerSubagent = vi.fn();
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runExplorerSubagent,
        runPlannerSubagent,
      },
    });
    const contextEnvelope = createContextEnvelope();

    contextEnvelope.stable.discovery = {
      ...contextEnvelope.stable.discovery,
      isGreenfield: false,
      bootstrapReady: true,
      language: null,
      framework: null,
      packageManager: null,
      scripts: {},
      hasReadme: true,
      hasAgentsMd: true,
      topLevelFiles: ["AGENTS.md", "README.md"],
      topLevelDirectories: [],
      projectName: null,
    };
    contextEnvelope.stable.availableScripts = {};

    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Bootstrap this seeded target with the shared scaffold.",
      contextEnvelope,
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    });

    const update = await nodes.plan(state);

    expect(runExplorerSubagent).not.toHaveBeenCalled();
    expect(runPlannerSubagent).not.toHaveBeenCalled();
    expect(update.planningMode).toBe("lightweight");
    expect(update.harnessRoute).toMatchObject({
      selectedPath: "lightweight",
      usedExplorer: false,
      usedPlanner: false,
    });
  });

  it("plan node converts explorer cancellation into a cancelled update", async () => {
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        async runExplorerSubagent() {
          throw createTurnCancelledError(
            "Operator interrupted the active turn.",
          );
        },
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix the auth flow",
      contextEnvelope: createContextEnvelope(),
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    });

    const update = await nodes.plan(state);

    expect(update).toMatchObject({
      status: "cancelled",
      finalResult: "Operator interrupted the active turn.",
      lastError: null,
    });
  });

  it("act node checkpoints before edit_block runs", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "src", "app.ts");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export const count = 1;\n", "utf8");

    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_read_file",
            name: "read_file",
            input: {
              path: "src/app.ts",
            },
            caller: {
              type: "direct",
            },
          },
          {
            type: "tool_use",
            id: "toolu_edit_block",
            name: "edit_block",
            input: {
              path: "src/app.ts",
              old_string: "export const count = 1;\n",
              new_string: "export const count = 2;\n",
            },
            caller: {
              type: "direct",
            },
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Updated src/app.ts.",
            citations: null,
          },
        ],
      }),
    ]);

    const checkpointManager = {
      checkpoint: vi.fn(async (relativePath: string) => {
        expect(relativePath).toBe("src/app.ts");
        expect(await readFile(appPath, "utf8")).toBe(
          "export const count = 1;\n",
        );
        return path.join(directory, ".shipyard", "checkpoints", "session-123", "mock.checkpoint");
      }),
      revert: vi.fn(async () => true),
    };

    const nodes = createAgentRuntimeNodes({
      dependencies: {
        createCheckpointManager: () => checkpointManager,
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const update = await nodes.act(createInitialState(directory));

    expect(checkpointManager.checkpoint).toHaveBeenCalledTimes(1);
    expect(await readFile(appPath, "utf8")).toBe("export const count = 2;\n");
    expect(update.status).toBe("verifying");
    expect(update.lastEditedFile).toBe("src/app.ts");
  });

  it("act node converts raw-loop continuation into a checkpointed response instead of a failure", async () => {
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runActingLoop: async () => ({
          status: "continuation",
          finalText:
            "Shipyard reached the acting iteration limit of 25 and needs a checkpoint-backed continuation.",
          messageHistory: [],
          iterations: 25,
          didEdit: true,
          lastEditedFile: "src/app.ts",
          touchedFiles: ["src/app.ts", "src/routes.tsx"],
        }),
      },
    });
    const update = await nodes.act(createInitialState());

    expect(update.status).toBe("responding");
    expect(update.finalResult).toContain("needs a checkpoint-backed continuation");
    expect(update.actingIterations).toBe(25);
    expect(update.lastEditedFile).toBe("src/app.ts");
    expect(update.checkpointRequested).toBe(true);
    expect(update.touchedFiles).toEqual(["src/app.ts", "src/routes.tsx"]);
    expect(update.lastError).toBeNull();
  });

  it("derives narrow and broad acting-loop budgets from task shape", () => {
    const broadBudget = determineActingLoopBudget({
      instruction:
        "Bootstrap this seeded target, create apps/web/src/lib/seed-data.ts, and update apps/web/src/App.tsx to build a Trello-style dashboard.",
      contextEnvelope: {
        ...createContextEnvelope(),
        stable: {
          ...createContextEnvelope().stable,
          discovery: {
            ...createContextEnvelope().stable.discovery,
            isGreenfield: false,
            bootstrapReady: true,
            language: null,
            framework: null,
            packageManager: null,
            scripts: {},
            hasReadme: true,
            hasAgentsMd: true,
            topLevelFiles: ["AGENTS.md", "README.md"],
            topLevelDirectories: [],
            projectName: null,
          },
          availableScripts: {},
        },
      },
      taskPlan: null,
      executionSpec: null,
      contextReport: null,
      latestHandoff: null,
    });
    const narrowGreenfieldBudget = determineActingLoopBudget({
      instruction: "Update apps/web/src/App.tsx to rename the exported component.",
      contextEnvelope: {
        ...createContextEnvelope(),
        stable: {
          ...createContextEnvelope().stable,
          discovery: {
            ...createContextEnvelope().stable.discovery,
            isGreenfield: false,
            bootstrapReady: true,
            language: null,
            framework: null,
            packageManager: null,
            scripts: {},
            hasReadme: true,
            hasAgentsMd: true,
            topLevelFiles: ["AGENTS.md", "README.md"],
            topLevelDirectories: [],
            projectName: null,
          },
          availableScripts: {},
        },
      },
      taskPlan: null,
      executionSpec: null,
      contextReport: null,
      latestHandoff: null,
    });
    const narrowBudget = determineActingLoopBudget({
      instruction: "Update src/app.tsx to rename the exported component.",
      contextEnvelope: createContextEnvelope(),
      taskPlan: null,
      executionSpec: null,
      contextReport: null,
      latestHandoff: null,
    });
    const continuationBudget = determineActingLoopBudget({
      instruction: "Continue the same dashboard build.",
      contextEnvelope: createContextEnvelope(),
      taskPlan: null,
      executionSpec: null,
      contextReport: null,
      latestHandoff: {
        artifactPath: ".shipyard/artifacts/session-123/turn-3.handoff.json",
        handoff: {
          version: 1,
          sessionId: "session-123",
          turnCount: 3,
          createdAt: "2026-03-25T21:30:00.000Z",
          instruction: "Build the dashboard",
          phaseName: "code",
          runtimeMode: "graph",
          status: "success",
          summary: "Checkpointed after a long greenfield build.",
          goal: "Build the dashboard",
          completedWork: ["Turn summary: Checkpointed after a long greenfield build."],
          remainingWork: ["Resume the dashboard build from the touched files."],
          touchedFiles: [
            "apps/web/src/App.tsx",
            "apps/web/src/lib/seed-data.ts",
            "apps/web/src/components/status-summary.tsx",
          ],
          blockedFiles: [],
          latestEvaluation: null,
          nextRecommendedAction: "Resume from the checkpoint.",
          resetReason: {
            kind: "iteration-threshold",
            summary: "The acting loop crossed the long-run iteration threshold.",
            thresholds: {
              actingIterations: 4,
              recoveryAttempts: 1,
            },
            metrics: {
              actingIterations: 5,
              recoveryAttempts: 0,
              blockedFileCount: 0,
            },
          },
          taskPlan: {
            instruction: "Build the dashboard",
            goal: "Build the dashboard",
            targetFilePaths: ["apps/web/src/App.tsx"],
            plannedSteps: ["Continue the dashboard build."],
          },
        },
      },
    });
    const sameSessionContinuationBudget = determineActingLoopBudget({
      instruction: "Continue the same scaffolded app and finish the dashboard build.",
      contextEnvelope: {
        ...createContextEnvelope(),
        session: {
          ...createContextEnvelope().session,
          recentTouchedFiles: [
            "apps/web/src/App.tsx",
            "apps/web/src/lib/seed-data.ts",
            "apps/web/src/components/status-summary.tsx",
          ],
        },
      },
      taskPlan: {
        instruction: "Continue the same scaffolded app and finish the dashboard build.",
        goal: "Continue the same scaffolded app and finish the dashboard build.",
        targetFilePaths: [
          "apps/web/src/App.tsx",
          "apps/web/src/lib/seed-data.ts",
        ],
        plannedSteps: ["Finish the dashboard build."],
      },
      executionSpec: null,
      contextReport: null,
      latestHandoff: null,
    });

    expect(broadBudget).toEqual({
      maxIterations: 45,
      reason: "broad-greenfield",
    });
    expect(narrowGreenfieldBudget).toEqual({
      maxIterations: 25,
      reason: "narrow-default",
    });
    expect(narrowBudget).toEqual({
      maxIterations: 25,
      reason: "narrow-default",
    });
    expect(continuationBudget).toEqual({
      maxIterations: 45,
      reason: "broad-continuation",
    });
    expect(sameSessionContinuationBudget).toEqual({
      maxIterations: 45,
      reason: "broad-continuation",
    });
  });

  it("verify node delegates post-edit checks to the verifier helper", async () => {
    const runVerifierSubagent = vi.fn(
      async (input: string | {
        summary: string;
        checks: Array<{ command: string }>;
      }) => ({
        command: typeof input === "string" ? input : input.checks[0]?.command ?? "",
        exitCode: 0,
        passed: true,
        stdout: "",
        stderr: "",
        summary: "Verification passed.",
      }),
    );
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runVerifierSubagent,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix src/app.ts",
      contextEnvelope: createContextEnvelope(),
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
      lastEditedFile: "src/app.ts",
    });

    const update = await nodes.verify(state);
    const verifierCall = runVerifierSubagent.mock.calls.at(0) as
      | unknown[]
      | undefined;

    expect(runVerifierSubagent).toHaveBeenCalledTimes(1);
    expect(verifierCall?.[0]).toEqual({
      summary: "Run the verification command.",
      checks: [
        {
          id: "check-1",
          label: "Run pnpm test",
          kind: "command",
          command: "pnpm test",
          required: true,
        },
      ],
    });
    expect(verifierCall?.[1]).toBe("/tmp/shipyard-graph");
    expect(update.verificationReport).toEqual({
      command: "pnpm test",
      exitCode: 0,
      passed: true,
      stdout: "",
      stderr: "",
      summary: "Verification passed.",
      browserEvaluationReport: null,
    });
    expect(update.harnessRoute).toMatchObject({
      usedVerifier: true,
      verificationMode: "command",
      verificationCheckCount: 1,
      usedBrowserEvaluator: false,
      browserEvaluationStatus: "not_run",
    });
    expect(update.status).toBe("responding");
  });

  it("verify node falls back to file-presence checks for greenfield targets without install markers", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "apps", "web", "src", "App.tsx");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export function App() { return null; }\n", "utf8");

    const contextEnvelope = createContextEnvelope();

    contextEnvelope.stable.discovery = {
      ...contextEnvelope.stable.discovery,
      isGreenfield: true,
      packageManager: null,
      scripts: {},
      topLevelFiles: [],
      topLevelDirectories: [],
      projectName: null,
    };
    contextEnvelope.stable.availableScripts = {};

    const expectedCommand =
      "test -f 'apps/web/src/App.tsx' && echo 'Edited file exists: apps/web/src/App.tsx'";
    const runVerifierSubagent = vi.fn(async (input: string | EvaluationPlan) => ({
      command: typeof input === "string" ? input : input.checks[0]?.command ?? "",
      exitCode: 0,
      passed: true,
      stdout: "Edited file exists: apps/web/src/App.tsx\n",
      stderr: "",
      summary: "Verification passed.",
      evaluationPlan: typeof input === "string" ? undefined : input,
      checks: [],
      firstHardFailure: null,
      browserEvaluationReport: null,
    }));
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runVerifierSubagent,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Bootstrap the target and update App.tsx",
      contextEnvelope,
      previewState: createPreviewState(),
      targetDirectory: directory,
      phaseConfig: createCodePhase(),
      lastEditedFile: "apps/web/src/App.tsx",
    });

    const update = await nodes.verify(state);
    const verifierCall = runVerifierSubagent.mock.calls.at(0)?.[0] as
      | EvaluationPlan
      | undefined;

    expect(verifierCall).toEqual({
      summary: "Run the verification command.",
      checks: [
        {
          id: "check-1",
          label: "Confirm apps/web/src/App.tsx still exists",
          kind: "command",
          command: expectedCommand,
          required: true,
        },
      ],
    });
    expect(update.verificationReport).toEqual({
      command: expectedCommand,
      exitCode: 0,
      passed: true,
      stdout: "Edited file exists: apps/web/src/App.tsx\n",
      stderr: "",
      summary: "Verification passed.",
      evaluationPlan: {
        summary: "Run the verification command.",
        checks: [
          {
            id: "check-1",
            label: "Confirm apps/web/src/App.tsx still exists",
            kind: "command",
            command: expectedCommand,
            required: true,
          },
        ],
      },
      checks: [],
      firstHardFailure: null,
      browserEvaluationReport: null,
    });
    expect(update.status).toBe("responding");
  });

  it("verify node avoids package-script verification when package manifests changed without an install", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "apps", "web", "src", "App.tsx");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export function App() { return null; }\n", "utf8");

    const contextEnvelope = createContextEnvelope();

    contextEnvelope.stable.discovery = {
      ...contextEnvelope.stable.discovery,
      isGreenfield: false,
      scripts: {
        typecheck: "tsc -p tsconfig.json",
        build: "vite build",
      },
      topLevelFiles: ["package.json", "pnpm-workspace.yaml"],
      topLevelDirectories: ["apps", "packages"],
    };
    contextEnvelope.stable.availableScripts = {
      typecheck: "tsc -p tsconfig.json",
      build: "vite build",
    };
    contextEnvelope.session.recentTouchedFiles = [
      "package.json",
      "apps/web/src/App.tsx",
    ];

    const expectedCommand =
      "test -f 'apps/web/src/App.tsx' && echo 'Edited file exists: apps/web/src/App.tsx'";
    const runVerifierSubagent = vi.fn(async (input: string | EvaluationPlan) => ({
      command: typeof input === "string" ? input : input.checks[0]?.command ?? "",
      exitCode: 0,
      passed: true,
      stdout: "Edited file exists: apps/web/src/App.tsx\n",
      stderr: "",
      summary: "Verification passed.",
      evaluationPlan: typeof input === "string" ? undefined : input,
      checks: [],
      firstHardFailure: null,
      browserEvaluationReport: null,
    }));
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runVerifierSubagent,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Continue the scaffolded app",
      contextEnvelope,
      previewState: createPreviewState(),
      targetDirectory: directory,
      phaseConfig: createCodePhase(),
      lastEditedFile: "apps/web/src/App.tsx",
    });

    const update = await nodes.verify(state);
    const verifierCall = runVerifierSubagent.mock.calls.at(0)?.[0] as
      | EvaluationPlan
      | undefined;

    expect(verifierCall?.checks.map((check) => check.command)).toEqual([
      expectedCommand,
    ]);
    expect(update.verificationReport?.command).toBe(expectedCommand);
    expect(update.status).toBe("responding");
  });

  it("verify node runs multi-check verification and browser evaluation for previewable UI work", async () => {
    const contextEnvelope = createContextEnvelope();

    contextEnvelope.stable.discovery.scripts = {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
      build: "vite build",
    };
    contextEnvelope.stable.availableScripts = {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
      build: "vite build",
    };

    const runVerifierSubagent = vi.fn(async (input: string | EvaluationPlan) => ({
      command: typeof input === "string" ? input : input.checks.at(-1)?.command ?? "",
      exitCode: 0,
      passed: true,
      stdout: "build ok\n",
      stderr: "",
      summary: "All 3 evaluation checks passed.",
      evaluationPlan: typeof input === "string" ? undefined : input,
      checks: [],
      firstHardFailure: null,
      browserEvaluationReport: null,
    }));
    const runBrowserEvaluator = vi.fn(async (plan: BrowserEvaluationPlan) => ({
      status: "passed" as const,
      summary: "Browser evaluation passed.",
      previewUrl: "http://127.0.0.1:4173/",
      browserEvaluationPlan: plan,
      steps: [
        {
          stepId: "load-preview",
          label: "Load the current preview",
          kind: "load" as const,
          status: "passed" as const,
          summary: "Loaded the preview successfully.",
          error: null,
          elapsedMs: 25,
        },
      ],
      consoleMessages: [],
      pageErrors: [],
      artifacts: [],
      failure: null,
    }));
    const nodes = createAgentRuntimeNodes({
      dependencies: {
        runVerifierSubagent,
        runBrowserEvaluator,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Polish the app layout in src/app.tsx",
      contextEnvelope,
      previewState: createPreviewState({
        status: "running",
        summary: "Preview running.",
        url: "http://127.0.0.1:4173/",
      }),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
      planningMode: "planner",
      executionSpec: {
        instruction: "Polish the app layout in src/app.tsx",
        goal: "Polish the app layout without breaking the existing flow.",
        deliverables: ["Refine the main app layout."],
        acceptanceCriteria: ["The layout renders cleanly in the preview."],
        verificationIntent: ["Run the verification checks."],
        targetFilePaths: ["src/app.tsx"],
        risks: [],
      },
      lastEditedFile: "src/app.tsx",
    });

    const update = await nodes.verify(state);
    const verifierCall = runVerifierSubagent.mock.calls.at(0)?.[0] as
      | { summary: string; checks: Array<{ command: string }> }
      | undefined;

    expect(verifierCall?.checks.map((check) => check.command)).toEqual([
      "pnpm test",
      "pnpm typecheck",
      "pnpm build",
    ]);
    expect(runBrowserEvaluator).toHaveBeenCalledTimes(1);
    expect(update.verificationReport?.passed).toBe(true);
    expect(update.browserEvaluationReport?.status).toBe("passed");
    expect(update.harnessRoute).toMatchObject({
      verificationMode: "command+browser",
      verificationCheckCount: 3,
      usedBrowserEvaluator: true,
      browserEvaluationStatus: "passed",
    });
    expect(update.status).toBe("responding");
  });

  it("recover restores the latest checkpoint, refreshes hashes, and retries", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "src", "app.ts");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export const count = 1;\n", "utf8");

    const checkpointManager = new CheckpointManager(directory, "session-123");
    await checkpointManager.checkpoint("src/app.ts");
    await writeFile(appPath, "broken change\n", "utf8");

    const nodes = createAgentRuntimeNodes({
      dependencies: {
        createCheckpointManager: () => checkpointManager,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix src/app.ts",
      contextEnvelope: createContextEnvelope(),
      previewState: createPreviewState(),
      targetDirectory: directory,
      phaseConfig: createCodePhase(),
      lastEditedFile: "src/app.ts",
      lastError: "Verification failed.",
    });

    const update = await nodes.recover(state);
    const restoredHash = hashContents("export const count = 1;\n");

    expect(await readFile(appPath, "utf8")).toBe("export const count = 1;\n");
    expect(update.status).toBe("planning");
    expect(update.retryCountsByFile).toEqual({
      "src/app.ts": 1,
    });
    expect(update.fileHashes).toEqual({
      "src/app.ts": restoredHash,
    });
    expect(getTrackedReadHash("src/app.ts")).toBe(restoredHash);
  });

  it("act node checkpoints after 25 tool-loop iterations instead of failing", async () => {
    const graph = createAgentRuntimeGraph({
      dependencies: {
        runActingLoop: vi.fn(async () => {
          throw new Error(
            "Raw Claude loop exceeded 25 iterations without reaching a final response.",
          );
        }),
      },
    });

    const finalState = await graph.invoke(createInitialState());

    expect(finalState.status).toBe("done");
    expect(finalState.actingIterations).toBe(25);
    expect(finalState.finalResult).toMatch(/handoff|fresh turn|checkpoint/i);
  });

  it("fallback runtime preserves retry and blocked-file semantics", async () => {
    const runActingLoop = vi.fn(async () => ({
      finalText: "Applied a fix.",
      messageHistory: [],
      iterations: 1,
      didEdit: true,
      lastEditedFile: "src/app.ts",
    }));
    const verifyState = vi.fn(async () => ({
      command: "pnpm test",
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "tests failed",
      summary: "Verification failed.",
    }));
    const checkpointManager = {
      checkpoint: vi.fn(async () => "/tmp/mock.checkpoint"),
      revert: vi.fn(async () => false),
    };
    const directory = await createTempProject();

    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "src", "app.ts"), "broken change\n", "utf8");

    const finalState = await runFallbackRuntime(createInitialState(directory), {
      maxRecoveriesPerFile: 2,
      dependencies: {
        runActingLoop,
        verifyState,
        createCheckpointManager: () => checkpointManager,
      },
    });

    expect(runActingLoop).toHaveBeenCalledTimes(3);
    expect(verifyState).toHaveBeenCalledTimes(3);
    expect(checkpointManager.revert).toHaveBeenCalledTimes(3);
    expect(finalState.fallbackMode).toBe(true);
    expect(finalState.retryCountsByFile).toEqual({
      "src/app.ts": 3,
    });
    expect(finalState.blockedFiles).toEqual(["src/app.ts"]);
    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toMatch(
      /Blocked src\/app\.ts after 3 failed verification attempts\./,
    );
  });

  it("verification evidence beats explorer guesses and keeps recovery intact", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "src", "app.ts");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export const count = 1;\n", "utf8");

    const runExplorerSubagent = vi.fn(async () => ({
      query: "Fix the auth flow",
      findings: [
        {
          filePath: "src/guessed.ts",
          excerpt: "export const guessed = true;",
          relevanceNote: "Explorer thinks this file may matter.",
        },
      ],
    }));
    const runActingLoop = vi.fn(async () => ({
      finalText: "Applied a change.",
      messageHistory: [],
      iterations: 1,
      didEdit: true,
      lastEditedFile: "src/app.ts",
    }));
    const runVerifierSubagent = vi.fn(async (input: string | {
      summary: string;
      checks: Array<{ command: string }>;
    }) => ({
      command: typeof input === "string" ? input : input.checks[0]?.command ?? "",
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "tests failed",
      summary: "Verification failed for src/app.ts.",
    }));
    const checkpointManager = {
      checkpoint: vi.fn(async () => "/tmp/mock.checkpoint"),
      revert: vi.fn(async () => false),
    };
    const finalState = await runFallbackRuntime(
      createAgentGraphState({
        sessionId: "session-123",
        instruction: "Fix the auth flow",
        contextEnvelope: createContextEnvelope(),
        previewState: createPreviewState(),
        targetDirectory: directory,
        phaseConfig: createCodePhase(),
      }),
      {
        maxRecoveriesPerFile: 1,
        dependencies: {
          runExplorerSubagent,
          runPlannerSubagent: async () => ({
            instruction: "Fix the auth flow",
            goal: "Repair the auth flow without widening scope.",
            deliverables: ["Inspect the suspected auth surface."],
            acceptanceCriteria: ["The auth flow matches the request."],
            verificationIntent: ["Run the auth-focused tests."],
            targetFilePaths: ["src/guessed.ts"],
            risks: ["Explorer may have guessed the wrong file."],
          }),
          runActingLoop,
          runVerifierSubagent,
          createCheckpointManager: () => checkpointManager,
        },
      },
    );

    expect(runExplorerSubagent).toHaveBeenCalledTimes(1);
    expect(runVerifierSubagent).toHaveBeenCalledTimes(2);
    expect(finalState.taskPlan).toEqual(
      expect.objectContaining({
        targetFilePaths: ["src/guessed.ts"],
      }),
    );
    expect(finalState.blockedFiles).toEqual(["src/app.ts"]);
    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toMatch(/src\/app\.ts/);
  });

  it("attaches LangSmith trace metadata to successful graph runs when tracing is enabled", async () => {
    const trace = {
      projectName: "shipyard",
      runId: "graph-run-123",
      traceUrl: "https://smith.langchain.com/runs/graph-run-123",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    } satisfies LangSmithTraceReference;

    mockLangSmithTrace(trace);

    const finalState = await runAgentRuntime(createInitialState(), {
      dependencies: {
        runActingLoop: async () => ({
          finalText: "Inspection complete without edits.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
          modelProvider: "anthropic",
          modelName: "claude-sonnet-4-5",
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.langSmithTrace).toEqual(trace);
    expect(finalState.modelProvider).toBe("anthropic");
    expect(finalState.modelName).toBe("claude-sonnet-4-5");
    expect(langsmith.getLangSmithCallbacksForCurrentTrace).toHaveBeenCalledTimes(1);
    expect(langsmith.runWithLangSmithTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "shipyard.graph-runtime",
        tags: expect.arrayContaining(["shipyard", "graph-runtime", "code"]),
        getResultMetadata: expect.any(Function),
      }),
    );

    const tracedOptions = vi.mocked(langsmith.runWithLangSmithTrace).mock.calls[0]?.[0];
    const resultMetadata = tracedOptions?.getResultMetadata?.(finalState);

    expect(resultMetadata).toMatchObject({
      modelProvider: "anthropic",
      modelName: "claude-sonnet-4-5",
    });
  });

  it("marks graph trace metadata as using the explorer for broad instructions", async () => {
    const trace = {
      projectName: "shipyard",
      runId: "graph-run-456",
      traceUrl: "https://smith.langchain.com/runs/graph-run-456",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    } satisfies LangSmithTraceReference;
    const contextEnvelope = createContextEnvelope();

    contextEnvelope.task.currentInstruction = "Fix the auth flow";
    contextEnvelope.task.targetFilePaths = [];

    mockLangSmithTrace(trace);

    const runExplorerSubagent = vi.fn(async () => ({
      query: "Fix the auth flow",
      findings: [
        {
          filePath: "src/auth.ts",
          excerpt: "export async function authenticate() {}",
          relevanceNote: "Auth entry point.",
        },
      ],
    }));

    const finalState = await runAgentRuntime(createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix the auth flow",
      contextEnvelope,
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    }), {
      dependencies: {
        runExplorerSubagent,
        runPlannerSubagent: async () => ({
          instruction: "Fix the auth flow",
          goal: "Repair the auth flow without widening scope.",
          deliverables: ["Update the auth entry point."],
          acceptanceCriteria: ["Authentication succeeds for valid credentials."],
          verificationIntent: ["Run the auth-focused tests."],
          targetFilePaths: ["src/auth.ts"],
          risks: ["Regression risk in authentication state handling."],
        }),
        runActingLoop: async () => ({
          finalText: "Inspection complete without edits.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(runExplorerSubagent).toHaveBeenCalledTimes(1);
    expect(langsmith.runWithLangSmithTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          usedExplorer: true,
        }),
      }),
    );
  });

  it("marks graph trace metadata as using the planner for broad instructions", async () => {
    const trace = {
      projectName: "shipyard",
      runId: "graph-run-789",
      traceUrl: "https://smith.langchain.com/runs/graph-run-789",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    } satisfies LangSmithTraceReference;
    const contextEnvelope = createContextEnvelope();

    contextEnvelope.task.currentInstruction = "Fix the auth flow";
    contextEnvelope.task.targetFilePaths = [];

    mockLangSmithTrace(trace);

    const finalState = await runAgentRuntime(createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix the auth flow",
      contextEnvelope,
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    }), {
      dependencies: {
        runExplorerSubagent: async () => ({
          query: "Fix the auth flow",
          findings: [
            {
              filePath: "src/auth.ts",
              excerpt: "export async function authenticate() {}",
              relevanceNote: "Auth entry point.",
            },
          ],
        }),
        runPlannerSubagent: async () => ({
          instruction: "Fix the auth flow",
          goal: "Repair the auth flow without widening scope.",
          deliverables: ["Update the auth entry point."],
          acceptanceCriteria: ["Authentication succeeds for valid credentials."],
          verificationIntent: ["Run the auth-focused tests."],
          targetFilePaths: ["src/auth.ts"],
          risks: ["Regression risk in authentication state handling."],
        }),
        runActingLoop: async () => ({
          finalText: "Inspection complete without edits.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(langsmith.runWithLangSmithTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          usedPlanner: true,
        }),
      }),
    );
  });

  it("records loaded handoff resume metadata when tracing is enabled", async () => {
    const trace = {
      projectName: "shipyard",
      runId: "graph-run-790",
      traceUrl: "https://smith.langchain.com/runs/graph-run-790",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    } satisfies LangSmithTraceReference;
    const contextEnvelope = createContextEnvelope();

    contextEnvelope.task.currentInstruction = "Continue src/app.ts";
    contextEnvelope.task.targetFilePaths = ["src/app.ts"];
    contextEnvelope.session.latestHandoff = {
      artifactPath: ".shipyard/artifacts/session-123/turn-3.handoff.json",
      handoff: {
        version: 1,
        sessionId: "session-123",
        turnCount: 3,
        createdAt: "2026-03-25T21:30:00.000Z",
        instruction: "Implement the dashboard shell",
        phaseName: "code",
        runtimeMode: "graph",
        status: "success",
        summary: "Turn 3 completed via graph: dashboard shell is scaffolded.",
        goal: "Implement the dashboard shell",
        completedWork: ["Captured the implementation goal."],
        remainingWork: ["Resume in a fresh turn to finish the remaining task plan safely."],
        touchedFiles: ["src/app.ts"],
        blockedFiles: [],
        latestEvaluation: null,
        nextRecommendedAction: "Resume from the handoff before making additional edits.",
        resetReason: {
          kind: "iteration-threshold",
          summary: "The acting loop crossed the long-run iteration threshold.",
          thresholds: {
            actingIterations: 4,
            recoveryAttempts: 1,
          },
          metrics: {
            actingIterations: 5,
            recoveryAttempts: 0,
            blockedFileCount: 0,
          },
        },
        taskPlan: {
          instruction: "Implement the dashboard shell",
          goal: "Implement the dashboard shell",
          targetFilePaths: ["src/app.ts"],
          plannedSteps: [
            "Read the relevant files before editing.",
            "Implement the dashboard shell.",
            "Leave command-based verification to the verifier after the edit unless shell output is required now.",
          ],
        },
      },
    };

    mockLangSmithTrace(trace);

    const finalState = await runAgentRuntime(createAgentGraphState({
      sessionId: "session-123",
      instruction: "Continue src/app.ts",
      contextEnvelope,
      previewState: createPreviewState(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
    }), {
      dependencies: {
        runActingLoop: async () => ({
          finalText: "Resumed cleanly.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(langsmith.runWithLangSmithTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          handoffLoaded: true,
          handoffPath: ".shipyard/artifacts/session-123/turn-3.handoff.json",
          handoffReason: "iteration-threshold",
        }),
      }),
    );
  });

  it("attaches LangSmith trace metadata to intentional fallback failures", async () => {
    const trace = {
      projectName: "shipyard",
      runId: "fallback-run-123",
      traceUrl: "https://smith.langchain.com/runs/fallback-run-123",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    } satisfies LangSmithTraceReference;

    mockLangSmithTrace(trace);

    const finalState = await runAgentRuntime(createInitialState(), {
      mode: "fallback",
      dependencies: {
        runActingLoop: async () => {
          throw new Error("Intentional fallback failure.");
        },
      },
    });

    expect(finalState.status).toBe("failed");
    expect(finalState.finalResult).toContain("Intentional fallback failure.");
    expect(finalState.fallbackMode).toBe(true);
    expect(finalState.langSmithTrace).toEqual(trace);
    expect(langsmith.runWithLangSmithTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "shipyard.fallback-runtime",
        tags: expect.arrayContaining(["shipyard", "fallback-runtime", "code"]),
      }),
    );
  });

  it("graph runtime follows plan to act to respond when no edit occurs", async () => {
    const finalState = await runAgentRuntime(createInitialState(), {
      dependencies: {
        runActingLoop: async () => ({
          finalText: "Inspection complete without edits.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toBe("Inspection complete without edits.");
    expect(finalState.fallbackMode).toBe(false);
  });

  it("graph runtime carries checkpoint requests through to the final state without failing", async () => {
    const finalState = await runAgentRuntime(createInitialState(), {
      dependencies: {
        runActingLoop: async () => ({
          status: "continuation",
          finalText:
            "Shipyard reached the acting iteration limit of 25 and needs a checkpoint-backed continuation.",
          messageHistory: [],
          iterations: 25,
          didEdit: true,
          lastEditedFile: "src/app.ts",
          touchedFiles: ["src/app.ts", "src/routes.tsx"],
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toContain("checkpoint-backed continuation");
    expect(finalState.checkpointRequested).toBe(true);
    expect(finalState.touchedFiles).toEqual(["src/app.ts", "src/routes.tsx"]);
  });
});
