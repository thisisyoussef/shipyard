import { access } from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";

import type { TaskPlan } from "../artifacts/types.js";
import {
  buildContextEnvelope,
  composeSystemPrompt,
} from "../context/envelope.js";
import { createCodePhase } from "../phases/code/index.js";
import {
  gitDiffTool,
  listFilesTool,
  readFileTool,
} from "../tools/index.js";
import type { ListFilesResult } from "../tools/list-files.js";
import type { ReadFileResult } from "../tools/read-file.js";
import type { ToolResult } from "../tools/registry.js";
import type { RunCommandResult } from "../tools/run-command.js";
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
  saveSessionState,
  type ContextEnvelope,
  type SessionState,
} from "./state.js";

export type InstructionRuntimeMode = "graph" | "fallback";

export interface InstructionRuntimeState {
  projectRules: string;
  baseInjectedContext: string[];
  recentToolOutputs: string[];
  recentErrors: string[];
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
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
}

export interface EditEvent {
  path: string;
  summary: string;
  diff: string;
}

export interface DoneEvent {
  status: "success" | "error" | "cancelled";
  summary: string;
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
}

export interface InstructionTurnResult {
  phaseName: string;
  runtimeMode: InstructionRuntimeMode;
  taskPlan: TaskPlan;
  contextEnvelope: ContextEnvelope;
  status: "success" | "error";
  summary: string;
  finalText: string;
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

function summarizeReadResult(result: ReadFileResult): string {
  return `Read ${result.path} (${result.contents.split(/\r?\n/).filter(Boolean).length} lines).`;
}

function summarizeListFiles(result: ListFilesResult): string {
  if (result.entries.length === 0) {
    return "Found no files in the target directory.";
  }

  const preview = result.entries
    .slice(0, 5)
    .map((entry) => entry.path)
    .join(", ");
  const remainder = result.entries.length > 5
    ? `, +${String(result.entries.length - 5)} more`
    : "";

  return `Found ${String(result.entries.length)} entries under ${result.path}: ${preview}${remainder}.`;
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

function hasAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
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

function createTurnSummary(
  turnCount: number,
  runtimeMode: InstructionRuntimeMode,
  finalStateStatus: "done" | "failed",
  finalText: string,
): string {
  const statusLabel = finalStateStatus === "failed" ? "failed" : "completed";
  return `Turn ${turnCount} ${statusLabel} via ${runtimeMode}: ${truncateText(finalText, 140)}`;
}

function createOfflinePreviewDependencies(
  state: SessionState,
  runtimeState: InstructionRuntimeState,
  explicitFilePath: string | null,
  reporter: InstructionTurnReporter | undefined,
): AgentRuntimeDependencies {
  return {
    async runActingLoop(graphState) {
      const observations: string[] = [];

      if (explicitFilePath) {
        const callId = nanoid();
        await reporter?.onToolCall?.({
          callId,
          toolName: "read_file",
          summary: `path: ${explicitFilePath}`,
        });

        try {
          const result = await readFileTool({
            targetDirectory: state.targetDirectory,
            path: explicitFilePath,
          });
          const summary = summarizeReadResult(result);
          rememberRecent(runtimeState.recentToolOutputs, `read_file ${result.path}`);
          observations.push(summary);
          await reporter?.onToolResult?.({
            callId,
            toolName: "read_file",
            success: true,
            summary,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          rememberRecent(runtimeState.recentErrors, message);
          await reporter?.onToolResult?.({
            callId,
            toolName: "read_file",
            success: false,
            summary: message,
          });
          throw new Error(message);
        }
      }

      {
        const callId = nanoid();
        await reporter?.onToolCall?.({
          callId,
          toolName: "list_files",
          summary: "glob: all tracked files in the target",
        });

        try {
          const result = await listFilesTool({
            targetDirectory: state.targetDirectory,
            path: ".",
          });
          const summary = summarizeListFiles(result);
          rememberRecent(
            runtimeState.recentToolOutputs,
            `list_files -> ${String(result.entries.length)} result(s)`,
          );
          observations.push(summary);
          await reporter?.onToolResult?.({
            callId,
            toolName: "list_files",
            success: true,
            summary,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          rememberRecent(runtimeState.recentErrors, message);
          await reporter?.onToolResult?.({
            callId,
            toolName: "list_files",
            success: false,
            summary: message,
          });
          throw new Error(message);
        }
      }

      if (await isGitRepository(state.targetDirectory)) {
        const callId = nanoid();
        await reporter?.onToolCall?.({
          callId,
          toolName: "git_diff",
          summary: "args: --no-ext-diff",
        });

        const result = await gitDiffTool({
          targetDirectory: state.targetDirectory,
        });
        const summary = summarizeGitDiff(result);
        const success = result.exitCode === 0;

        rememberRecent(runtimeState.recentToolOutputs, `git_diff -> ${summary}`);
        observations.push(summary);
        await reporter?.onToolResult?.({
          callId,
          toolName: "git_diff",
          success,
          summary,
        });

        const diffPreview = summarizeGitDiffPreview(result);

        if (success && diffPreview) {
          await reporter?.onEdit?.({
            path: extractDiffPath(result),
            summary: "Current workspace diff preview",
            diff: diffPreview,
          });
        }
      }

      const finalText = [
        `Goal: ${graphState.taskPlan?.goal ?? graphState.currentInstruction}`,
        graphState.contextEnvelope.task.targetFilePaths.length > 0
          ? `Target files: ${graphState.contextEnvelope.task.targetFilePaths.join(", ")}`
          : "Target files: none identified yet.",
        observations.length > 0
          ? `Observations: ${observations.join(" ")}`
          : "Observations: no tool activity was required for this turn.",
        "Runtime note: Shipyard used the offline preview path because ANTHROPIC_API_KEY is not configured.",
      ].join("\n");

      return {
        finalText,
        messageHistory: [],
        iterations: 1,
        didEdit: false,
        lastEditedFile: null,
      };
    },
  };
}

function createRuntimeDependencies(
  state: SessionState,
  runtimeState: InstructionRuntimeState,
  explicitFilePath: string | null,
  reporter: InstructionTurnReporter | undefined,
): AgentRuntimeDependencies {
  const baseDependencies = runtimeState.runtimeDependencies;

  if (!baseDependencies && !hasAnthropicApiKey()) {
    return createOfflinePreviewDependencies(
      state,
      runtimeState,
      explicitFilePath,
      reporter,
    );
  }

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
          await reporter?.onToolCall?.({
            callId: context.toolUse.id,
            toolName: context.toolUse.name,
            summary: summarizeToolCallInput(context.toolUse.input),
          });
        },
        afterToolExecution: async (context: RawLoopToolResultHookContext) => {
          await existingAfterToolExecution?.(context);

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
          });
        },
      };
    },
  };
}

