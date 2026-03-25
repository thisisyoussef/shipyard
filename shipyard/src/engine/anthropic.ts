import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Model,
  TextBlock,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { wrapAnthropic } from "langsmith/wrappers/anthropic";

import type { AnthropicToolDefinition, ToolResult } from "../tools/registry.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";
import { toTurnCancelledError } from "./cancellation.js";

export const DEFAULT_ANTHROPIC_MODEL: Model = "claude-sonnet-4-5";
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 4_096;
export const DEFAULT_ANTHROPIC_TIMEOUT_MS = 30_000;
export const DEFAULT_ANTHROPIC_MAX_RETRIES = 1;

export interface AnthropicConfig {
  apiKey: string;
  model: Model;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface ResolveAnthropicConfigOptions {
  apiKey?: string | null;
  model?: Model;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  env?: NodeJS.ProcessEnv;
}

export interface ClaudeRequestInput {
  systemPrompt: string;
  messages: MessageParam[];
  tools?: AnthropicToolDefinition[];
  model?: Model;
  maxTokens?: number;
  temperature?: number;
}

export interface AnthropicMessagesClient {
  messages: {
    create: (
      request: MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ) => Promise<Message>;
  };
}

function ensureNonBlankString(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank.`);
  }

  return trimmed;
}

function ensurePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return value;
}

function ensureNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateMessageParam(message: MessageParam, index: number): void {
  if (typeof message.content === "string") {
    ensureNonBlankString(message.content, `messages[${index}].content`);
    return;
  }

  if (message.content.length === 0) {
    throw new Error(`messages[${index}].content must not be empty.`);
  }
}

function toAnthropicTools(
  tools: AnthropicToolDefinition[],
): MessageCreateParamsNonStreaming["tools"] {
  return tools as MessageCreateParamsNonStreaming["tools"];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertTextBlock(block: unknown, index: number): asserts block is TextBlock {
  if (!isPlainObject(block) || typeof block.text !== "string") {
    throw new Error(
      `Malformed assistant text block at index ${String(index)}.`,
    );
  }
}

function assertToolUseBlock(block: unknown, index: number): asserts block is ToolUseBlock {
  if (!isPlainObject(block)) {
    throw new Error(`Malformed assistant tool_use block at index ${String(index)}.`);
  }

  if (typeof block.id !== "string" || !block.id.trim()) {
    throw new Error(
      `Malformed assistant tool_use block at index ${String(index)}: missing id.`,
    );
  }

  if (typeof block.name !== "string" || !block.name.trim()) {
    throw new Error(
      `Malformed assistant tool_use block at index ${String(index)}: missing name.`,
    );
  }

  if (!isPlainObject(block.caller) || typeof block.caller.type !== "string") {
    throw new Error(
      `Malformed assistant tool_use block at index ${String(index)}: missing caller.`,
    );
  }
}

export function resolveAnthropicConfig(
  options: ResolveAnthropicConfigOptions = {},
): AnthropicConfig {
  const env = options.env ?? process.env;
  const apiKey = (options.apiKey ?? env.ANTHROPIC_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Set it in the environment before starting Shipyard.",
    );
  }

  return {
    apiKey,
    model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
    maxTokens: ensurePositiveInteger(
      options.maxTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
      "maxTokens",
    ),
    timeoutMs: ensurePositiveInteger(
      options.timeoutMs ?? DEFAULT_ANTHROPIC_TIMEOUT_MS,
      "timeoutMs",
    ),
    maxRetries: ensureNonNegativeInteger(
      options.maxRetries ?? DEFAULT_ANTHROPIC_MAX_RETRIES,
      "maxRetries",
    ),
  };
}

export function createAnthropicClient(
  options: ResolveAnthropicConfigOptions = {},
): AnthropicMessagesClient {
  const config = resolveAnthropicConfig(options);
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
  const langSmith = getLangSmithConfig(options.env);

  if (!langSmith.enabled) {
    return client;
  }

  return wrapAnthropic(client, {
    name: "shipyard.anthropic.messages.create",
    project_name: langSmith.project ?? undefined,
    metadata: {
      runtime: "shipyard",
      provider: "anthropic",
    },
    tags: ["shipyard", "anthropic"],
  });
}

export function createUserTextMessage(text: string): MessageParam {
  return {
    role: "user",
    content: ensureNonBlankString(text, "user message"),
  };
}

export function normalizeAssistantResponseBlocks(
  content: ReadonlyArray<unknown>,
): Array<TextBlock | ToolUseBlock> {
  return content.map((block, index) => {
    if (!isPlainObject(block) || typeof block.type !== "string") {
      throw new Error(
        `Malformed assistant content block at index ${String(index)}.`,
      );
    }

    if (block.type === "text") {
      assertTextBlock(block, index);
      return block;
    }

    if (block.type === "tool_use") {
      assertToolUseBlock(block, index);
      return block;
    }

    throw new Error(
      `Unsupported assistant content block type "${block.type}" at index ${String(index)}. Shipyard currently supports text and tool_use blocks only.`,
    );
  });
}

export function extractAssistantToolUseBlocks(
  message: Pick<Message, "content">,
): ToolUseBlock[] {
  return normalizeAssistantResponseBlocks(message.content).filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  );
}

export function extractAssistantText(
  message: Pick<Message, "content">,
): string {
  return normalizeAssistantResponseBlocks(message.content)
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

export function createAssistantHistoryMessage(
  message: Pick<Message, "content">,
): MessageParam {
  return {
    role: "assistant",
    content: normalizeAssistantResponseBlocks(message.content),
  };
}

export function createToolResultPayload(result: ToolResult): string {
  return JSON.stringify(
    {
      success: result.success,
      output: result.output,
      ...(result.error ? { error: result.error } : {}),
      ...(result.data === undefined ? {} : { data: result.data }),
    },
    null,
    2,
  );
}

export function createUserToolResultBlock(
  toolUseId: string,
  result: ToolResult,
): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: ensureNonBlankString(toolUseId, "toolUseId"),
    content: createToolResultPayload(result),
    is_error: !result.success,
  };
}

export function createUserToolResultMessage(
  toolUseId: string,
  result: ToolResult,
): MessageParam {
  return {
    role: "user",
    content: [createUserToolResultBlock(toolUseId, result)],
  };
}

export function buildAnthropicMessageRequest(
  input: ClaudeRequestInput,
): MessageCreateParamsNonStreaming {
  const systemPrompt = ensureNonBlankString(input.systemPrompt, "systemPrompt");

  if (input.messages.length === 0) {
    throw new Error("messages must contain at least one message.");
  }

  input.messages.forEach((message, index) => {
    validateMessageParam(message, index);
  });

  const request: MessageCreateParamsNonStreaming = {
    system: systemPrompt,
    // Snapshot the request history so later loop mutations do not retroactively
    // change the payload we already sent to Anthropic.
    messages: [...input.messages],
    model: input.model ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: ensurePositiveInteger(
      input.maxTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
      "maxTokens",
    ),
  };

  if (input.temperature !== undefined) {
    request.temperature = input.temperature;
  }

  if (input.tools !== undefined) {
    request.tools = toAnthropicTools(input.tools);
  }

  return request;
}

export async function createAnthropicMessage(
  client: AnthropicMessagesClient,
  input: ClaudeRequestInput,
  requestOptions?: Anthropic.RequestOptions,
): Promise<Message> {
  const request = buildAnthropicMessageRequest(input);

  try {
    return await client.messages.create(request, requestOptions);
  } catch (error) {
    const cancelledError = toTurnCancelledError(
      error,
      requestOptions?.signal ?? undefined,
    );

    if (cancelledError) {
      throw cancelledError;
    }

    throw new Error(
      `Anthropic API request failed during message creation: ${getErrorMessage(error)}`,
    );
  }
}
