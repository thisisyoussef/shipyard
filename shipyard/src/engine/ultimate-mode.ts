import { nanoid } from "nanoid";

import type { RuntimeSurface } from "./turn-fingerprint.js";
import type { SessionState } from "./state.js";
import {
  createModelAdapterForRoute,
  HUMAN_SIMULATOR_MODEL_ROUTE,
} from "./model-routing.js";
import {
  getTurnCancellationReason,
  toTurnCancelledError,
} from "./cancellation.js";
import {
  executeInstructionTurn,
  type ExecuteInstructionTurnOptions,
  type InstructionRuntimeState,
  type InstructionTurnReporter,
  type InstructionTurnResult,
} from "./turn.js";
import {
  runHumanSimulator,
  type HumanSimulatorDecision,
  type HumanSimulatorFeedback,
  type HumanSimulatorHistoryEntry,
  type HumanSimulatorInput,
  type HumanSimulatorLogger,
  type HumanSimulatorTurnReview,
} from "../agents/human-simulator.js";

const MAX_ULTIMATE_MODE_HISTORY_ITEMS = 24;

export interface UltimateModeStartCommand {
  type: "start";
  brief: string;
}

export interface UltimateModeFeedbackCommand {
  type: "feedback";
  feedback: string;
}

export interface UltimateModeStopCommand {
  type: "stop";
}

export interface UltimateModeStatusCommand {
  type: "status";
}

export type UltimateModeCommand =
  | UltimateModeStartCommand
  | UltimateModeFeedbackCommand
  | UltimateModeStopCommand
  | UltimateModeStatusCommand;

export interface UltimateModeFeedbackEntry extends HumanSimulatorFeedback {
  id: string;
}

export interface UltimateModeController {
  readonly initialBrief: string;
  readonly startedAt: string;
  enqueueHumanFeedback: (text: string) => UltimateModeFeedbackEntry;
  drainHumanFeedback: () => UltimateModeFeedbackEntry[];
  getPendingHumanFeedback: () => UltimateModeFeedbackEntry[];
}

export interface UltimateModeResult {
  status: "success" | "cancelled" | "error";
  summary: string;
  finalText: string;
  iterations: number;
  history: HumanSimulatorHistoryEntry[];
  lastTurn: InstructionTurnResult | null;
}

export interface ExecuteUltimateModeDependencies {
  runHumanSimulator?: (
    input: HumanSimulatorInput,
    targetDirectory: string,
  ) => Promise<HumanSimulatorDecision>;
  executeTurn?: (
    options: ExecuteInstructionTurnOptions,
  ) => Promise<InstructionTurnResult>;
}

export interface ExecuteUltimateModeOptions {
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  brief: string;
  injectedContext?: string[];
  controller?: UltimateModeController;
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
  runtimeSurface?: RuntimeSurface;
  dependencies?: ExecuteUltimateModeDependencies;
}

