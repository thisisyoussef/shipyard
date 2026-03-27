import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { abortTurn } from "../src/engine/cancellation.js";
import { createSessionState } from "../src/engine/state.js";
import {
  createInstructionRuntimeState,
  type DoneEvent,
  type InstructionTurnResult,
  type TurnStateEvent,
} from "../src/engine/turn.js";
import {
  createUltimateModeController,
  executeUltimateMode,
  formatUltimateModeStatus,
  parseUltimateModeCommand,
} from "../src/engine/ultimate-mode.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscoveryReport() {
  return {
    isGreenfield: true,
    language: null,
    framework: null,
    packageManager: null,
    scripts: {},
    hasReadme: false,
    hasAgentsMd: false,
    topLevelFiles: [],
    topLevelDirectories: [],
    projectName: "ultimate-mode-test",
    previewCapability: createUnavailablePreviewCapability(
      "No preview is configured for this test target.",
    ),
  };
}

function createTurnResult(
  options: Partial<InstructionTurnResult> & Pick<InstructionTurnResult, "status" | "summary" | "finalText">,
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
        discovery: createDiscoveryReport(),
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
    selectedTargetPath: null,
    langSmithTrace: null,
    executionFingerprint: {
      surface: "cli",
      phase: "code",
      planningMode: "lightweight",
      targetProfile: "no",
      preview: "no",
      previewStatus: "idle",
      browserEval: "no",
      browserEvaluationStatus: "not_run",
      model: "anthropic/claude-opus-4-6",
      modelProvider: "anthropic",
      modelName: "claude-opus-4-6",
    },
    harnessRoute: {
      selectedPath: "lightweight",
      actingMode: "raw-loop",
      taskComplexity: "direct",
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

describe("ultimate mode", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("parses the start, status, feedback, and stop commands", () => {
    expect(parseUltimateModeCommand("ultimate make the dashboard denser")).toEqual({
      type: "start",
      brief: "make the dashboard denser",
    });
    expect(parseUltimateModeCommand("ultimate start improve the empty state")).toEqual({
      type: "start",
      brief: "improve the empty state",
    });
    expect(parseUltimateModeCommand("ultimate feedback tighten the CTA copy")).toEqual({
      type: "feedback",
      feedback: "tighten the CTA copy",
    });
    expect(parseUltimateModeCommand("ultimate stop")).toEqual({
      type: "stop",
    });
    expect(parseUltimateModeCommand("ultimate")).toEqual({
      type: "status",
    });
  });

  it("tracks queued human feedback and formats status text", () => {
    const controller = createUltimateModeController("Build the command palette.");

    controller.enqueueHumanFeedback("Make the search results denser.");

    expect(formatUltimateModeStatus(controller)).toContain("Ultimate mode is active.");
    expect(formatUltimateModeStatus(controller)).toContain("Pending human feedback: 1");
    expect(controller.drainHumanFeedback()).toHaveLength(1);
    expect(formatUltimateModeStatus(null)).toBe("Ultimate mode is idle.");
  });

  it("keeps looping, folds queued human feedback into the next cycle, and stops on interrupt", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ultimate-mode-");
    const sessionState = createSessionState({
      sessionId: "ultimate-mode-session",
      targetDirectory,
      discovery: createDiscoveryReport(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Prefer concise, high-signal prompts.",
    });
    const controller = createUltimateModeController("Build the dashboard.");
    const abortController = new AbortController();
    const seenSimulatorInputs: Array<{
      iteration: number;
      initialHumanContext: string[] | undefined;
      pendingHumanFeedback: string[];
      latestTurnStatus: string | null;
    }> = [];
    const turnStates: TurnStateEvent[] = [];
    const doneEvents: DoneEvent[] = [];
    const thinkingMessages: string[] = [];

    const executeTurn = vi.fn(
      async (options): Promise<InstructionTurnResult> => {
        options.sessionState.turnCount += 1;

        if (options.sessionState.turnCount === 1) {
          controller.enqueueHumanFeedback("Real human: tighten the card spacing.");

          return createTurnResult({
            status: "error",
            summary: "The first attempt failed its checks.",
            finalText: "Turn 1 stopped: The first attempt failed its checks.",
            taskPlan: {
              instruction: options.instruction,
              goal: options.instruction,
              targetFilePaths: [],
              plannedSteps: [],
            },
          });
        }

        abortTurn(abortController, "Human stopped ultimate mode.");

        return createTurnResult({
          status: "cancelled",
          summary: "Human stopped ultimate mode.",
          finalText: "Turn 2 cancelled: Human stopped ultimate mode.",
          taskPlan: {
            instruction: options.instruction,
            goal: options.instruction,
            targetFilePaths: [],
            plannedSteps: [],
          },
        });
      },
    );

    const result = await executeUltimateMode({
      sessionState,
      runtimeState,
      brief: "Build the dashboard.",
      injectedContext: ["Use the uploaded mock as the visual anchor."],
      controller,
      signal: abortController.signal,
      reporter: {
        onTurnState(event) {
          turnStates.push(event);
        },
        onDone(event) {
          doneEvents.push(event);
        },
        onThinking(message) {
          thinkingMessages.push(message);
        },
      },
      dependencies: {
        async runHumanSimulator(input) {
          seenSimulatorInputs.push({
            iteration: input.iteration,
            initialHumanContext: input.initialHumanContext,
            pendingHumanFeedback:
              input.pendingHumanFeedback?.map((entry) => entry.text) ?? [],
            latestTurnStatus: input.latestTurn?.status ?? null,
          });

          return {
            summary: `Cycle ${String(input.iteration)} review complete.`,
            instruction: `Cycle ${String(input.iteration)} instruction.`,
            focusAreas: [],
          };
        },
        executeTurn,
      },
    });

    expect(result.status).toBe("cancelled");
    expect(result.iterations).toBe(2);
    expect(result.history).toHaveLength(2);
    expect(executeTurn).toHaveBeenCalledTimes(2);
    expect(seenSimulatorInputs).toEqual([
      {
        iteration: 1,
        initialHumanContext: ["Use the uploaded mock as the visual anchor."],
        pendingHumanFeedback: [],
        latestTurnStatus: null,
      },
      {
        iteration: 2,
        initialHumanContext: ["Use the uploaded mock as the visual anchor."],
        pendingHumanFeedback: ["Real human: tighten the card spacing."],
        latestTurnStatus: "error",
      },
    ]);
    expect(turnStates[0]?.connectionState).toBe("agent-busy");
    expect(turnStates.at(-1)?.connectionState).toBe("ready");
    expect(doneEvents.at(-1)).toMatchObject({
      status: "cancelled",
      summary: expect.stringContaining("Ultimate mode stopped by human interrupt"),
    });
    expect(thinkingMessages).toContain(
      "Ultimate mode activated. Shipyard and the human simulator will keep handing work back and forth until you interrupt them.",
    );
  });

  it("rotates the live turn callback every configured number of cycles", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ultimate-rotation-");
    const sessionState = createSessionState({
      sessionId: "ultimate-mode-rotation-session",
      targetDirectory,
      discovery: createDiscoveryReport(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep the live transcript lean.",
    });
    const onCycleRotation = vi.fn();
    let completedTurns = 0;

    const result = await executeUltimateMode({
      sessionState,
      runtimeState,
      brief: "Keep improving the dashboard.",
      cycleRotationInterval: 2,
      onCycleRotation,
      dependencies: {
        async runHumanSimulator(input) {
          return {
            summary: `Cycle ${String(input.iteration)} reviewed.`,
            instruction: `Cycle ${String(input.iteration)} instruction.`,
            focusAreas: [],
          };
        },
        async executeTurn(options) {
          completedTurns += 1;

          return createTurnResult({
            status: completedTurns >= 3 ? "cancelled" : "success",
            summary:
              completedTurns >= 3
                ? "Human stopped ultimate mode."
                : `Cycle ${String(completedTurns)} completed.`,
            finalText:
              completedTurns >= 3
                ? "Turn cancelled."
                : `Turn ${String(completedTurns)} completed.`,
            taskPlan: {
              instruction: options.instruction,
              goal: options.instruction,
              targetFilePaths: [],
              plannedSteps: [],
            },
          });
        },
      },
    });

    expect(result.status).toBe("cancelled");
    expect(result.iterations).toBe(3);
    expect(onCycleRotation).toHaveBeenCalledTimes(1);
    expect(onCycleRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        iteration: 2,
        simulatorDecision: expect.objectContaining({
          instruction: "Cycle 2 instruction.",
        }),
        turnResult: expect.objectContaining({
          status: "success",
          summary: "Cycle 2 completed.",
        }),
      }),
    );
  });
});
