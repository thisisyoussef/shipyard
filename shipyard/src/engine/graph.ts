import path from "node:path";

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";

import {
  CheckpointManager,
  type CheckpointManagerLike,
} from "../checkpoints/manager.js";
import type {
  BrowserEvaluationReport,
  ContextReport,
  EvaluationPlan,
  ExecutionSpec,
  HarnessRouteSummary,
  PlanningMode,
  PreviewState,
  TaskPlan,
  TargetProfile,
  VerificationReport,
} from "../artifacts/types.js";
import {
  createCoordinatorTaskPlan,
  createBrowserEvaluationPlan,
  createLightweightExecutionSpec,
  createExplorerQuery,
  createVerificationPlan,
  mergeBrowserEvaluationIntoVerificationReport,
  shouldCoordinatorUseBrowserEvaluator,
  shouldCoordinatorUseExplorer,
  shouldCoordinatorUsePlanner,
} from "../agents/coordinator.js";
import {
  runExplorerSubagent as executeExplorerSubagent,
  type ExplorerRunOptions,
} from "../agents/explorer.js";
import {
  runPlannerSubagent as executePlannerSubagent,
  type PlannerInput,
  type PlannerRunOptions,
} from "../agents/planner.js";
import {
  runBrowserEvaluator as executeBrowserEvaluator,
  type BrowserEvaluatorRunOptions,
} from "../agents/browser-evaluator.js";
import {
  runVerifierSubagent as executeVerifierSubagent,
  type VerifierRunOptions,
} from "../agents/verifier.js";
import type { Phase } from "../phases/phase.js";
import { readFileTool } from "../tools/read-file.js";
import { normalizeTargetRelativePath } from "../tools/file-state.js";
import {
  RAW_LOOP_MAX_ITERATIONS,
  createRawLoopIterationLimitMessage,
  isRawLoopIterationLimitError,
  runRawToolLoopDetailed,
  type RawToolLoopOptions,
  type RawToolExecution,
  type RawLoopToolHookContext,
  type RawToolLoopResult,
} from "./raw-loop.js";
import {
  getArtifactDirectory,
  type ContextEnvelope,
  type FileHashMap,
} from "./state.js";
import {
  getLangSmithCallbacksForCurrentTrace,
  getLangSmithConfig,
  runWithLangSmithTrace,
  type LangSmithTraceReference,
} from "../tracing/langsmith.js";
import {
  getTurnCancellationReason,
  toTurnCancelledError,
} from "./cancellation.js";

export type AgentRuntimeStatus =
  | "planning"
  | "acting"
  | "verifying"
  | "recovering"
  | "responding"
  | "cancelled"
  | "done"
  | "failed";

export interface AgentGraphState {
  sessionId: string;
  messageHistory: MessageParam[];
  currentInstruction: string;
  contextEnvelope: ContextEnvelope;
  previewState: PreviewState;
  targetProfile: TargetProfile | null;
  targetDirectory: string;
  phaseConfig: Phase;
  fileHashes: FileHashMap;
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  lastEditedFile: string | null;
  touchedFiles: string[];
  status: AgentRuntimeStatus;
  finalResult: string | null;
  taskPlan: TaskPlan | null;
  executionSpec: ExecutionSpec | null;
  planningMode: PlanningMode;
  contextReport: ContextReport | null;
  verificationReport: VerificationReport | null;
  browserEvaluationReport: BrowserEvaluationReport | null;
  harnessRoute: HarnessRouteSummary;
  actingIterations: number;
  fallbackMode: boolean;
  lastError: string | null;
  langSmithTrace: LangSmithTraceReference | null;
}

export interface CreateAgentGraphStateOptions {
  sessionId?: string;
  instruction: string;
  contextEnvelope: ContextEnvelope;
  previewState: PreviewState;
  targetProfile?: TargetProfile | null;
  targetDirectory: string;
  phaseConfig: Phase;
  messageHistory?: MessageParam[];
  fileHashes?: FileHashMap;
  retryCountsByFile?: Record<string, number>;
  blockedFiles?: string[];
  lastEditedFile?: string | null;
  touchedFiles?: string[];
  status?: AgentRuntimeStatus;
  finalResult?: string | null;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  planningMode?: PlanningMode;
  contextReport?: ContextReport | null;
  verificationReport?: VerificationReport | null;
  browserEvaluationReport?: BrowserEvaluationReport | null;
  harnessRoute?: HarnessRouteSummary;
  actingIterations?: number;
  fallbackMode?: boolean;
  lastError?: string | null;
  langSmithTrace?: LangSmithTraceReference | null;
}

export interface ActingLoopResult {
  status?: "completed" | "cancelled" | "limit_reached";
  finalText: string;
  messageHistory: MessageParam[];
  iterations: number;
  didEdit: boolean;
  lastEditedFile: string | null;
  touchedFiles?: string[];
}

