import { access } from "node:fs/promises";
import path from "node:path";

import {
  createExecutionHandoff,
  createExecutionHandoffDecision,
  loadExecutionHandoff,
  type LoadExecutionHandoffResult,
  saveExecutionHandoff,
} from "../artifacts/handoff.js";
import type {
  DiscoveryReport,
  ExecutionSpec,
  HarnessRouteSummary,
  LoadedExecutionHandoff,
  PlanningMode,
  TargetProfile,
  TaskPlan,
} from "../artifacts/types.js";
import {
  buildContextEnvelope,
  composeSystemPrompt,
} from "../context/envelope.js";
import { createCodePhase } from "../phases/code/index.js";
import { createTargetManagerPhase } from "../phases/target-manager/index.js";
import { gitDiffTool } from "../tools/index.js";
import type { EditBlockResult } from "../tools/edit-block.js";
import { normalizeTargetRelativePath } from "../tools/file-state.js";
import type { ToolResult } from "../tools/registry.js";
import type { RunCommandResult } from "../tools/run-command.js";
import type { WriteFilePreviewData } from "../tools/write-file.js";
import {
  createAgentGraphState,
  runAgentRuntime,
  type AgentRuntimeDependencies,
  type AgentRuntimeOptions,
} from "./graph.js";
import type {
  RawLoopToolHookContext,
  RawLoopToolResultHookContext,
} from "./raw-loop.js";
import {
  DEFAULT_TURN_CANCELLED_REASON,
  getTurnCancellationReason,
  toTurnCancelledError,
} from "./cancellation.js";
import {
  createCancelledTurnText,
  createExecutionTurnSummary,
  truncateText,
  updateRollingSummary,
} from "./turn-summary.js";
import { getTargetEnrichmentInvoker } from "./target-enrichment.js";
import {
  saveSessionState,
  type ContextEnvelope,
  type SessionState,
} from "./state.js";
import {
  runWithLangSmithTrace,
  type LangSmithTraceReference,
} from "../tracing/langsmith.js";
import { configureTargetManagerEnrichmentInvoker } from "../tools/target-manager/enrich-target.js";
import {
  createModelAdapterForRoute,
  createModelRoutingConfig,
  type ModelRoutingConfig,
  type ModelRoutingOverrides,
} from "./model-routing.js";

export type InstructionRuntimeMode = "graph" | "fallback";

export interface InstructionContinuationLimits {
  maxAutomaticResumes: number;
  maxWallClockMs: number;
}

const DEFAULT_INSTRUCTION_CONTINUATION_LIMITS: InstructionContinuationLimits = {
  maxAutomaticResumes: 1,
  maxWallClockMs: 8 * 60_000,
};

export interface InstructionRuntimeState {
  projectRules: string;
  baseInjectedContext: string[];
  recentToolOutputs: string[];
  recentErrors: string[];
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  pendingTargetSelectionPath: string | null;
  modelRouting: ModelRoutingConfig;
  modelRoutingEnv: NodeJS.ProcessEnv;
  targetEnrichmentInvoker?: (
    prompt: string,
  ) => Promise<{
    text: string;
    model: string;
  }>;
  runtimeMode: InstructionRuntimeMode;
  runtimeDependencies?: AgentRuntimeDependencies;
  continuationLimits: InstructionContinuationLimits;
}

export interface TurnStateEvent {
  sessionState: SessionState;
  connectionState: "agent-busy" | "ready" | "error";
}

export interface ToolCallEvent {
  callId: string;
  toolName: string;
  summary: string;
}

export interface ToolResultEvent {
  callId: string;
  toolName: string;
  success: boolean;
  summary: string;
  detail?: string;
  command?: string;
}

export interface EditEvent {
  path: string;
  summary: string;
  diff: string;
  beforePreview?: string | null;
  afterPreview?: string | null;
  addedLines?: number;
  removedLines?: number;
}

export interface DoneEvent {
  status: "success" | "error" | "cancelled";
  summary: string;
  langSmithTrace?: LangSmithTraceReference | null;
}

export interface InstructionTurnReporter {
  onTurnState?: (event: TurnStateEvent) => Promise<void> | void;
  onThinking?: (message: string) => Promise<void> | void;
  onToolCall?: (event: ToolCallEvent) => Promise<void> | void;
  onToolResult?: (event: ToolResultEvent) => Promise<void> | void;
  onEdit?: (event: EditEvent) => Promise<void> | void;
  onText?: (text: string) => Promise<void> | void;
  onError?: (message: string) => Promise<void> | void;
  onDone?: (event: DoneEvent) => Promise<void> | void;
}

