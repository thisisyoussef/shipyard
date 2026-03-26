import { traceable } from "langsmith/traceable";

import {
  createAnthropicModelAdapter,
} from "./anthropic.js";
import {
  buildCompactedMessageHistory,
  type CompletedToolExecution,
  type CompletedToolTurn,
} from "./history-compaction.js";
import {
  createToolResultTurnMessage,
  createUserTurnMessage,
  type ModelAdapter,
  type ModelTurnResult,
  type ToolCall,
  type TurnMessage,
} from "./model-adapter.js";
import {
  createToolErrorResult,
  getTools,
  getTool,
  type ToolResult,
} from "../tools/registry.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";
import {
  getTurnCancellationReason,
  throwIfTurnCancelled,
  toTurnCancelledError,
} from "./cancellation.js";
import {
  countLines,
  createDisplayHash,
  hashContents,
  normalizeTargetRelativePath,
} from "../tools/file-state.js";

export const RAW_LOOP_MAX_ITERATIONS = 25;
const LOG_PREVIEW_LIMIT = 160;
const DEFAULT_MAX_TOKENS_RECOVERY_RETRIES = 1;
const DEFAULT_MAX_TOKENS_RETRY_MULTIPLIER = 2;
const DEFAULT_MAX_TOKENS_RETRY_CAP = 16_384;
const DEFAULT_RAW_LOOP_MAX_TOKENS = 8_192;

export interface RawLoopLogger {
  log: (message: string) => void;
}

export interface RawLoopToolHookContext {
  toolCall: ToolCall;
  turnNumber: number;
  targetDirectory: string;
}

export interface RawLoopToolResultHookContext extends RawLoopToolHookContext {
  result: ToolResult;
  toolExecution: RawToolExecution;
}

export interface RawToolExecution extends CompletedToolExecution {}

export interface RawToolLoopResult {
  status: "completed" | "cancelled" | "continuation";
  finalText: string;
  messageHistory: TurnMessage[];
  toolExecutions: RawToolExecution[];
  iterations: number;
  didEdit: boolean;
  lastEditedFile: string | null;
  touchedFiles: string[];
  modelProvider: string;
  modelName: string | null;
}

export interface RawToolLoopOptions {
  modelAdapter?: ModelAdapter;
  client?: object;
  logger?: RawLoopLogger;
  maxIterations?: number;
  signal?: AbortSignal;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxTokensRecoveryRetries?: number;
  maxTokensRetryMultiplier?: number;
  maxTokensRetryCap?: number;
  beforeToolExecution?: (
    context: RawLoopToolHookContext,
  ) => Promise<void> | void;
  afterToolExecution?: (
    context: RawLoopToolResultHookContext,
  ) => Promise<void> | void;
}

export class ModelOutputBudgetExceededError extends Error {
  readonly stopReason = "max_tokens";
  readonly turnNumber: number;
  readonly maxTokens: number;
  readonly recoveryAttempts: number;
  readonly generatingToolCall: boolean;
  readonly partialText: string;

  constructor(options: {
    turnNumber: number;
    maxTokens: number;
    recoveryAttempts: number;
    generatingToolCall: boolean;
    partialText?: string;
  }) {
    const target = options.generatingToolCall ? "a tool call" : "a final response";
    const partialText = options.partialText?.trim() ?? "";
    const partialTextLabel = partialText
      ? ` Partial text preview: ${truncateForLog(partialText, 120)}`
      : "";

    super(
      `Model output budget exhausted on turn ${String(options.turnNumber)} ` +
      `(stop_reason=max_tokens) while generating ${target} at max_tokens=${String(options.maxTokens)} ` +
      `after ${String(options.recoveryAttempts)} recovery attempt(s).${partialTextLabel}`,
    );
    this.name = "ModelOutputBudgetExceededError";
    this.turnNumber = options.turnNumber;
    this.maxTokens = options.maxTokens;
    this.recoveryAttempts = options.recoveryAttempts;
    this.generatingToolCall = options.generatingToolCall;
    this.partialText = partialText;
  }
}

