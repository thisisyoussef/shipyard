import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runShipyardLoop } from "../src/engine/loop.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import { createSessionState } from "../src/engine/state.js";
import type {
  ExecuteInstructionTurnOptions,
  InstructionTurnResult,
} from "../src/engine/turn.js";
import type {
  ExecutePlanningTurnOptions,
  PlanningTurnResult,
} from "../src/plans/turn.js";
import type {
  ExecuteTaskRunnerTurnOptions,
  TaskRunnerTurnResult,
} from "../src/plans/task-runner.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createTurnResult(
  options: Partial<InstructionTurnResult> & Pick<InstructionTurnResult, "finalText" | "status">,
): InstructionTurnResult {
  return {
    phaseName: "code",
    runtimeMode: "graph",
    taskPlan: {
      instruction: "test instruction",
      goal: "test instruction",
      targetFilePaths: [],
      plannedSteps: [],
    },
    executionSpec: null,
    planningMode: "lightweight",
    contextEnvelope: {
      stable: {
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
          "No supported local preview signal was detected for this target.",
        ),
      },
        projectRules: "",
        availableScripts: {},
      },
      task: {
        currentInstruction: "test instruction",
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
      browserEvaluationFailureKind: null,
      commandReadinessStatus: "none",
      commandReadyUrl: null,
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

class FakeReadline extends EventEmitter implements AsyncIterable<string> {
  private queuedResults: Array<IteratorResult<string>> = [];
  private pendingResolvers: Array<
    (result: IteratorResult<string>) => void
  > = [];

  promptCalls = 0;

  setPrompt(_prompt: string): void {
    // No-op for the test double.
  }

  prompt(): void {
    this.promptCalls += 1;
  }

  close(): void {
    this.finish();
  }

  pushLine(line: string): void {
    this.enqueue({
      done: false,
      value: line,
    });
  }

  finish(): void {
    this.enqueue({
      done: true,
      value: undefined,
    });
  }

  emitSigint(): void {
    this.emit("SIGINT");
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async () => {
        const nextResult = this.queuedResults.shift();

        if (nextResult) {
          return nextResult;
        }

        return await new Promise<IteratorResult<string>>((resolve) => {
          this.pendingResolvers.push(resolve);
        });
      },
    };
  }

  private enqueue(result: IteratorResult<string>): void {
    const nextResolver = this.pendingResolvers.shift();

    if (nextResolver) {
      nextResolver(result);
      return;
    }

    this.queuedResults.push(result);
  }
}

function createPlanningTurnResult(
  options: Partial<PlanningTurnResult> & Pick<PlanningTurnResult, "finalText" | "status">,
): PlanningTurnResult {
  return {
    phaseName: "code",
    runtimeMode: "graph",
    planningMode: "planner",
    contextEnvelope: {
      stable: {
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
            "No supported local preview signal was detected for this target.",
          ),
        },
        projectRules: "",
        availableScripts: {},
      },
      task: {
        currentInstruction: "test instruction",
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
    },
    executionSpec: {
      instruction: "Plan the queue",
      goal: "Persist a task queue",
      deliverables: ["Persist the queue"],
      acceptanceCriteria: ["Queue survives restarts"],
      verificationIntent: ["Run plan mode tests"],
      targetFilePaths: ["src/plans/store.ts"],
      risks: [],
    },
    loadedSpecRefs: [],
    plan: {
      planId: "plan-test",
      instruction: "Plan the queue",
      goal: "Persist a task queue",
      planningMode: "planner",
      createdAt: "2026-03-25T18:00:00.000Z",
      updatedAt: "2026-03-25T18:00:00.000Z",
      executionSpec: {
        instruction: "Plan the queue",
        goal: "Persist a task queue",
        deliverables: ["Persist the queue"],
        acceptanceCriteria: ["Queue survives restarts"],
        verificationIntent: ["Run plan mode tests"],
        targetFilePaths: ["src/plans/store.ts"],
        risks: [],
      },
      loadedSpecRefs: [],
      tasks: [
        {
          id: "task-1",
          description: "Persist the queue",
          status: "pending",
          targetFilePaths: ["src/plans/store.ts"],
        },
      ],
    },
    summary: options.finalText,
    langSmithTrace: null,
    ...options,
  };
}

