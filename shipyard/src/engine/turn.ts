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
  LoadedExecutionHandoff,
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
  saveSessionState,
  type ContextEnvelope,
  type SessionState,
} from "./state.js";
import type { LangSmithTraceReference } from "../tracing/langsmith.js";
import { configureTargetManagerEnrichmentInvoker } from "../tools/target-manager/enrich-target.js";

export type InstructionRuntimeMode = "graph" | "fallback";

export interface InstructionRuntimeState {
  projectRules: string;
  baseInjectedContext: string[];
  recentToolOutputs: string[];
  recentErrors: string[];
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  pendingTargetSelectionPath: string | null;
  targetEnrichmentInvoker?: (
    prompt: string,
  ) => Promise<{
    text: string;
    model: string;
  }>;
  runtimeMode: InstructionRuntimeMode;
  runtimeDependencies?: AgentRuntimeDependencies;
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

const EXPLICIT_FILE_PATH_PATTERN =
  /(?:\.{1,2}\/)?[A-Za-z0-9_-]+(?:[/.][A-Za-z0-9_-]+)+/;

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

function truncateText(value: string, limit = 240): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 1)}…`;
}

function updateRollingSummary(
  currentSummary: string,
  turnCount: number,
  instruction: string,
  summary: string,
): string {
  const nextLine = `Turn ${turnCount}: ${instruction} -> ${truncateText(summary, 120)}`;
  const nextSummary = currentSummary
    ? `${currentSummary}\n${nextLine}`
    : nextLine;

  return nextSummary
    .split("\n")
    .slice(-8)
    .join("\n");
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

function createTurnSummary(
  turnCount: number,
  runtimeMode: InstructionRuntimeMode,
  finalStateStatus: "done" | "failed" | "cancelled",
  finalText: string,
): string {
  const statusLabel = finalStateStatus === "failed"
    ? "failed"
    : finalStateStatus === "cancelled"
      ? "cancelled"
      : "completed";
  return `Turn ${turnCount} ${statusLabel} via ${runtimeMode}: ${truncateText(finalText, 140)}`;
}

function createCancelledTurnText(
  turnCount: number,
  reason: string,
): string {
  return `Turn ${String(turnCount)} cancelled: ${reason}`;
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
    async createRawLoopOptions(graphState) {
      const baseOptions =
        await baseDependencies?.createRawLoopOptions?.(graphState)
        ?? {};
      const existingBeforeToolExecution = baseOptions.beforeToolExecution;
      const existingAfterToolExecution = baseOptions.afterToolExecution;

      return {
        ...baseOptions,
        logger: baseOptions.logger ?? createSilentLogger(),
        beforeToolExecution: async (context: RawLoopToolHookContext) => {
          await existingBeforeToolExecution?.(context);

          if (signal?.aborted) {
            return;
          }

          await reporter?.onToolCall?.({
            callId: context.toolUse.id,
            toolName: context.toolUse.name,
            summary: summarizeToolCallInput(context.toolUse.input),
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
              `${context.toolUse.name} ${summary}`,
            );
          } else {
            rememberRecent(runtimeState.recentErrors, summary);
          }

          await reporter?.onToolResult?.({
            callId: context.toolUse.id,
            toolName: context.toolUse.name,
            success: context.result.success,
            summary,
            detail: getToolResultDetail(context.result),
            command: extractCommandFromToolInput(context.toolUse.input),
          });

          const immediateEditEvent = context.result.success
            ? createImmediateEditEvent(
                context.toolUse.name,
                context.result.data,
              )
            : null;

          if (immediateEditEvent) {
            editPreviewState.emitted = true;
            await reporter?.onEdit?.(immediateEditEvent);
          }

          if (
            context.result.success &&
            context.toolUse.name === "select_target" &&
            isTargetSelectionData(context.result.data)
          ) {
            runtimeState.pendingTargetSelectionPath = context.result.data.path;
          }

          if (
            context.result.success &&
            context.toolUse.name === "enrich_target" &&
            isTargetProfileData(context.result.data)
          ) {
            sessionState.targetProfile = context.result.data;
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
  return {
    projectRules: options.projectRules,
    baseInjectedContext: [...(options.baseInjectedContext ?? [])],
    recentToolOutputs: [],
    recentErrors: [],
    retryCountsByFile: {},
    blockedFiles: [],
    pendingTargetSelectionPath: null,
    targetEnrichmentInvoker: options.targetEnrichmentInvoker,
    runtimeMode: options.runtimeMode ?? "graph",
    runtimeDependencies: options.runtimeDependencies,
  };
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
  const targetFilePaths = explicitFilePath ? [explicitFilePath] : [];
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
    latestHandoff: loadedHandoff,
  });

  runtimeState.projectRules = contextEnvelope.stable.projectRules;

  const initialState = createAgentGraphState({
    sessionId: state.sessionId,
    instruction: options.instruction,
    contextEnvelope,
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

  configureTargetManagerEnrichmentInvoker(runtimeState.targetEnrichmentInvoker ?? null);

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
        "Verify the result after the edit.",
      ],
    };
    const finalText = finalState.finalResult
      ?? "Shipyard finished without a final response.";
    const finalStateStatus = finalState.status === "failed"
      ? "failed"
      : finalState.status === "cancelled"
        ? "cancelled"
        : "done";
    const summary = createTurnSummary(
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
      const cancellationReason = finalText || getTurnCancellationReason(options.signal)
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

      await options.reporter?.onText?.(cancelledTurnText);
      await options.reporter?.onDone?.({
        status: "cancelled",
        summary: cancellationReason,
        langSmithTrace: finalState.langSmithTrace,
      });
      await emitTurnState(options.reporter, state, "ready");

      return {
        phaseName: phase.name,
        runtimeMode: runtimeState.runtimeMode,
        taskPlan,
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

      await options.reporter?.onText?.(failedTurnText);
      await options.reporter?.onError?.(errorMessage);
      await options.reporter?.onDone?.({
        status: "error",
        summary: errorMessage,
        langSmithTrace: finalState.langSmithTrace,
      });
      await emitTurnState(options.reporter, state, "error");

      return {
        phaseName: phase.name,
        runtimeMode: runtimeState.runtimeMode,
        taskPlan,
        contextEnvelope,
        status: "error",
        summary: errorMessage,
        finalText: failedTurnText,
        selectedTargetPath: null,
        langSmithTrace: finalState.langSmithTrace,
        handoff: handoffState,
      };
    }

    await options.reporter?.onText?.(finalText);
    await options.reporter?.onDone?.({
      status: "success",
      summary,
      langSmithTrace: finalState.langSmithTrace,
    });

    state.rollingSummary = updateRollingSummary(
      state.rollingSummary,
      state.turnCount,
      options.instruction,
      summary,
    );

    await emitTurnState(options.reporter, state, "ready");

    return {
      phaseName: phase.name,
      runtimeMode: runtimeState.runtimeMode,
      taskPlan,
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
      const summary = createTurnSummary(
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
      });
      await emitTurnState(options.reporter, state, "ready");

      return {
        phaseName: phase.name,
        runtimeMode: runtimeState.runtimeMode,
        taskPlan: {
          instruction: options.instruction,
          goal: options.instruction,
          targetFilePaths,
          plannedSteps: [],
        },
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
    const summary = createTurnSummary(
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
      taskPlan: {
        instruction: options.instruction,
        goal: options.instruction,
        targetFilePaths,
        plannedSteps: [],
      },
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
}