export interface ExecuteInstructionTurnOptions {
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  instruction: string;
  injectedContext?: string[];
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
}

export interface InstructionTurnResult {
  phaseName: string;
  runtimeMode: InstructionRuntimeMode;
  taskPlan: TaskPlan;
  executionSpec: ExecutionSpec | null;
  planningMode: PlanningMode;
  harnessRoute: HarnessRouteSummary;
  contextEnvelope: ContextEnvelope;
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  selectedTargetPath: string | null;
  langSmithTrace: LangSmithTraceReference | null;
  handoff: InstructionTurnHandoffState;
}

export interface InstructionTurnHandoffState {
  loaded: LoadedExecutionHandoff | null;
  loadError: string | null;
  emitted: LoadedExecutionHandoff | null;
}

function createHarnessRouteForErrorState(
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
    browserEvaluationFailureKind: null,
    commandReadinessStatus: "none",
    commandReadyUrl: null,
    handoffLoaded: latestHandoff !== null,
    handoffEmitted: false,
    handoffReason: latestHandoff?.handoff.resetReason.kind ?? null,
    checkpointRequested: false,
    continuationCount: 0,
    actingLoopBudget: 25,
    actingLoopBudgetReason: "narrow-default",
    firstHardFailure: null,
  };
}

const EXPLICIT_FILE_PATH_PATTERN =
  /(?:\.{1,2}\/)?[A-Za-z0-9_-]+(?:[/.][A-Za-z0-9_-]+)+/;
const RECENT_TOUCHED_FILES_LIMIT = 24;

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

function normalizeRecentFilePath(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return normalizeTargetRelativePath(trimmed);
  } catch {
    return trimmed;
  }
}

function rememberRecentFilePath(
  values: string[],
  nextValue: string,
  limit = RECENT_TOUCHED_FILES_LIMIT,
): void {
  const normalized = normalizeRecentFilePath(nextValue);

  if (!normalized) {
    return;
  }

  const existingIndex = values.indexOf(normalized);

  if (existingIndex >= 0) {
    values.splice(existingIndex, 1);
  }

  values.push(normalized);

  while (values.length > limit) {
    values.shift();
  }
}

function rememberRecentFilePaths(
  values: string[],
  nextValues: Iterable<string>,
  limit = RECENT_TOUCHED_FILES_LIMIT,
): void {
  for (const nextValue of nextValues) {
    rememberRecentFilePath(values, nextValue, limit);
  }
}

