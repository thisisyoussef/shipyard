import { access } from "node:fs/promises";
import path from "node:path";

import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { z } from "zod";

import {
  CheckpointManager,
  type CheckpointManagerLike,
} from "../checkpoints/manager.js";
import type {
  ActingLoopBudgetReason,
  BrowserEvaluationReport,
  ContextReport,
  DiscoveryReport,
  EvaluationPlan,
  ExecutionSpec,
  HarnessActingMode,
  HarnessRouteSummary,
  LoadedExecutionHandoff,
  PlanningMode,
  PreviewState,
  ResearchLookupRequest,
  ResearchLookupResult,
  TaskPlan,
  TargetProfile,
  VerificationReport,
} from "../artifacts/types.js";
import {
  createCoordinatorTaskPlan,
  createBrowserEvaluationPlan,
  createCoordinatorRouteDecision,
  createLightweightExecutionSpec,
  createExplorerQuery,
  extractInstructionTargetFilePaths,
  isClearlyLightweightInstruction,
  isSingleTurnUiBuildInstruction,
  looksLikeUiRelevantFilePath,
  looksLikeUiRelevantInstruction,
  createVerificationPlan,
  mergeBrowserEvaluationIntoVerificationReport,
  shouldCoordinatorUseDirectEditFastPath,
  type CoordinatorRouteDecision,
  shouldCoordinatorUseBrowserEvaluator,
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
import { editBlockTool, type EditBlockResult } from "../tools/edit-block.js";
import { normalizeTargetRelativePath } from "../tools/file-state.js";
import { listFilesTool } from "../tools/list-files.js";
import { findReadyServerEvidence } from "../preview/readiness.js";
import { readFileTool } from "../tools/read-file.js";
import {
  createToolSuccessResult,
  type ToolResult,
} from "../tools/registry.js";
import { runCommandTool } from "../tools/run-command.js";
import {
  RAW_LOOP_MAX_ITERATIONS,
  runRawToolLoopDetailed,
  type RawToolLoopOptions,
  type RawLoopToolHookContext,
  type RawLoopToolResultHookContext,
  type RawToolExecution,
  type RawToolLoopResult,
} from "./raw-loop.js";
import {
  createUserTurnMessage,
  type ToolCall,
  type TurnMessage,
} from "./model-adapter.js";
import {
  getArtifactDirectory,
  type ContextEnvelope,
  type FileHashMap,
} from "./state.js";
import { normalizeRuntimeFeatureFlags } from "./runtime-flags.js";
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
import {
  EXPLORER_MODEL_ROUTE,
  PLANNER_MODEL_ROUTE,
  VERIFIER_MODEL_ROUTE,
  type ModelRouteId,
} from "./model-routing.js";
import { verifySurgicalEdit } from "./live-verification.js";

export type AgentRuntimeStatus =
  | "planning"
  | "acting"
  | "verifying"
  | "recovering"
  | "responding"
  | "cancelled"
  | "done"
  | "failed";

interface DirectEditCandidateFile {
  filePath: string;
  contents: string;
  hash: string;
}

interface DirectEditArtifact {
  filePath: string;
  beforeContents: string;
  afterContents: string;
  oldBlock: string;
  newBlock: string;
  summary: string;
}

export interface AgentGraphState {
  sessionId: string;
  messageHistory: TurnMessage[];
  currentInstruction: string;
  contextEnvelope: ContextEnvelope;
  previewState: PreviewState;
  targetProfile: TargetProfile | null;
  targetDirectory: string;
  phaseConfig: Phase;
  fileHashes: FileHashMap;
  touchedFiles: string[];
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  lastEditedFile: string | null;
  checkpointRequested: boolean;
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
  directEditArtifact: DirectEditArtifact | null;
  modelProvider: string | null;
  modelName: string | null;
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
  messageHistory?: TurnMessage[];
  fileHashes?: FileHashMap;
  touchedFiles?: string[];
  retryCountsByFile?: Record<string, number>;
  blockedFiles?: string[];
  lastEditedFile?: string | null;
  checkpointRequested?: boolean;
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
  directEditArtifact?: DirectEditArtifact | null;
  modelProvider?: string | null;
  modelName?: string | null;
  fallbackMode?: boolean;
  lastError?: string | null;
  langSmithTrace?: LangSmithTraceReference | null;
}

export interface ActingLoopResult {
  status?: "completed" | "cancelled" | "continuation";
  finalText: string;
  messageHistory: TurnMessage[];
  iterations: number;
  didEdit: boolean;
  lastEditedFile: string | null;
  touchedFiles?: string[];
  actingLoopBudget?: number;
  actingLoopBudgetReason?: ActingLoopBudgetReason;
  actingMode?: HarnessActingMode;
  directEditArtifact?: DirectEditArtifact | null;
  modelProvider?: string | null;
  modelName?: string | null;
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
    request?: {
      routeId?: ModelRouteId;
    },
  ) => RawToolLoopOptions | Promise<RawToolLoopOptions>;
  runResearchLookup?: (
    request: ResearchLookupRequest,
    targetDirectory: string,
    options?: {
      discovery?: DiscoveryReport;
      signal?: AbortSignal;
    },
  ) => ResearchLookupResult | Promise<ResearchLookupResult>;
}

export interface AgentRuntimeOptions {
  mode?: "graph" | "fallback";
  maxRecoveriesPerFile?: number;
  signal?: AbortSignal;
  dependencies?: AgentRuntimeDependencies;
}

type AgentGraphNodeName =
  | "triage"
  | "plan"
  | "act"
  | "verify"
  | "recover"
  | "respond";