export function createInstructionRuntimeState(
  options: {
    projectRules: string;
    baseInjectedContext?: string[];
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
    runtimeMode: options.runtimeMode ?? "graph",
    runtimeDependencies: options.runtimeDependencies,
  };
}

export async function executeInstructionTurn(
  options: ExecuteInstructionTurnOptions,
): Promise<InstructionTurnResult> {
  const phase = createCodePhase();
  const state = options.sessionState;
  const runtimeState = options.runtimeState;
  const explicitFilePath = extractExplicitFilePath(options.instruction);
  const targetFilePaths = explicitFilePath ? [explicitFilePath] : [];
  const mergedInjectedContext = [
    ...runtimeState.baseInjectedContext,
    ...(options.injectedContext ?? []),
  ];

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
  const runtimeDependencies = createRuntimeDependencies(
    state,
    runtimeState,
    explicitFilePath,
    options.reporter,
  );

  try {
    const finalState = await runAgentRuntime(initialState, {
      mode: runtimeState.runtimeMode,
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
      : "done";
    const summary = createTurnSummary(
      state.turnCount,
      runtimeState.runtimeMode,
      finalStateStatus,
      finalText,
    );

    runtimeState.retryCountsByFile = { ...finalState.retryCountsByFile };
    runtimeState.blockedFiles = [...finalState.blockedFiles];

    await emitDiffPreviewIfAvailable(
      options.reporter,
      state.targetDirectory,
      finalState.lastEditedFile,
    );
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
      };
    }

    await options.reporter?.onText?.(finalText);
    await options.reporter?.onDone?.({
      status: "success",
      summary,
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
    };
  } catch (error) {
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
    };
  } finally {
    await saveSessionState(state);
  }
}