export interface AgentRuntimeDependencies {
  createTaskPlan?: (
    state: AgentGraphState,
    contextReport?: ContextReport | null,
  ) => TaskPlan | Promise<TaskPlan>;
  runActingLoop?: (
    state: AgentGraphState,
  ) => ActingLoopResult | Promise<ActingLoopResult>;
  runExplorerSubagent?: (
    query: string,
    targetDirectory: string,
    options?: ExplorerRunOptions,
  ) => ContextReport | Promise<ContextReport>;
  runPlannerSubagent?: (
    input: PlannerInput,
    targetDirectory: string,
    options?: PlannerRunOptions,
  ) => ExecutionSpec | Promise<ExecutionSpec>;
  runVerifierSubagent?: (
    input: string | EvaluationPlan,
    targetDirectory: string,
    options?: VerifierRunOptions,
  ) => VerificationReport | Promise<VerificationReport>;
  runBrowserEvaluator?: (
    input: Parameters<typeof executeBrowserEvaluator>[0],
    options?: BrowserEvaluatorRunOptions,
  ) => BrowserEvaluationReport | Promise<BrowserEvaluationReport>;
  verifyState?: (
    state: AgentGraphState,
  ) => VerificationReport | Promise<VerificationReport>;
  createCheckpointManager?: (
    state: AgentGraphState,
  ) => CheckpointManagerLike;
  createRawLoopOptions?: (
    state: AgentGraphState,
  ) => RawToolLoopOptions | Promise<RawToolLoopOptions>;
}

export interface AgentRuntimeOptions {
  mode?: "graph" | "fallback";
  maxRecoveriesPerFile?: number;
  signal?: AbortSignal;
  dependencies?: AgentRuntimeDependencies;
}

type AgentGraphNodeName = "plan" | "act" | "verify" | "recover" | "respond";

const DEFAULT_MAX_RECOVERIES_PER_FILE = 2;

const AgentGraphStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  messageHistory: Annotation<MessageParam[]>(),
  currentInstruction: Annotation<string>(),
  contextEnvelope: Annotation<ContextEnvelope>(),
  previewState: Annotation<PreviewState>(),
  targetProfile: Annotation<TargetProfile | null>(),
  targetDirectory: Annotation<string>(),
  phaseConfig: Annotation<Phase>(),
  fileHashes: Annotation<FileHashMap>(),
  retryCountsByFile: Annotation<Record<string, number>>(),
  blockedFiles: Annotation<string[]>(),
  lastEditedFile: Annotation<string | null>(),
  touchedFiles: Annotation<string[]>(),
  status: Annotation<AgentRuntimeStatus>(),
  finalResult: Annotation<string | null>(),
  taskPlan: Annotation<TaskPlan | null>(),
  executionSpec: Annotation<ExecutionSpec | null>(),
  planningMode: Annotation<PlanningMode>(),
  contextReport: Annotation<ContextReport | null>(),
  verificationReport: Annotation<VerificationReport | null>(),
  browserEvaluationReport: Annotation<BrowserEvaluationReport | null>(),
  harnessRoute: Annotation<HarnessRouteSummary>(),
  actingIterations: Annotation<number>(),
  fallbackMode: Annotation<boolean>(),
  lastError: Annotation<string | null>(),
  langSmithTrace: Annotation<LangSmithTraceReference | null>(),
});

