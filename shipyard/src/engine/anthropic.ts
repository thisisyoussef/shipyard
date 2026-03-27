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

import type {
  ModelAdapter,
  ModelTurnInput,
  ModelTurnResult,
  ToolCall,
  TurnContentPart,
  TurnMessage,
} from "./model-adapter.js";
import {
  createAssistantTextTurnMessage,
  createAssistantToolCallTurnMessage,
  createToolResultTurnMessage,
  createUserTurnMessage,
  extractTextFromTurnMessage,
  extractToolCallsFromTurnMessage,
} from "./model-adapter.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";
import { toTurnCancelledError } from "./cancellation.js";
import type {
  ToolDefinition,
  ToolInputSchema,
  ToolResult,
} from "../tools/registry.js";

export const DEFAULT_ANTHROPIC_MODEL: Model = "claude-opus-4-6";
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 12_288;
export const DEFAULT_ANTHROPIC_TIMEOUT_MS = 600_000;
export const DEFAULT_ANTHROPIC_MAX_RETRIES = 1;

const SHIPYARD_ANTHROPIC_MODEL_ENV = "SHIPYARD_ANTHROPIC_MODEL";
const SHIPYARD_ANTHROPIC_MAX_TOKENS_ENV = "SHIPYARD_ANTHROPIC_MAX_TOKENS";
const SHIPYARD_ANTHROPIC_TIMEOUT_MS_ENV = "SHIPYARD_ANTHROPIC_TIMEOUT_MS";
const SHIPYARD_ANTHROPIC_MAX_RETRIES_ENV = "SHIPYARD_ANTHROPIC_MAX_RETRIES";

export interface AnthropicRuntimeConfig {
  model: Model;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface AnthropicConfig extends AnthropicRuntimeConfig {
  apiKey: string;
}

export interface ResolveAnthropicConfigOptions {
  apiKey?: string | null;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  env?: NodeJS.ProcessEnv;
}

export interface ClaudeRequestInput {
  systemPrompt: string;
  messages: TurnMessage[];
  tools?: AnthropicToolDefinition[];
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  env?: NodeJS.ProcessEnv;
}

export interface AnthropicMessagesClient {
  messages: {
    create: (
      request: MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ) => Promise<Message>;
  };
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

export interface AnthropicModelAdapterOptions {
  client?: AnthropicMessagesClient;
  env?: NodeJS.ProcessEnv;
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

function validateTurnContentPart(
  part: TurnContentPart,
  messageIndex: number,
  partIndex: number,
): void {
  const prefix = `messages[${String(messageIndex)}].content[${String(partIndex)}]`;

  if (part.type === "text") {
    ensureNonBlankString(part.text, `${prefix}.text`);
    return;
  }

  if (part.type === "tool_call") {
    ensureNonBlankString(part.toolCallId, `${prefix}.toolCallId`);
    ensureNonBlankString(part.toolName, `${prefix}.toolName`);
    return;
  }

  ensureNonBlankString(part.toolCallId, `${prefix}.toolCallId`);
}

function validateTurnMessage(message: TurnMessage, index: number): void {
  if (typeof message.content === "string") {
    ensureNonBlankString(message.content, `messages[${String(index)}].content`);
    return;
  }

  if (message.content.length === 0) {
    throw new Error(`messages[${String(index)}].content must not be empty.`);
  }

  message.content.forEach((part, partIndex) =>
    validateTurnContentPart(part, index, partIndex)
  );
}

function toAnthropicTools(
  tools: AnthropicToolDefinition[],
): MessageCreateParamsNonStreaming["tools"] {
  return tools as MessageCreateParamsNonStreaming["tools"];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseOptionalPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  envName: string,
): number | undefined {
  const rawValue = env[envName]?.trim();

  if (!rawValue) {
    return undefined;
  }

  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(
      `${envName} must be a positive integer when set. Received: ${rawValue}`,
    );
  }

  return ensurePositiveInteger(Number.parseInt(rawValue, 10), envName);
}

function parseOptionalNonNegativeIntegerEnv(
  env: NodeJS.ProcessEnv,
  envName: string,
): number | undefined {
  const rawValue = env[envName]?.trim();

  if (!rawValue) {
    return undefined;
  }

  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(
      `${envName} must be a non-negative integer when set. Received: ${rawValue}`,
    );
  }

  return ensureNonNegativeInteger(Number.parseInt(rawValue, 10), envName);
}

function toAnthropicToolUseBlock(toolCall: ToolCall): ToolUseBlock {
  return {
    type: "tool_use",
    id: ensureNonBlankString(toolCall.id, "toolCall.id"),
    name: ensureNonBlankString(toolCall.name, "toolCall.name"),
    input: toolCall.input,
    caller: {
      type: "direct",
    },
  };
}

function toAnthropicContentBlock(part: TurnContentPart): unknown {
  if (part.type === "text") {
    return {
      type: "text",
      text: ensureNonBlankString(part.text, "text"),
      citations: null,
    };
  }

  if (part.type === "tool_call") {
    return toAnthropicToolUseBlock({
      id: part.toolCallId,
      name: part.toolName,
      input: part.input,
    });
  }

  return createUserToolResultBlock(part.toolCallId, part.result);
}

function toAnthropicMessageParam(message: TurnMessage): MessageParam {
  if (typeof message.content === "string") {
    return {
      role: message.role,
      content: ensureNonBlankString(message.content, "message.content"),
    };
  }

  return {
    role: message.role,
    content: message.content.map((part) => toAnthropicContentBlock(part)) as Exclude<
      MessageParam["content"],
      string
    >,
  };
}

export function projectToolsToAnthropicTools(
  tools: ToolDefinition[],
): AnthropicToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
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
    ...resolveAnthropicRuntimeConfig(options),
  };
}