function summarizeGitDiff(result: RunCommandResult): string {
  if (result.exitCode !== 0) {
    const stderr = truncateText(result.stderr, 180);
    return stderr
      ? `git diff failed: ${stderr}`
      : `git diff exited with code ${String(result.exitCode)}.`;
  }

  if (!result.stdout.trim()) {
    return "Working tree is clean.";
  }

  const fileMatches = [...result.stdout.matchAll(/^diff --git a\/(.+?) b\//gm)];
  const changedFiles = fileMatches.map((match) => match[1]).filter(Boolean);
  const fileCount = changedFiles.length || 1;

  return `Detected diff for ${String(fileCount)} file${fileCount === 1 ? "" : "s"}.`;
}

function extractDiffPath(result: RunCommandResult): string {
  const match = result.stdout.match(/^diff --git a\/(.+?) b\//m);
  return match?.[1] ?? "(workspace)";
}

function summarizeGitDiffPreview(result: RunCommandResult): string | null {
  const trimmed = result.stdout.trim();

  if (!trimmed) {
    return null;
  }

  return truncateText(trimmed, 1_200);
}

function extractExplicitFilePath(instruction: string): string | null {
  const match = instruction.match(EXPLICIT_FILE_PATH_PATTERN);
  return match?.[0] ?? null;
}

async function isGitRepository(targetDirectory: string): Promise<boolean> {
  try {
    await access(path.join(targetDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function captureCurrentGitDiff(
  targetDirectory: string,
): Promise<string | null> {
  try {
    const result = await gitDiffTool({
      targetDirectory,
    });

    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trimEnd();
    }
  } catch {
    return null;
  }

  return null;
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

function isEditBlockResult(value: unknown): value is EditBlockResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "beforePreview" in value &&
    typeof value.beforePreview === "string" &&
    "afterPreview" in value &&
    typeof value.afterPreview === "string"
  );
}

function isWriteFilePreviewData(value: unknown): value is WriteFilePreviewData {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "afterPreview" in value &&
    typeof value.afterPreview === "string"
  );
}

function isBootstrapTargetData(
  value: unknown,
): value is {
  scaffoldType: string;
  createdFiles: string[];
  discovery: DiscoveryReport;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    scaffoldType?: unknown;
    createdFiles?: unknown;
    discovery?: unknown;
  };
  const discovery = candidate.discovery as {
    isGreenfield?: unknown;
    topLevelFiles?: unknown;
  } | null;

  return (
    typeof candidate.scaffoldType === "string" &&
    Array.isArray(candidate.createdFiles) &&
    candidate.createdFiles.every((item) => typeof item === "string") &&
    typeof discovery === "object" &&
    discovery !== null &&
    typeof discovery.isGreenfield === "boolean" &&
    Array.isArray(discovery.topLevelFiles)
  );
}

function createBootstrapPreview(createdFiles: string[]): string {
  const previewLines = createdFiles.slice(0, 12);
  const preview = previewLines.join("\n");

  if (createdFiles.length > previewLines.length) {
    return `${preview}\n...`;
  }

  return preview || "(no files)";
}

function createImmediateEditDiff(options: {
  path: string;
  beforePreview?: string | null;
  afterPreview?: string | null;
}): string {
  const lines = [
    `diff --shipyard ${options.path}`,
    "@@ immediate edit preview @@",
  ];

  if (options.beforePreview) {
    lines.push(
      ...options.beforePreview
        .split("\n")
        .map((line) => `-${line}`),
    );
  }

  if (options.afterPreview) {
    lines.push(
      ...options.afterPreview
        .split("\n")
        .map((line) => `+${line}`),
    );
  }

  return lines.join("\n");
}

function createImmediateEditEvent(
  toolName: string,
  resultData: unknown,
): EditEvent | null {
  if (toolName === "edit_block" && isEditBlockResult(resultData)) {
    return {
      path: resultData.path,
      summary: `Applied targeted edit to ${resultData.path}`,
      diff: createImmediateEditDiff({
        path: resultData.path,
        beforePreview: resultData.beforePreview,
        afterPreview: resultData.afterPreview,
      }),
      beforePreview: resultData.beforePreview,
      afterPreview: resultData.afterPreview,
      addedLines: resultData.addedLines,
      removedLines: resultData.removedLines,
    };
  }

  if (toolName === "write_file" && isWriteFilePreviewData(resultData)) {
    return {
      path: resultData.path,
      summary: `Created ${resultData.path}`,
      diff: createImmediateEditDiff({
        path: resultData.path,
        afterPreview: resultData.afterPreview,
      }),
      beforePreview: null,
      afterPreview: resultData.afterPreview,
      addedLines: resultData.totalLines,
      removedLines: 0,
    };
  }

  if (toolName === "bootstrap_target" && isBootstrapTargetData(resultData)) {
    const afterPreview = createBootstrapPreview(resultData.createdFiles);

    return {
      path: `bootstrap:${resultData.scaffoldType}`,
      summary:
        `Bootstrapped ${String(resultData.createdFiles.length)} files ` +
        `with ${resultData.scaffoldType}`,
      diff: createImmediateEditDiff({
        path: `bootstrap:${resultData.scaffoldType}`,
        afterPreview,
      }),
      beforePreview: null,
      afterPreview,
      addedLines: resultData.createdFiles.length,
      removedLines: 0,
    };
  }

  return null;
}

function isTargetSelectionData(value: unknown): value is { path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    value.path.trim().length > 0
  );
}

function isTargetProfileData(
  value: unknown,
): value is TargetProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    typeof value.description === "string" &&
    "enrichedAt" in value &&
    typeof value.enrichedAt === "string"
  );
}

async function emitDiffPreviewIfAvailable(
  reporter: InstructionTurnReporter | undefined,
  targetDirectory: string,
  relativePath: string | null,
): Promise<void> {
  if (!reporter?.onEdit) {
    return;
  }

  if (!relativePath || !(await isGitRepository(targetDirectory))) {
    return;
  }

  const result = await gitDiffTool({
    targetDirectory,
    path: relativePath,
  });
  const diffPreview = summarizeGitDiffPreview(result);

  if (!diffPreview) {
    return;
  }

  await reporter.onEdit({
    path: extractDiffPath(result),
    summary: `Current workspace diff preview for ${relativePath}`,
    diff: diffPreview,
  });
}

