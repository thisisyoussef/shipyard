import OpenAI from "openai";
import type {
  ClientOptions,
} from "openai";
import type {
  EasyInputMessage,
  FunctionTool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputMessage,
} from "openai/resources/responses/responses";
import type { ResponsesModel } from "openai/resources/shared";
import { wrapOpenAI } from "langsmith/wrappers/openai";

import type {
  ModelAdapter,
  ModelTurnInput,
  ModelTurnResult,
  ToolCall,
  ToolResultTurnContentPart,
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
  ToolResult,
} from "../tools/registry.js";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4" as ResponsesModel;
export const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 8_192;
export const DEFAULT_OPENAI_TIMEOUT_MS = 120_000;
export const DEFAULT_OPENAI_MAX_RETRIES = 1;

const SHIPYARD_OPENAI_MODEL_ENV = "SHIPYARD_OPENAI_MODEL";
const SHIPYARD_OPENAI_MAX_TOKENS_ENV = "SHIPYARD_OPENAI_MAX_TOKENS";
const SHIPYARD_OPENAI_TIMEOUT_MS_ENV = "SHIPYARD_OPENAI_TIMEOUT_MS";
const SHIPYARD_OPENAI_MAX_RETRIES_ENV = "SHIPYARD_OPENAI_MAX_RETRIES";

