import type {
  Message,
  MessageParam,
  Model,
  TextBlock,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { traceable } from "langsmith/traceable";

import {
  createAnthropicClient,
  createAnthropicMessage,
  createAssistantHistoryMessage,
  createUserTextMessage,
  createUserToolResultBlock,
  extractAssistantText,
  extractAssistantToolUseBlocks,
  resolveAnthropicRuntimeConfig,
  type AnthropicMessagesClient,
} from "./anthropic.js";
import {
  buildCompactedMessageHistory,
  type CompletedToolTurn,
} from "./history-compaction.js";
import {
  createToolErrorResult,
  getAnthropicTools,
  getTool,
  type ToolResult,
} from "../tools/registry.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";
import {
  getTurnCancellationReason,
  throwIfTurnCancelled,
  toTurnCancelledError,
} from "./cancellation.js";

export const RAW_LOOP_MAX_ITERATIONS = 25;
const LOG_PREVIEW_LIMIT = 160;
const DEFAULT_MAX_TOKENS_RECOVERY_RETRIES = 1;
const DEFAULT_MAX_TOKENS_RETRY_MULTIPLIER = 2;
const DEFAULT_MAX_TOKENS_RETRY_CAP = 16_384;

export interface RawLoopLogger {
  log: (message: string) => void;
}

export interface RawLoopToolHookContext {
  toolUse: ToolUseBlock;
  turnNumber: number;
  targetDirectory: string;
}

export interface RawLoopToolResultHookContext extends RawLoopToolHookContext {
  result: ToolResult;
  toolExecution: RawToolExecution;
}

export interface RawToolExecution {
  toolName: string;
  input: unknown;
  success: boolean;
  output: string;
  error?: string;
  editedPath: string | null;
}

export interface RawToolLoopResult {
  status: "completed" | "cancelled";
  finalText: string;
  messageHistory: MessageParam[];
  toolExecutions: RawToolExecution[];
  iterations: number;
  didEdit: boolean;
  lastEditedFile: string | null;
}

export interface RawToolLoopOptions {
  client?: AnthropicMessagesClient;
  logger?: RawLoopLogger;
  maxIterations?: number;
  signal?: AbortSignal;
  model?: Model;
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

export class AnthropicOutputBudgetExceededError extends Error {
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
      `Anthropic output budget exhausted on turn ${String(options.turnNumber)} ` +
      `(stop_reason=max_tokens) while generating ${target} at max_tokens=${String(options.maxTokens)} ` +
      `after ${String(options.recoveryAttempts)} recovery attempt(s).${partialTextLabel}`,
    );
    this.name = "AnthropicOutputBudgetExceededError";
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
    return input.path;
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractAssistantTextSafely(
  message: Pick<Message, "content">,
): string {
  const textBlocks = message.content
    .filter(
      (block): block is TextBlock =>
        isPlainObject(block) &&
        block.type === "text" &&
        typeof block.text === "string" &&
        "citations" in block,
    );

  return textBlocks.map((block) => block.text).join("\n\n").trim();
}

function hasToolUseLikeBlock(
  message: Pick<Message, "content">,
): boolean {
  return message.content.some(
    (block) => isPlainObject(block) && block.type === "tool_use",
  );
}

function createUserToolResultHistoryMessage(
  toolResultBlocks: MessageParam["content"],
): MessageParam {
  if (typeof toolResultBlocks === "string" || toolResultBlocks.length === 0) {
    throw new Error("toolResultBlocks must contain at least one tool_result block.");
  }

  return {
    role: "user",
    content: toolResultBlocks,
  };
}

function createCancelledLoopResult(options: {
  signal?: AbortSignal;
  fallbackReason?: string;
  messageHistory: MessageParam[];
  toolExecutions: RawToolExecution[];
  iterations: number;
  lastEditedFile: string | null;
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
  };
}

async function createAnthropicMessageWithBudgetRecovery(options: {
  client: AnthropicMessagesClient;
  systemPrompt: string;
  messages: MessageParam[];
  tools: ReturnType<typeof getAnthropicTools>;
  model: Model;
  maxTokens: number;
  temperature?: number;
  turnNumber: number;
  logger: RawLoopLogger;
  signal?: AbortSignal;
  maxTokensRecoveryRetries: number;
  maxTokensRetryMultiplier: number;
  maxTokensRetryCap: number;
}): Promise<Message> {
  let currentMaxTokens = options.maxTokens;
  let recoveryAttempts = 0;

  while (true) {
    const assistantMessage = await createAnthropicMessage(
      options.client,
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

    if (assistantMessage.stop_reason !== "max_tokens") {
      return assistantMessage;
    }

    const partialText = extractAssistantTextSafely(assistantMessage);
    const generatingToolCall =
      hasToolUseLikeBlock(assistantMessage) || partialText.length === 0;

    if (recoveryAttempts >= options.maxTokensRecoveryRetries) {
      throw new AnthropicOutputBudgetExceededError({
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
      throw new AnthropicOutputBudgetExceededError({
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

async function executeToolUse(
  toolUse: ToolUseBlock,
  targetDirectory: string,
  allowedToolNames: Set<string>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  throwIfTurnCancelled(signal);

  if (!allowedToolNames.has(toolUse.name)) {
    return createToolErrorResult(
      `Tool "${toolUse.name}" is not available in this loop.`,
    );
  }

  const tool = getTool(toolUse.name);

  if (!tool) {
    return createToolErrorResult(
      `Tool "${toolUse.name}" is not registered.`,
    );
  }

  try {
    return await tool.execute(toolUse.input, targetDirectory, {
      signal,
    });
  } catch (error) {
    const cancelledError = toTurnCancelledError(error, signal);

    if (cancelledError) {
      throw cancelledError;
    }

    return createToolErrorResult(
      `Tool "${toolUse.name}" execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function executeToolUseWithTracing(
  toolUse: ToolUseBlock,
  targetDirectory: string,
  allowedToolNames: Set<string>,
  turnNumber: number,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const langSmith = getLangSmithConfig();

  if (!langSmith.enabled) {
    return executeToolUse(toolUse, targetDirectory, allowedToolNames, signal);
  }

  const tracedToolExecution = traceable(
    async () => executeToolUse(toolUse, targetDirectory, allowedToolNames, signal),
    {
      name: `shipyard.tool.${toolUse.name}`,
      run_type: "tool",
      project_name: langSmith.project ?? undefined,
      tags: ["shipyard", "tool", toolUse.name],
      metadata: {
        toolName: toolUse.name,
        turnNumber,
        targetDirectory,
      },
    },
  );

  return tracedToolExecution();
}

async function executeToolUsesForTurn(
  toolUses: ToolUseBlock[],
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
  toolResultMessage: MessageParam;
  toolExecutions: RawToolExecution[];
}> {
  const toolResultBlocks: Exclude<MessageParam["content"], string> = [];
  const toolExecutions: RawToolExecution[] = [];

  for (const toolUse of toolUses) {
    throwIfTurnCancelled(signal);
    await beforeToolExecution?.({
      toolUse,
      turnNumber,
      targetDirectory,
    });

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} tool_call ${toolUse.name} input=${truncateForLog(
        stringifyForLog(toolUse.input),
      )}`,
    );

    const result = await executeToolUseWithTracing(
      toolUse,
      targetDirectory,
      allowedToolNames,
      turnNumber,
      signal,
    );

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} tool_result ${toolUse.name} ${result.success ? "success" : "failure"} output=${formatToolResultPreview(
        result,
      )}`,
    );

    const toolExecution: RawToolExecution = {
      toolName: toolUse.name,
      input: toolUse.input,
      success: result.success,
      output: result.output,
      error: result.error,
      editedPath: extractEditedPath(toolUse.name, toolUse.input, result),
    };

    toolExecutions.push(toolExecution);
    throwIfTurnCancelled(signal);
    await afterToolExecution?.({
      toolUse,
      turnNumber,
      targetDirectory,
      result,
      toolExecution,
    });
    toolResultBlocks.push(createUserToolResultBlock(toolUse.id, result));
  }

  return {
    toolResultMessage: createUserToolResultHistoryMessage(toolResultBlocks),
    toolExecutions,
  };
}

function validateToolUseTurn(
  message: Pick<Message, "content" | "stop_reason">,
  turnNumber: number,
): ToolUseBlock[] {
  const toolUses = extractAssistantToolUseBlocks(message);

  if (toolUses.length === 0) {
    throw new Error(
      `Claude returned stop_reason "tool_use" on turn ${String(turnNumber)} without any tool_use blocks.`,
    );
  }

  return toolUses;
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
  const runtimeConfig = resolveAnthropicRuntimeConfig({
    model: options.model,
    maxTokens: options.maxTokens,
  });
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
  const client = options.client ?? createAnthropicClient();
  const logger = options.logger ?? console;
  const allowedToolNames = new Set(normalizedToolNames);
  const initialUserMessage = createUserTextMessage(normalizedUserMessage);
  const completedToolTurns: CompletedToolTurn[] = [];
  const anthropicTools = getAnthropicTools(normalizedToolNames);
  const toolExecutions: RawToolExecution[] = [];
  let lastEditedFile: string | null = null;

  for (let turnNumber = 1; turnNumber <= maxIterations; turnNumber += 1) {
    throwIfTurnCancelled(options.signal);
    const requestHistory = buildCompactedMessageHistory({
      initialUserMessage,
      completedTurns: completedToolTurns,
    });

    if (requestHistory.didCompact) {
      logger.log(
        `[raw-loop] compacted ${String(requestHistory.compactedTurnCount)} completed tool cycle(s); ` +
        `preserved_tail_cycles=${String(requestHistory.preservedTailTurnCount)} ` +
        `history_chars=${String(requestHistory.estimatedCharsBefore)}->${String(requestHistory.estimatedCharsAfter)}`,
      );
    }

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} request messages=${String(requestHistory.messages.length)} ` +
      `tools=${String(anthropicTools.length)} max_tokens=${String(runtimeConfig.maxTokens)}`,
    );

    let assistantMessage: Message;

    try {
      assistantMessage = await createAnthropicMessageWithBudgetRecovery({
        client,
        systemPrompt: normalizedSystemPrompt,
        messages: requestHistory.messages,
        tools: anthropicTools,
        model: runtimeConfig.model,
        maxTokens: runtimeConfig.maxTokens,
        temperature: options.temperature,
        turnNumber,
        logger,
        signal: options.signal,
        maxTokensRecoveryRetries,
        maxTokensRetryMultiplier,
        maxTokensRetryCap,
      });
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
        });
      }

      throw error;
    }

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} stop_reason=${assistantMessage.stop_reason ?? "unknown"}`,
    );

    if (assistantMessage.stop_reason === "tool_use") {
      const toolUses = validateToolUseTurn(assistantMessage, turnNumber);
      const assistantHistoryMessage = createAssistantHistoryMessage(assistantMessage);
      let toolTurnResult: {
        toolResultMessage: MessageParam;
        toolExecutions: RawToolExecution[];
      };

      try {
        toolTurnResult = await executeToolUsesForTurn(
          toolUses,
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
          }).messages,
          toolExecutions,
          iterations: turnNumber,
          lastEditedFile,
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
      });
    }

    const finalText = extractAssistantText(assistantMessage).trim();

    if (!finalText) {
      throw new Error(
        `Claude completed turn ${String(turnNumber)} without any final text blocks.`,
      );
    }

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} final_text=${truncateForLog(finalText)}`,
    );

    const finalAssistantMessage = createAssistantHistoryMessage(assistantMessage);
    const finalMessageHistory = buildCompactedMessageHistory({
      initialUserMessage,
      completedTurns: completedToolTurns,
      finalAssistantMessage,
    });

    return {
      status: "completed",
      finalText,
      messageHistory: finalMessageHistory.messages,
      toolExecutions,
      iterations: turnNumber,
      didEdit: lastEditedFile !== null,
      lastEditedFile,
    };
  }

  throw new Error(
    `Raw Claude loop exceeded ${String(maxIterations)} iterations without reaching a final response.`,
  );
}

export async function runRawToolLoopDetailed(
  systemPrompt: string,
  userMessage: string,
  toolNames: string[],
  targetDirectory: string,
  options: RawToolLoopOptions = {},
): Promise<RawToolLoopResult> {
  const langSmith = getLangSmithConfig();

  if (!langSmith.enabled) {
    return runRawToolLoopDetailedCore(
      systemPrompt,
      userMessage,
      toolNames,
      targetDirectory,
      options,
    );
  }

  const tracedRawLoop = traceable(async () =>
    runRawToolLoopDetailedCore(
      systemPrompt,
      userMessage,
      toolNames,
      targetDirectory,
      options,
    ), {
    name: "shipyard.raw-tool-loop",
    run_type: "chain",
    project_name: langSmith.project ?? undefined,
    tags: ["shipyard", "raw-loop"],
    metadata: {
      targetDirectory,
      toolCount: toolNames.length,
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