describe("terminal loop interrupts", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("cancels an active turn on SIGINT and keeps the session alive for the next instruction", async () => {
    const targetDirectory = await createTempDirectory("shipyard-loop-runtime-");
    const sessionState = createSessionState({
      sessionId: "loop-runtime-session",
      targetDirectory,
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
          "No supported local preview signal was detected for this target.",
        ),
      },
    });
    const fakeReadline = new FakeReadline();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const executeTurn = vi.fn(
      async (
        options: ExecuteInstructionTurnOptions & {
          signal?: AbortSignal;
        },
      ): Promise<InstructionTurnResult> => {
        options.sessionState.turnCount += 1;

        if (options.sessionState.turnCount === 1) {
          return await new Promise<InstructionTurnResult>((resolve) => {
            const resolveCancelled = () => {
              resolve(
                createTurnResult({
                  status: "cancelled",
                  finalText:
                    "Turn 1 cancelled: Operator interrupted the active turn.",
                }),
              );
            };

            if (options.signal?.aborted) {
              resolveCancelled();
              return;
            }

            options.signal?.addEventListener("abort", resolveCancelled, {
              once: true,
            });
          });
        }

        return createTurnResult({
          status: "success",
          finalText: "Turn 2 completed.",
          summary: "Turn 2 completed successfully.",
        });
      },
    );

    const loopPromise = runShipyardLoop({
      sessionState,
      executeTurn,
      createReadlineInterface: () =>
        fakeReadline as unknown as ReturnType<typeof import("node:readline").createInterface>,
    });

    fakeReadline.pushLine("inspect the repo until I interrupt you");
    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(1);
    });

    fakeReadline.emitSigint();
    await vi.waitFor(() => {
      expect(fakeReadline.promptCalls).toBeGreaterThanOrEqual(2);
    });

    fakeReadline.pushLine("summarize the repo");
    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(2);
    });

    fakeReadline.pushLine("exit");
    await loopPromise;

    expect(executeTurn.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(sessionState.turnCount).toBe(2);
    expect(logSpy.mock.calls.flat()).toContain(
      "Interrupt requested. Waiting for Shipyard to stop the current turn...",
    );
    expect(logSpy.mock.calls.flat()).toContain("Turn 2 completed.");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("routes plan-prefixed instructions through the planning-only executor", async () => {
    const targetDirectory = await createTempDirectory("shipyard-loop-plan-");
    const sessionState = createSessionState({
      sessionId: "loop-plan-session",
      targetDirectory,
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
          "No supported local preview signal was detected for this target.",
        ),
      },
    });
    const fakeReadline = new FakeReadline();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const executeTurn = vi.fn(async (): Promise<InstructionTurnResult> => {
      throw new Error("Normal instruction executor should not run for plan mode.");
    });
    const executePlanTurn = vi.fn(
      async (
        options: ExecutePlanningTurnOptions,
      ): Promise<PlanningTurnResult> => {
        options.sessionState.turnCount += 1;

        return createPlanningTurnResult({
          finalText: `Saved plan for: ${options.instruction}`,
          status: "success",
        });
      },
    );

    const loopPromise = runShipyardLoop({
      sessionState,
      executeTurn,
      executePlanTurn,
      createReadlineInterface: () =>
        fakeReadline as unknown as ReturnType<typeof import("node:readline").createInterface>,
    });

    fakeReadline.pushLine("plan: break this feature into reviewable tasks");
    await vi.waitFor(() => {
      expect(executePlanTurn).toHaveBeenCalledTimes(1);
    });

    fakeReadline.pushLine("exit");
    await loopPromise;

    expect(executeTurn).not.toHaveBeenCalled();
    expect(executePlanTurn.mock.calls[0]?.[0].instruction).toBe(
      "plan: break this feature into reviewable tasks",
    );
    expect(logSpy.mock.calls.flat()).toContain(
      'Turn 1 planned in phase "code" via graph runtime.',
    );
    expect(logSpy.mock.calls.flat()).toContain(
      "Saved plan for: plan: break this feature into reviewable tasks",
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("records emitted handoff metadata in the local instruction trace", async () => {
    const targetDirectory = await createTempDirectory("shipyard-loop-handoff-");
    const sessionState = createSessionState({
      sessionId: "loop-handoff-session",
      targetDirectory,
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
          "No supported local preview signal was detected for this target.",
        ),
      },
    });
    const fakeReadline = new FakeReadline();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const executeTurn = vi.fn(async (): Promise<InstructionTurnResult> =>
      createTurnResult({
        status: "success",
        finalText: "Turn 1 completed with a handoff.",
        harnessRoute: {
          selectedPath: "planner-backed",
          usedExplorer: true,
          usedPlanner: true,
          usedVerifier: true,
          verificationMode: "command+browser",
          verificationCheckCount: 2,
          usedBrowserEvaluator: true,
          browserEvaluationStatus: "passed",
          browserEvaluationFailureKind: null,
          commandReadinessStatus: "none",
          commandReadyUrl: null,
          handoffLoaded: false,
          handoffEmitted: true,
          handoffReason: "iteration-threshold",
          checkpointRequested: true,
          continuationCount: 0,
          actingLoopBudget: 45,
          actingLoopBudgetReason: "broad-continuation",
          firstHardFailure: null,
        },
        handoff: {
          loaded: null,
          loadError: null,
          emitted: {
            artifactPath:
              ".shipyard/artifacts/loop-handoff-session/turn-1.handoff.json",
            handoff: {
              version: 1,
              sessionId: "loop-handoff-session",
              turnCount: 1,
              createdAt: "2026-03-25T21:30:00.000Z",
              instruction: "Long-running task",
              phaseName: "code",
              runtimeMode: "graph",
              status: "success",
              summary: "Turn 1 completed with a handoff.",
              goal: "Long-running task",
              completedWork: ["Captured the implementation goal."],
              remainingWork: ["Resume in a fresh turn to finish the remaining task plan safely."],
              touchedFiles: ["src/app.ts"],
              blockedFiles: [],
              latestEvaluation: null,
              nextRecommendedAction:
                "Resume from the handoff before making additional edits.",
              resetReason: {
                kind: "iteration-threshold",
                summary:
                  "The acting loop crossed the long-run iteration threshold.",
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
                instruction: "Long-running task",
                goal: "Long-running task",
                targetFilePaths: ["src/app.ts"],
                plannedSteps: [],
              },
            },
          },
        },
      }));

    const loopPromise = runShipyardLoop({
      sessionState,
      executeTurn,
      createReadlineInterface: () =>
        fakeReadline as unknown as ReturnType<typeof import("node:readline").createInterface>,
    });

    fakeReadline.pushLine("keep going on the long task");
    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(1);
    });
    fakeReadline.pushLine("exit");
    await loopPromise;

    const traceContents = await readFile(
      path.join(
        targetDirectory,
        ".shipyard",
        "traces",
        "loop-handoff-session.jsonl",
      ),
      "utf8",
    );

    expect(traceContents).toContain('"event":"instruction.plan"');
    expect(traceContents).toContain('"handoff"');
    expect(traceContents).toContain('"harnessRoute"');
    expect(traceContents).toContain('"verificationMode":"command+browser"');
    expect(traceContents).toContain('"usedBrowserEvaluator":true');
    expect(traceContents).toContain(
      '".shipyard/artifacts/loop-handoff-session/turn-1.handoff.json"',
    );
    expect(traceContents).toContain('"iteration-threshold"');
    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("routes next and continue through the task-runner executor", async () => {
    const targetDirectory = await createTempDirectory("shipyard-loop-task-runner-");
    const sessionState = createSessionState({
      sessionId: "loop-task-runner-session",
      targetDirectory,
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
          "No supported local preview signal was detected for this target.",
        ),
      },
    });
    const fakeReadline = new FakeReadline();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const executeTurn = vi.fn(async (): Promise<InstructionTurnResult> => {
      throw new Error(
        "Normal instruction executor should not run for task-runner commands.",
      );
    });
    const executeTaskTurn = vi.fn(
      async (
        options: ExecuteTaskRunnerTurnOptions,
      ): Promise<TaskRunnerTurnResult> => {
        options.sessionState.turnCount += 1;

        return {
          phaseName: "code",
          runtimeMode: "graph",
          planningMode: "lightweight",
          contextEnvelope: null,
          taskPlan: null,
          executionSpec: null,
          status: "success",
          summary: `Handled ${options.instruction}`,
          finalText: `Handled ${options.instruction}`,
          selectedTargetPath: null,
          langSmithTrace: null,
          plan: null,
          planId: "plan-test",
          taskId: options.instruction === "next" ? "task-1" : "task-2",
          route: options.instruction === "next"
            ? "next-pending"
            : "continue-fallback",
          command: options.instruction === "next" ? "next" : "continue",
          loadedSpecRefs: [],
          taskTransition: null,
        };
      },
    );

    const loopPromise = runShipyardLoop({
      sessionState,
      executeTurn,
      executeTaskTurn,
      createReadlineInterface: () =>
        fakeReadline as unknown as ReturnType<typeof import("node:readline").createInterface>,
    });

    fakeReadline.pushLine("next");
    await vi.waitFor(() => {
      expect(executeTaskTurn).toHaveBeenCalledTimes(1);
    });

    fakeReadline.pushLine("continue");
    await vi.waitFor(() => {
      expect(executeTaskTurn).toHaveBeenCalledTimes(2);
    });

    fakeReadline.pushLine("exit");
    await loopPromise;

    expect(executeTurn).not.toHaveBeenCalled();
    expect(executeTaskTurn.mock.calls[0]?.[0].instruction).toBe("next");
    expect(executeTaskTurn.mock.calls[1]?.[0].instruction).toBe("continue");
    expect(logSpy.mock.calls.flat()).toContain("Handled next");
    expect(logSpy.mock.calls.flat()).toContain("Handled continue");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