const DEFAULT_MAX_RECOVERIES_PER_FILE = 2;
const SINGLE_TURN_UI_BUILD_MAX_ITERATIONS = 60;

const AgentGraphStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  messageHistory: Annotation<TurnMessage[]>(),
  currentInstruction: Annotation<string>(),
  contextEnvelope: Annotation<ContextEnvelope>(),
  previewState: Annotation<PreviewState>(),
  targetProfile: Annotation<TargetProfile | null>(),
  targetDirectory: Annotation<string>(),
  phaseConfig: Annotation<Phase>(),
  fileHashes: Annotation<FileHashMap>(),
  touchedFiles: Annotation<string[]>(),
  retryCountsByFile: Annotation<Record<string, number>>(),
  blockedFiles: Annotation<string[]>(),
  lastEditedFile: Annotation<string | null>(),
  checkpointRequested: Annotation<boolean>(),
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
  directEditArtifact: Annotation<DirectEditArtifact | null>(),
  modelProvider: Annotation<string | null>(),
  modelName: Annotation<string | null>(),
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
    actingMode: "raw-loop",
    taskComplexity: "unclassified",
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
    handoffLoaded: latestHandoff !== null,
    handoffEmitted: false,
    handoffReason: latestHandoff?.handoff.resetReason.kind ?? null,
    checkpointRequested: false,
    continuationCount: 0,
    actingLoopBudget: RAW_LOOP_MAX_ITERATIONS,
    actingLoopBudgetReason: "narrow-default",
    firstHardFailure: null,
  };
}

function isBroadGreenfieldBuildInstruction(instruction: string): boolean {
  const normalizedInstruction = instruction.trim().toLowerCase();

  return /\b(bootstrap|scaffold|generate|continue)\b/.test(normalizedInstruction)
    || (
      /\b(build|create|implement)\b/.test(normalizedInstruction)
      && /\b(app|project|workspace|dashboard|screen|page|flow|module)\b/.test(normalizedInstruction)
    );
}

function isBroadContinuationInstruction(instruction: string): boolean {
  const normalizedInstruction = instruction.trim().toLowerCase();

  return /\b(continue|resume|keep going|finish)\b/.test(normalizedInstruction)
    && /\b(app|project|workspace|dashboard|build|flow|screen|page)\b/.test(normalizedInstruction);
}

export function determineActingLoopBudget(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
  latestHandoff?: LoadedExecutionHandoff | null;
  overrideMaxIterations?: number | null;
}): {
  maxIterations: number;
  reason: ActingLoopBudgetReason;
} {
  if (
    typeof options.overrideMaxIterations === "number"
    && Number.isInteger(options.overrideMaxIterations)
    && options.overrideMaxIterations > 0
  ) {
    return {
      maxIterations: options.overrideMaxIterations,
      reason: "override",
    };
  }

  const discovery = options.contextEnvelope.stable.discovery;
  const featureFlags = normalizeRuntimeFeatureFlags(
    options.contextEnvelope.runtime.featureFlags,
  );
  const explicitTargetFilePaths = [
    ...new Set([
      ...extractInstructionTargetFilePaths(options.instruction),
      ...(options.taskPlan?.targetFilePaths ?? []),
      ...(options.executionSpec?.targetFilePaths ?? []),
    ]),
  ];
  const broadGreenfieldBuild =
    (discovery.bootstrapReady || discovery.isGreenfield)
    && (
      explicitTargetFilePaths.length > 1
      || isBroadGreenfieldBuildInstruction(options.instruction)
    );
  const recentTouchedFiles = options.contextEnvelope.session.recentTouchedFiles ?? [];
  const latestHandoff = options.latestHandoff
    ?? options.contextEnvelope.session.latestHandoff
    ?? null;
  const broadContinuation =
    (latestHandoff?.handoff.resetReason.kind === "iteration-threshold"
      && latestHandoff.handoff.touchedFiles.length >= 3)
    || (
      recentTouchedFiles.length > 0
      && isBroadContinuationInstruction(options.instruction)
    );
  const singleTurnUiBuild =
    featureFlags.preferSingleTurnUiBuilds
    && isSingleTurnUiBuildInstruction(options.instruction);

  if (singleTurnUiBuild) {
    return {
      maxIterations: SINGLE_TURN_UI_BUILD_MAX_ITERATIONS,
      reason: "single-turn-ui-build",
    };
  }

  if (broadContinuation) {
    return {
      maxIterations: 45,
      reason: "broad-continuation",
    };
  }

  if (
    explicitTargetFilePaths.length > 0
    || isClearlyLightweightInstruction(options.instruction)
  ) {
    if (!broadGreenfieldBuild) {
      return {
        maxIterations: RAW_LOOP_MAX_ITERATIONS,
        reason: "narrow-default",
      };
    }
  }

  if (discovery.bootstrapReady || discovery.isGreenfield) {
    return {
      maxIterations: 45,
      reason: "broad-greenfield",
    };
  }

  return {
    maxIterations: RAW_LOOP_MAX_ITERATIONS,
    reason: "narrow-default",
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

async function createSubagentLoopOptions(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  routeId: ModelRouteId,
  signal?: AbortSignal,
): Promise<RawToolLoopOptions> {
  const rawLoopOptions =
    await dependencies.createRawLoopOptions?.(state, { routeId })
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
  if (context.toolCall.name !== "edit_block") {
    return;
  }

  const relativePath = getRelativeToolPath(context.toolCall.input);

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
    touchedFiles: state.touchedFiles,
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
  routeDecision: CoordinatorRouteDecision,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ContextReport | null> {
  if (!routeDecision.useExplorer) {
    return state.contextReport;
  }

  const runExplorerSubagent =
    dependencies.runExplorerSubagent ?? executeExplorerSubagent;

  return runExplorerSubagent(
    createExplorerQuery(state.currentInstruction),
    state.targetDirectory,
    await createSubagentLoopOptions(
      state,
      dependencies,
      EXPLORER_MODEL_ROUTE,
      signal,
    ),
  );
}

async function maybePlanExecutionSpec(
  state: AgentGraphState,
  contextReport: ContextReport | null,
  routeDecision: CoordinatorRouteDecision,
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
    || state.contextEnvelope.stable.discovery.bootstrapReady
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

  if (!routeDecision.usePlanner) {
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
      await createSubagentLoopOptions(
        state,
        dependencies,
        PLANNER_MODEL_ROUTE,
        signal,
      ),
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

const DIRECT_EDIT_MAX_CANDIDATES = 4;
const DIRECT_EDIT_SCAN_DEPTH = 3;
const DIRECT_EDIT_STYLE_SCOPE_PATTERN =
  /\b(background|color|padding|margin|spacing|font|border|shadow|style|css|class(?:name)?)\b/i;
const DIRECT_EDIT_COPY_SCOPE_PATTERN =
  /\b(copy|text|label|title|heading|button|placeholder|icon)\b/i;
const DIRECT_EDIT_SCAN_FILE_PATTERN = /\.(?:css|scss|sass|less|tsx|jsx|html)$/i;
const DIRECT_EDIT_PREFERRED_FILE_NAME_PATTERN =
  /(?:^|\/)(styles?|app|index|global|globals|theme|page|layout|button|header|footer)\.(?:css|scss|sass|less|tsx|jsx|html)$/i;
const DIRECT_EDIT_SYSTEM_PROMPT = `
You are Shipyard's direct-edit fast path.

Return only valid JSON with one of these shapes:
{"status":"edit","filePath":"relative/path","oldBlock":"exact old text","newBlock":"replacement text","summary":"short summary"}
{"status":"fallback","reason":"why the fast path is unsafe"}

Rules:
- Pick exactly one provided candidate file.
- Use exact text from that file for oldBlock.
- oldBlock must be the smallest unique anchor that safely applies the change.
- Keep indentation and surrounding formatting stable.
- For CSS color changes, use a valid CSS literal such as a hex value, rgb(), hsl(), or an actual CSS keyword. Do not use descriptive words that are not valid CSS values.
- If the request cannot be completed safely from exactly one candidate file, return fallback.
- Do not wrap the JSON in markdown fences or extra commentary.
`.trim();

const directEditResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("edit"),
    filePath: z.string().trim().min(1),
    oldBlock: z.string().min(1),
    newBlock: z.string(),
    summary: z.string().trim().min(1),
  }),
  z.object({
    status: z.literal("fallback"),
    reason: z.string().trim().min(1),
  }),
]);

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function* extractJsonObjectCandidates(rawText: string): Generator<string> {
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];

    if (objectStart === -1) {
      if (character === "{") {
        objectStart = index;
        depth = 1;
        inString = false;
        escaped = false;
      }

      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character !== "}") {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      yield rawText.slice(objectStart, index + 1);
      objectStart = -1;
    }
  }
}

