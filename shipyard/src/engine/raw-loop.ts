import type { Message, MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

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

export const RAW_LOOP_MAX_ITERATIONS = 25;
const LOG_PREVIEW_LIMIT = 160;

export interface RawLoopLogger {
  log: (message: string) => void;
}

export interface RawToolLoopOptions {
  client?: AnthropicMessagesClient;
  logger?: RawLoopLogger;
  maxIterations?: number;
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

async function executeToolUsesForTurn(
  toolUses: ToolUseBlock[],
  targetDirectory: string,
  allowedToolNames: Set<string>,
  logger: RawLoopLogger,
  turnNumber: number,
): Promise<MessageParam> {
  const toolResultBlocks: Exclude<MessageParam["content"], string> = [];

  for (const toolUse of toolUses) {
    logger.log(
      `[raw-loop] turn ${String(turnNumber)} tool_call ${toolUse.name} input=${truncateForLog(
        stringifyForLog(toolUse.input),
      )}`,
    );

    const result = await executeToolUse(toolUse, targetDirectory, allowedToolNames);

    logger.log(
      `[raw-loop] turn ${String(turnNumber)} tool_result ${toolUse.name} ${result.success ? "success" : "failure"} output=${formatToolResultPreview(
        result,
      )}`,
    );

    toolResultBlocks.push(createUserToolResultBlock(toolUse.id, result));
  }

  return createUserToolResultHistoryMessage(toolResultBlocks);
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

export async function runRawToolLoop(
  systemPrompt: string,
  userMessage: string,
  toolNames: string[],
  targetDirectory: string,
  options: RawToolLoopOptions = {},
): Promise<string> {
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
      const toolResultMessage = await executeToolUsesForTurn(
        toolUses,
        targetDirectory,
        allowedToolNames,
        logger,
        turnNumber,
      );

      messages.push(assistantHistoryMessage, toolResultMessage);
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

    return finalText;
  }

  throw new Error(
    `Raw Claude loop exceeded ${String(maxIterations)} iterations without reaching a final response.`,
  );
}