function ensureNonBlankString(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank.`);
  }

  return trimmed;
}

function ensureValidToolNames(toolNames: string[]): string[] {
  if (!Array.isArray(toolNames)) {
    throw new Error("toolNames must be an array.");
  }

  return toolNames.map((toolName) => toolName.trim()).filter(Boolean);
}

function ensureValidIterationCap(maxIterations: number): number {
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    throw new Error("maxIterations must be a positive integer.");
  }

  return maxIterations;
}

function ensureValidMaxTokensRecoveryRetries(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("maxTokensRecoveryRetries must be a non-negative integer.");
  }

  return value;
}

function ensureValidRetryMultiplier(value: number): number {
  if (!Number.isFinite(value) || value <= 1) {
    throw new Error("maxTokensRetryMultiplier must be greater than 1.");
  }

  return value;
}

function ensureValidRetryCap(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("maxTokensRetryCap must be a positive integer.");
  }

  return value;
}

function truncateForLog(value: string, limit = LOG_PREVIEW_LIMIT): string {
  if (value.length <= limit) {
    return value;
  }

  const truncatedCount = value.length - limit;
  return `${value.slice(0, limit)}… [truncated ${String(truncatedCount)} chars]`;
}

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatToolResultPreview(result: ToolResult): string {
  if (result.success) {
    return truncateForLog(result.output);
  }

  if (result.error?.trim()) {
    return truncateForLog(result.error);
  }

  return truncateForLog(result.output);
}

function extractEditedPath(
  toolName: string,
  input: unknown,
  result: ToolResult,
): string | null {
  if (!result.success) {
    return null;
  }

  if (toolName !== "edit_block" && toolName !== "write_file") {
    return null;
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "path" in input &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    return normalizeHistoryPath(input.path);
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function normalizeHistoryPath(value: string): string {
  try {
    return normalizeTargetRelativePath(value);
  } catch {
    return value.trim();
  }
}

function extractInputPath(input: unknown): string | null {
  if (
    typeof input === "object" &&
    input !== null &&
    "path" in input &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    return normalizeHistoryPath(input.path);
  }

  return null;
}

function getOptionalString(value: unknown, key: string): string | null {
  if (!isPlainObject(value) || typeof value[key] !== "string") {
    return null;
  }

  const candidate = String(value[key]).trim();
  return candidate ? candidate : null;
}

function getOptionalNumber(value: unknown, key: string): number | null {
  if (!isPlainObject(value) || typeof value[key] !== "number") {
    return null;
  }

  return Number(value[key]);
}

function createDigestPreview(value: string, limit = 120): string {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return truncateForLog(normalized, limit);
}

function formatDigestValue(value: string): string {
  return JSON.stringify(createDigestPreview(value));
}

function formatPathLabel(toolName: string, pathValue: string | null): string {
  return pathValue ? `${toolName}(${pathValue})` : toolName;
}

function formatPathList(paths: string[], limit = 3): string {
  if (paths.length === 0) {
    return "(none)";
  }

  const preview = paths.slice(0, limit).join(", ");

  if (paths.length <= limit) {
    return preview;
  }

  return `${preview}, +${String(paths.length - limit)} more`;
}

function extractTouchedFiles(
  toolName: string,
  input: unknown,
  result: ToolResult,
): string[] {
  if (!result.success) {
    return [];
  }

  if (
    toolName === "bootstrap_target"
    && isPlainObject(result.data)
    && Array.isArray(result.data.createdFiles)
  ) {
    return uniqueStrings(
      result.data.createdFiles
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => normalizeHistoryPath(item)),
    );
  }

  const inputPath = extractInputPath(input);

  if (
    inputPath
    && (toolName === "write_file" || toolName === "edit_block")
  ) {
    return [inputPath];
  }

  return [];
}

function createToolHistoryDigest(
  toolName: string,
  input: unknown,
  result: ToolResult,
  touchedFiles: string[],
): CompletedToolExecution["historyDigest"] {
  const primaryPath = touchedFiles[0] ?? extractInputPath(input);
  const label = formatPathLabel(toolName, primaryPath);
  const errorPreview = createDigestPreview(result.error ?? result.output);

  if (toolName === "write_file" && isPlainObject(input) && typeof input.content === "string") {
    const lineCount = countLines(input.content);
    const fingerprint = createDisplayHash(hashContents(input.content));
    const preview = createDigestPreview(input.content);

    return {
      requestLine:
        `${label} lines=${String(lineCount)} chars=${String(input.content.length)} ` +
        `fingerprint=${fingerprint} preview=${formatDigestValue(preview)}`,
      resultLine: result.success
        ? `${label} success lines=${String(lineCount)} fingerprint=${fingerprint} preview=${formatDigestValue(preview)}. Re-read the file from disk if exact contents are needed.`
        : `${label} failed error=${formatDigestValue(errorPreview)}`,
      isWriteLike: true,
      prefersVerbatimTail: false,
    };
  }

  if (
    toolName === "edit_block"
    && isPlainObject(input)
    && typeof input.new_string === "string"
  ) {
    const fingerprint = createDisplayHash(hashContents(input.new_string));
    const totalLines = getOptionalNumber(result.data, "totalLines")
      ?? countLines(input.new_string);
    const preview = getOptionalString(result.data, "afterPreview")
      ?? createDigestPreview(input.new_string);

    return {
      requestLine:
        `${label} new_lines=${String(countLines(input.new_string))} ` +
        `fingerprint=${fingerprint} preview=${formatDigestValue(preview)}`,
      resultLine: result.success
        ? `${label} success total_lines=${String(totalLines)} fingerprint=${fingerprint} preview=${formatDigestValue(preview)}. Re-read the file from disk if exact contents are needed.`
        : `${label} failed error=${formatDigestValue(errorPreview)}`,
      isWriteLike: true,
      prefersVerbatimTail: false,
    };
  }

  if (toolName === "bootstrap_target") {
    const scaffoldType = getOptionalString(input, "scaffold_type")
      ?? getOptionalString(result.data, "scaffoldType")
      ?? "default";
    const createdFiles = touchedFiles;
    const filePreview = formatPathList(createdFiles);

    return {
      requestLine:
        `${toolName} scaffold=${scaffoldType} files_expected=${String(createdFiles.length || 0)}`,
      resultLine: result.success
        ? `${toolName} success files=${String(createdFiles.length)} paths=${filePreview}. Re-read the new files from disk if exact contents are needed.`
        : `${toolName} failed error=${formatDigestValue(errorPreview)}`,
      isWriteLike: true,
      prefersVerbatimTail: false,
    };
  }

  if (toolName === "run_command") {
    const command = getOptionalString(input, "command") ?? "(unknown command)";
    const fingerprint = createDisplayHash(hashContents(result.output));
    const preview = createDigestPreview(result.output || result.error || "");

    return {
      requestLine: `${toolName} command=${formatDigestValue(command)}`,
      resultLine: result.success
        ? `${toolName} success output_chars=${String(result.output.length)} fingerprint=${fingerprint} preview=${formatDigestValue(preview)}`
        : `${toolName} failed error=${formatDigestValue(errorPreview)}`,
      isWriteLike: false,
      prefersVerbatimTail: false,
    };
  }

  if (!result.success) {
    return {
      requestLine: label,
      resultLine: `${label} failed error=${formatDigestValue(errorPreview)}`,
      isWriteLike: false,
      prefersVerbatimTail: false,
    };
  }

  const outputPreview = createDigestPreview(result.output);

  return {
    requestLine: label,
    resultLine: `${label} success preview=${formatDigestValue(outputPreview)}`,
    isWriteLike: false,
    prefersVerbatimTail: toolName === "read_file" && result.success,
  };
}

function createCancelledLoopResult(options: {
  signal?: AbortSignal;
  fallbackReason?: string;
  messageHistory: TurnMessage[];
  toolExecutions: RawToolExecution[];
  iterations: number;
  lastEditedFile: string | null;
  touchedFiles: string[];
  modelProvider: string;
  modelName: string | null;
}): RawToolLoopResult {
  const reason = getTurnCancellationReason(
    options.signal,
    options.fallbackReason,
  ) ?? options.fallbackReason
    ?? "The active turn was cancelled.";

  return {
    status: "cancelled",
    finalText: reason,
    messageHistory: [...options.messageHistory],
    toolExecutions: [...options.toolExecutions],
    iterations: options.iterations,
    didEdit: options.lastEditedFile !== null,
    lastEditedFile: options.lastEditedFile,
    touchedFiles: [...options.touchedFiles],
    modelProvider: options.modelProvider,
    modelName: options.modelName,
  };
}

async function createModelTurnWithBudgetRecovery(options: {
  modelAdapter: ModelAdapter;
  systemPrompt: string;
  messages: TurnMessage[];
  tools: ReturnType<typeof getTools>;
  model?: string;
  maxTokens: number;
  temperature?: number;
  turnNumber: number;
  logger: RawLoopLogger;
  signal?: AbortSignal;
  maxTokensRecoveryRetries: number;
  maxTokensRetryMultiplier: number;
  maxTokensRetryCap: number;
}): Promise<ModelTurnResult> {
  let currentMaxTokens = options.maxTokens;
  let recoveryAttempts = 0;

  while (true) {
    const modelTurn = await options.modelAdapter.createTurn(
      {
        systemPrompt: options.systemPrompt,
        messages: options.messages,
        tools: options.tools,
        model: options.model,
        maxTokens: currentMaxTokens,
        temperature: options.temperature,
      },
      {
        signal: options.signal,
      },
    );

    if (modelTurn.stopReason !== "max_tokens") {
      return modelTurn;
    }

    const partialText = modelTurn.finalText.trim();
    const generatingToolCall =
      modelTurn.toolCalls.length > 0 || partialText.length === 0;

    if (recoveryAttempts >= options.maxTokensRecoveryRetries) {
      throw new ModelOutputBudgetExceededError({
        turnNumber: options.turnNumber,
        maxTokens: currentMaxTokens,
        recoveryAttempts,
        generatingToolCall,
        partialText,
      });
    }

    const scaledMaxTokens = Math.ceil(
      currentMaxTokens * options.maxTokensRetryMultiplier,
    );
    const nextMaxTokens = Math.min(
      Math.max(currentMaxTokens + 1, scaledMaxTokens),
      options.maxTokensRetryCap,
    );

    if (nextMaxTokens <= currentMaxTokens) {
      throw new ModelOutputBudgetExceededError({
        turnNumber: options.turnNumber,
        maxTokens: currentMaxTokens,
        recoveryAttempts,
        generatingToolCall,
        partialText,
      });
    }

    recoveryAttempts += 1;
    options.logger.log(
      `[raw-loop] turn ${String(options.turnNumber)} stop_reason=max_tokens ` +
      `while generating ${generatingToolCall ? "a tool call" : "a final response"}; ` +
      `retrying with max_tokens=${String(nextMaxTokens)}`,
    );
    currentMaxTokens = nextMaxTokens;
  }
}

async function executeToolCall(
  toolCall: ToolCall,
  targetDirectory: string,
  allowedToolNames: Set<string>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  throwIfTurnCancelled(signal);

  if (!allowedToolNames.has(toolCall.name)) {
    return createToolErrorResult(
      `Tool "${toolCall.name}" is not available in this loop.`,
    );
  }

  const tool = getTool(toolCall.name);

  if (!tool) {
    return createToolErrorResult(
      `Tool "${toolCall.name}" is not registered.`,
    );
  }

  try {
    return await tool.execute(toolCall.input, targetDirectory, {
      signal,
    });
  } catch (error) {
    const cancelledError = toTurnCancelledError(error, signal);

    if (cancelledError) {
      throw cancelledError;
    }

    return createToolErrorResult(
      `Tool "${toolCall.name}" execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function executeToolCallWithTracing(
  toolCall: ToolCall,
  targetDirectory: string,
  allowedToolNames: Set<string>,
  turnNumber: number,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const langSmith = getLangSmithConfig();

  if (!langSmith.enabled) {
    return executeToolCall(toolCall, targetDirectory, allowedToolNames, signal);
  }

  const tracedToolExecution = traceable(
    async () => executeToolCall(toolCall, targetDirectory, allowedToolNames, signal),
    {
      name: `shipyard.tool.${toolCall.name}`,
      run_type: "tool",
      project_name: langSmith.project ?? undefined,
      tags: ["shipyard", "tool", toolCall.name],
      metadata: {
        toolName: toolCall.name,
        turnNumber,
        targetDirectory,
      },
    },
  );

  return tracedToolExecution();
}

async function executeToolCallsForTurn(
  toolCalls: ToolCall[],
  targetDirectory: string,
  allowedToolNames: Set<string>,
  logger: RawLoopLogger,
  turnNumber: number,
  signal: AbortSignal | undefined,
  beforeToolExecution?: (
    context: RawLoopToolHookContext,
  ) => Promise<void> | void,
  afterToolExecution?: (
    context: RawLoopToolResultHookContext,
  ) => Promise<void> | void,
): Promise<{
  toolResultMessage: TurnMessage;
  toolExecutions: RawToolExecution[];
}> {
  const toolCallResults: Array<{
    toolCallId: string;
    result: ToolResult;
  }> = [];
  const toolExecutions: RawToolExecution[] = [];

  for (const toolCall of toolCalls) {
    throwIfTurnCancelled(signal);
    await beforeToolExecution?.({
      toolCall,
      turnNumber,
      targetDirectory,
    });

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} tool_call ${toolCall.name} input=${truncateForLog(
        stringifyForLog(toolCall.input),
      )}`,
    );

    const result = await executeToolCallWithTracing(
      toolCall,
      targetDirectory,
      allowedToolNames,
      turnNumber,
      signal,
    );

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} tool_result ${toolCall.name} ${result.success ? "success" : "failure"} output=${formatToolResultPreview(
        result,
      )}`,
    );
    const touchedFiles = extractTouchedFiles(toolCall.name, toolCall.input, result);

    const toolExecution: RawToolExecution = {
      toolName: toolCall.name,
      input: toolCall.input,
      success: result.success,
      output: result.output,
      error: result.error,
      editedPath: extractEditedPath(toolCall.name, toolCall.input, result),
      touchedFiles,
      historyDigest: createToolHistoryDigest(
        toolCall.name,
        toolCall.input,
        result,
        touchedFiles,
      ),
    };

    toolExecutions.push(toolExecution);
    throwIfTurnCancelled(signal);
    await afterToolExecution?.({
      toolCall,
      turnNumber,
      targetDirectory,
      result,
      toolExecution,
    });
    toolCallResults.push({
      toolCallId: toolCall.id,
      result,
    });
  }

  return {
    toolResultMessage: createToolResultTurnMessage(toolCallResults),
    toolExecutions,
  };
}

