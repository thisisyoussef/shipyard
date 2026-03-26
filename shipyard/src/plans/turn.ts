import type {
  ExecutionSpec,
  LoadedPlanSpec,
  PersistedTaskQueue,
} from "../artifacts/types.js";
import { DEFAULT_TURN_CANCELLED_REASON, toTurnCancelledError } from "../engine/cancellation.js";
import { buildContextEnvelope } from "../context/envelope.js";
import { createAgentGraphState } from "../engine/graph.js";
import type {
  RawLoopToolHookContext,
  RawLoopToolResultHookContext,
} from "../engine/raw-loop.js";
import {
  saveSessionState,
  type ContextEnvelope,
  type SessionState,
} from "../engine/state.js";
import {
  createCancelledTurnText,
  createExecutionTurnSummary,
  createPlanningTurnSummary,
  truncateText,
  updateRollingSummary,
} from "../engine/turn-summary.js";
import { PLANNER_MODEL_ROUTE } from "../engine/model-routing.js";
import type {
  InstructionRuntimeState,
  InstructionTurnReporter,
  TurnStateEvent,
} from "../engine/turn.js";
import { runPlannerSubagent } from "../agents/planner.js";
import { extractInstructionTargetFilePaths } from "../agents/coordinator.js";
import { createCodePhase } from "../phases/code/index.js";
import { createTargetManagerPhase } from "../phases/target-manager/index.js";
import type { ToolResult } from "../tools/registry.js";
import type { LangSmithTraceReference } from "../tracing/langsmith.js";
import { derivePlanTasks, savePlanTaskQueue } from "./store.js";

const PLAN_MODE_PREFIX = /^plan\s*:/i;

export interface ExecutePlanningTurnOptions {
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  instruction: string;
  injectedContext?: string[];
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
}

export interface PlanningTurnResult {
  phaseName: string;
  runtimeMode: "graph" | "fallback";
  planningMode: "planner";
  contextEnvelope: ContextEnvelope | null;
  executionSpec: ExecutionSpec | null;
  loadedSpecRefs: string[];
  plan: PersistedTaskQueue | null;
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  langSmithTrace: LangSmithTraceReference | null;
}

function rememberRecent(
  values: string[],
  nextValue: string,
  limit = 5,
): void {
  values.push(nextValue);

  while (values.length > limit) {
    values.shift();
  }
}

function createSilentLogger() {
  return {
    log() {},
  };
}

function summarizeToolCallInput(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    "path" in input &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    return `path: ${input.path}`;
  }

  if (input === undefined) {
    return "no input";
  }

  try {
    return truncateText(JSON.stringify(input), 200);
  } catch {
    return truncateText(String(input), 200);
  }
}

function summarizeToolResult(result: ToolResult): string {
  if (result.success) {
    return truncateText(result.output || "Tool completed successfully.", 220);
  }

  return truncateText(result.error ?? result.output ?? "Tool failed.", 220);
}

function getToolResultDetail(result: ToolResult): string | undefined {
  const detail = result.success
    ? result.output
    : result.error ?? result.output;
  const trimmed = detail?.trim();

  return trimmed ? trimmed : undefined;
}

function extractCommandFromToolInput(input: unknown): string | undefined {
  if (
    typeof input === "object" &&
    input !== null &&
    "command" in input &&
    typeof input.command === "string" &&
    input.command.trim()
  ) {
    return input.command.trim();
  }

  return undefined;
}

function extractPlanInstruction(rawInstruction: string): string {
  const trimmed = rawInstruction.trim();
  const withoutPrefix = PLAN_MODE_PREFIX.test(trimmed)
    ? trimmed.replace(PLAN_MODE_PREFIX, "").trim()
    : trimmed;

  if (!withoutPrefix) {
    throw new Error('Plan instructions must include a request after "plan:".');
  }

  return withoutPrefix;
}

function isLoadSpecResult(
  value: unknown,
): value is {
  documents: Array<{
    ref: string;
    path: string;
  }>;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "documents" in value &&
    Array.isArray(value.documents) &&
    value.documents.every((document) =>
      typeof document === "object" &&
      document !== null &&
      "ref" in document &&
      typeof document.ref === "string" &&
      "path" in document &&
      typeof document.path === "string"
    )
  );
}

function collectLoadedSpecs(result: ToolResult): LoadedPlanSpec[] {
  if (!result.success || !isLoadSpecResult(result.data)) {
    return [];
  }

  return result.data.documents.map((document) => ({
    ref: document.ref,
    path: document.path,
  }));
}

function formatPlanSummary(plan: PersistedTaskQueue): string {
  const taskLines = plan.tasks.map((task, index) =>
    `${String(index + 1)}. [${task.status}] ${task.description}`
  );
  const lines = [
    `Plan ${plan.planId} saved with ${String(plan.tasks.length)} task${plan.tasks.length === 1 ? "" : "s"}.`,
    `Goal: ${plan.goal}`,
    ...taskLines,
  ];

  if (plan.loadedSpecRefs.length > 0) {
    lines.push(`Loaded specs: ${plan.loadedSpecRefs.join(", ")}`);
  }

  return lines.join("\n");
}