function ensureNonBlankText(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} must not be blank.`);
  }

  return trimmed;
}

function formatCycleCount(iterations: number): string {
  return `${String(iterations)} cycle${iterations === 1 ? "" : "s"}`;
}

function createSilentLogger(): HumanSimulatorLogger {
  return {
    log() {},
  };
}

function rememberRecentHistoryEntry(
  history: HumanSimulatorHistoryEntry[],
  entry: HumanSimulatorHistoryEntry,
): void {
  history.push(entry);

  while (history.length > MAX_ULTIMATE_MODE_HISTORY_ITEMS) {
    history.shift();
  }
}

function createHumanSimulatorTurnReview(
  instruction: string,
  turnResult: InstructionTurnResult,
): HumanSimulatorTurnReview {
  return {
    instruction,
    status: turnResult.status,
    summary: turnResult.summary,
    finalText: turnResult.finalText,
    taskPlan: turnResult.taskPlan,
    executionSpec: turnResult.executionSpec,
    harnessRoute: turnResult.harnessRoute,
    verificationReport: null,
    selectedTargetPath: turnResult.selectedTargetPath,
  };
}

function createUltimateModeInnerReporter(
  reporter: InstructionTurnReporter | undefined,
): InstructionTurnReporter | undefined {
  if (!reporter) {
    return undefined;
  }

  return {
    onThinking: reporter.onThinking,
    onToolCall: reporter.onToolCall,
    onToolResult: reporter.onToolResult,
    onEdit: reporter.onEdit,
    onText: reporter.onText,
    onTurnState(event) {
      if (event.connectionState === "agent-busy") {
        return reporter.onTurnState?.(event);
      }

      return undefined;
    },
  };
}

function createDefaultHumanSimulatorRunner(
  runtimeState: InstructionRuntimeState,
  signal?: AbortSignal,
): NonNullable<ExecuteUltimateModeDependencies["runHumanSimulator"]> {
  return async (input, targetDirectory) => {
    const selection = createModelAdapterForRoute({
      routing: runtimeState.modelRouting,
      routeId: HUMAN_SIMULATOR_MODEL_ROUTE,
      env: runtimeState.modelRoutingEnv,
    });

    return await runHumanSimulator(input, targetDirectory, {
      modelAdapter: selection.modelAdapter,
      model: selection.model ?? undefined,
      logger: createSilentLogger(),
      signal,
      temperature: 0,
    });
  };
}

function createCancelledResult(
  iterations: number,
  reason: string,
  history: HumanSimulatorHistoryEntry[],
  lastTurn: InstructionTurnResult | null,
): UltimateModeResult {
  const finalText =
    `Ultimate mode stopped by human interrupt after ${formatCycleCount(iterations)}. ` +
    reason;

  return {
    status: "cancelled",
    summary: finalText,
    finalText,
    iterations,
    history: [...history],
    lastTurn,
  };
}

function createErrorResult(
  iterations: number,
  message: string,
  history: HumanSimulatorHistoryEntry[],
  lastTurn: InstructionTurnResult | null,
): UltimateModeResult {
  const finalText =
    `Ultimate mode stopped after ${formatCycleCount(iterations)} because of an internal error. ` +
    message;

  return {
    status: "error",
    summary: finalText,
    finalText,
    iterations,
    history: [...history],
    lastTurn,
  };
}

async function emitUltimateModeOutcome(
  reporter: InstructionTurnReporter | undefined,
  sessionState: SessionState,
  result: UltimateModeResult,
): Promise<void> {
  await reporter?.onText?.(result.finalText);

  if (result.status === "error") {
    await reporter?.onError?.(result.summary);
  }

  await reporter?.onDone?.({
    status: result.status,
    summary: result.summary,
    langSmithTrace: result.lastTurn?.langSmithTrace ?? null,
    executionFingerprint: result.lastTurn?.executionFingerprint ?? null,
  });
  await reporter?.onTurnState?.({
    sessionState,
    connectionState: result.status === "error" ? "error" : "ready",
  });
}

export function parseUltimateModeCommand(
  value: string,
): UltimateModeCommand | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (!lower.startsWith("ultimate")) {
    return null;
  }

  const rest = trimmed.slice("ultimate".length).trim();
  const lowerRest = rest.toLowerCase();

  if (!rest || lowerRest === "status") {
    return {
      type: "status",
    };
  }

  if (lowerRest === "stop") {
    return {
      type: "stop",
    };
  }

  if (lowerRest.startsWith("feedback ")) {
    const feedback = rest.slice("feedback".length).trim();

    if (!feedback) {
      return null;
    }

    return {
      type: "feedback",
      feedback,
    };
  }

  if (lowerRest.startsWith("start ")) {
    const brief = rest.slice("start".length).trim();

    if (!brief) {
      return null;
    }

    return {
      type: "start",
      brief,
    };
  }

  return {
    type: "start",
    brief: rest,
  };
}

export function createUltimateModeController(
  initialBrief: string,
): UltimateModeController {
  const normalizedBrief = ensureNonBlankText(initialBrief, "Ultimate mode brief");
  const startedAt = new Date().toISOString();
  const pendingHumanFeedback: UltimateModeFeedbackEntry[] = [];

  return {
    initialBrief: normalizedBrief,
    startedAt,
    enqueueHumanFeedback(text) {
      const feedback = ensureNonBlankText(text, "Ultimate mode feedback");
      const entry: UltimateModeFeedbackEntry = {
        id: nanoid(),
        text: feedback,
        submittedAt: new Date().toISOString(),
      };

      pendingHumanFeedback.push(entry);

      return entry;
    },
    drainHumanFeedback() {
      return pendingHumanFeedback.splice(0, pendingHumanFeedback.length);
    },
    getPendingHumanFeedback() {
      return [...pendingHumanFeedback];
    },
  };
}

export function formatUltimateModeStatus(
  controller: UltimateModeController | null,
): string {
  if (!controller) {
    return "Ultimate mode is idle.";
  }

  const pendingFeedback = controller.getPendingHumanFeedback();

  return [
    "Ultimate mode is active.",
    `Started: ${controller.startedAt}`,
    `Pending human feedback: ${String(pendingFeedback.length)}`,
    `Brief: ${controller.initialBrief}`,
  ].join("\n");
}

export async function executeUltimateMode(
  options: ExecuteUltimateModeOptions,
): Promise<UltimateModeResult> {
  const brief = ensureNonBlankText(options.brief, "Ultimate mode brief");
  const controller = options.controller ?? createUltimateModeController(brief);
  const sessionState = options.sessionState;
  const runtimeState = options.runtimeState;
  const reporter = options.reporter;
  const signal = options.signal;
  const history: HumanSimulatorHistoryEntry[] = [];
  const innerReporter = createUltimateModeInnerReporter(reporter);
  const runHumanSimulatorTurn =
    options.dependencies?.runHumanSimulator
    ?? createDefaultHumanSimulatorRunner(runtimeState, signal);
  const executeTurn =
    options.dependencies?.executeTurn
    ?? executeInstructionTurn;
  const initialHumanContext = [...(options.injectedContext ?? [])];
  let latestTurn: InstructionTurnResult | null = null;
  let iteration = 0;

  await reporter?.onTurnState?.({
    sessionState,
    connectionState: "agent-busy",
  });
  await reporter?.onThinking?.(
    "Ultimate mode activated. Shipyard and the human simulator will keep handing work back and forth until you interrupt them.",
  );

  try {
    while (true) {
      const cancellationReason = getTurnCancellationReason(signal);

      if (cancellationReason) {
        const result = createCancelledResult(
          iteration,
          cancellationReason,
          history,
          latestTurn,
        );

        await emitUltimateModeOutcome(reporter, sessionState, result);
        return result;
      }

      const pendingHumanFeedback = controller.drainHumanFeedback();

      if (pendingHumanFeedback.length > 0) {
        await reporter?.onThinking?.(
          `Queued human feedback received. Folding ${String(pendingHumanFeedback.length)} item(s) into the next ultimate mode cycle.`,
        );
      }

      const latestTurnReview = latestTurn === null
        ? null
        : (
          history.at(-1)?.turn
          ?? createHumanSimulatorTurnReview(
            latestTurn.taskPlan.instruction,
            latestTurn,
          )
        );
      const decision = await runHumanSimulatorTurn(
        {
          originalBrief: controller.initialBrief,
          initialHumanContext,
          iteration: iteration + 1,
          discovery: sessionState.discovery,
          targetProfile: sessionState.targetProfile ?? null,
          previewState: sessionState.workbenchState.previewState,
          projectRules: runtimeState.projectRules,
          pendingHumanFeedback,
          history,
          latestTurn: latestTurnReview,
        },
        sessionState.targetDirectory,
      );

      iteration += 1;
      await reporter?.onThinking?.(
        `Ultimate mode cycle ${String(iteration)}: human simulator -> Shipyard: ${decision.instruction}`,
      );

      const turnResult = await executeTurn({
        sessionState,
        runtimeState,
        instruction: decision.instruction,
        reporter: innerReporter,
        signal,
        runtimeSurface: options.runtimeSurface,
      });

      latestTurn = turnResult;

      rememberRecentHistoryEntry(history, {
        iteration,
        simulatorSummary: decision.summary,
        simulatorInstruction: decision.instruction,
        appliedHumanFeedback: [...pendingHumanFeedback],
        turn: createHumanSimulatorTurnReview(
          decision.instruction,
          turnResult,
        ),
      });

      if (turnResult.selectedTargetPath) {
        await reporter?.onThinking?.(
          `Ultimate mode observed a target switch request to ${turnResult.selectedTargetPath}. The loop is continuing on the current active target for now.`,
        );
      }

      await reporter?.onThinking?.(
        `Ultimate mode cycle ${String(iteration)} finished with ${turnResult.status}. ${turnResult.summary}`,
      );

      if (turnResult.status === "cancelled") {
        const result = createCancelledResult(
          iteration,
          getTurnCancellationReason(signal, turnResult.summary)
            ?? turnResult.summary,
          history,
          latestTurn,
        );

        await emitUltimateModeOutcome(reporter, sessionState, result);
        return result;
      }
    }
  } catch (error) {
    const cancelledError = toTurnCancelledError(error, signal);

    if (cancelledError) {
      const result = createCancelledResult(
        iteration,
        cancelledError.message,
        history,
        latestTurn,
      );

      await emitUltimateModeOutcome(reporter, sessionState, result);
      return result;
    }

    const message = error instanceof Error
      ? error.message
      : "Ultimate mode failed unexpectedly.";
    const result = createErrorResult(iteration, message, history, latestTurn);

    await emitUltimateModeOutcome(reporter, sessionState, result);
    return result;
  }
}