function createSilentLogger() {
  return {
    log() {},
  };
}

function createEmptyTurnHandoffState(): InstructionTurnHandoffState {
  return {
    loaded: null,
    loadError: null,
    emitted: null,
  };
}
function createRuntimeDependencies(
  sessionState: SessionState,
  runtimeState: InstructionRuntimeState,
  reporter: InstructionTurnReporter | undefined,
  editPreviewState: { emitted: boolean },
  signal?: AbortSignal,
): AgentRuntimeDependencies {
  const baseDependencies = runtimeState.runtimeDependencies;

  return {
    ...baseDependencies,
    async createRawLoopOptions(graphState, request) {
      const baseOptions =
        await baseDependencies?.createRawLoopOptions?.(graphState, request)
        ?? {};
      const existingBeforeToolExecution = baseOptions.beforeToolExecution;
      const existingAfterToolExecution = baseOptions.afterToolExecution;
      const routeId = request?.routeId ?? graphState.phaseConfig.modelRoute;
      const selection =
        !baseOptions.modelAdapter && !baseOptions.client && routeId
          ? createModelAdapterForRoute({
              routing: runtimeState.modelRouting,
              routeId,
              env: runtimeState.modelRoutingEnv,
            })
          : null;

      return {
        ...baseOptions,
        modelAdapter: baseOptions.modelAdapter ?? selection?.modelAdapter,
        model: baseOptions.model ?? selection?.model ?? undefined,
        logger: baseOptions.logger ?? createSilentLogger(),
        beforeToolExecution: async (context: RawLoopToolHookContext) => {
          await existingBeforeToolExecution?.(context);

          if (signal?.aborted) {
            return;
          }

          await reporter?.onToolCall?.({
            callId: context.toolCall.id,
            toolName: context.toolCall.name,
            summary: summarizeToolCallInput(context.toolCall.input),
          });
        },
        afterToolExecution: async (context: RawLoopToolResultHookContext) => {
          await existingAfterToolExecution?.(context);

          if (signal?.aborted) {
            return;
          }

          const summary = summarizeToolResult(context.result);

          if (context.result.success) {
            rememberRecent(
              runtimeState.recentToolOutputs,
              `${context.toolCall.name} ${summary}`,
            );
          } else {
            rememberRecent(runtimeState.recentErrors, summary);
          }

          await reporter?.onToolResult?.({
            callId: context.toolCall.id,
            toolName: context.toolCall.name,
            success: context.result.success,
            summary,
            detail: getToolResultDetail(context.result),
            command: extractCommandFromToolInput(context.toolCall.input),
          });

          const immediateEditEvent = context.result.success
            ? createImmediateEditEvent(
                context.toolCall.name,
                context.result.data,
              )
            : null;

          if (
            context.result.success
            && context.toolExecution.touchedFiles.length > 0
          ) {
            rememberRecentFilePaths(
              sessionState.recentTouchedFiles,
              context.toolExecution.touchedFiles,
            );
          }

          if (immediateEditEvent) {
            editPreviewState.emitted = true;
            await reporter?.onEdit?.(immediateEditEvent);
          }

          if (
            context.result.success &&
            context.toolCall.name === "select_target" &&
            isTargetSelectionData(context.result.data)
          ) {
            runtimeState.pendingTargetSelectionPath = context.result.data.path;
          }

          if (
            context.result.success &&
            context.toolCall.name === "enrich_target" &&
            isTargetProfileData(context.result.data)
          ) {
            sessionState.targetProfile = context.result.data;
          }

          if (
            context.result.success &&
            context.toolCall.name === "bootstrap_target" &&
            isBootstrapTargetData(context.result.data)
          ) {
            sessionState.discovery = context.result.data.discovery;
            rememberRecentFilePaths(
              sessionState.recentTouchedFiles,
              context.result.data.createdFiles,
            );
          }
        },
      };
    },
  };
}