async function emitTurnState(
  reporter: InstructionTurnReporter | undefined,
  sessionState: SessionState,
  connectionState: TurnStateEvent["connectionState"],
): Promise<void> {
  await reporter?.onTurnState?.({
    sessionState,
    connectionState,
  });
}

async function createPlannerRunOptions(options: {
  planInstruction: string;
  contextEnvelope: ContextEnvelope;
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  reporter?: InstructionTurnReporter;
  loadedSpecRefs: Set<string>;
  loadedSpecs: Map<string, LoadedPlanSpec>;
  signal?: AbortSignal;
}) {
  const phase = options.sessionState.activePhase === "target-manager"
    ? createTargetManagerPhase()
    : createCodePhase();
  const graphState = createAgentGraphState({
    sessionId: options.sessionState.sessionId,
    instruction: options.planInstruction,
    contextEnvelope: options.contextEnvelope,
    previewState: options.sessionState.workbenchState.previewState,
    targetProfile: options.sessionState.targetProfile ?? null,
    targetDirectory: options.sessionState.targetDirectory,
    phaseConfig: phase,
    retryCountsByFile: options.runtimeState.retryCountsByFile,
    blockedFiles: options.runtimeState.blockedFiles,
  });
  const baseOptions =
    await options.runtimeState.runtimeDependencies?.createRawLoopOptions?.(
      graphState,
      {
        routeId: PLANNER_MODEL_ROUTE,
      },
    )
    ?? {};
  const existingBeforeToolExecution = baseOptions.beforeToolExecution;
  const existingAfterToolExecution = baseOptions.afterToolExecution;

  return {
    ...baseOptions,
    logger: baseOptions.logger ?? createSilentLogger(),
    signal: options.signal,
    beforeToolExecution: async (context: RawLoopToolHookContext) => {
      await existingBeforeToolExecution?.(context);

      if (options.signal?.aborted) {
        return;
      }

      await options.reporter?.onToolCall?.({
        callId: context.toolCall.id,
        toolName: context.toolCall.name,
        summary: summarizeToolCallInput(context.toolCall.input),
      });
    },
    afterToolExecution: async (context: RawLoopToolResultHookContext) => {
      await existingAfterToolExecution?.(context);

      if (options.signal?.aborted) {
        return;
      }

      const summary = summarizeToolResult(context.result);

      if (context.result.success) {
        rememberRecent(
          options.runtimeState.recentToolOutputs,
          `${context.toolCall.name} ${summary}`,
        );
      } else {
        rememberRecent(options.runtimeState.recentErrors, summary);
      }

      for (const spec of collectLoadedSpecs(context.result)) {
        options.loadedSpecRefs.add(spec.ref);
        options.loadedSpecs.set(`${spec.ref}::${spec.path}`, spec);
      }

      await options.reporter?.onToolResult?.({
        callId: context.toolCall.id,
        toolName: context.toolCall.name,
        success: context.result.success,
        summary,
        detail: getToolResultDetail(context.result),
        command: extractCommandFromToolInput(context.toolCall.input),
      });
    },
  };
}

export function isPlanModeInstruction(instruction: string): boolean {
  return PLAN_MODE_PREFIX.test(instruction.trim());
}