export function resolveAnthropicRuntimeConfig(
  options: ResolveAnthropicConfigOptions = {},
): AnthropicRuntimeConfig {
  const env = options.env ?? process.env;
  const model = ensureNonBlankString(
    options.model
      ?? (env[SHIPYARD_ANTHROPIC_MODEL_ENV] as Model | undefined)
      ?? DEFAULT_ANTHROPIC_MODEL,
    "model",
  ) as Model;

  return {
    model,
    maxTokens: ensurePositiveInteger(
      options.maxTokens
        ?? parseOptionalPositiveIntegerEnv(env, SHIPYARD_ANTHROPIC_MAX_TOKENS_ENV)
        ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
      "maxTokens",
    ),
    timeoutMs: ensurePositiveInteger(
      options.timeoutMs
        ?? parseOptionalPositiveIntegerEnv(env, SHIPYARD_ANTHROPIC_TIMEOUT_MS_ENV)
        ?? DEFAULT_ANTHROPIC_TIMEOUT_MS,
      "timeoutMs",
    ),
    maxRetries: ensureNonNegativeInteger(
      options.maxRetries
        ?? parseOptionalNonNegativeIntegerEnv(env, SHIPYARD_ANTHROPIC_MAX_RETRIES_ENV)
        ?? DEFAULT_ANTHROPIC_MAX_RETRIES,
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

export function createUserTextMessage(text: string): TurnMessage {
  return createUserTurnMessage(text);
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
): TurnMessage {
  const text = extractAssistantText(message);
  const toolCalls = extractAssistantToolUseBlocks(message).map<ToolCall>(
    (block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }),
  );

  if (toolCalls.length > 0) {
    return createAssistantToolCallTurnMessage(toolCalls, {
      text: text || undefined,
    });
  }

  if (text.trim()) {
    return createAssistantTextTurnMessage(text);
  }

  return {
    role: "assistant",
    content: [],
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
): TurnMessage {
  return createToolResultTurnMessage([
    {
      toolCallId: toolUseId,
      result,
    },
  ]);
}

export function buildAnthropicMessageRequest(
  input: ClaudeRequestInput,
): MessageCreateParamsNonStreaming {
  const systemPrompt = ensureNonBlankString(input.systemPrompt, "systemPrompt");
  const runtimeConfig = resolveAnthropicRuntimeConfig({
    model: input.model,
    maxTokens: input.maxTokens,
    env: input.env,
  });

  if (input.messages.length === 0) {
    throw new Error("messages must contain at least one message.");
  }

  input.messages.forEach((message, index) => {
    validateTurnMessage(message, index);
  });

  const request: MessageCreateParamsNonStreaming = {
    system: systemPrompt,
    messages: input.messages.map((message) => toAnthropicMessageParam(message)),
    model: runtimeConfig.model,
    max_tokens: runtimeConfig.maxTokens,
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

    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      const timeoutMs = input.timeoutMs
        ?? resolveAnthropicRuntimeConfig({
          model: input.model,
          maxTokens: input.maxTokens,
          env: input.env,
        }).timeoutMs;

      throw new Error(
        `Anthropic API request timed out after ${String(timeoutMs)}ms during message creation. ` +
        "Set SHIPYARD_ANTHROPIC_TIMEOUT_MS to override the default timeout if needed.",
      );
    }

    throw new Error(
      `Anthropic API request failed during message creation: ${getErrorMessage(error)}`,
    );
  }
}

function mapAnthropicStopReason(
  stopReason: Message["stop_reason"],
): ModelTurnResult["stopReason"] {
  if (stopReason === "tool_use") {
    return "tool_call";
  }

  if (stopReason === "end_turn" || stopReason === "stop_sequence") {
    return "completed";
  }

  if (stopReason === "max_tokens") {
    return "max_tokens";
  }

  return "unknown";
}

export function createAnthropicModelAdapter(
  options: AnthropicModelAdapterOptions = {},
): ModelAdapter<AnthropicToolDefinition> {
  const runtimeConfig = resolveAnthropicRuntimeConfig({
    env: options.env,
  });
  const client = options.client ?? createAnthropicClient({
    env: options.env,
  });

  return {
    provider: "anthropic",
    defaultModel: runtimeConfig.model,
    defaultMaxTokens: runtimeConfig.maxTokens,
    projectTools: projectToolsToAnthropicTools,
    async createTurn(
      input: ModelTurnInput,
      requestOptions?: { signal?: AbortSignal },
    ): Promise<ModelTurnResult> {
      const response = await createAnthropicMessage(
        client,
        {
          systemPrompt: input.systemPrompt,
          messages: input.messages,
          tools: input.tools
            ? projectToolsToAnthropicTools(input.tools)
            : undefined,
          model: input.model,
          maxTokens: input.maxTokens,
          timeoutMs: runtimeConfig.timeoutMs,
          temperature: input.temperature,
          env: options.env,
        },
        requestOptions,
      );
      const message = createAssistantHistoryMessage(response);

      return {
        message,
        toolCalls: extractToolCallsFromTurnMessage(message),
        finalText: extractTextFromTurnMessage(message).trim(),
        stopReason: mapAnthropicStopReason(response.stop_reason),
        rawStopReason: response.stop_reason ?? null,
        model: response.model,
      };
    },
  };
}
