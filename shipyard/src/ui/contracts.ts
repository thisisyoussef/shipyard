import { z } from "zod";

export const runtimeModeSchema = z.enum(["repl", "ui"]);
export const uiConnectionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "ready",
  "agent-busy",
  "error",
]);

const nonEmptyTextSchema = z.string().trim().min(1);

export const instructionMessageSchema = z.object({
  type: z.literal("instruction"),
  text: nonEmptyTextSchema,
  injectedContext: z.array(nonEmptyTextSchema).optional(),
});

export const cancelMessageSchema = z.object({
  type: z.literal("cancel"),
  requestId: z.string().trim().min(1).optional(),
});

export const statusMessageSchema = z.object({
  type: z.literal("status"),
});

export const frontendToBackendMessageSchema = z.discriminatedUnion("type", [
  instructionMessageSchema,
  cancelMessageSchema,
  statusMessageSchema,
]);

export type FrontendToBackendMessage = z.infer<
  typeof frontendToBackendMessageSchema
>;

export const sessionStateMessageSchema = z.object({
  type: z.literal("session:state"),
  runtimeMode: runtimeModeSchema,
  connectionState: uiConnectionStateSchema,
  sessionId: z.string(),
  targetLabel: z.string(),
  turnCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  discoverySummary: z.string(),
  projectRulesLoaded: z.boolean(),
});

export const agentThinkingMessageSchema = z.object({
  type: z.literal("agent:thinking"),
  message: z.string(),
});

export const agentToolCallMessageSchema = z.object({
  type: z.literal("agent:tool_call"),
  toolName: z.string(),
  summary: z.string().optional(),
});

export const agentToolResultMessageSchema = z.object({
  type: z.literal("agent:tool_result"),
  toolName: z.string(),
  success: z.boolean(),
  summary: z.string(),
});

export const agentTextMessageSchema = z.object({
  type: z.literal("agent:text"),
  text: z.string(),
});

export const agentEditMessageSchema = z.object({
  type: z.literal("agent:edit"),
  path: z.string(),
  summary: z.string(),
});

export const agentDoneMessageSchema = z.object({
  type: z.literal("agent:done"),
  status: z.enum(["success", "error", "cancelled"]),
  summary: z.string(),
});

export const agentErrorMessageSchema = z.object({
  type: z.literal("agent:error"),
  message: z.string(),
});

export const backendToFrontendMessageSchema = z.discriminatedUnion("type", [
  sessionStateMessageSchema,
  agentThinkingMessageSchema,
  agentToolCallMessageSchema,
  agentToolResultMessageSchema,
  agentTextMessageSchema,
  agentEditMessageSchema,
  agentDoneMessageSchema,
  agentErrorMessageSchema,
]);

export type BackendToFrontendMessage = z.infer<
  typeof backendToFrontendMessageSchema
>;

function hasMessageType(value: unknown): value is { type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export function parseFrontendMessage(
  rawMessage: string,
): FrontendToBackendMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    throw new Error("Invalid client message: expected valid JSON.");
  }

  const validated = frontendToBackendMessageSchema.safeParse(parsed);

  if (validated.success) {
    return validated.data;
  }

  if (hasMessageType(parsed)) {
    if (
      parsed.type === "instruction" ||
      parsed.type === "cancel" ||
      parsed.type === "status"
    ) {
      throw new Error(
        `Invalid client message payload for "${parsed.type}".`,
      );
    }

    throw new Error(
      `Invalid client message type: ${parsed.type}. Expected instruction, cancel, or status.`,
    );
  }

  throw new Error(
    "Invalid client message: expected instruction, cancel, or status.",
  );
}

export function serializeBackendMessage(
  message: BackendToFrontendMessage,
): string {
  return JSON.stringify(backendToFrontendMessageSchema.parse(message));
}