function parseStructuredJson(rawText: string): unknown {
  const candidates = [rawText.trim()];

  for (const candidate of extractJsonObjectCandidates(rawText)) {
    const trimmed = candidate.trim();

    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Direct edit response was not valid JSON.");
}

function parseDirectEditResponse(rawText: string) {
  return directEditResponseSchema.parse(parseStructuredJson(rawText));
}

function createDirectEditPrompt(
  state: AgentGraphState,
  candidates: DirectEditCandidateFile[],
): string {
  const goal = state.executionSpec?.goal ?? state.currentInstruction;
  const acceptanceCriteria = state.executionSpec?.acceptanceCriteria ?? [];

  return [
    `Instruction: ${state.currentInstruction}`,
    `Goal: ${goal}`,
    acceptanceCriteria.length > 0
      ? `Acceptance criteria:\n${acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}`
      : null,
    "Candidate files:",
    ...candidates.flatMap((candidate) => [
      `--- FILE: ${candidate.filePath} ---`,
      candidate.contents,
    ]),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

function countPathDepth(filePath: string): number {
  return filePath.split("/").length;
}

function scoreDirectEditCandidatePath(
  filePath: string,
  instruction: string,
): number {
  if (!DIRECT_EDIT_SCAN_FILE_PATTERN.test(filePath)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  const lowerPath = filePath.toLowerCase();

  if (DIRECT_EDIT_STYLE_SCOPE_PATTERN.test(instruction)) {
    score += /\.(?:css|scss|sass|less)$/i.test(filePath) ? 120 : 40;
  }

  if (DIRECT_EDIT_COPY_SCOPE_PATTERN.test(instruction)) {
    score += /\.(?:tsx|jsx|html)$/i.test(filePath) ? 110 : 25;
  }

  if (DIRECT_EDIT_PREFERRED_FILE_NAME_PATTERN.test(filePath)) {
    score += 30;
  }

  if (
    lowerPath.includes("/src/")
    || lowerPath.startsWith("src/")
    || lowerPath.includes("/app/")
    || lowerPath.startsWith("app/")
    || lowerPath.includes("/components/")
    || lowerPath.startsWith("components/")
  ) {
    score += 12;
  }

  score -= countPathDepth(filePath) * 2;

  return score;
}

function createSyntheticToolExecution(options: {
  toolName: string;
  input: unknown;
  result: ToolResult;
  touchedFiles?: string[];
  editedPath?: string | null;
}): RawToolExecution {
  return {
    toolName: options.toolName,
    input: structuredClone(options.input),
    success: options.result.success,
    output: options.result.output,
    ...(options.result.error ? { error: options.result.error } : {}),
    ...(options.result.data === undefined ? {} : { data: options.result.data }),
    editedPath: options.editedPath ?? null,
    touchedFiles: options.touchedFiles ?? [],
    historyDigest: {
      requestLine: `${options.toolName} ${JSON.stringify(options.input)}`,
      resultLine: options.result.success
        ? options.result.output
        : (options.result.error ?? options.result.output),
      isWriteLike: options.toolName === "edit_block",
      prefersVerbatimTail: false,
    },
  };
}

async function executeDirectToolWithHooks<Result>(options: {
  rawLoopOptions: RawToolLoopOptions;
  targetDirectory: string;
  toolCall: ToolCall;
  run: () => Promise<{
    result: Result;
    toolResult: ToolResult;
    touchedFiles?: string[];
    editedPath?: string | null;
  }>;
}): Promise<Result> {
  const turnNumber = 1;

  await options.rawLoopOptions.beforeToolExecution?.({
    toolCall: options.toolCall,
    turnNumber,
    targetDirectory: options.targetDirectory,
  });

  let executionResult: Awaited<ReturnType<typeof options.run>> | null = null;
  let toolResult: ToolResult;

  try {
    executionResult = await options.run();
    toolResult = executionResult.toolResult;
  } catch (error) {
    toolResult = {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const toolExecution = createSyntheticToolExecution({
    toolName: options.toolCall.name,
    input: options.toolCall.input,
    result: toolResult,
    touchedFiles: executionResult?.touchedFiles,
    editedPath: executionResult?.editedPath ?? null,
  });

  await options.rawLoopOptions.afterToolExecution?.({
    toolCall: options.toolCall,
    turnNumber,
    targetDirectory: options.targetDirectory,
    result: toolResult,
    toolExecution,
  } satisfies RawLoopToolResultHookContext);

  if (!toolResult.success || executionResult === null) {
    throw new Error(toolResult.error ?? `${options.toolCall.name} failed.`);
  }

  return executionResult.result;
}

function getDirectEditKnownCandidatePaths(
  state: AgentGraphState,
): string[] {
  return uniqueStrings([
    ...(state.executionSpec?.targetFilePaths ?? []),
    ...(state.taskPlan?.targetFilePaths ?? []),
    ...state.contextEnvelope.task.targetFilePaths,
    ...(state.contextEnvelope.session.recentTouchedFiles ?? []),
    ...(state.contextReport?.findings.map((finding) => finding.filePath) ?? []),
  ]).filter((filePath) =>
    !state.blockedFiles.includes(filePath)
  );
}

async function getScannedDirectEditCandidatePaths(
  state: AgentGraphState,
  rawLoopOptions: RawToolLoopOptions,
): Promise<string[]> {
  if (
    !looksLikeUiRelevantInstruction(state.currentInstruction)
    && !DIRECT_EDIT_STYLE_SCOPE_PATTERN.test(state.currentInstruction)
    && !DIRECT_EDIT_COPY_SCOPE_PATTERN.test(state.currentInstruction)
  ) {
    return [];
  }

  try {
    const fileTree = await executeDirectToolWithHooks({
      rawLoopOptions,
      targetDirectory: state.targetDirectory,
      toolCall: {
        id: "fastpath_list_files",
        name: "list_files",
        input: {
          depth: DIRECT_EDIT_SCAN_DEPTH,
        },
      },
      run: async () => {
        const result = await listFilesTool({
          targetDirectory: state.targetDirectory,
          depth: DIRECT_EDIT_SCAN_DEPTH,
        });

        return {
          result,
          toolResult: createToolSuccessResult(result.tree, result),
        };
      },
    });

    return fileTree.entries
      .filter((entry) => !entry.isDirectory)
      .filter((entry) => looksLikeUiRelevantFilePath(entry.path))
      .map((entry) => entry.path)
      .sort((left, right) =>
        scoreDirectEditCandidatePath(right, state.currentInstruction) -
        scoreDirectEditCandidatePath(left, state.currentInstruction) ||
        left.localeCompare(right)
      )
      .slice(0, DIRECT_EDIT_MAX_CANDIDATES);
  } catch {
    return [];
  }
}

async function collectDirectEditCandidateFiles(
  state: AgentGraphState,
  rawLoopOptions: RawToolLoopOptions,
): Promise<DirectEditCandidateFile[]> {
  const knownCandidatePaths = getDirectEditKnownCandidatePaths(state);
  const candidatePaths = knownCandidatePaths.length > 0
    ? knownCandidatePaths.slice(0, DIRECT_EDIT_MAX_CANDIDATES)
    : await getScannedDirectEditCandidatePaths(state, rawLoopOptions);
  const candidates: DirectEditCandidateFile[] = [];

  for (const filePath of candidatePaths) {
    try {
      const result = await executeDirectToolWithHooks({
        rawLoopOptions,
        targetDirectory: state.targetDirectory,
        toolCall: {
          id: `fastpath_read_${candidates.length + 1}`,
          name: "read_file",
          input: {
            path: filePath,
          },
        },
        run: async () => {
          const readResult = await readFileTool({
            targetDirectory: state.targetDirectory,
            path: filePath,
          });

          return {
            result: readResult,
            toolResult: createToolSuccessResult(
              `Read ${readResult.path}`,
              readResult,
            ),
            touchedFiles: [readResult.path],
          };
        },
      });

      candidates.push({
        filePath: result.path,
        contents: result.contents,
        hash: result.hash,
      });
    } catch {
      continue;
    }
  }

  return candidates.slice(0, DIRECT_EDIT_MAX_CANDIDATES);
}

function isCheapDirectVerificationCommand(command: string): boolean {
  const normalized = command.trim();

  return normalized === "git diff --stat"
    || normalized.startsWith("test -f ")
    || normalized.startsWith("node --input-type=module -e")
    || normalized.includes("rg -n");
}

function selectDirectEditVerificationCheck(
  evaluationPlan: EvaluationPlan,
): EvaluationPlan["checks"][number] | null {
  return evaluationPlan.checks.find((check) =>
    isCheapDirectVerificationCommand(check.command)
  ) ?? null;
}

async function canRunDirectEditVerificationCommand(
  targetDirectory: string,
  command: string,
): Promise<boolean> {
  if (command.trim() !== "git diff --stat") {
    return true;
  }

  try {
    await access(path.join(targetDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
}

function toDirectEditVerificationFailureReport(
  summary: string,
): VerificationReport {
  return {
    command: "deterministic-edit",
    exitCode: 1,
    passed: false,
    stdout: "",
    stderr: summary,
    summary,
    checks: [],
    firstHardFailure: {
      checkId: "direct-edit",
      label: "Validate the targeted edit remained surgical",
      command: "deterministic-edit",
    },
    browserEvaluationReport: null,
  };
}

async function runDirectEditVerification(
  state: AgentGraphState,
  signal?: AbortSignal,
): Promise<VerificationReport> {
  const artifact = state.directEditArtifact;

  if (!artifact) {
    return createDefaultVerificationReport(state);
  }

  const currentFile = await readFileTool({
    targetDirectory: state.targetDirectory,
    path: artifact.filePath,
  });
  const surgicalVerification = verifySurgicalEdit(
    artifact.beforeContents,
    currentFile.contents,
    artifact.oldBlock,
    artifact.newBlock,
  );

  if (!surgicalVerification.changedOnlyTarget) {
    return toDirectEditVerificationFailureReport(
      `Deterministic surgical verification failed for ${artifact.filePath}: ` +
      "the file changed outside the targeted block.",
    );
  }

  const evaluationPlan = createVerificationPlan({
    contextEnvelope: state.contextEnvelope,
    executionSpec: state.executionSpec,
    editedFilePath: artifact.filePath,
    touchedFiles: state.touchedFiles,
  });
  const selectedDirectCheck = selectDirectEditVerificationCheck(evaluationPlan);
  const directCheck = selectedDirectCheck &&
    await canRunDirectEditVerificationCommand(
      state.targetDirectory,
      selectedDirectCheck.command,
    )
    ? selectedDirectCheck
    : null;

  if (!directCheck) {
    return {
      command: "deterministic-edit",
      exitCode: 0,
      passed: true,
      stdout: "",
      stderr: "",
      summary: `Deterministic surgical edit verification passed for ${artifact.filePath}.`,
      checks: [],
      firstHardFailure: null,
      browserEvaluationReport: null,
    };
  }

  const commandResult = await runCommandTool({
    targetDirectory: state.targetDirectory,
    command: directCheck.command,
    signal,
  });
  const readiness = commandResult.timedOut
    ? findReadyServerEvidence(commandResult.combinedOutput)
    : null;
  const commandPassed = commandResult.exitCode === 0 || readiness !== null;
  const commandSummary = commandPassed
    ? `Command "${directCheck.command}" passed after deterministic verification.`
    : `Command "${directCheck.command}" failed after deterministic verification.`;

  return {
    command: directCheck.command,
    exitCode: commandResult.exitCode,
    passed: commandPassed,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    summary: commandPassed
      ? `Deterministic surgical edit verification passed for ${artifact.filePath}. ${commandSummary}`
      : commandSummary,
    evaluationPlan: {
      summary: evaluationPlan.summary,
      checks: [directCheck],
    },
    checks: [
      {
        checkId: directCheck.id,
        label: directCheck.label,
        kind: directCheck.kind,
        command: directCheck.command,
        required: directCheck.required,
        status: commandPassed ? "passed" : "failed",
        exitCode: commandResult.exitCode,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        summary: commandSummary,
      },
    ],
    firstHardFailure: commandPassed
      ? null
      : {
        checkId: directCheck.id,
        label: directCheck.label,
        command: directCheck.command,
      },
    ...(readiness
      ? {
        commandReadiness: {
          status: "ready-before-timeout" as const,
          readyUrl: readiness.readyUrl,
          readyLine: readiness.readyLine,
        },
      }
      : {}),
    browserEvaluationReport: null,
  };
}

async function maybeRunDirectEditFastPath(
  state: AgentGraphState,
  rawLoopOptions: RawToolLoopOptions,
  signal?: AbortSignal,
): Promise<ActingLoopResult | null> {
  if (state.phaseConfig.name !== "code") {
    return null;
  }

  if (!rawLoopOptions.modelAdapter) {
    return null;
  }

  if (!shouldCoordinatorUseDirectEditFastPath({
    instruction: state.currentInstruction,
    contextEnvelope: state.contextEnvelope,
    planningMode: state.planningMode,
    taskComplexityHint: state.harnessRoute.taskComplexity === "unclassified"
      ? null
      : state.harnessRoute.taskComplexity,
    taskPlan: state.taskPlan,
    executionSpec: state.executionSpec,
    contextReport: state.contextReport,
  })) {
    return null;
  }

  const candidates = await collectDirectEditCandidateFiles(state, rawLoopOptions);

  if (candidates.length === 0) {
    return null;
  }

  try {
    const modelResult = await rawLoopOptions.modelAdapter.createTurn(
      {
        systemPrompt: DIRECT_EDIT_SYSTEM_PROMPT,
        messages: [createUserTurnMessage(createDirectEditPrompt(state, candidates))],
        model: rawLoopOptions.model,
        maxTokens: rawLoopOptions.maxTokens,
        temperature: 0,
      },
      { signal },
    );

    if (modelResult.stopReason !== "completed" || !modelResult.finalText.trim()) {
      return null;
    }

    const parsedResponse = parseDirectEditResponse(modelResult.finalText);

    if (parsedResponse.status === "fallback") {
      return null;
    }

    const editResponse = parsedResponse;

    const selectedCandidate = candidates.find((candidate) =>
      candidate.filePath === normalizeTargetRelativePath(editResponse.filePath)
    );

    if (!selectedCandidate) {
      return null;
    }

    let editResult: EditBlockResult;

    try {
      editResult = await executeDirectToolWithHooks({
        rawLoopOptions,
        targetDirectory: state.targetDirectory,
        toolCall: {
          id: "fastpath_edit_block",
          name: "edit_block",
          input: {
            path: selectedCandidate.filePath,
            old_string: editResponse.oldBlock,
            new_string: editResponse.newBlock,
          },
        },
        run: async () => {
          const result = await editBlockTool({
            targetDirectory: state.targetDirectory,
            path: selectedCandidate.filePath,
            old_string: editResponse.oldBlock,
            new_string: editResponse.newBlock,
          });

          return {
            result,
            toolResult: createToolSuccessResult(
              result.changed
                ? `Edited ${result.path}`
                : `No changes needed for ${result.path}`,
              result,
            ),
            touchedFiles: [result.path],
            editedPath: result.path,
          };
        },
      });
    } catch {
      return null;
    }

    return {
      status: "completed",
      finalText: editResponse.summary,
      messageHistory: state.messageHistory,
      iterations: 1,
      didEdit: editResult.changed,
      lastEditedFile: editResult.path,
      touchedFiles: [editResult.path],
      actingLoopBudget: 1,
      actingLoopBudgetReason: "direct-edit-fast-path",
      actingMode: "direct-edit",
      directEditArtifact: {
        filePath: editResult.path,
        beforeContents: selectedCandidate.contents,
        afterContents: editResult.contents,
        oldBlock: editResponse.oldBlock,
        newBlock: editResponse.newBlock,
        summary: editResponse.summary,
      },
      modelProvider: rawLoopOptions.modelAdapter.provider,
      modelName: modelResult.model,
    };
  } catch {
    return null;
  }
}

async function defaultVerifyState(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<VerificationReport> {
  if (!state.lastEditedFile) {
    return createDefaultVerificationReport(state);
  }

  if (state.directEditArtifact) {
    return runDirectEditVerification(state, signal);
  }

  const runVerifierSubagent =
    dependencies.runVerifierSubagent ?? executeVerifierSubagent;

  return runVerifierSubagent(
    createVerificationPlan({
      contextEnvelope: state.contextEnvelope,
      executionSpec: state.executionSpec,
      editedFilePath: state.lastEditedFile,
      touchedFiles: state.touchedFiles,
    }),
    state.targetDirectory,
    await createSubagentLoopOptions(
      state,
      dependencies,
      VERIFIER_MODEL_ROUTE,
      signal,
    ),
  );
}

async function defaultActingLoop(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
  signal?: AbortSignal,
): Promise<ActingLoopResult> {
  const rawLoopOptions =
    await dependencies.createRawLoopOptions?.(state, {
      routeId: state.phaseConfig.modelRoute,
    })
    ?? {};
  const budgetDecision = determineActingLoopBudget({
    instruction: state.currentInstruction,
    contextEnvelope: state.contextEnvelope,
    taskPlan: state.taskPlan,
    executionSpec: state.executionSpec,
    contextReport: state.contextReport,
    latestHandoff: state.contextEnvelope.session.latestHandoff,
    overrideMaxIterations: rawLoopOptions.maxIterations ?? null,
  });
  const checkpointManager = getCheckpointManager(state, dependencies);
  const existingBeforeToolExecution = rawLoopOptions.beforeToolExecution;
  const wrappedRawLoopOptions: RawToolLoopOptions = {
    ...rawLoopOptions,
    signal,
    maxIterations: budgetDecision.maxIterations,
    beforeToolExecution: async (context) => {
      await checkpointBeforeEdit(context, checkpointManager);
      await existingBeforeToolExecution?.(context);
    },
  };
  const directEditResult = await maybeRunDirectEditFastPath(
    state,
    wrappedRawLoopOptions,
    signal,
  );

  if (directEditResult) {
    return directEditResult;
  }

  const result: RawToolLoopResult = await runRawToolLoopDetailed(
    state.phaseConfig.systemPrompt,
    state.currentInstruction,
    state.phaseConfig.tools,
    state.targetDirectory,
    wrappedRawLoopOptions,
  );

  return {
    status: result.status,
    finalText: result.finalText,
    messageHistory: result.messageHistory,
    iterations: result.iterations,
    didEdit: result.didEdit,
    lastEditedFile: result.lastEditedFile,
    touchedFiles: result.touchedFiles,
    actingLoopBudget: budgetDecision.maxIterations,
    actingLoopBudgetReason: budgetDecision.reason,
    actingMode: "raw-loop",
    directEditArtifact: null,
    modelProvider: result.modelProvider,
    modelName: result.modelName,
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
    touchedFiles: [...(options.touchedFiles ?? [])],
    retryCountsByFile: { ...(options.retryCountsByFile ?? {}) },
    blockedFiles: [...(options.blockedFiles ?? [])],
    lastEditedFile: options.lastEditedFile ?? null,
    checkpointRequested: options.checkpointRequested ?? false,
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
    directEditArtifact: options.directEditArtifact ?? null,
    modelProvider: options.modelProvider ?? null,
    modelName: options.modelName ?? null,
    fallbackMode: options.fallbackMode ?? false,
    lastError: options.lastError ?? null,
    langSmithTrace: options.langSmithTrace ?? null,
  };
}

function resolveRoutingDecision(state: AgentGraphState): CoordinatorRouteDecision {
  return createCoordinatorRouteDecision({
    instruction: state.currentInstruction,
    contextEnvelope: state.contextEnvelope,
    planningMode: state.planningMode,
    taskComplexityHint: state.harnessRoute.taskComplexity === "unclassified"
      ? null
      : state.harnessRoute.taskComplexity,
    taskPlan: state.taskPlan,
    executionSpec: state.executionSpec,
    contextReport: state.contextReport,
  });
}

function createRuntimeTraceMetadata(
  state: AgentGraphState,
  runtimeMode: "graph" | "fallback",
): Record<string, unknown> {
  const latestHandoff = state.contextEnvelope.session.latestHandoff;
  const routingDecision = resolveRoutingDecision(state);
  const selectedPath = state.harnessRoute.selectedPath === "lightweight" &&
      routingDecision.usePlanner
    ? "planner-backed"
    : state.harnessRoute.selectedPath;

  return {
    sessionId: state.sessionId,
    runtimeMode,
    phase: state.phaseConfig.name,
    instruction: state.currentInstruction,
    targetDirectory: state.targetDirectory,
    selectedPath,
    actingMode: state.harnessRoute.actingMode,
    taskComplexity: state.harnessRoute.taskComplexity === "unclassified"
      ? routingDecision.complexity
      : state.harnessRoute.taskComplexity,
    usedExplorer: state.harnessRoute.usedExplorer || routingDecision.useExplorer,
    usedPlanner: state.harnessRoute.usedPlanner || routingDecision.usePlanner,
    usedVerifier: state.harnessRoute.usedVerifier,
    verificationMode: state.harnessRoute.verificationMode,
    verificationCheckCount: state.harnessRoute.verificationCheckCount,
    usedBrowserEvaluator: state.harnessRoute.usedBrowserEvaluator,
    browserEvaluationStatus: state.harnessRoute.browserEvaluationStatus,
    browserEvaluationFailureKind: state.harnessRoute.browserEvaluationFailureKind,
    commandReadinessStatus: state.harnessRoute.commandReadinessStatus,
    commandReadyUrl: state.harnessRoute.commandReadyUrl,
    handoffLoaded: state.harnessRoute.handoffLoaded || latestHandoff !== null,
    handoffEmitted: state.harnessRoute.handoffEmitted,
    handoffPath: latestHandoff?.artifactPath ?? null,
    handoffReason: state.harnessRoute.handoffReason
      ?? latestHandoff?.handoff.resetReason.kind
      ?? null,
    checkpointRequested: state.harnessRoute.checkpointRequested || state.checkpointRequested,
    continuationCount: state.harnessRoute.continuationCount,
    actingLoopBudget: state.harnessRoute.actingLoopBudget,
    actingLoopBudgetReason: state.harnessRoute.actingLoopBudgetReason,
    firstHardFailure: state.harnessRoute.firstHardFailure,
    modelProvider: state.modelProvider,
    modelName: state.modelName,
  };
}

function shouldUseFastTraceLookupPolicy(
  state: AgentGraphState,
): boolean {
  return state.phaseConfig.name === "code"
    && shouldCoordinatorUseDirectEditFastPath({
      instruction: state.currentInstruction,
      contextEnvelope: state.contextEnvelope,
      planningMode: state.planningMode,
      taskComplexityHint: state.harnessRoute.taskComplexity === "unclassified"
        ? null
        : state.harnessRoute.taskComplexity,
      taskPlan: state.taskPlan,
      executionSpec: state.executionSpec,
      contextReport: state.contextReport,
    });
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
    checkpointRequested: false,
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
    checkpointRequested: false,
    lastError: null,
  };
}

function isActingIterationLimitError(message: string): boolean {
  if (!message.trim()) {
    return false;
  }

  return (
    message.includes(`acting iteration limit of ${String(RAW_LOOP_MAX_ITERATIONS)}`)
    || message.includes(`exceeded ${String(RAW_LOOP_MAX_ITERATIONS)} iterations`)
    || /iteration(?:-threshold| threshold| limit)/i.test(message)
  );
}

export function routeAfterTriage(
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

  throw new Error(`Unsupported post-triage status: ${state.status}`);
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
    async triage(state) {
      const cancelledBeforeTriage = createCancellationUpdate(signal);

      if (cancelledBeforeTriage) {
        return cancelledBeforeTriage;
      }

      const routingDecision = resolveRoutingDecision(state);

      return {
        harnessRoute: {
          ...state.harnessRoute,
          taskComplexity: routingDecision.complexity,
        },
        status: "planning",
      };
    },
    async plan(state) {
      const cancelledBeforePlan = createCancellationUpdate(signal);

      if (cancelledBeforePlan) {
        return cancelledBeforePlan;
      }

      try {
        const routingDecision = resolveRoutingDecision(state);
        const contextReport = await maybeExploreContext(
          state,
          routingDecision,
          dependencies,
          signal,
        );
        const cancelledAfterExplore = createCancellationUpdate(signal);

        if (cancelledAfterExplore) {
          return cancelledAfterExplore;
        }

        const planningArtifacts = await maybePlanExecutionSpec(
          state,
          contextReport,
          routingDecision,
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
            taskComplexity: routingDecision.complexity,
            selectedPath: planningArtifacts.planningMode === "planner"
              ? "planner-backed"
              : "lightweight",
            usedExplorer: state.harnessRoute.usedExplorer
              || routingDecision.useExplorer,
            usedPlanner: state.harnessRoute.usedPlanner
              || planningArtifacts.planningMode === "planner",
          },
          status: "acting",
          checkpointRequested: false,
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
            directEditArtifact: actingLoop.directEditArtifact ?? null,
            modelProvider: actingLoop.modelProvider ?? state.modelProvider,
            modelName: actingLoop.modelName ?? state.modelName,
            finalResult:
              cancelledAfterAct?.finalResult ?? actingLoop.finalText,
            status: "cancelled",
            checkpointRequested: false,
            lastError: null,
          };
        }

        return {
          messageHistory: actingLoop.messageHistory,
          actingIterations: actingLoop.iterations,
          lastEditedFile: actingLoop.lastEditedFile,
          touchedFiles: actingLoop.touchedFiles ?? [],
          directEditArtifact: actingLoop.directEditArtifact ?? null,
          modelProvider: actingLoop.modelProvider ?? state.modelProvider,
          modelName: actingLoop.modelName ?? state.modelName,
          checkpointRequested: actingLoop.status === "continuation",
          finalResult: actingLoop.finalText,
          status: actingLoop.status === "continuation"
            ? "responding"
            : actingLoop.didEdit
              ? "verifying"
              : "responding",
          harnessRoute: {
            ...state.harnessRoute,
            actingMode: actingLoop.actingMode ?? state.harnessRoute.actingMode,
            checkpointRequested: actingLoop.status === "continuation",
            actingLoopBudget:
              actingLoop.actingLoopBudget ?? state.harnessRoute.actingLoopBudget,
            actingLoopBudgetReason:
              actingLoop.actingLoopBudgetReason
              ?? state.harnessRoute.actingLoopBudgetReason,
          },
          lastError: null,
        };
      } catch (error) {
        const cancelledUpdate = createCancellationUpdateFromError(error, signal);

        if (cancelledUpdate) {
          return cancelledUpdate;
        }

        const message = toErrorMessage(error);
        const limitHit = isActingIterationLimitError(message);

        if (limitHit) {
          return {
            actingIterations: RAW_LOOP_MAX_ITERATIONS,
            checkpointRequested: true,
            status: "responding",
            finalResult: message.includes("checkpoint")
              ? message
              : `Shipyard reached the acting iteration limit of ${String(RAW_LOOP_MAX_ITERATIONS)} and needs a checkpoint-backed continuation.`,
            harnessRoute: {
              ...state.harnessRoute,
              checkpointRequested: true,
            },
            lastError: null,
          };
        }

        return {
          actingIterations: state.actingIterations,
          checkpointRequested: false,
          status: "failed",
          finalResult: message,
          lastError: message,
        };
      }
    },
    async verify(state) {
      const cancelledBeforeVerify = createCancellationUpdate(signal);

      if (cancelledBeforeVerify) {
        return cancelledBeforeVerify;
      }

      try {
        const routingDecision = resolveRoutingDecision(state);
        const usedDeterministicVerification = state.directEditArtifact !== null;
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
            planningMode: state.planningMode,
            taskComplexityHint: routingDecision.complexity,
            routeDecision: routingDecision,
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
          touchedFiles: state.touchedFiles,
        }).checks.length;
        const verificationMode = browserEvaluationReport
          ? "command+browser"
          : usedDeterministicVerification
            ? (combinedVerificationReport.checks?.length ?? 0) > 0
              ? "deterministic+command"
              : "deterministic"
            : "command";
        const verificationCheckCount = usedDeterministicVerification
          ? 1 + (combinedVerificationReport.checks?.length ?? 0)
          : (
            combinedVerificationReport.evaluationPlan?.checks.length
            ?? combinedVerificationReport.checks?.length
            ?? plannedVerificationChecks
          );
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
            usedVerifier: usedDeterministicVerification
              ? state.harnessRoute.usedVerifier
              : true,
            checkpointRequested: state.checkpointRequested,
            verificationMode,
            verificationCheckCount,
            usedBrowserEvaluator: browserEvaluationReport !== null,
            browserEvaluationStatus:
              browserEvaluationReport?.status ?? "not_run",
            browserEvaluationFailureKind:
              browserEvaluationReport?.failure?.kind ?? null,
            commandReadinessStatus:
              combinedVerificationReport.commandReadiness?.status ?? "none",
            commandReadyUrl:
              combinedVerificationReport.commandReadiness?.readyUrl ?? null,
            firstHardFailure:
              combinedVerificationReport.firstHardFailure ?? null,
          },
          status: combinedVerificationReport.passed ? "responding" : "recovering",
          checkpointRequested: false,
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
          directEditArtifact: null,
          checkpointRequested: false,
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
        directEditArtifact: null,
        checkpointRequested: false,
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
        checkpointRequested: state.checkpointRequested,
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
    .addNode("triage", nodes.triage)
    .addNode("plan", nodes.plan)
    .addNode("act", nodes.act)
    .addNode("verify", nodes.verify)
    .addNode("recover", nodes.recover)
    .addNode("respond", nodes.respond)
    .addEdge(START, "triage")
    .addConditionalEdges("triage", routeAfterTriage, {
      plan: "plan",
      respond: "respond",
    })
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
  let nextNode: AgentGraphNodeName = "triage";

  while (true) {
    if (nextNode === "triage") {
      state = applyStateUpdate(state, await nodes.triage(state));
      nextNode = routeAfterTriage(state);
      continue;
    }

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
  const traceLookup = shouldUseFastTraceLookupPolicy(initialState)
    ? {
      maxAttempts: 1,
      delayMs: 0,
    }
    : undefined;

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
    traceLookup,
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
