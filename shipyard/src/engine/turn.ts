import { access } from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";

import type { TaskPlan } from "../artifacts/types.js";
import { createContextEnvelope } from "../context/envelope.js";
import {
  createCodePhase,
  createStubCodeTaskPlan,
} from "../phases/code/index.js";
import { countLines, createDisplayHash } from "../tools/file-state.js";
import { gitDiffTool, listFilesTool, readFileTool } from "../tools/index.js";
import type { ListFilesResult } from "../tools/list-files.js";
import type { ReadFileResult } from "../tools/read-file.js";
import type { RunCommandResult } from "../tools/run-command.js";
import { saveSessionState, type ContextEnvelope, type SessionState } from "./state.js";

export interface InstructionRuntimeState {
  projectRules: string;
  baseInjectedContext: string[];
  recentToolOutputs: string[];
  recentErrors: string[];
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
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

function updateRollingSummary(
  currentSummary: string,
  turnCount: number,
  instruction: string,
): string {
  const nextLine = `Turn ${turnCount}: ${instruction}`;
  const nextSummary = currentSummary
    ? `${currentSummary}\n${nextLine}`
    : nextLine;

  return nextSummary
    .split("\n")
    .slice(-8)
    .join("\n");
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

async function buildContextEnvelope(
  state: SessionState,
  runtimeState: InstructionRuntimeState,
  currentInstruction: string,
  injectedContext: string[],
  targetFilePaths: string[],
): Promise<ContextEnvelope> {
  const currentGitDiff = await captureCurrentGitDiff(state.targetDirectory);

  return createContextEnvelope({
    targetDirectory: state.targetDirectory,
    discovery: state.discovery,
    projectRules: runtimeState.projectRules,
    currentInstruction,
    injectedContext,
    targetFilePaths,
    recentToolOutputs: runtimeState.recentToolOutputs,
    recentErrors: runtimeState.recentErrors,
    currentGitDiff,
    rollingSummary: state.rollingSummary,
    retryCountsByFile: runtimeState.retryCountsByFile,
    blockedFiles: runtimeState.blockedFiles,
  });
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

function summarizeReadResult(result: ReadFileResult): string {
  return `Read ${result.path} (${countLines(result.contents)} lines, hash ${createDisplayHash(result.hash)}).`;
}

function summarizeListFiles(result: ListFilesResult): string {
  if (result.entries.length === 0) {
    return "Found no files in the target directory.";
  }

  const preview = result.entries.slice(0, 5).map((entry) => entry.path).join(", ");
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

async function isGitRepository(targetDirectory: string): Promise<boolean> {
  try {
    await access(path.join(targetDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
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

export function createInstructionRuntimeState(
  options: {
    projectRules: string;
    baseInjectedContext?: string[];
  },
): InstructionRuntimeState {
  return {
    projectRules: options.projectRules,
    baseInjectedContext: [...(options.baseInjectedContext ?? [])],
    recentToolOutputs: [],
    recentErrors: [],
    retryCountsByFile: {},
    blockedFiles: [],
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

  const contextEnvelope = await buildContextEnvelope(
    state,
    runtimeState,
    options.instruction,
    mergedInjectedContext,
    targetFilePaths,
  );
  const taskPlan = createStubCodeTaskPlan(options.instruction);
  taskPlan.targetFilePaths = targetFilePaths;

  state.rollingSummary = updateRollingSummary(
    state.rollingSummary,
    state.turnCount,
    options.instruction,
  );

  await emitTurnState(options.reporter, state, "agent-busy");
  await options.reporter?.onThinking?.(
    `Planning turn ${String(state.turnCount)} in phase "${phase.name}".`,
  );

  const observations: string[] = [];

  try {
    if (explicitFilePath) {
      const callId = nanoid();
      const toolName = "read_file";
      await options.reporter?.onToolCall?.({
        callId,
        toolName,
        summary: `path: ${explicitFilePath}`,
      });

      try {
        const result = await readFileTool({
          targetDirectory: state.targetDirectory,
          path: explicitFilePath,
        });
        const summary = summarizeReadResult(result);
        rememberRecent(runtimeState.recentToolOutputs, `${toolName} ${result.path}`);
        observations.push(summary);
        await options.reporter?.onToolResult?.({
          callId,
          toolName,
          success: true,
          summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rememberRecent(runtimeState.recentErrors, message);
        await options.reporter?.onToolResult?.({
          callId,
          toolName,
          success: false,
          summary: message,
        });
        throw new Error(message);
      }
    }

    {
      const callId = nanoid();
      const toolName = "list_files";
      await options.reporter?.onToolCall?.({
        callId,
        toolName,
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
          `${toolName} -> ${String(result.entries.length)} result(s)`,
        );
        observations.push(summary);
        await options.reporter?.onToolResult?.({
          callId,
          toolName,
          success: true,
          summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rememberRecent(runtimeState.recentErrors, message);
        await options.reporter?.onToolResult?.({
          callId,
          toolName,
          success: false,
          summary: message,
        });
        throw new Error(message);
      }
    }

    if (await isGitRepository(state.targetDirectory)) {
      const callId = nanoid();
      const toolName = "git_diff";
      await options.reporter?.onToolCall?.({
        callId,
        toolName,
        summary: "args: --no-ext-diff",
      });

      const result = await gitDiffTool({
        targetDirectory: state.targetDirectory,
      });
      const summary = summarizeGitDiff(result);
      const success = result.exitCode === 0;

      rememberRecent(runtimeState.recentToolOutputs, `${toolName} -> ${summary}`);
      observations.push(summary);
      await options.reporter?.onToolResult?.({
        callId,
        toolName,
        success,
        summary,
      });

      const diffPreview = summarizeGitDiffPreview(result);

      if (success && diffPreview) {
        await options.reporter?.onEdit?.({
          path: extractDiffPath(result),
          summary: "Current workspace diff preview",
          diff: diffPreview,
        });
      }
    }

    const finalText = [
      `Goal: ${taskPlan.goal}`,
      targetFilePaths.length > 0
        ? `Target files: ${targetFilePaths.join(", ")}`
        : "Target files: none identified yet.",
      observations.length > 0
        ? `Observations: ${observations.join(" ")}`
        : "Observations: no tool activity was required for this turn.",
    ].join("\n");
    const summary = `Turn ${String(state.turnCount)} completed in phase "${phase.name}".`;

    await options.reporter?.onText?.(finalText);
    await options.reporter?.onDone?.({
      status: "success",
      summary,
    });
    await emitTurnState(options.reporter, state, "ready");

    return {
      phaseName: phase.name,
      taskPlan,
      contextEnvelope,
      status: "success",
      summary,
      finalText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finalText = `Turn ${String(state.turnCount)} stopped: ${message}`;

    rememberRecent(runtimeState.recentErrors, message);
    await options.reporter?.onText?.(finalText);
    await options.reporter?.onError?.(message);
    await options.reporter?.onDone?.({
      status: "error",
      summary: message,
    });
    await emitTurnState(options.reporter, state, "error");

    return {
      phaseName: phase.name,
      taskPlan,
      contextEnvelope,
      status: "error",
      summary: message,
      finalText,
    };
  } finally {
    await saveSessionState(state);
  }
}
