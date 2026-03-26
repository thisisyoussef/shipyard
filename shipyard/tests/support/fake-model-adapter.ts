import {
  createAssistantTextTurnMessage,
  createAssistantToolCallTurnMessage,
  extractTextFromTurnMessage,
  extractToolCallsFromTurnMessage,
  type ModelAdapter,
  type ModelTurnInput,
  type ModelTurnResult,
  type ModelTurnStopReason,
  type ToolCall,
  type TurnContentPart,
  type ToolResultTurnContentPart,
  type TurnMessage,
} from "../../src/engine/model-adapter.js";
import type { ToolDefinition } from "../../src/tools/registry.js";

export const DEFAULT_FAKE_MODEL_PROVIDER = "fake-provider";
export const DEFAULT_FAKE_MODEL_NAME = "fake-model";

export interface FakeModelAdapterCall extends ModelTurnInput {
  turnNumber: number;
  signal?: AbortSignal;
}

export interface FakeModelAdapterOptions {
  provider?: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
}

export interface FakeModelAdapter extends ModelAdapter<ToolDefinition> {
  calls: FakeModelAdapterCall[];
}

type StructuredUserTurnMessage = {
  role: "user";
  content: TurnContentPart[];
};

type FakeModelTurnResponder =
  | ModelTurnResult[]
  | ((
    input: ModelTurnInput,
    context: {
      turnNumber: number;
      signal?: AbortSignal;
    },
  ) => ModelTurnResult | Promise<ModelTurnResult>);

function cloneTurnMessage(message: TurnMessage): TurnMessage {
  if (typeof message.content === "string") {
    return {
      role: message.role,
      content: message.content,
    };
  }

  return {
    role: message.role,
    content: structuredClone(message.content),
  };
}

function cloneToolCall(toolCall: ToolCall): ToolCall {
  return {
    id: toolCall.id,
    name: toolCall.name,
    input: structuredClone(toolCall.input),
  };
}

function createAssistantMessage(options: {
  finalText?: string;
  toolCalls?: ToolCall[];
} = {}): TurnMessage {
  if (options.toolCalls && options.toolCalls.length > 0) {
    return createAssistantToolCallTurnMessage(options.toolCalls, {
      ...(options.finalText ? { text: options.finalText } : {}),
    });
  }

  if (options.finalText?.trim()) {
    return createAssistantTextTurnMessage(options.finalText);
  }

  return {
    role: "assistant",
    content: [],
  };
}

function cloneModelTurnResult(result: ModelTurnResult): ModelTurnResult {
  return {
    ...result,
    message: cloneTurnMessage(result.message),
    toolCalls: result.toolCalls.map((toolCall) => cloneToolCall(toolCall)),
  };
}

function cloneModelTurnInput(
  input: ModelTurnInput,
  turnNumber: number,
  signal?: AbortSignal,
): FakeModelAdapterCall {
  return {
    ...input,
    messages: input.messages.map((message) => cloneTurnMessage(message)),
    ...(input.tools ? { tools: [...input.tools] } : {}),
    turnNumber,
    signal,
  };
}

export function createFakeModelTurnResult(options: {
  finalText?: string;
  toolCalls?: ToolCall[];
  message?: TurnMessage;
  stopReason?: ModelTurnStopReason;
  rawStopReason?: string | null;
  model?: string;
} = {}): ModelTurnResult {
  const message = options.message
    ? cloneTurnMessage(options.message)
    : createAssistantMessage({
      finalText: options.finalText,
      toolCalls: options.toolCalls,
    });
  const toolCalls = options.toolCalls
    ? options.toolCalls.map((toolCall) => cloneToolCall(toolCall))
    : extractToolCallsFromTurnMessage(message);
  const finalText = options.finalText ?? extractTextFromTurnMessage(message);

  return {
    message,
    toolCalls,
    finalText,
    stopReason: options.stopReason ?? (
      toolCalls.length > 0 ? "tool_call" : "completed"
    ),
    rawStopReason: options.rawStopReason ?? null,
    model: options.model ?? DEFAULT_FAKE_MODEL_NAME,
  };
}

export function createFakeTextTurnResult(
  text: string,
  options: {
    model?: string;
    stopReason?: ModelTurnStopReason;
    rawStopReason?: string | null;
  } = {},
): ModelTurnResult {
  return createFakeModelTurnResult({
    finalText: text,
    model: options.model,
    stopReason: options.stopReason ?? "completed",
    rawStopReason: options.rawStopReason,
  });
}

export function createFakeToolCallTurnResult(
  toolCalls: ToolCall[],
  options: {
    text?: string;
    model?: string;
    stopReason?: ModelTurnStopReason;
    rawStopReason?: string | null;
  } = {},
): ModelTurnResult {
  return createFakeModelTurnResult({
    finalText: options.text,
    toolCalls,
    model: options.model,
    stopReason: options.stopReason ?? "tool_call",
    rawStopReason: options.rawStopReason,
  });
}

export function createAbortError(
  message = "The operation was aborted.",
): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function createFakeModelAdapter(
  responder: FakeModelTurnResponder,
  options: FakeModelAdapterOptions = {},
): FakeModelAdapter {
  const calls: FakeModelAdapterCall[] = [];

  return {
    provider: options.provider ?? DEFAULT_FAKE_MODEL_PROVIDER,
    defaultModel: options.defaultModel ?? DEFAULT_FAKE_MODEL_NAME,
    defaultMaxTokens: options.defaultMaxTokens,
    calls,
    projectTools(tools) {
      return [...tools];
    },
    async createTurn(input, turnOptions) {
      const turnNumber = calls.length + 1;
      calls.push(cloneModelTurnInput(input, turnNumber, turnOptions?.signal));

      if (typeof responder === "function") {
        return cloneModelTurnResult(
          await responder(input, {
            turnNumber,
            signal: turnOptions?.signal,
          }),
        );
      }

      const response = responder[turnNumber - 1];

      if (!response) {
        throw new Error(
          `No fake model response configured for turn ${String(turnNumber)}.`,
        );
      }

      return cloneModelTurnResult(response);
    },
  };
}

export function getToolNamesFromCall(call: FakeModelAdapterCall): string[] {
  return call.tools?.map((tool) => tool.name) ?? [];
}

export function getLastStructuredUserMessage(
  call: FakeModelAdapterCall,
): StructuredUserTurnMessage {
  const lastMessage = call.messages.at(-1);

  if (!lastMessage) {
    throw new Error("Expected a last message.");
  }

  if (lastMessage.role !== "user" || typeof lastMessage.content === "string") {
    throw new Error(
      "Expected the last message to be a structured user tool_result message.",
    );
  }

  return {
    role: "user",
    content: lastMessage.content,
  };
}

export function getToolResultContentParts(
  call: FakeModelAdapterCall,
): ToolResultTurnContentPart[] {
  const message = getLastStructuredUserMessage(call);

  return message.content.map((part) => {
    if (part.type !== "tool_result") {
      throw new Error("Expected tool_result content parts.");
    }

    return part;
  });
}
