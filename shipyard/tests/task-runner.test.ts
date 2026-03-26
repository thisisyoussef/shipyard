import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ExecuteInstructionTurnOptions,
  InstructionTurnResult,
} from "../src/engine/turn.js";
import { createInstructionRuntimeState } from "../src/engine/turn.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import {
  createSessionState,
  loadSessionState,
} from "../src/engine/state.js";
import {
  executeTaskRunnerTurn,
} from "../src/plans/task-runner.js";
import {
  loadPlanTaskQueue,
  savePlanTaskQueue,
} from "../src/plans/store.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery() {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
    },
    hasReadme: true,
    hasAgentsMd: false,
    topLevelFiles: ["package.json"],
    topLevelDirectories: ["src", "docs"],
    projectName: "shipyard-task-runner",
    previewCapability: createUnavailablePreviewCapability(
      "No supported local preview signal was detected for this target.",
    ),
  };
}

function createExecutionSpec() {
  return {
    instruction: "Implement the queued plan tasks.",
    goal: "Step through the saved task queue one task at a time.",
    deliverables: [
      "Implement the first deliverable.",
      "Implement the second deliverable.",
    ],
    acceptanceCriteria: [
      "The selected plan task runs through the normal instruction path.",
      "Plan task status transitions are persisted.",
    ],
    verificationIntent: [
      "Run the focused task-runner tests.",
    ],
    targetFilePaths: [
      "src/plans/store.ts",
      "src/engine/state.ts",
    ],
    risks: [
      "The runner could lose task focus across turns.",
    ],
  };
}