function ensureNonBlankString(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank.`);
  }

  return trimmed;
}

function applyStateUpdate(
  state: AgentGraphState,
  update: Partial<AgentGraphState>,
): AgentGraphState {
  return {
    ...state,
    ...update,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createInitialHarnessRouteSummary(
  contextEnvelope: ContextEnvelope,
): HarnessRouteSummary {
  const latestHandoff = contextEnvelope.session.latestHandoff;

  return {
    selectedPath: "lightweight",
    usedExplorer: false,
    usedPlanner: false,
    usedVerifier: false,
    verificationMode: "none",
    verificationCheckCount: 0,
    usedBrowserEvaluator: false,
    browserEvaluationStatus: "not_run",
    handoffLoaded: latestHandoff !== null,
    handoffEmitted: false,
    handoffReason: latestHandoff?.handoff.resetReason.kind ?? null,
    firstHardFailure: null,
  };
}

function createBrowserArtifactsDirectory(state: AgentGraphState): string {
  return path.join(
    getArtifactDirectory(state.targetDirectory),
    state.sessionId,
    "browser-evaluator",
  );
}

function getCheckpointManager(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
): CheckpointManagerLike {
  return dependencies.createCheckpointManager?.(state)
    ?? new CheckpointManager(state.targetDirectory, state.sessionId);
}

function getRelativeToolPath(input: unknown): string | null {
  if (
    typeof input === "object" &&
    input !== null &&
    "path" in input &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    return normalizeTargetRelativePath(input.path);
  }

  return null;
}

function isBootstrapToolData(
  data: unknown,
): data is {
  createdFiles: string[];
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "createdFiles" in data &&
    Array.isArray(data.createdFiles) &&
    data.createdFiles.every((item) => typeof item === "string")
  );
}

function collectTouchedFiles(
  toolExecutions: RawToolExecution[],
): string[] {
  const touchedFiles = new Set<string>();

  for (const execution of toolExecutions) {
    if (!execution.success) {
      continue;
    }

    if (execution.editedPath) {
      touchedFiles.add(execution.editedPath);
      continue;
    }

    if (
      execution.toolName === "bootstrap_target" &&
      isBootstrapToolData(execution.data)
    ) {
      for (const createdFile of execution.data.createdFiles) {
        touchedFiles.add(createdFile);
      }
    }
  }

  return [...touchedFiles];
}

async function createSubagentLoopOptions(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<RawToolLoopOptions> {
  const rawLoopOptions =
    await dependencies.createRawLoopOptions?.(state)
    ?? {};

  return {
    ...rawLoopOptions,
    signal: signal ?? rawLoopOptions.signal,
  };
}

async function checkpointBeforeEdit(
  context: RawLoopToolHookContext,
  checkpointManager: CheckpointManagerLike,
): Promise<void> {
  if (context.toolUse.name !== "edit_block") {
    return;
  }

  const relativePath = getRelativeToolPath(context.toolUse.input);

  if (!relativePath) {
    throw new Error("edit_block requires a non-empty relative path before checkpointing.");
  }

  await checkpointManager.checkpoint(relativePath);
}

function createDefaultVerificationReport(
  state: AgentGraphState,
): VerificationReport {
  const evaluationPlan = createVerificationPlan({
    contextEnvelope: state.contextEnvelope,
    executionSpec: state.executionSpec,
    editedFilePath: state.lastEditedFile,
  });
  const command = evaluationPlan.checks[0]?.command ?? "";

  if (!state.lastEditedFile) {
    return {
      command,
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "No edited file available for verification.",
      summary: "Verification failed because no edited file was recorded.",
      evaluationPlan,
      checks: [],
      firstHardFailure: null,
      browserEvaluationReport: null,
    };
  }

  return {
    command,
    exitCode: 0,
    passed: true,
    stdout: "",
    stderr: "",
    summary: `Verification placeholder passed for ${state.lastEditedFile}.`,
    evaluationPlan,
    checks: [],
    firstHardFailure: null,
    browserEvaluationReport: null,
  };
}

async function maybeExploreContext(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ContextReport | null> {
  if (
    !shouldCoordinatorUseExplorer({
      instruction: state.currentInstruction,
      contextEnvelope: state.contextEnvelope,
      taskPlan: state.taskPlan,
      executionSpec: state.executionSpec,
      contextReport: state.contextReport,
    })
  ) {
    return state.contextReport;
  }

  const runExplorerSubagent =
    dependencies.runExplorerSubagent ?? executeExplorerSubagent;

  return runExplorerSubagent(
    createExplorerQuery(state.currentInstruction),
    state.targetDirectory,
    await createSubagentLoopOptions(state, dependencies, signal),
  );
}

async function maybePlanExecutionSpec(
  state: AgentGraphState,
  contextReport: ContextReport | null,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<{
  executionSpec: ExecutionSpec;
  planningMode: PlanningMode;
}> {
  if (state.executionSpec) {
    return {
      executionSpec: state.executionSpec,
      planningMode: state.planningMode,
    };
  }

  if (
    state.phaseConfig.name !== "code"
    || state.contextEnvelope.stable.discovery.isGreenfield
  ) {
    return {
      executionSpec: createLightweightExecutionSpec({
        instruction: state.currentInstruction,
        contextEnvelope: state.contextEnvelope,
        taskPlan: state.taskPlan,
        executionSpec: state.executionSpec,
        contextReport,
      }),
      planningMode: "lightweight",
    };
  }

  if (
    !shouldCoordinatorUsePlanner({
      instruction: state.currentInstruction,
      contextEnvelope: state.contextEnvelope,
      taskPlan: state.taskPlan,
      executionSpec: state.executionSpec,
      contextReport,
    })
  ) {
    return {
      executionSpec: createLightweightExecutionSpec({
        instruction: state.currentInstruction,
        contextEnvelope: state.contextEnvelope,
        taskPlan: state.taskPlan,
        executionSpec: state.executionSpec,
        contextReport,
      }),
      planningMode: "lightweight",
    };
  }

  const runPlannerSubagent =
    dependencies.runPlannerSubagent ?? executePlannerSubagent;

  return {
    executionSpec: await runPlannerSubagent(
      {
        instruction: state.currentInstruction,
        discovery: state.contextEnvelope.stable.discovery,
        targetProfile: state.targetProfile,
        contextReport,
      },
      state.targetDirectory,
      await createSubagentLoopOptions(state, dependencies, signal),
    ),
    planningMode: "planner",
  };
}

function createDefaultTaskPlan(
  state: AgentGraphState,
  executionSpec: ExecutionSpec,
  contextReport: ContextReport | null,
): TaskPlan {
  return createCoordinatorTaskPlan({
    instruction: state.currentInstruction,
    contextEnvelope: state.contextEnvelope,
    taskPlan: state.taskPlan,
    executionSpec,
    contextReport,
  });
}

async function defaultVerifyState(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<VerificationReport> {
  if (!state.lastEditedFile) {
    return createDefaultVerificationReport(state);
  }

  const runVerifierSubagent =
    dependencies.runVerifierSubagent ?? executeVerifierSubagent;

  return runVerifierSubagent(
    createVerificationPlan({
      contextEnvelope: state.contextEnvelope,
      executionSpec: state.executionSpec,
      editedFilePath: state.lastEditedFile,
    }),
    state.targetDirectory,
    await createSubagentLoopOptions(state, dependencies, signal),
  );
}

async function defaultActingLoop(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ActingLoopResult> {
  const rawLoopOptions =
    await dependencies.createRawLoopOptions?.(state)
    ?? {};
  const checkpointManager = getCheckpointManager(state, dependencies);
  const existingBeforeToolExecution = rawLoopOptions.beforeToolExecution;
  const result: RawToolLoopResult = await runRawToolLoopDetailed(
    state.phaseConfig.systemPrompt,
    state.currentInstruction,
    state.phaseConfig.tools,
    state.targetDirectory,
    {
      ...rawLoopOptions,
      signal,
      maxIterations: rawLoopOptions.maxIterations ?? RAW_LOOP_MAX_ITERATIONS,
      beforeToolExecution: async (context) => {
        await checkpointBeforeEdit(context, checkpointManager);
        await existingBeforeToolExecution?.(context);
      },
    },
  );

  return {
    status:
      result.status === "cancelled"
        ? "cancelled"
        : result.status === "limit_reached"
          ? "limit_reached"
          : "completed",
    finalText: result.finalText,
    messageHistory: result.messageHistory,
    iterations: result.iterations,
    didEdit: result.didEdit,
    lastEditedFile: result.lastEditedFile,
    touchedFiles: collectTouchedFiles(result.toolExecutions),
  };
}

function ensureValidRecoveries(maxRecoveriesPerFile: number): number {
  if (!Number.isInteger(maxRecoveriesPerFile) || maxRecoveriesPerFile <= 0) {
    throw new Error("maxRecoveriesPerFile must be a positive integer.");
  }

  return maxRecoveriesPerFile;
}

export function createAgentGraphState(
  options: CreateAgentGraphStateOptions,
): AgentGraphState {
  return {
    sessionId: options.sessionId ?? "runtime-session",
    messageHistory: [...(options.messageHistory ?? [])],
    currentInstruction: ensureNonBlankString(
      options.instruction,
      "instruction",
    ),
    contextEnvelope: options.contextEnvelope,
    previewState: { ...options.previewState },
    targetProfile: options.targetProfile ?? null,
    targetDirectory: options.targetDirectory,
    phaseConfig: options.phaseConfig,
    fileHashes: { ...(options.fileHashes ?? {}) },
    retryCountsByFile: { ...(options.retryCountsByFile ?? {}) },
    blockedFiles: [...(options.blockedFiles ?? [])],
    lastEditedFile: options.lastEditedFile ?? null,
    touchedFiles: [...(options.touchedFiles ?? [])],
    status: options.status ?? "planning",
    finalResult: options.finalResult ?? null,
    taskPlan: options.taskPlan ?? null,
    executionSpec: options.executionSpec ?? null,
    planningMode: options.planningMode ?? "lightweight",
    contextReport: options.contextReport ?? null,
    verificationReport: options.verificationReport ?? null,
    browserEvaluationReport: options.browserEvaluationReport ?? null,
    harnessRoute:
      options.harnessRoute
      ?? createInitialHarnessRouteSummary(options.contextEnvelope),
    actingIterations: options.actingIterations ?? 0,
    fallbackMode: options.fallbackMode ?? false,
    lastError: options.lastError ?? null,
    langSmithTrace: options.langSmithTrace ?? null,
  };
}

function createRuntimeTraceMetadata(
  state: AgentGraphState,
  runtimeMode: "graph" | "fallback",
): Record<string, unknown> {
  const latestHandoff = state.contextEnvelope.session.latestHandoff;
  const predictedExplorerUsage = shouldCoordinatorUseExplorer({
    instruction: state.currentInstruction,
    contextEnvelope: state.contextEnvelope,
    taskPlan: state.taskPlan,
    executionSpec: state.executionSpec,
    contextReport: state.contextReport,
  });
  const predictedPlannerUsage = shouldCoordinatorUsePlanner({
    instruction: state.currentInstruction,
    contextEnvelope: state.contextEnvelope,
    taskPlan: state.taskPlan,
    executionSpec: state.executionSpec,
    contextReport: state.contextReport,
  });
  const selectedPath = state.harnessRoute.selectedPath === "lightweight" &&
      predictedPlannerUsage
    ? "planner-backed"
    : state.harnessRoute.selectedPath;

  return {
    sessionId: state.sessionId,
    runtimeMode,
    phase: state.phaseConfig.name,
    instruction: state.currentInstruction,
    targetDirectory: state.targetDirectory,
    selectedPath,
    usedExplorer: state.harnessRoute.usedExplorer || predictedExplorerUsage,
    usedPlanner: state.harnessRoute.usedPlanner || predictedPlannerUsage,
    usedVerifier: state.harnessRoute.usedVerifier,
    verificationMode: state.harnessRoute.verificationMode,
    verificationCheckCount: state.harnessRoute.verificationCheckCount,
    usedBrowserEvaluator: state.harnessRoute.usedBrowserEvaluator,
    browserEvaluationStatus: state.harnessRoute.browserEvaluationStatus,
    handoffLoaded: state.harnessRoute.handoffLoaded || latestHandoff !== null,
    handoffEmitted: state.harnessRoute.handoffEmitted,
    handoffPath: latestHandoff?.artifactPath ?? null,
    handoffReason: state.harnessRoute.handoffReason
      ?? latestHandoff?.handoff.resetReason.kind
      ?? null,
    firstHardFailure: state.harnessRoute.firstHardFailure,
  };
}

function createCancellationUpdate(
  signal?: AbortSignal,
): Partial<AgentGraphState> | null {
  const reason = getTurnCancellationReason(signal);

  if (!reason) {
    return null;
  }

  return {
    status: "cancelled",
    finalResult: reason,
    lastError: null,
  };
}

function createCancellationUpdateFromError(
  error: unknown,
  signal?: AbortSignal,
): Partial<AgentGraphState> | null {
  const cancelledError = toTurnCancelledError(error, signal);

  if (!cancelledError) {
    return null;
  }

  return {
    status: "cancelled",
    finalResult: cancelledError.message,
    lastError: null,
  };
}

export function routeAfterPlan(
  state: Pick<AgentGraphState, "status">,
): "act" | "respond" {
  if (state.status === "acting") {
    return "act";
  }

  if (
    state.status === "cancelled" ||
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-plan status: ${state.status}`);
}

