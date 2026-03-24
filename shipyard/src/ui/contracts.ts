import { z } from "zod";

export const runtimeModeSchema = z.enum(["repl", "ui"]);
export const uiConnectionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "ready",
  "agent-busy",
  "error",
]);
const turnStatusSchema = z.enum(["working", "success", "error", "idle"]);
const activityKindSchema = z.enum([
  "thinking",
  "tool",
  "text",
  "edit",
  "done",
  "error",
]);
const activityToneSchema = z.enum([
  "neutral",
  "working",
  "success",
  "danger",
]);
const diffKindSchema = z.enum(["meta", "context", "add", "remove"]);
const fileEventStatusSchema = z.enum(["running", "success", "error", "diff"]);

const nonEmptyTextSchema = z.string().trim().min(1);
const discoverySchema = z.object({
  isGreenfield: z.boolean(),
  language: z.string().nullable(),
  framework: z.string().nullable(),
  packageManager: z.string().nullable(),
  scripts: z.record(z.string(), z.string()),
  hasReadme: z.boolean(),
  hasAgentsMd: z.boolean(),
  topLevelFiles: z.array(z.string()),
  topLevelDirectories: z.array(z.string()),
  projectName: z.string().nullable(),
});
const sessionStateViewModelSchema = z.object({
  sessionId: z.string(),
  targetLabel: z.string(),
  targetDirectory: z.string(),
  workspaceDirectory: z.string(),
  turnCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  discoverySummary: z.string(),
  discovery: discoverySchema,
  projectRulesLoaded: z.boolean(),
  tracePath: z.string(),
});
const activityItemSchema = z.object({
  id: z.string(),
  kind: activityKindSchema,
  title: z.string(),
  detail: z.string(),
  tone: activityToneSchema,
  toolName: z.string().optional(),
  callId: z.string().optional(),
});
const turnViewModelSchema = z.object({
  id: z.string(),
  instruction: z.string(),
  status: turnStatusSchema,
  startedAt: z.string(),
  summary: z.string(),
  contextPreview: z.array(z.string()),
  agentMessages: z.array(z.string()),
  activity: z.array(activityItemSchema),
});
const diffLineSchema = z.object({
  id: z.string(),
  kind: diffKindSchema,
  text: z.string(),
});
const fileEventSchema = z.object({
  id: z.string(),
  path: z.string(),
  status: fileEventStatusSchema,
  title: z.string(),
  summary: z.string(),
  toolName: z.string().optional(),
  callId: z.string().optional(),
  turnId: z.string(),
  diffLines: z.array(diffLineSchema),
});
const contextReceiptSchema = z.object({
  id: z.string(),
  text: z.string(),
  submittedAt: z.string(),
  turnId: z.string(),
});
const pendingToolCallSchema = z.object({
  turnId: z.string(),
  fileEventId: z.string().optional(),
  toolName: z.string(),
});
export const workbenchStateSchema = z.object({
  connectionState: uiConnectionStateSchema,
  agentStatus: z.string(),
  sessionState: sessionStateViewModelSchema.nullable(),
  turns: z.array(turnViewModelSchema),
  fileEvents: z.array(fileEventSchema),
  activeTurnId: z.string().nullable(),
  pendingToolCalls: z.record(z.string(), pendingToolCallSchema),
  latestError: z.string().nullable(),
  nextTurnNumber: z.number().int().nonnegative(),
  nextEventNumber: z.number().int().nonnegative(),
  nextFileEventNumber: z.number().int().nonnegative(),
  contextHistory: z.array(contextReceiptSchema),
});

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
  targetDirectory: z.string(),
  workspaceDirectory: z.string(),
  turnCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  discovery: discoverySchema,
  discoverySummary: z.string(),
  projectRulesLoaded: z.boolean(),
  workbenchState: workbenchStateSchema,
});

export const agentThinkingMessageSchema = z.object({
  type: z.literal("agent:thinking"),
  message: z.string(),
});

export const agentToolCallMessageSchema = z.object({
  type: z.literal("agent:tool_call"),
  callId: z.string(),
  toolName: z.string(),
  summary: z.string().optional(),
});

export const agentToolResultMessageSchema = z.object({
  type: z.literal("agent:tool_result"),
  callId: z.string(),
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
  diff: z.string(),
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