export function createInstructionRuntimeState(
  options: {
    projectRules: string;
    baseInjectedContext?: string[];
    continuationLimits?: Partial<InstructionContinuationLimits>;
    modelRouting?: ModelRoutingOverrides;
    env?: NodeJS.ProcessEnv;
    targetEnrichmentInvoker?: (
      prompt: string,
    ) => Promise<{
      text: string;
      model: string;
    }>;
    runtimeMode?: InstructionRuntimeMode;
    runtimeDependencies?: AgentRuntimeDependencies;
  },
): InstructionRuntimeState {
  const modelRoutingEnv = options.env ?? process.env;
  const modelRouting = createModelRoutingConfig({
    env: modelRoutingEnv,
    ...options.modelRouting,
  });

  return {
    projectRules: options.projectRules,
    baseInjectedContext: [...(options.baseInjectedContext ?? [])],
    recentToolOutputs: [],
    recentErrors: [],
    retryCountsByFile: {},
    blockedFiles: [],
    pendingTargetSelectionPath: null,
    modelRouting,
    modelRoutingEnv,
    targetEnrichmentInvoker: options.targetEnrichmentInvoker,
    runtimeMode: options.runtimeMode ?? "graph",
    runtimeDependencies: options.runtimeDependencies,
    continuationLimits: {
      maxAutomaticResumes:
        options.continuationLimits?.maxAutomaticResumes
        ?? DEFAULT_INSTRUCTION_CONTINUATION_LIMITS.maxAutomaticResumes,
      maxWallClockMs:
        options.continuationLimits?.maxWallClockMs
        ?? DEFAULT_INSTRUCTION_CONTINUATION_LIMITS.maxWallClockMs,
    },
  };
}

function createInstructionTurnTraceMetadata(options: {
  sessionId: string;
  runtimeMode: InstructionRuntimeMode;
  phaseName: string;
  instruction: string;
  targetDirectory: string;
  planningMode?: PlanningMode | null;
  harnessRoute?: HarnessRouteSummary | null;
  turnStatus?: InstructionTurnResult["status"];
  finalText?: string;
  summary?: string;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    sessionId: options.sessionId,
    runtimeMode: options.runtimeMode,
    phase: options.phaseName,
    instruction: options.instruction,
    targetDirectory: options.targetDirectory,
  };

  if (options.planningMode) {
    metadata.planningMode = options.planningMode;
  }

  if (options.harnessRoute) {
    Object.assign(metadata, options.harnessRoute);
  }

  if (options.turnStatus) {
    metadata.turnStatus = options.turnStatus;
  }

  const runtimeFailure = classifyInstructionTurnFailure({
    status: options.turnStatus,
    finalText: options.finalText,
    summary: options.summary,
  });

  if (runtimeFailure) {
    metadata.runtimeFailureKind = runtimeFailure.kind;
    metadata.runtimeFailureStopReason = runtimeFailure.stopReason;
  }

  return metadata;
}

function classifyInstructionTurnFailure(options: {
  status?: InstructionTurnResult["status"];
  finalText?: string;
  summary?: string;
}): { kind: "cancelled" | "timeout" | "budget_exhausted" | "error"; stopReason: string | null } | null {
  if (!options.status || options.status === "success") {
    return null;
  }

  if (options.status === "cancelled") {
    return {
      kind: "cancelled",
      stopReason: null,
    };
  }

  const combinedMessage = `${options.summary ?? ""}\n${options.finalText ?? ""}`
    .trim()
    .toLowerCase();

  if (combinedMessage.includes("stop_reason=max_tokens")
    || combinedMessage.includes("output budget exhausted")) {
    return {
      kind: "budget_exhausted",
      stopReason: "max_tokens",
    };
  }

  if (combinedMessage.includes("timed out")) {
    return {
      kind: "timeout",
      stopReason: null,
    };
  }

  return {
    kind: "error",
    stopReason: null,
  };
}

async function emitInstructionTurnOutcome(
  reporter: InstructionTurnReporter | undefined,
  sessionState: SessionState,
  result: InstructionTurnResult,
): Promise<void> {
  await reporter?.onText?.(result.finalText);

  if (result.status === "error") {
    await reporter?.onError?.(result.summary);
  }

  await reporter?.onDone?.({
    status: result.status,
    summary: result.summary,
    langSmithTrace: result.langSmithTrace,
  });
  await emitTurnState(
    reporter,
    sessionState,
    result.status === "error" ? "error" : "ready",
  );
}