export async function executePlanningTurn(
  options: ExecutePlanningTurnOptions,
): Promise<PlanningTurnResult> {
  const state = options.sessionState;
  const runtimeState = options.runtimeState;
  const phase = state.activePhase === "target-manager"
    ? createTargetManagerPhase()
    : createCodePhase();
  let contextEnvelope: ContextEnvelope | null = null;
  let executionSpec: ExecutionSpec | null = null;
  let loadedSpecRefs = new Set<string>();
  let loadedSpecs = new Map<string, LoadedPlanSpec>();

  state.turnCount += 1;
  state.lastActiveAt = new Date().toISOString();

  await emitTurnState(options.reporter, state, "agent-busy");
  await options.reporter?.onThinking?.(
    `Planning turn ${String(state.turnCount)} in phase "${phase.name}" via ${runtimeState.runtimeMode} runtime.`,
  );

  try {
    const planInstruction = extractPlanInstruction(options.instruction);
    const mergedInjectedContext = [
      ...runtimeState.baseInjectedContext,
      ...(options.injectedContext ?? []),
    ];

    contextEnvelope = await buildContextEnvelope({
      targetDirectory: state.targetDirectory,
      discovery: state.discovery,
      currentInstruction: planInstruction,
      injectedContext: mergedInjectedContext,
      targetFilePaths: extractInstructionTargetFilePaths(planInstruction),
      recentToolOutputs: runtimeState.recentToolOutputs,
      recentErrors: runtimeState.recentErrors,
      currentGitDiff: null,
      rollingSummary: state.rollingSummary,
      retryCountsByFile: runtimeState.retryCountsByFile,
      blockedFiles: runtimeState.blockedFiles,
    });

    runtimeState.projectRules = contextEnvelope.stable.projectRules;

    const plannerRunOptions = await createPlannerRunOptions({
      planInstruction,
      contextEnvelope,
      sessionState: state,
      runtimeState,
      reporter: options.reporter,
      loadedSpecRefs,
      loadedSpecs,
      signal: options.signal,
    });
    const runPlanner =
      runtimeState.runtimeDependencies?.runPlannerSubagent
      ?? runPlannerSubagent;

    executionSpec = await runPlanner(
      {
        instruction: planInstruction,
        discovery: contextEnvelope.stable.discovery,
        targetProfile: state.targetProfile ?? null,
        projectRules: contextEnvelope.stable.projectRules,
        injectedContext: mergedInjectedContext,
        planMode: true,
      },
      state.targetDirectory,
      plannerRunOptions,
    );

    const plan = await savePlanTaskQueue({
      targetDirectory: state.targetDirectory,
      instruction: planInstruction,
      executionSpec,
      planningMode: "planner",
      loadedSpecRefs: [...loadedSpecRefs],
      loadedSpecs: [...loadedSpecs.values()],
      tasks: derivePlanTasks({
        executionSpec,
        loadedSpecRefs: [...loadedSpecRefs],
      }),
    });
    state.activePlanId = plan.planId;
    state.activeTask = null;
    const compactSummary = `Created plan ${plan.planId} with ${String(plan.tasks.length)} task${plan.tasks.length === 1 ? "" : "s"}.`;
    const summary = createPlanningTurnSummary(
      state.turnCount,
      runtimeState.runtimeMode,
      compactSummary,
    );
    const finalText = formatPlanSummary(plan);

    state.rollingSummary = updateRollingSummary(
      state.rollingSummary,
      state.turnCount,
      options.instruction,
      summary,
    );

    await options.reporter?.onText?.(finalText);
    await options.reporter?.onDone?.({
      status: "success",
      summary,
      langSmithTrace: null,
    });
    await emitTurnState(options.reporter, state, "ready");

    return {
      phaseName: phase.name,
      runtimeMode: runtimeState.runtimeMode,
      planningMode: "planner",
      contextEnvelope,
      executionSpec,
      loadedSpecRefs: [...loadedSpecRefs],
      plan,
      status: "success",
      summary,
      finalText,
      langSmithTrace: null,
    };
  } catch (error) {
    const cancelledError = toTurnCancelledError(error, options.signal);

    if (cancelledError) {
      const cancellationReason = cancelledError.message
        || DEFAULT_TURN_CANCELLED_REASON;
      const finalText = createCancelledTurnText(
        state.turnCount,
        cancellationReason,
      );
      const summary = createExecutionTurnSummary(
        state.turnCount,
        runtimeState.runtimeMode,
        "cancelled",
        cancellationReason,
      );

      state.rollingSummary = updateRollingSummary(
        state.rollingSummary,
        state.turnCount,
        options.instruction,
        summary,
      );

      await options.reporter?.onText?.(finalText);
      await options.reporter?.onDone?.({
        status: "cancelled",
        summary: cancellationReason,
        langSmithTrace: null,
      });
      await emitTurnState(options.reporter, state, "ready");

      return {
        phaseName: phase.name,
        runtimeMode: runtimeState.runtimeMode,
        planningMode: "planner",
        contextEnvelope,
        executionSpec,
        loadedSpecRefs: [...loadedSpecRefs],
        plan: null,
        status: "cancelled",
        summary,
        finalText,
        langSmithTrace: null,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    const finalText = `Turn ${String(state.turnCount)} stopped: ${message}`;
    const summary = createExecutionTurnSummary(
      state.turnCount,
      runtimeState.runtimeMode,
      "failed",
      message,
    );

    rememberRecent(runtimeState.recentErrors, message);
    state.rollingSummary = updateRollingSummary(
      state.rollingSummary,
      state.turnCount,
      options.instruction,
      summary,
    );

    await options.reporter?.onText?.(finalText);
    await options.reporter?.onError?.(message);
    await options.reporter?.onDone?.({
      status: "error",
      summary: message,
      langSmithTrace: null,
    });
    await emitTurnState(options.reporter, state, "error");

    return {
      phaseName: phase.name,
      runtimeMode: runtimeState.runtimeMode,
      planningMode: "planner",
      contextEnvelope,
      executionSpec,
      loadedSpecRefs: [...loadedSpecRefs],
      plan: null,
      status: "error",
      summary,
      finalText,
      langSmithTrace: null,
    };
  } finally {
    await saveSessionState(state);
  }
}