function validateToolCallTurn(
  message: Pick<ModelTurnResult, "toolCalls" | "stopReason">,
  turnNumber: number,
): ToolCall[] {
  if (message.toolCalls.length === 0) {
    throw new Error(
      `Model adapter returned stopReason "tool_call" on turn ${String(turnNumber)} without any tool calls.`,
    );
  }

  return message.toolCalls;
}

async function runRawToolLoopDetailedCore(
  systemPrompt: string,
  userMessage: string,
  toolNames: string[],
  targetDirectory: string,
  options: RawToolLoopOptions = {},
): Promise<RawToolLoopResult> {
  const normalizedSystemPrompt = ensureNonBlankString(systemPrompt, "systemPrompt");
  const normalizedUserMessage = ensureNonBlankString(userMessage, "userMessage");
  const normalizedToolNames = ensureValidToolNames(toolNames);
  const maxIterations = ensureValidIterationCap(
    options.maxIterations ?? RAW_LOOP_MAX_ITERATIONS,
  );
  const maxTokensRecoveryRetries = ensureValidMaxTokensRecoveryRetries(
    options.maxTokensRecoveryRetries ?? DEFAULT_MAX_TOKENS_RECOVERY_RETRIES,
  );
  const maxTokensRetryMultiplier = ensureValidRetryMultiplier(
    options.maxTokensRetryMultiplier ?? DEFAULT_MAX_TOKENS_RETRY_MULTIPLIER,
  );
  const maxTokensRetryCap = ensureValidRetryCap(
    options.maxTokensRetryCap ?? DEFAULT_MAX_TOKENS_RETRY_CAP,
  );
  const modelAdapter = options.modelAdapter ?? createAnthropicModelAdapter({
    client: options.client as never,
  });
  const maxTokens = options.maxTokens
    ?? modelAdapter.defaultMaxTokens
    ?? DEFAULT_RAW_LOOP_MAX_TOKENS;
  const logger = options.logger ?? console;
  const allowedToolNames = new Set(normalizedToolNames);
  const initialUserMessage = createUserTurnMessage(normalizedUserMessage);
  const completedToolTurns: CompletedToolTurn[] = [];
  const toolDefinitions = getTools(normalizedToolNames);
  const toolExecutions: RawToolExecution[] = [];
  let lastEditedFile: string | null = null;
  let activeModelName = options.model ?? modelAdapter.defaultModel ?? null;

  for (let turnNumber = 1; turnNumber <= maxIterations; turnNumber += 1) {
    throwIfTurnCancelled(options.signal);
    const requestHistory = buildCompactedMessageHistory({
      initialUserMessage,
      completedTurns: completedToolTurns,
      maxTokens,
    });

    if (requestHistory.didCompact) {
      logger.log(
        `[raw-loop] compacted ${String(requestHistory.compactedTurnCount)} completed tool cycle(s); ` +
        `preserved_tail_cycles=${String(requestHistory.preservedTailTurnCount)} ` +
        `preserved_tail_mode=${requestHistory.preservedTailMode} ` +
        `history_chars=${String(requestHistory.estimatedCharsBefore)}->${String(requestHistory.estimatedCharsAfter)} ` +
        `budget=${String(requestHistory.historyCharBudget)}`,
      );
    }

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} request messages=${String(requestHistory.messages.length)} ` +
      `tools=${String(toolDefinitions.length)} max_tokens=${String(maxTokens)} ` +
      `provider=${modelAdapter.provider}`,
    );

    let modelTurn: ModelTurnResult;

    try {
      modelTurn = await createModelTurnWithBudgetRecovery({
        modelAdapter,
        systemPrompt: normalizedSystemPrompt,
        messages: requestHistory.messages,
        tools: toolDefinitions,
        model: options.model,
        maxTokens,
        temperature: options.temperature,
        turnNumber,
        logger,
        signal: options.signal,
        maxTokensRecoveryRetries,
        maxTokensRetryMultiplier,
        maxTokensRetryCap,
      });
      activeModelName = modelTurn.model;
    } catch (error) {
      const cancelledError = toTurnCancelledError(error, options.signal);

      if (cancelledError) {
        return createCancelledLoopResult({
          signal: options.signal,
          fallbackReason: cancelledError.message,
          messageHistory: requestHistory.messages,
          toolExecutions,
          iterations: Math.max(turnNumber - 1, 0),
          lastEditedFile,
          touchedFiles: uniqueStrings(toolExecutions.flatMap((execution) => execution.touchedFiles)),
          modelProvider: modelAdapter.provider,
          modelName: activeModelName,
        });
      }

      throw error;
    }

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} stop_reason=${modelTurn.rawStopReason ?? modelTurn.stopReason ?? "unknown"}`,
    );

    if (modelTurn.stopReason === "tool_call") {
      const toolCalls = validateToolCallTurn(modelTurn, turnNumber);
      const assistantHistoryMessage = modelTurn.message;
      let toolTurnResult: {
        toolResultMessage: TurnMessage;
        toolExecutions: RawToolExecution[];
      };

      try {
        toolTurnResult = await executeToolCallsForTurn(
          toolCalls,
          targetDirectory,
          allowedToolNames,
          logger,
          turnNumber,
          options.signal,
          options.beforeToolExecution,
          options.afterToolExecution,
        );
      } catch (error) {
        const cancelledError = toTurnCancelledError(error, options.signal);

        if (cancelledError) {
          return createCancelledLoopResult({
            signal: options.signal,
            fallbackReason: cancelledError.message,
            messageHistory: [...requestHistory.messages, assistantHistoryMessage],
            toolExecutions,
            iterations: turnNumber,
            lastEditedFile,
            touchedFiles: uniqueStrings(toolExecutions.flatMap((execution) => execution.touchedFiles)),
            modelProvider: modelAdapter.provider,
            modelName: activeModelName,
          });
        }

        throw error;
      }

      toolExecutions.push(...toolTurnResult.toolExecutions);
      const editedExecution = [...toolTurnResult.toolExecutions]
        .reverse()
        .find((execution) => execution.editedPath !== null);

      if (editedExecution?.editedPath) {
        lastEditedFile = editedExecution.editedPath;
      }

      const completedToolTurn: CompletedToolTurn = {
        turnNumber,
        assistantMessage: assistantHistoryMessage,
        toolResultMessage: toolTurnResult.toolResultMessage,
        toolExecutions: toolTurnResult.toolExecutions,
      };

      if (options.signal?.aborted) {
        return createCancelledLoopResult({
          signal: options.signal,
          messageHistory: buildCompactedMessageHistory({
            initialUserMessage,
            completedTurns: [...completedToolTurns, completedToolTurn],
            maxTokens,
          }).messages,
          toolExecutions,
          iterations: turnNumber,
          lastEditedFile,
          touchedFiles: uniqueStrings(toolExecutions.flatMap((execution) => execution.touchedFiles)),
          modelProvider: modelAdapter.provider,
          modelName: activeModelName,
        });
      }

      completedToolTurns.push(completedToolTurn);
      continue;
    }

    if (options.signal?.aborted) {
      return createCancelledLoopResult({
        signal: options.signal,
        messageHistory: requestHistory.messages,
        toolExecutions,
        iterations: turnNumber,
        lastEditedFile,
        touchedFiles: uniqueStrings(toolExecutions.flatMap((execution) => execution.touchedFiles)),
        modelProvider: modelAdapter.provider,
        modelName: activeModelName,
      });
    }

    const finalText = modelTurn.finalText.trim();

    if (!finalText) {
      throw new Error(
        `Model adapter completed turn ${String(turnNumber)} without any final text.`,
      );
    }

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} final_text=${truncateForLog(finalText)}`,
    );

    const finalAssistantMessage = modelTurn.message;
    const finalMessageHistory = buildCompactedMessageHistory({
      initialUserMessage,
      completedTurns: completedToolTurns,
      finalAssistantMessage,
      maxTokens,
    });
    const touchedFiles = uniqueStrings(
      toolExecutions.flatMap((execution) => execution.touchedFiles),
    );

    return {
      status: "completed",
      finalText,
      messageHistory: finalMessageHistory.messages,
      toolExecutions,
      iterations: turnNumber,
      didEdit: lastEditedFile !== null,
      lastEditedFile,
      touchedFiles,
      modelProvider: modelAdapter.provider,
      modelName: activeModelName,
    };
  }

  const continuationHistory = buildCompactedMessageHistory({
    initialUserMessage,
    completedTurns: completedToolTurns,
    maxTokens,
  });
  const touchedFiles = uniqueStrings(
    toolExecutions.flatMap((execution) => execution.touchedFiles),
  );

  return {
    status: "continuation",
    finalText:
      `Shipyard reached the acting iteration limit of ${String(maxIterations)} ` +
      "and needs a checkpoint-backed continuation.",
    messageHistory: continuationHistory.messages,
    toolExecutions,
    iterations: maxIterations,
    didEdit: lastEditedFile !== null,
    lastEditedFile,
    touchedFiles,
    modelProvider: modelAdapter.provider,
    modelName: activeModelName,
  };
}

export async function runRawToolLoopDetailed(
  systemPrompt: string,
  userMessage: string,
  toolNames: string[],
  targetDirectory: string,
  options: RawToolLoopOptions = {},
): Promise<RawToolLoopResult> {
  const langSmith = getLangSmithConfig();
  const modelAdapter = options.modelAdapter ?? createAnthropicModelAdapter({
    client: options.client as never,
  });
  const modelName = options.model ?? modelAdapter.defaultModel ?? null;
  const tracedOptions = {
    ...options,
    modelAdapter,
  };

  if (!langSmith.enabled) {
    return runRawToolLoopDetailedCore(
      systemPrompt,
      userMessage,
      toolNames,
      targetDirectory,
      tracedOptions,
    );
  }

  const tracedRawLoop = traceable(async () =>
    runRawToolLoopDetailedCore(
      systemPrompt,
      userMessage,
      toolNames,
      targetDirectory,
      tracedOptions,
    ), {
    name: "shipyard.raw-tool-loop",
    run_type: "chain",
    project_name: langSmith.project ?? undefined,
    tags: ["shipyard", "raw-loop"],
    metadata: {
      targetDirectory,
      toolCount: toolNames.length,
      modelProvider: modelAdapter.provider,
      modelName,
    },
  });

  return tracedRawLoop();
}

export async function runRawToolLoop(
  systemPrompt: string,
  userMessage: string,
  toolNames: string[],
  targetDirectory: string,
  options: RawToolLoopOptions = {},
): Promise<string> {
  const result = await runRawToolLoopDetailed(
    systemPrompt,
    userMessage,
    toolNames,
    targetDirectory,
    options,
  );

  return result.finalText;
}