export async function executeInstructionTurn(
  options: ExecuteInstructionTurnOptions,
): Promise<InstructionTurnResult> {
  const phase = options.sessionState.activePhase === "target-manager"
    ? createTargetManagerPhase()
    : createCodePhase();
  const state = options.sessionState;
  const runtimeState = options.runtimeState;
  runtimeState.pendingTargetSelectionPath = null;
  const explicitFilePath = extractExplicitFilePath(options.instruction);
  const targetFilePaths = [
    ...(explicitFilePath ? [explicitFilePath] : []),
    ...(state.activeTask?.status === "in_progress"
      ? state.activeTask.targetFilePaths
      : []),
  ];
  const mergedInjectedContext = [
    ...runtimeState.baseInjectedContext,
    ...(options.injectedContext ?? []),
  ];
  let loadedHandoff: LoadedExecutionHandoff | null = null;
  let handoffLoadError: string | null = null;

  if (state.activeHandoffPath) {
    const loadedHandoffResult: LoadExecutionHandoffResult =
      await loadExecutionHandoff(state.targetDirectory, state.activeHandoffPath);

    loadedHandoff = loadedHandoffResult.handoff;
    handoffLoadError = loadedHandoffResult.error;

    if (handoffLoadError) {
      state.activeHandoffPath = null;
      rememberRecent(runtimeState.recentErrors, handoffLoadError);
    }
  }

  state.turnCount += 1;
  state.lastActiveAt = new Date().toISOString();

  await emitTurnState(options.reporter, state, "agent-busy");
  await options.reporter?.onThinking?.(
    `Planning turn ${String(state.turnCount)} in phase "${phase.name}" via ${runtimeState.runtimeMode} runtime.`,
  );

  const executeCore = async (): Promise<InstructionTurnResult> => {
    const contextEnvelope = await buildContextEnvelope({
      targetDirectory: state.targetDirectory,
      discovery: state.discovery,
      currentInstruction: options.instruction,
      injectedContext: mergedInjectedContext,
      targetFilePaths,
      recentToolOutputs: runtimeState.recentToolOutputs,
      recentErrors: runtimeState.recentErrors,
      currentGitDiff: await captureCurrentGitDiff(state.targetDirectory),
      rollingSummary: state.rollingSummary,
      retryCountsByFile: runtimeState.retryCountsByFile,
      blockedFiles: runtimeState.blockedFiles,
      recentTouchedFiles: state.recentTouchedFiles,
      latestHandoff: loadedHandoff,
      activeTask: state.activeTask,
    });

    runtimeState.projectRules = contextEnvelope.stable.projectRules;

    const initialState = createAgentGraphState({
      sessionId: state.sessionId,
      instruction: options.instruction,
      contextEnvelope,
      previewState: state.workbenchState.previewState,
      targetProfile: state.targetProfile ?? null,
      targetDirectory: state.targetDirectory,
      phaseConfig: {
        ...phase,
        systemPrompt: composeSystemPrompt(phase.systemPrompt, contextEnvelope),
      },
      retryCountsByFile: runtimeState.retryCountsByFile,
      blockedFiles: runtimeState.blockedFiles,
    });
    const editPreviewState = { emitted: false };
    const runtimeDependencies = createRuntimeDependencies(
      state,
      runtimeState,
      options.reporter,
      editPreviewState,
      options.signal,
    );

    configureTargetManagerEnrichmentInvoker(
      getTargetEnrichmentInvoker({
        invokeModel: runtimeState.targetEnrichmentInvoker,
        modelRouting: runtimeState.modelRouting,
        env: runtimeState.modelRoutingEnv,
      }),
    );

    try {
      const finalState = await runAgentRuntime(initialState, {
        mode: runtimeState.runtimeMode,
        signal: options.signal,
        dependencies: runtimeDependencies,
      } satisfies AgentRuntimeOptions);
      const taskPlan = finalState.taskPlan ?? {
        instruction: options.instruction,
        goal: options.instruction,
        targetFilePaths,
        plannedSteps: [
          "Read the relevant files before editing.",
          "Choose the smallest unique anchor for each change.",
          "Leave command-based verification to the verifier after the edit unless shell output is required now.",
        ],
      };
      const executionSpec = finalState.executionSpec ?? null;
      const planningMode = finalState.planningMode;
      const finalText = finalState.finalResult
        ?? "Shipyard finished without a final response.";
      rememberRecentFilePaths(state.recentTouchedFiles, taskPlan.targetFilePaths);
      rememberRecentFilePaths(
        state.recentTouchedFiles,
        executionSpec?.targetFilePaths ?? [],
      );
      rememberRecentFilePaths(
        state.recentTouchedFiles,
        finalState.touchedFiles,
      );

      if (finalState.lastEditedFile) {
        rememberRecentFilePath(
          state.recentTouchedFiles,
          finalState.lastEditedFile,
        );
      }

      const finalStateStatus = finalState.status === "failed"
        ? "failed"
        : finalState.status === "cancelled"
          ? "cancelled"
          : "done";
      const summary = createExecutionTurnSummary(
        state.turnCount,
        runtimeState.runtimeMode,
        finalStateStatus,
        finalText,
      );
      const handoffDecision = createExecutionHandoffDecision({
        actingIterations: finalState.actingIterations,
        retryCountsByFile: finalState.retryCountsByFile,
        blockedFiles: finalState.blockedFiles,
      });
      let emittedHandoff: LoadedExecutionHandoff | null = null;

      if (
        handoffDecision.shouldPersist &&
        handoffDecision.kind &&
        handoffDecision.summary
      ) {
        emittedHandoff = await saveExecutionHandoff(
          state.targetDirectory,
          createExecutionHandoff({
            sessionId: state.sessionId,
            turnCount: state.turnCount,
            instruction: options.instruction,
            phaseName: phase.name,
            runtimeMode: runtimeState.runtimeMode,
            status:
              finalStateStatus === "done"
                ? "success"
                : finalStateStatus === "failed"
                  ? "error"
                  : "cancelled",
            summary,
            taskPlan,
            actingIterations: finalState.actingIterations,
            retryCountsByFile: finalState.retryCountsByFile,
            blockedFiles: finalState.blockedFiles,
            lastEditedFile: finalState.lastEditedFile,
            touchedFiles: finalState.touchedFiles,
            verificationReport: finalState.verificationReport,
            decision: handoffDecision,
          }),
        );
        state.activeHandoffPath = emittedHandoff.artifactPath;
      } else if (loadedHandoff && finalStateStatus === "done") {
        state.activeHandoffPath = null;
      }
      const handoffState: InstructionTurnHandoffState = {
        loaded: loadedHandoff,
        loadError: handoffLoadError,
        emitted: emittedHandoff,
      };
      const harnessRoute: HarnessRouteSummary = {
        ...finalState.harnessRoute,
        handoffLoaded: loadedHandoff !== null,
        handoffEmitted: emittedHandoff !== null,
        handoffReason:
          emittedHandoff?.handoff.resetReason.kind
          ?? finalState.harnessRoute.handoffReason
          ?? loadedHandoff?.handoff.resetReason.kind
          ?? null,
        checkpointRequested: finalState.checkpointRequested,
      };

      runtimeState.retryCountsByFile = { ...finalState.retryCountsByFile };
      runtimeState.blockedFiles = [...finalState.blockedFiles];

      if (!editPreviewState.emitted) {
        await emitDiffPreviewIfAvailable(
          options.reporter,
          state.targetDirectory,
          finalState.lastEditedFile,
        );
      }
      if (finalStateStatus === "cancelled") {
        const cancellationReason = finalText
          || getTurnCancellationReason(options.signal)
          || DEFAULT_TURN_CANCELLED_REASON;
        const cancelledTurnText = createCancelledTurnText(
          state.turnCount,
          cancellationReason,
        );

        state.rollingSummary = updateRollingSummary(
          state.rollingSummary,
          state.turnCount,
          options.instruction,
          summary,
        );

        return {
          phaseName: phase.name,
          runtimeMode: runtimeState.runtimeMode,
          taskPlan,
          executionSpec,
          planningMode,
          harnessRoute,
          contextEnvelope,
          status: "cancelled",
          summary: cancellationReason,
          finalText: cancelledTurnText,
          selectedTargetPath: null,
          langSmithTrace: finalState.langSmithTrace,
          handoff: handoffState,
        };
      }
      if (finalStateStatus === "failed") {
        const errorMessage = finalState.lastError ?? finalText;
        const failedTurnText = `Turn ${String(state.turnCount)} stopped: ${errorMessage}`;

        rememberRecent(runtimeState.recentErrors, errorMessage);
        state.rollingSummary = updateRollingSummary(
          state.rollingSummary,
          state.turnCount,
          options.instruction,
          summary,
        );

        return {
          phaseName: phase.name,
          runtimeMode: runtimeState.runtimeMode,
          taskPlan,
          executionSpec,
          planningMode,
          harnessRoute,
          contextEnvelope,
          status: "error",
          summary: errorMessage,
          finalText: failedTurnText,
          selectedTargetPath: null,
          langSmithTrace: finalState.langSmithTrace,
          handoff: handoffState,
        };
      }

      state.rollingSummary = updateRollingSummary(
        state.rollingSummary,
        state.turnCount,
        options.instruction,
        summary,
      );

      return {
        phaseName: phase.name,
        runtimeMode: runtimeState.runtimeMode,
        taskPlan,
        executionSpec,
        planningMode,
        harnessRoute,
        contextEnvelope,
        status: "success",
        summary,
        finalText,
        selectedTargetPath: runtimeState.pendingTargetSelectionPath,
        langSmithTrace: finalState.langSmithTrace,
        handoff: handoffState,
      };
    } catch (error) {
      const cancelledError = toTurnCancelledError(error, options.signal);

      if (cancelledError) {
        const cancellationReason = cancelledError.message;
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

        return {
          phaseName: phase.name,
          runtimeMode: runtimeState.runtimeMode,
          taskPlan: {
            instruction: options.instruction,
            goal: options.instruction,
            targetFilePaths,
            plannedSteps: [],
          },
          executionSpec: null,
          planningMode: "lightweight",
          harnessRoute: createHarnessRouteForErrorState(contextEnvelope),
          contextEnvelope,
          status: "cancelled",
          summary: cancellationReason,
          finalText,
          selectedTargetPath: null,
          langSmithTrace: null,
          handoff: {
            loaded: loadedHandoff,
            loadError: handoffLoadError,
            emitted: null,
          },
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

      return {
        phaseName: phase.name,
        runtimeMode: runtimeState.runtimeMode,
        taskPlan: {
          instruction: options.instruction,
          goal: options.instruction,
          targetFilePaths,
          plannedSteps: [],
        },
        executionSpec: null,
        planningMode: "lightweight",
        harnessRoute: createHarnessRouteForErrorState(contextEnvelope),
        contextEnvelope,
        status: "error",
        summary: message,
        finalText,
        selectedTargetPath: null,
        langSmithTrace: null,
        handoff: {
          loaded: loadedHandoff,
          loadError: handoffLoadError,
          emitted: null,
        },
      };
    } finally {
      configureTargetManagerEnrichmentInvoker(null);
      await saveSessionState(state);
    }
  };

  const executeWithContinuations = async (): Promise<InstructionTurnResult> => {
    const startedAt = Date.now();
    let continuationCount = 0;
    let result = await executeCore();

    while (
      result.status === "success"
      && result.harnessRoute.checkpointRequested
      && result.handoff.emitted !== null
      && !options.signal?.aborted
    ) {
      if (
        continuationCount >= runtimeState.continuationLimits.maxAutomaticResumes
        || Date.now() - startedAt >= runtimeState.continuationLimits.maxWallClockMs
      ) {
        const pausedMessage =
          `Automatic continuation paused after ${String(continuationCount)} ` +
          `resume attempt(s); continue from the persisted handoff.`;

        return {
          ...result,
          summary: pausedMessage,
          finalText: pausedMessage,
          harnessRoute: {
            ...result.harnessRoute,
            continuationCount,
          },
        };
      }

      continuationCount += 1;
      await options.reporter?.onThinking?.(
        `Resuming from checkpoint-backed continuation (${String(continuationCount)}/${String(runtimeState.continuationLimits.maxAutomaticResumes)}).`,
      );
      result = await executeCore();
    }

    if (
      result.status === "success"
      && !result.harnessRoute.checkpointRequested
      && result.handoff.emitted === null
    ) {
      state.activeHandoffPath = null;
    }

    return {
      ...result,
      harnessRoute: {
        ...result.harnessRoute,
        continuationCount,
      },
    };
  };

  const tracedTurn = await runWithLangSmithTrace({
    name: "shipyard.instruction-turn",
    runType: "chain",
    tags: ["shipyard", "instruction-turn", phase.name],
    metadata: createInstructionTurnTraceMetadata({
      sessionId: state.sessionId,
      runtimeMode: runtimeState.runtimeMode,
      phaseName: phase.name,
      instruction: options.instruction,
      targetDirectory: state.targetDirectory,
    }),
    getResultMetadata: (result) =>
      createInstructionTurnTraceMetadata({
        sessionId: state.sessionId,
        runtimeMode: result.runtimeMode,
        phaseName: result.phaseName,
        instruction: options.instruction,
        targetDirectory: state.targetDirectory,
        planningMode: result.planningMode,
        harnessRoute: result.harnessRoute,
        turnStatus: result.status,
        finalText: result.finalText,
        summary: result.summary,
      }),
    fn: executeWithContinuations,
    args: [],
  });
  const result = tracedTurn.trace
    ? {
        ...tracedTurn.result,
        langSmithTrace: tracedTurn.trace,
      }
    : tracedTurn.result;

  await emitInstructionTurnOutcome(options.reporter, state, result);

  return result;
}
