import type { Message, MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { traceable } from "langsmith/traceable";

import {
  createAnthropicClient,
  createAnthropicMessage,
  createAssistantHistoryMessage,
  createUserTextMessage,
  createUserToolResultBlock,
  extractAssistantText,
  extractAssistantToolUseBlocks,
  type AnthropicMessagesClient,
} from "./anthropic.js";
import {
  createToolErrorResult,
  getAnthropicTools,
  getTool,
  type ToolResult,
} from "../tools/registry.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";

export const RAW_LOOP_MAX_ITERATIONS = 25;
const LOG_PREVIEW_LIMIT = 160;

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
  beforeToolExecution?: (
    context: RawLoopToolHookContext,
  ) => Promise<void> | void;
  afterToolExecution?: (
    context: RawLoopToolResultHookContext,
  ) => Promise<void> | void;
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

async function executeToolUse(
  toolUse: ToolUseBlock,
  targetDirectory: string,
  allowedToolNames: Set<string>,
): Promise<ToolResult> {
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
    return await tool.execute(toolUse.input, targetDirectory);
  } catch (error) {
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
): Promise<ToolResult> {
  const langSmith = getLangSmithConfig();

  if (!langSmith.enabled) {
    return executeToolUse(toolUse, targetDirectory, allowedToolNames);
  }

  const tracedToolExecution = traceable(
    async () => executeToolUse(toolUse, targetDirectory, allowedToolNames),
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
  const maxIterations = ensureValidIterationCap(
    options.maxIterations ?? RAW_LOOP_MAX_ITERATIONS,
  );
  const client = options.client ?? createAnthropicClient();
  const logger = options.logger ?? console;
  const allowedToolNames = new Set(normalizedToolNames);
  const messages: MessageParam[] = [createUserTextMessage(normalizedUserMessage)];
  const anthropicTools = getAnthropicTools(normalizedToolNames);
  const toolExecutions: RawToolExecution[] = [];
  let lastEditedFile: string | null = null;

  for (let turnNumber = 1; turnNumber <= maxIterations; turnNumber += 1) {
    logger.log(
      `[raw-loop] turn ${String(turnNumber)} request messages=${String(messages.length)} tools=${String(anthropicTools.length)}`,
    );

    const assistantMessage = await createAnthropicMessage(client, {
      systemPrompt: normalizedSystemPrompt,
      messages,
      tools: anthropicTools,
    });

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} stop_reason=${assistantMessage.stop_reason ?? "unknown"}`,
    );

    if (assistantMessage.stop_reason === "tool_use") {
      const toolUses = validateToolUseTurn(assistantMessage, turnNumber);
      const assistantHistoryMessage = createAssistantHistoryMessage(assistantMessage);
      const toolTurnResult = await executeToolUsesForTurn(
        toolUses,
        targetDirectory,
        allowedToolNames,
        logger,
        turnNumber,
        options.beforeToolExecution,
        options.afterToolExecution,
      );

      toolExecutions.push(...toolTurnResult.toolExecutions);
      const editedExecution = [...toolTurnResult.toolExecutions]
        .reverse()
        .find((execution) => execution.editedPath !== null);

      if (editedExecution?.editedPath) {
        lastEditedFile = editedExecution.editedPath;
      }

      messages.push(assistantHistoryMessage, toolTurnResult.toolResultMessage);
      continue;
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

    messages.push(createAssistantHistoryMessage(assistantMessage));

    return {
      finalText,
      messageHistory: messages,
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
