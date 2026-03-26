import type {
  ToolDefinition,
  ToolResult,
} from "../tools/registry.js";

export type TurnMessageRole = "user" | "assistant";

export interface TextTurnContentPart {
  type: "text";
  text: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolCallTurnContentPart {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ToolCallResult {
  toolCallId: string;
  result: ToolResult;
}

export interface ToolResultTurnContentPart {
  type: "tool_result";
  toolCallId: string;
  result: ToolResult;
}

export type TurnContentPart =
  | TextTurnContentPart
  | ToolCallTurnContentPart
  | ToolResultTurnContentPart;

export interface TurnMessage {
  role: TurnMessageRole;
  content: string | TurnContentPart[];
}

export type ModelTurnStopReason =
  | "tool_call"
  | "completed"
  | "max_tokens"
  | "cancelled"
  | "unknown";

export interface ModelTurnInput {
  systemPrompt: string;
  messages: TurnMessage[];
  tools?: ToolDefinition[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelTurnResult {
  message: TurnMessage;
  toolCalls: ToolCall[];
  finalText: string;
  stopReason: ModelTurnStopReason;
  rawStopReason?: string | null;
  model: string;
}

export interface ModelAdapter<TProjectedTool = unknown> {
  readonly provider: string;
  projectTools: (tools: ToolDefinition[]) => TProjectedTool[];
  createTurn: (
    input: ModelTurnInput,
    options?: { signal?: AbortSignal },
  ) => Promise<ModelTurnResult>;
}

function ensureNonBlankString(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank.`);
  }

  return trimmed;
}

export function createTextTurnContentPart(text: string): TextTurnContentPart {
  return {
    type: "text",
    text: ensureNonBlankString(text, "text"),
  };
}

export function createToolCallTurnContentPart(
  toolCall: ToolCall,
): ToolCallTurnContentPart {
  return {
    type: "tool_call",
    toolCallId: ensureNonBlankString(toolCall.id, "toolCall.id"),
    toolName: ensureNonBlankString(toolCall.name, "toolCall.name"),
    input: toolCall.input,
  };
}

export function normalizeToolCallResults(
  toolCallResults: ToolCallResult[],
): ToolResultTurnContentPart[] {
  return toolCallResults.map((toolCallResult, index) => ({
    type: "tool_result",
    toolCallId: ensureNonBlankString(
      toolCallResult.toolCallId,
      `toolCallResults[${String(index)}].toolCallId`,
    ),
    result: toolCallResult.result,
  }));
}

export function createUserTurnMessage(text: string): TurnMessage {
  return {
    role: "user",
    content: ensureNonBlankString(text, "user message"),
  };
}

export function createAssistantTextTurnMessage(text: string): TurnMessage {
  return {
    role: "assistant",
    content: [createTextTurnContentPart(text)],
  };
}

export function createAssistantToolCallTurnMessage(
  toolCalls: ToolCall[],
  options: { text?: string } = {},
): TurnMessage {
  if (toolCalls.length === 0) {
    throw new Error("toolCalls must contain at least one tool call.");
  }

  const content: TurnContentPart[] = [
    ...(options.text ? [createTextTurnContentPart(options.text)] : []),
    ...toolCalls.map((toolCall) => createToolCallTurnContentPart(toolCall)),
  ];

  return {
    role: "assistant",
    content,
  };
}

export function createToolResultTurnMessage(
  toolCallResults: ToolCallResult[],
): TurnMessage {
  const normalizedResults = normalizeToolCallResults(toolCallResults);

  if (normalizedResults.length === 0) {
    throw new Error("toolCallResults must contain at least one tool result.");
  }

  return {
    role: "user",
    content: normalizedResults,
  };
}

export function extractTextFromTurnMessage(message: TurnMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((part): part is TextTurnContentPart => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

export function extractToolCallsFromTurnMessage(
  message: TurnMessage,
): ToolCall[] {
  if (typeof message.content === "string") {
    return [];
  }

  return message.content
    .filter(
      (part): part is ToolCallTurnContentPart => part.type === "tool_call",
    )
    .map((part) => ({
      id: part.toolCallId,
      name: part.toolName,
      input: part.input,
    }));
}