function createInstructionTurnResult(
  options: Partial<InstructionTurnResult> & Pick<InstructionTurnResult, "status" | "finalText">,
): InstructionTurnResult {
  return {
    phaseName: "code",
    runtimeMode: "graph",
    taskPlan: {
      instruction: "Implement the selected plan task.",
      goal: "Implement the selected plan task.",
      targetFilePaths: ["src/plans/store.ts"],
      plannedSteps: [
        "Inspect the queued task context before editing.",
      ],
    },
    executionSpec: null,
    planningMode: "lightweight",
    contextEnvelope: {
      stable: {
        discovery: createDiscovery(),
        projectRules: "",
        availableScripts: {
          test: "vitest run",
        },
      },
      task: {
        currentInstruction: "Implement the selected plan task.",
        injectedContext: [],
        targetFilePaths: ["src/plans/store.ts"],
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
    },
    summary: options.finalText,
    selectedTargetPath: null,
    langSmithTrace: null,
    harnessRoute: {
      selectedPath: "lightweight",
      usedExplorer: false,
      usedPlanner: false,
      usedVerifier: false,
      verificationMode: "none",
      verificationCheckCount: 0,
      usedBrowserEvaluator: false,
      browserEvaluationStatus: "not_run",
      handoffLoaded: false,
      handoffEmitted: false,
      handoffReason: null,
      checkpointRequested: false,
      continuationCount: 0,
      actingLoopBudget: 25,
      actingLoopBudgetReason: "narrow-default",
      firstHardFailure: null,
    },
    handoff: {
      loaded: null,
      loadError: null,
      emitted: null,
    },
    ...options,
  };
}

describe("task runner", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("runs the first pending task for next, preloads specs, and persists the task as done", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-runner-next-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "shipyard-task-runner" }, null, 2),
      "utf8",
    );
    await mkdir(path.join(targetDirectory, "docs/specs"), { recursive: true });
    await writeFile(
      path.join(targetDirectory, "docs/specs/feature-spec.md"),
      "# Feature Spec\n\nUse plan mode before writing code.\n",
      "utf8",
    );

    const sessionState = createSessionState({
      sessionId: "task-runner-next-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [],
    });
    const executionSpec = createExecutionSpec();
    const plan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      loadedSpecRefs: ["spec:docs/specs/feature-spec"],
      loadedSpecs: [
        {
          ref: "spec:docs/specs/feature-spec",
          path: "docs/specs/feature-spec.md",
        },
      ],
      tasks: [
        {
          id: "task-1",
          description: "Implement the first deliverable.",
          status: "pending",
          targetFilePaths: ["src/plans/store.ts"],
          specRefs: ["spec:docs/specs/feature-spec"],
        },
        {
          id: "task-2",
          description: "Implement the second deliverable.",
          status: "pending",
          targetFilePaths: ["src/engine/state.ts"],
        },
      ],
    });
    sessionState.activePlanId = plan.planId;

    const executeTurn = vi.fn(
      async (
        options: ExecuteInstructionTurnOptions,
      ): Promise<InstructionTurnResult> => {
        expect(options.instruction).toContain("Implement the first deliverable.");
        expect(options.instruction).toContain("src/plans/store.ts");
        expect(options.injectedContext?.join("\n")).toContain(
          "spec:docs/specs/feature-spec",
        );
        expect(options.injectedContext?.join("\n")).toContain(
          "Use plan mode before writing code.",
        );
        expect(options.sessionState.activeTask).toMatchObject({
          planId: plan.planId,
          taskId: "task-1",
          status: "in_progress",
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Implemented the first deliverable.",
        });
      },
    );

    const result = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "next",
      executeTurn,
    });

    expect(result.status).toBe("success");
    expect(result.route).toBe("next-pending");
    expect(result.planId).toBe(plan.planId);
    expect(result.taskId).toBe("task-1");
    expect(result.loadedSpecRefs).toEqual(["spec:docs/specs/feature-spec"]);
    expect(result.finalText).toContain("task-1");
    expect(result.finalText).toContain("Implemented the first deliverable.");

    const savedPlan = await loadPlanTaskQueue(targetDirectory, plan.planId);
    expect(savedPlan?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        status: "done",
        summary: expect.stringContaining("Implemented the first deliverable."),
      }),
      expect.objectContaining({
        id: "task-2",
        status: "pending",
      }),
    ]);
    expect(sessionState.activeTask).toBeNull();
    await expect(
      loadSessionState(targetDirectory, sessionState.sessionId),
    ).resolves.toMatchObject({
      activePlanId: plan.planId,
      activeTask: null,
    });
  });

  it("resumes the current in-progress task for continue even when the session was reloaded", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-runner-continue-");
    const sessionState = createSessionState({
      sessionId: "task-runner-continue-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [],
    });
    const executionSpec = createExecutionSpec();
    const plan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      tasks: [
        {
          id: "task-1",
          description: "Finish the in-progress task.",
          status: "in_progress",
          targetFilePaths: ["src/plans/store.ts"],
        },
        {
          id: "task-2",
          description: "Leave the follow-up task pending.",
          status: "pending",
        },
      ],
    });
    sessionState.activePlanId = plan.planId;

    const executeTurn = vi.fn(
      async (
        options: ExecuteInstructionTurnOptions,
      ): Promise<InstructionTurnResult> => {
        expect(options.instruction).toContain("Finish the in-progress task.");
        expect(options.sessionState.activeTask).toMatchObject({
          planId: plan.planId,
          taskId: "task-1",
          status: "in_progress",
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Resumed task finished successfully.",
        });
      },
    );

    const result = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "continue",
      executeTurn,
    });

    expect(result.route).toBe("continue-in-progress");
    expect(result.finalText).toContain("Resuming");
    expect(result.finalText).toContain("task-1");
    expect(executeTurn).toHaveBeenCalledTimes(1);

    const savedPlan = await loadPlanTaskQueue(targetDirectory, plan.planId);
    expect(savedPlan?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        status: "done",
      }),
      expect.objectContaining({
        id: "task-2",
        status: "pending",
      }),
    ]);
  });

  it("falls back to the next pending task for continue when nothing is currently in progress", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-runner-fallback-");
    const sessionState = createSessionState({
      sessionId: "task-runner-fallback-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [],
    });
    const executionSpec = createExecutionSpec();
    const plan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      tasks: [
        {
          id: "task-1",
          description: "The previous task failed and should stay failed.",
          status: "failed",
          summary: "Verification failed on the previous turn.",
        },
        {
          id: "task-2",
          description: "Pick up the next pending task.",
          status: "pending",
          targetFilePaths: ["src/engine/state.ts"],
        },
      ],
    });
    sessionState.activePlanId = plan.planId;
    sessionState.activeTask = {
      planId: plan.planId,
      taskId: "task-1",
      title: "The previous task failed and should stay failed.",
      instruction: "Retry the failed task.",
      goal: plan.goal,
      checklist: ["Review the failure summary before retrying."],
      targetFilePaths: [],
      specRefs: [],
      status: "failed",
      startedAt: "2026-03-25T18:10:00.000Z",
      updatedAt: "2026-03-25T18:10:00.000Z",
      summary: "Verification failed on the previous turn.",
    };

    const executeTurn = vi.fn(
      async (): Promise<InstructionTurnResult> =>
        createInstructionTurnResult({
          status: "success",
          finalText: "Completed the next pending task.",
        }),
    );

    const result = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "continue",
      executeTurn,
    });

    expect(result.route).toBe("continue-fallback");
    expect(result.taskId).toBe("task-2");
    expect(result.finalText).toContain("No in-progress task was found");
    expect(result.finalText).toContain("task-2");

    const savedPlan = await loadPlanTaskQueue(targetDirectory, plan.planId);
    expect(savedPlan?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        status: "failed",
      }),
      expect.objectContaining({
        id: "task-2",
        status: "done",
      }),
    ]);
  });

  it("marks the selected task failed and preserves the failure summary when execution stops with an error", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-runner-error-");
    const sessionState = createSessionState({
      sessionId: "task-runner-error-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [],
    });
    const executionSpec = createExecutionSpec();
    const plan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      tasks: [
        {
          id: "task-1",
          description: "Fail during verification.",
          status: "pending",
        },
      ],
    });
    sessionState.activePlanId = plan.planId;

    const executeTurn = vi.fn(
      async (): Promise<InstructionTurnResult> =>
        createInstructionTurnResult({
          status: "error",
          finalText: "Turn 1 stopped: Verification failed for the selected task.",
          summary: "Verification failed for the selected task.",
        }),
    );

    const result = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "next",
      executeTurn,
    });

    expect(result.status).toBe("error");
    expect(result.taskId).toBe("task-1");

    const savedPlan = await loadPlanTaskQueue(targetDirectory, plan.planId);
    expect(savedPlan?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        status: "failed",
        summary: expect.stringContaining("Verification failed"),
      }),
    ]);
    expect(sessionState.activeTask).toMatchObject({
      taskId: "task-1",
      status: "failed",
      summary: expect.stringContaining("Verification failed"),
    });
  });

  it("fails clearly when a referenced spec file is missing and leaves plan state untouched", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-runner-missing-spec-");
    const sessionState = createSessionState({
      sessionId: "task-runner-missing-spec-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [],
    });
    const executionSpec = createExecutionSpec();
    const plan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      loadedSpecRefs: ["spec:docs/specs/missing-spec"],
      loadedSpecs: [
        {
          ref: "spec:docs/specs/missing-spec",
          path: "docs/specs/missing-spec.md",
        },
      ],
      tasks: [
        {
          id: "task-1",
          description: "Try to load the missing spec.",
          status: "pending",
          specRefs: ["spec:docs/specs/missing-spec"],
        },
      ],
    });
    sessionState.activePlanId = plan.planId;

    const executeTurn = vi.fn(async (): Promise<InstructionTurnResult> => {
      throw new Error("Normal instruction execution should not start.");
    });

    const result = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "next",
      executeTurn,
    });

    expect(result.status).toBe("error");
    expect(result.finalText).toContain("Path not found");
    expect(executeTurn).not.toHaveBeenCalled();

    const savedPlan = await loadPlanTaskQueue(targetDirectory, plan.planId);
    expect(savedPlan?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        status: "pending",
      }),
    ]);
    expect(sessionState.activeTask).toBeNull();
  });

  it("returns a clear operator message when there is no active plan or no remaining actionable tasks", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-runner-empty-");
    const sessionState = createSessionState({
      sessionId: "task-runner-empty-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [],
    });
    const executeTurn = vi.fn(async (): Promise<InstructionTurnResult> => {
      throw new Error("Normal instruction execution should not start.");
    });

    const noPlanResult = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "next",
      executeTurn,
    });
    expect(noPlanResult.status).toBe("success");
    expect(noPlanResult.finalText).toContain("No active plan");
    expect(executeTurn).not.toHaveBeenCalled();

    const executionSpec = createExecutionSpec();
    const completedPlan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      tasks: [
        {
          id: "task-1",
          description: "Already completed work.",
          status: "done",
          summary: "Implemented already.",
        },
      ],
    });
    sessionState.activePlanId = completedPlan.planId;

    const completedResult = await executeTaskRunnerTurn({
      sessionState,
      runtimeState,
      instruction: "continue",
      executeTurn,
    });
    expect(completedResult.status).toBe("success");
    expect(completedResult.finalText).toContain("complete");
    expect(completedResult.finalText).toContain(completedPlan.planId);
    expect(executeTurn).not.toHaveBeenCalled();
  });
});