export interface OpenAIRuntimeConfig {
  model: ResponsesModel;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface OpenAIConfig extends OpenAIRuntimeConfig {
  apiKey: string;
}

export interface ResolveOpenAIConfigOptions {
  apiKey?: string | null;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  env?: NodeJS.ProcessEnv;
}

export interface OpenAIRequestInput {
  systemPrompt: string;
  messages: TurnMessage[];
  tools?: FunctionTool[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  env?: NodeJS.ProcessEnv;
}

export interface OpenAIResponsesClient {
  responses: {
    create: (
      request: ResponseCreateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ) => Promise<Response>;
  };
}

export interface OpenAIModelAdapterOptions {
  client?: OpenAIResponsesClient;
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

function stringifyJsonValue(
  value: unknown,
  fieldName: string,
): string {
  try {
    const serialized = JSON.stringify(value ?? {});

    if (typeof serialized !== "string" || !serialized.trim()) {
      throw new Error("Expected a JSON-serializable value.");
    }

    return serialized;
  } catch (error) {
    throw new Error(
      `Failed to serialize ${fieldName}: ${getErrorMessage(error)}`,
    );
  }
}

function createMessageInputItem(
  role: TurnMessage["role"],
  text: string,
): EasyInputMessage {
  return {
    role,
    type: "message",
    content: ensureNonBlankString(text, `${role} message`),
  };
}

function createFunctionCallInputItem(
  toolCall: ToolCall,
): ResponseFunctionToolCall {
  const callId = ensureNonBlankString(toolCall.id, "toolCall.id");

  return {
    type: "function_call",
    id: `fc_${callId}`,
    call_id: callId,
    name: ensureNonBlankString(toolCall.name, "toolCall.name"),
    arguments: stringifyJsonValue(toolCall.input, "toolCall.input"),
  };
}

function createToolResultPayload(result: ToolResult): string {
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

export function createFunctionCallOutputItem(
  part: ToolResultTurnContentPart,
): ResponseInputItem.FunctionCallOutput {
  return {
    type: "function_call_output",
    call_id: ensureNonBlankString(part.toolCallId, "toolCallId"),
    output: createToolResultPayload(part.result),
  };
}

function toOpenAIInputItemsForStructuredMessage(
  message: TurnMessage,
  messageIndex: number,
): ResponseInputItem[] {
  if (typeof message.content === "string") {
    return [createMessageInputItem(message.role, message.content)];
  }

  const items: ResponseInputItem[] = [];
  const textBuffer: string[] = [];

  const flushTextBuffer = (): void => {
    if (textBuffer.length === 0) {
      return;
    }

    items.push(
      createMessageInputItem(message.role, textBuffer.join("\n\n")),
    );
    textBuffer.length = 0;
  };

  message.content.forEach((part, partIndex) => {
    validateTurnContentPart(part, messageIndex, partIndex);

    if (part.type === "text") {
      textBuffer.push(part.text);
      return;
    }

    flushTextBuffer();

    if (part.type === "tool_call") {
      items.push(
        createFunctionCallInputItem({
          id: part.toolCallId,
          name: part.toolName,
          input: part.input,
        }),
      );
      return;
    }

    items.push(createFunctionCallOutputItem(part));
  });

  flushTextBuffer();

  if (items.length === 0) {
    throw new Error(`messages[${String(messageIndex)}].content must not be empty.`);
  }

  return items;
}

function toOpenAIInputItems(
  messages: TurnMessage[],
): ResponseInputItem[] {
  return messages.flatMap((message, index) => {
    validateTurnMessage(message, index);
    return toOpenAIInputItemsForStructuredMessage(message, index);
  });
}

function toOpenAIFunctionTools(
  tools: FunctionTool[],
): ResponseCreateParamsNonStreaming["tools"] {
  return tools as ResponseCreateParamsNonStreaming["tools"];
}

function assertOpenAIOutputTextContent(
  part: unknown,
  outputIndex: number,
  contentIndex: number,
): asserts part is ResponseOutputMessage["content"][number] {
  const prefix =
    `output[${String(outputIndex)}].content[${String(contentIndex)}]`;

  if (!isPlainObject(part) || typeof part.type !== "string") {
    throw new Error(`Malformed OpenAI message content at ${prefix}.`);
  }

  if (part.type === "output_text") {
    if (typeof part.text !== "string") {
      throw new Error(`Malformed OpenAI output_text content at ${prefix}.`);
    }

    return;
  }

  if (part.type === "refusal") {
    if (typeof part.refusal !== "string") {
      throw new Error(`Malformed OpenAI refusal content at ${prefix}.`);
    }

    return;
  }

  throw new Error(
    `Unsupported OpenAI message content type "${part.type}" at ${prefix}.`,
  );
}

function assertOpenAIOutputMessage(
  item: unknown,
  index: number,
): asserts item is ResponseOutputMessage {
  const prefix = `output[${String(index)}]`;

  if (!isPlainObject(item)) {
    throw new Error(`Malformed OpenAI output item at ${prefix}.`);
  }

  if (typeof item.id !== "string" || !item.id.trim()) {
    throw new Error(`Malformed OpenAI message item at ${prefix}: missing id.`);
  }

  if (item.role !== "assistant") {
    throw new Error(
      `Malformed OpenAI message item at ${prefix}: expected assistant role.`,
    );
  }

  if (!Array.isArray(item.content)) {
    throw new Error(
      `Malformed OpenAI message item at ${prefix}: missing content array.`,
    );
  }

  item.content.forEach((part, contentIndex) =>
    assertOpenAIOutputTextContent(part, index, contentIndex)
  );
}

function assertOpenAIFunctionCall(
  item: unknown,
  index: number,
): asserts item is ResponseFunctionToolCall {
  const prefix = `output[${String(index)}]`;

  if (!isPlainObject(item)) {
    throw new Error(`Malformed OpenAI function_call item at ${prefix}.`);
  }

  if (typeof item.call_id !== "string" || !item.call_id.trim()) {
    throw new Error(
      `Malformed OpenAI function_call item at ${prefix}: missing call_id.`,
    );
  }

  if (typeof item.name !== "string" || !item.name.trim()) {
    throw new Error(
      `Malformed OpenAI function_call item at ${prefix}: missing name.`,
    );
  }

  if (typeof item.arguments !== "string") {
    throw new Error(
      `Malformed OpenAI function_call item at ${prefix}: missing arguments string.`,
    );
  }
}

type NormalizedOpenAIOutputItem = ResponseOutputMessage | ResponseFunctionToolCall;

export function normalizeOpenAIOutputItems(
  output: ReadonlyArray<unknown>,
): NormalizedOpenAIOutputItem[] {
  const normalizedItems: NormalizedOpenAIOutputItem[] = [];

  output.forEach((item, index) => {
    if (!isPlainObject(item) || typeof item.type !== "string") {
      throw new Error(`Malformed OpenAI output item at index ${String(index)}.`);
    }

    if (item.type === "message") {
      assertOpenAIOutputMessage(item, index);
      normalizedItems.push(item);
      return;
    }

    if (item.type === "function_call") {
      assertOpenAIFunctionCall(item, index);
      normalizedItems.push(item);
      return;
    }

    if (item.type === "reasoning") {
      return;
    }

    throw new Error(
      `Unsupported OpenAI output item type "${item.type}" at index ${String(index)}. ` +
      "Shipyard currently supports message, function_call, and reasoning items only.",
    );
  });

  return normalizedItems;
}

function parseFunctionCallArguments(
  functionCall: ResponseFunctionToolCall,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(functionCall.arguments) as unknown;

    if (!isPlainObject(parsed)) {
      throw new Error("Expected a JSON object.");
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Malformed OpenAI function call arguments for "${functionCall.name}" ` +
      `(call_id=${functionCall.call_id}): ${getErrorMessage(error)}`,
    );
  }
}

export function extractOpenAIFunctionToolCalls(
  output: ReadonlyArray<unknown>,
): ToolCall[] {
  return normalizeOpenAIOutputItems(output)
    .filter(
      (item): item is ResponseFunctionToolCall => item.type === "function_call",
    )
    .map((item) => ({
      id: item.call_id,
      name: item.name,
      input: parseFunctionCallArguments(item),
    }));
}

export function extractOpenAITextOutput(
  output: ReadonlyArray<unknown>,
): string {
  return normalizeOpenAIOutputItems(output)
    .filter(
      (item): item is ResponseOutputMessage => item.type === "message",
    )
    .flatMap((message) =>
      message.content.map((part) =>
        part.type === "output_text" ? part.text : part.refusal
      )
    )
    .join("\n\n");
}

function createOpenAIHistoryMessage(
  response: Pick<Response, "output" | "output_text">,
): TurnMessage {
  const toolCalls = extractOpenAIFunctionToolCalls(response.output);
  const text =
    extractOpenAITextOutput(response.output).trim()
    || response.output_text.trim();

  if (toolCalls.length > 0) {
    return createAssistantToolCallTurnMessage(toolCalls, {
      text: text || undefined,
    });
  }

  if (text) {
    return createAssistantTextTurnMessage(text);
  }

  return {
    role: "assistant",
    content: [],
  };
}

function mapOpenAIStopReason(
  response: Pick<Response, "status" | "incomplete_details">,
  toolCalls: ToolCall[],
): ModelTurnResult["stopReason"] {
  if (toolCalls.length > 0) {
    return "tool_call";
  }

  if (response.status === "completed") {
    return "completed";
  }

  if (
    response.status === "incomplete"
    && response.incomplete_details?.reason === "max_output_tokens"
  ) {
    return "max_tokens";
  }

  if (response.status === "cancelled") {
    return "cancelled";
  }

  return "unknown";
}

export function projectToolsToOpenAIFunctionTools(
  tools: ToolDefinition[],
): FunctionTool[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as unknown as Record<string, unknown>,
    strict: false,
  }));
}

export function resolveOpenAIConfig(
  options: ResolveOpenAIConfigOptions = {},
): OpenAIConfig {
  const env = options.env ?? process.env;
  const apiKey = (options.apiKey ?? env.OPENAI_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Set it in the environment before starting Shipyard.",
    );
  }

  return {
    apiKey,
    ...resolveOpenAIRuntimeConfig(options),
  };
}

export function resolveOpenAIRuntimeConfig(
  options: ResolveOpenAIConfigOptions = {},
): OpenAIRuntimeConfig {
  const env = options.env ?? process.env;
  const model = ensureNonBlankString(
    options.model
      ?? env[SHIPYARD_OPENAI_MODEL_ENV]
      ?? DEFAULT_OPENAI_MODEL,
    "model",
  ) as ResponsesModel;

  return {
    model,
    maxTokens: ensurePositiveInteger(
      options.maxTokens
        ?? parseOptionalPositiveIntegerEnv(env, SHIPYARD_OPENAI_MAX_TOKENS_ENV)
        ?? DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
      "maxTokens",
    ),
    timeoutMs: ensurePositiveInteger(
      options.timeoutMs
        ?? parseOptionalPositiveIntegerEnv(env, SHIPYARD_OPENAI_TIMEOUT_MS_ENV)
        ?? DEFAULT_OPENAI_TIMEOUT_MS,
      "timeoutMs",
    ),
    maxRetries: ensureNonNegativeInteger(
      options.maxRetries
        ?? parseOptionalNonNegativeIntegerEnv(env, SHIPYARD_OPENAI_MAX_RETRIES_ENV)
        ?? DEFAULT_OPENAI_MAX_RETRIES,
      "maxRetries",
    ),
  };
}

export function createOpenAIClient(
  options: ResolveOpenAIConfigOptions = {},
): OpenAIResponsesClient {
  const config = resolveOpenAIConfig(options);
  const clientOptions: ClientOptions = {
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
  };
  const client = new OpenAI(clientOptions);
  const langSmith = getLangSmithConfig(options.env);

  if (!langSmith.enabled) {
    return client;
  }

  return wrapOpenAI(client, {
    name: "shipyard.openai.responses.create",
    project_name: langSmith.project ?? undefined,
    metadata: {
      runtime: "shipyard",
      provider: "openai",
    },
    tags: ["shipyard", "openai"],
  });
}

export function buildOpenAIResponseRequest(
  input: OpenAIRequestInput,
): ResponseCreateParamsNonStreaming {
  const systemPrompt = ensureNonBlankString(input.systemPrompt, "systemPrompt");
  const runtimeConfig = resolveOpenAIRuntimeConfig({
    model: input.model,
    maxTokens: input.maxTokens,
    env: input.env,
  });

  if (input.messages.length === 0) {
    throw new Error("messages must contain at least one message.");
  }

  const request: ResponseCreateParamsNonStreaming = {
    instructions: systemPrompt,
    input: toOpenAIInputItems(input.messages),
    model: runtimeConfig.model,
    max_output_tokens: runtimeConfig.maxTokens,
    store: false,
  };

  if (input.temperature !== undefined) {
    request.temperature = input.temperature;
  }

  if (input.tools !== undefined) {
    request.tools = toOpenAIFunctionTools(input.tools);

    if (input.tools.length > 0) {
      request.tool_choice = "auto";
      request.parallel_tool_calls = true;
    }
  }

  return request;
}

export async function createOpenAIResponse(
  client: OpenAIResponsesClient,
  input: OpenAIRequestInput,
  requestOptions?: { signal?: AbortSignal },
): Promise<Response> {
  const request = buildOpenAIResponseRequest(input);

  try {
    const response = await client.responses.create(request, requestOptions);

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (response.status === "failed") {
      throw new Error(
        "OpenAI Responses API returned status=failed.",
      );
    }

    return response;
  } catch (error) {
    const cancelledError = toTurnCancelledError(
      error,
      requestOptions?.signal ?? undefined,
    );

    if (cancelledError) {
      throw cancelledError;
    }

    throw new Error(
      `OpenAI Responses API request failed during response creation: ${getErrorMessage(error)}`,
    );
  }
}

export function createUserTextMessage(text: string): TurnMessage {
  return createUserTurnMessage(text);
}

export function createUserToolResultMessage(
  toolCallId: string,
  result: ToolResult,
): TurnMessage {
  return createToolResultTurnMessage([
    {
      toolCallId,
      result,
    },
  ]);
}

export function createOpenAIModelAdapter(
  options: OpenAIModelAdapterOptions = {},
): ModelAdapter<FunctionTool> {
  const runtimeConfig = resolveOpenAIRuntimeConfig({
    env: options.env,
  });
  const client = options.client ?? createOpenAIClient({
    env: options.env,
  });

  return {
    provider: "openai",
    defaultModel: runtimeConfig.model,
    defaultMaxTokens: runtimeConfig.maxTokens,
    projectTools: projectToolsToOpenAIFunctionTools,
    async createTurn(
      input: ModelTurnInput,
      requestOptions?: { signal?: AbortSignal },
    ): Promise<ModelTurnResult> {
      const response = await createOpenAIResponse(
        client,
        {
          systemPrompt: input.systemPrompt,
          messages: input.messages,
          tools: input.tools
            ? projectToolsToOpenAIFunctionTools(input.tools)
            : undefined,
          model: input.model,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          env: options.env,
        },
        requestOptions,
      );
      const message = createOpenAIHistoryMessage(response);
      const toolCalls = extractToolCallsFromTurnMessage(message);

      return {
        message,
        toolCalls,
        finalText:
          extractTextFromTurnMessage(message).trim()
          || response.output_text.trim(),
        stopReason: mapOpenAIStopReason(response, toolCalls),
        rawStopReason: response.status,
        model: response.model,
      };
    },
  };
}