export function routeAfterAct(
  state: Pick<AgentGraphState, "status">,
): "verify" | "respond" {
  if (state.status === "verifying") {
    return "verify";
  }

  if (
    state.status === "cancelled" ||
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-act status: ${state.status}`);
}

export function routeAfterVerify(
  state: Pick<AgentGraphState, "status">,
): "recover" | "respond" {
  if (state.status === "recovering") {
    return "recover";
  }

  if (
    state.status === "cancelled" ||
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-verify status: ${state.status}`);
}

export function routeAfterRecover(
  state: Pick<AgentGraphState, "status">,
): "plan" | "respond" {
  if (state.status === "planning") {
    return "plan";
  }

  if (
    state.status === "cancelled" ||
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-recover status: ${state.status}`);
}

export function createAgentRuntimeNodes(
  options: AgentRuntimeOptions = {},
): Record<AgentGraphNodeName, (state: AgentGraphState) => Promise<Partial<AgentGraphState>>> {
  const dependencies = options.dependencies ?? {};
  const maxRecoveriesPerFile = ensureValidRecoveries(
    options.maxRecoveriesPerFile ?? DEFAULT_MAX_RECOVERIES_PER_FILE,
  );
  const signal = options.signal;

  return {
    async plan(state) {
      const cancelledBeforePlan = createCancellationUpdate(signal);

      if (cancelledBeforePlan) {
        return cancelledBeforePlan;
      }

      try {
        const shouldUseExplorer = shouldCoordinatorUseExplorer({
          instruction: state.currentInstruction,
          contextEnvelope: state.contextEnvelope,
          taskPlan: state.taskPlan,
          executionSpec: state.executionSpec,
          contextReport: state.contextReport,
        });
        const contextReport = await maybeExploreContext(state, dependencies, signal);
        const cancelledAfterExplore = createCancellationUpdate(signal);

        if (cancelledAfterExplore) {
          return cancelledAfterExplore;
        }

        const planningArtifacts = await maybePlanExecutionSpec(
          state,
          contextReport,
          dependencies,
          signal,
        );
        const cancelledAfterExecutionSpec = createCancellationUpdate(signal);

        if (cancelledAfterExecutionSpec) {
          return cancelledAfterExecutionSpec;
        }

        const taskPlan = await (dependencies.createTaskPlan
          ? dependencies.createTaskPlan(
              applyStateUpdate(state, {
                executionSpec: planningArtifacts.executionSpec,
                planningMode: planningArtifacts.planningMode,
              }),
              contextReport,
            )
          : createDefaultTaskPlan(
              state,
              planningArtifacts.executionSpec,
              contextReport,
            ));
        const cancelledAfterPlan = createCancellationUpdate(signal);

        if (cancelledAfterPlan) {
          return cancelledAfterPlan;
        }

        return {
          taskPlan,
          executionSpec: planningArtifacts.executionSpec,
          planningMode: planningArtifacts.planningMode,
          contextReport,
          harnessRoute: {
            ...state.harnessRoute,
            selectedPath: planningArtifacts.planningMode === "planner"
              ? "planner-backed"
              : "lightweight",
            usedExplorer: shouldUseExplorer,
            usedPlanner: planningArtifacts.planningMode === "planner",
          },
          status: "acting",
          lastError: null,
          verificationReport: null,
          browserEvaluationReport: null,
        };
      } catch (error) {
        const cancelledUpdate = createCancellationUpdateFromError(error, signal);

        if (cancelledUpdate) {
          return cancelledUpdate;
        }

        throw error;
      }
    },
    async act(state) {
      const cancelledBeforeAct = createCancellationUpdate(signal);

      if (cancelledBeforeAct) {
        return cancelledBeforeAct;
      }

      try {
        const actingLoop = await (dependencies.runActingLoop
          ? dependencies.runActingLoop(state)
          : defaultActingLoop(state, dependencies, signal));
        const cancelledAfterAct = createCancellationUpdate(signal);

        if (actingLoop.status === "cancelled" || cancelledAfterAct) {
          return {
            messageHistory: actingLoop.messageHistory,
            actingIterations: actingLoop.iterations,
            lastEditedFile: actingLoop.lastEditedFile,
            touchedFiles: actingLoop.touchedFiles ?? [],
            finalResult:
              cancelledAfterAct?.finalResult ?? actingLoop.finalText,
            status: "cancelled",
            lastError: null,
          };
        }

        if (actingLoop.status === "limit_reached") {
          return {
            messageHistory: actingLoop.messageHistory,
            actingIterations: actingLoop.iterations,
            lastEditedFile: actingLoop.lastEditedFile,
            touchedFiles: actingLoop.touchedFiles ?? [],
            finalResult: actingLoop.finalText,
            status: "responding",
            lastError: null,
          };
        }

        return {
          messageHistory: actingLoop.messageHistory,
          actingIterations: actingLoop.iterations,
          lastEditedFile: actingLoop.lastEditedFile,
          touchedFiles: actingLoop.touchedFiles ?? [],
          finalResult: actingLoop.finalText,
          status: actingLoop.didEdit ? "verifying" : "responding",
          lastError: null,
        };
      } catch (error) {
        const cancelledUpdate = createCancellationUpdateFromError(error, signal);

        if (cancelledUpdate) {
          return cancelledUpdate;
        }

        const message = toErrorMessage(error);
        const limitHit = isRawLoopIterationLimitError(
          message,
          RAW_LOOP_MAX_ITERATIONS,
        );

        return {
          actingIterations: limitHit
            ? RAW_LOOP_MAX_ITERATIONS
            : state.actingIterations,
          status: limitHit ? "responding" : "failed",
          finalResult: limitHit
            ? createRawLoopIterationLimitMessage(RAW_LOOP_MAX_ITERATIONS)
            : message,
          lastError: limitHit ? null : message,
        };
      }
    },
    async verify(state) {
      const cancelledBeforeVerify = createCancellationUpdate(signal);

      if (cancelledBeforeVerify) {
        return cancelledBeforeVerify;
      }

      try {
        const verificationReport = await (dependencies.verifyState
          ? dependencies.verifyState(state)
          : defaultVerifyState(state, dependencies, signal));
        let browserEvaluationReport: BrowserEvaluationReport | null = null;

        if (
          verificationReport.passed &&
          shouldCoordinatorUseBrowserEvaluator({
            instruction: state.currentInstruction,
            contextEnvelope: state.contextEnvelope,
            previewState: state.previewState,
            executionSpec: state.executionSpec,
            contextReport: state.contextReport,
          })
        ) {
          const runBrowserEvaluator =
            dependencies.runBrowserEvaluator ?? executeBrowserEvaluator;

          browserEvaluationReport = await runBrowserEvaluator(
            createBrowserEvaluationPlan({
              instruction: state.currentInstruction,
              previewState: state.previewState,
              executionSpec: state.executionSpec,
            }),
            {
              artifactsDirectory: createBrowserArtifactsDirectory(state),
            },
          );
        }

        const combinedVerificationReport = mergeBrowserEvaluationIntoVerificationReport({
          verificationReport,
          browserEvaluationReport,
        });
        const plannedVerificationChecks = createVerificationPlan({
          contextEnvelope: state.contextEnvelope,
          executionSpec: state.executionSpec,
          editedFilePath: state.lastEditedFile,
        }).checks.length;
        const cancelledAfterVerify = createCancellationUpdate(signal);

        if (cancelledAfterVerify) {
          return {
            verificationReport: combinedVerificationReport,
            browserEvaluationReport,
            ...cancelledAfterVerify,
          };
        }

        return {
          verificationReport: combinedVerificationReport,
          browserEvaluationReport,
          harnessRoute: {
            ...state.harnessRoute,
            usedVerifier: true,
            verificationMode: browserEvaluationReport
              ? "command+browser"
              : "command",
            verificationCheckCount:
              combinedVerificationReport.evaluationPlan?.checks.length
              ?? combinedVerificationReport.checks?.length
              ?? plannedVerificationChecks,
            usedBrowserEvaluator: browserEvaluationReport !== null,
            browserEvaluationStatus:
              browserEvaluationReport?.status ?? "not_run",
            firstHardFailure:
              combinedVerificationReport.firstHardFailure ?? null,
          },
          status: combinedVerificationReport.passed ? "responding" : "recovering",
          lastError: combinedVerificationReport.passed
            ? null
            : combinedVerificationReport.summary,
        };
      } catch (error) {
        const cancelledUpdate = createCancellationUpdateFromError(error, signal);

        if (cancelledUpdate) {
          return cancelledUpdate;
        }

        throw error;
      }
    },
    async recover(state) {
      const cancelledBeforeRecover = createCancellationUpdate(signal);

      if (cancelledBeforeRecover) {
        return cancelledBeforeRecover;
      }

      if (!state.lastEditedFile) {
        return {
          status: "failed",
          finalResult:
            state.lastError ?? "Recovery failed because no edited file was recorded.",
        };
      }

      const currentRetries =
        state.retryCountsByFile[state.lastEditedFile] ?? 0;
      const nextRetries = currentRetries + 1;
      const checkpointManager = getCheckpointManager(state, dependencies);
      const retryCountsByFile = {
        ...state.retryCountsByFile,
        [state.lastEditedFile]: nextRetries,
      };
      let restored = false;

      try {
        restored = await checkpointManager.revert(state.lastEditedFile);
      } catch (error) {
        const message = `Recovery failed while restoring ${state.lastEditedFile}: ${toErrorMessage(error)}`;

        return {
          retryCountsByFile,
          status: "failed",
          finalResult: message,
          lastError: message,
        };
      }

      const cancelledAfterRestore = createCancellationUpdate(signal);

      if (cancelledAfterRestore) {
        return {
          retryCountsByFile,
          ...cancelledAfterRestore,
        };
      }

      let rereadHashUpdate: Partial<AgentGraphState>;

      try {
        const rereadResult = await readFileTool({
          targetDirectory: state.targetDirectory,
          path: state.lastEditedFile,
        });

        rereadHashUpdate = {
          fileHashes: {
            ...state.fileHashes,
            [rereadResult.path]: rereadResult.hash,
          },
        };
      } catch (error) {
        const message = `Recovery failed while re-reading ${state.lastEditedFile}: ${toErrorMessage(error)}`;

        return {
          retryCountsByFile,
          status: "failed",
          finalResult: message,
          lastError: message,
        };
      }

      const cancelledAfterReread = createCancellationUpdate(signal);

      if (cancelledAfterReread) {
        return {
          ...rereadHashUpdate,
          retryCountsByFile,
          ...cancelledAfterReread,
        };
      }

      if (nextRetries > maxRecoveriesPerFile) {
        const blockedFiles = state.blockedFiles.includes(state.lastEditedFile)
          ? state.blockedFiles
          : [...state.blockedFiles, state.lastEditedFile];
        const escalationSummary = restored
          ? `Restored the latest checkpoint for ${state.lastEditedFile} before blocking further retries.`
          : `No checkpoint was available for ${state.lastEditedFile}, so Shipyard blocked further retries after re-reading the file.`;

        return {
          ...rereadHashUpdate,
          retryCountsByFile,
          blockedFiles,
          status: "responding",
          lastEditedFile: null,
          verificationReport: null,
          browserEvaluationReport: null,
          lastError: escalationSummary,
          finalResult: `Blocked ${state.lastEditedFile} after ${String(nextRetries)} failed verification attempts. ${escalationSummary}`,
        };
      }

      return {
        ...rereadHashUpdate,
        retryCountsByFile,
        status: "planning",
        lastEditedFile: null,
        verificationReport: null,
        browserEvaluationReport: null,
        lastError: null,
        finalResult: null,
      };
    },
    async respond(state) {
      return {
        status:
          state.status === "failed"
            ? "failed"
            : state.status === "cancelled"
              ? "cancelled"
              : "done",
        finalResult:
          state.finalResult ??
          state.lastError ??
          "Shipyard finished without a final result.",
      };
    },
  };
}

export function createAgentRuntimeGraph(
  options: AgentRuntimeOptions = {},
) {
  const nodes = createAgentRuntimeNodes(options);

  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("plan", nodes.plan)
    .addNode("act", nodes.act)
    .addNode("verify", nodes.verify)
    .addNode("recover", nodes.recover)
    .addNode("respond", nodes.respond)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", routeAfterPlan, {
      act: "act",
      respond: "respond",
    })
    .addConditionalEdges("act", routeAfterAct, {
      verify: "verify",
      respond: "respond",
    })
    .addConditionalEdges("verify", routeAfterVerify, {
      recover: "recover",
      respond: "respond",
    })
    .addConditionalEdges("recover", routeAfterRecover, {
      plan: "plan",
      respond: "respond",
    })
    .addEdge("respond", END)
    .compile({
      name: "shipyard-agent-runtime",
      description: "Phase 4 graph runtime contract with explicit fallback parity.",
    });
}

export async function runFallbackRuntime(
  initialState: AgentGraphState,
  options: AgentRuntimeOptions = {},
): Promise<AgentGraphState> {
  const nodes = createAgentRuntimeNodes(options);
  let state = applyStateUpdate(initialState, {
    fallbackMode: true,
  });
  let nextNode: AgentGraphNodeName = "plan";

  while (true) {
    if (nextNode === "plan") {
      state = applyStateUpdate(state, await nodes.plan(state));
      nextNode = routeAfterPlan(state);
      continue;
    }

    if (nextNode === "act") {
      state = applyStateUpdate(state, await nodes.act(state));
      nextNode = routeAfterAct(state);
      continue;
    }

    if (nextNode === "verify") {
      state = applyStateUpdate(state, await nodes.verify(state));
      nextNode = routeAfterVerify(state);
      continue;
    }

    if (nextNode === "recover") {
      state = applyStateUpdate(state, await nodes.recover(state));
      nextNode = routeAfterRecover(state);
      continue;
    }

    state = applyStateUpdate(state, await nodes.respond(state));
    return state;
  }
}

export async function runAgentRuntime(
  initialState: AgentGraphState,
  options: AgentRuntimeOptions = {},
): Promise<AgentGraphState> {
  const langSmith = getLangSmithConfig();

  if (options.mode === "fallback") {
    if (!langSmith.enabled) {
      const fallbackState = await runFallbackRuntime(initialState, options);

      return applyStateUpdate(fallbackState, {
        langSmithTrace: null,
      });
    }

    const tracedFallbackRuntime = await runWithLangSmithTrace({
      name: "shipyard.fallback-runtime",
      runType: "chain",
      tags: ["shipyard", "fallback-runtime", initialState.phaseConfig.name],
      metadata: createRuntimeTraceMetadata(initialState, "fallback"),
      getResultMetadata: (result) =>
        createRuntimeTraceMetadata(result, "fallback"),
      fn: async () => runFallbackRuntime(initialState, options),
      args: [],
    });

    return applyStateUpdate(tracedFallbackRuntime.result, {
      fallbackMode: true,
      langSmithTrace: tracedFallbackRuntime.trace,
    });
  }

  const graph = createAgentRuntimeGraph(options);

  if (!langSmith.enabled) {
    const nextState = await graph.invoke(initialState);

    return applyStateUpdate(nextState, {
      fallbackMode: false,
      langSmithTrace: null,
    });
  }

  const tracedGraphRuntime = await runWithLangSmithTrace({
    name: "shipyard.graph-runtime",
    runType: "chain",
    tags: ["shipyard", "graph-runtime", initialState.phaseConfig.name],
    metadata: createRuntimeTraceMetadata(initialState, "graph"),
    getResultMetadata: (result) => createRuntimeTraceMetadata(result, "graph"),
    fn: async () => {
      const callbacks = await getLangSmithCallbacksForCurrentTrace();

      return graph.invoke(initialState, {
        callbacks,
        tags: ["shipyard", "graph-runtime", initialState.phaseConfig.name],
        metadata: createRuntimeTraceMetadata(initialState, "graph"),
      });
    },
    args: [],
  });

  return applyStateUpdate(tracedGraphRuntime.result, {
    fallbackMode: false,
    langSmithTrace: tracedGraphRuntime.trace,
  });
}
