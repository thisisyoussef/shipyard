import { z } from "zod";

import { SCAFFOLD_TYPES } from "../tools/target-manager/scaffolds.js";
import { pipelineWorkbenchStateSchema } from "../pipeline/contracts.js";

export const runtimeModeSchema = z.enum(["repl", "ui"]);
export const uiConnectionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "ready",
  "agent-busy",
  "error",
]);
const turnStatusSchema = z.enum([
  "working",
  "success",
  "error",
  "cancelled",
  "idle",
]);
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
const fileEventStatusSchema = z.enum([
  "running",
  "success",
  "error",
  "cancelled",
  "diff",
]);
const previewCapabilityStatusSchema = z.enum(["available", "unavailable"]);
const previewKindSchema = z.enum(["dev-server", "watch-build", "static-output"]);
const previewRunnerSchema = z.enum(["npm", "pnpm", "yarn", "bun"]);
const previewAutoRefreshSchema = z.enum(["native-hmr", "restart", "none"]);
const previewStatusSchema = z.enum([
  "idle",
  "starting",
  "running",
  "refreshing",
  "error",
  "exited",
  "unavailable",
]);
const scaffoldTypeSchema = z.enum(SCAFFOLD_TYPES);
const enrichmentStatusSchema = z.enum([
  "idle",
  "queued",
  "started",
  "in-progress",
  "complete",
  "error",
]);
const deployStatusSchema = z.enum(["idle", "deploying", "success", "error"]);

const nonEmptyTextSchema = z.string().trim().min(1);
const discoverySchema = z.object({
  isGreenfield: z.boolean(),
  bootstrapReady: z.boolean().optional(),
  language: z.string().nullable(),
  framework: z.string().nullable(),
  packageManager: z.string().nullable(),
  scripts: z.record(z.string(), z.string()),
  hasReadme: z.boolean(),
  hasAgentsMd: z.boolean(),
  topLevelFiles: z.array(z.string()),
  topLevelDirectories: z.array(z.string()),
  projectName: z.string().nullable(),
  previewCapability: z.object({
    status: previewCapabilityStatusSchema,
    kind: previewKindSchema.nullable(),
    runner: previewRunnerSchema.nullable(),
    scriptName: z.string().nullable(),
    command: z.string().nullable(),
    reason: z.string(),
    autoRefresh: previewAutoRefreshSchema,
  }),
});
export const previewStateSchema = z.object({
  status: previewStatusSchema,
  summary: z.string(),
  url: z.string().nullable(),
  logTail: z.array(z.string()),
  lastRestartReason: z.string().nullable(),
});
const executionFingerprintPresenceSchema = z.enum(["yes", "no"]);
export const turnExecutionFingerprintSchema = z.object({
  surface: z.enum(["cli", "ui"]),
  phase: z.enum(["code", "target-manager"]),
  planningMode: z.enum(["lightweight", "planner"]),
  targetProfile: executionFingerprintPresenceSchema,
  preview: executionFingerprintPresenceSchema,
  previewStatus: previewStatusSchema,
  browserEval: executionFingerprintPresenceSchema,
  browserEvaluationStatus: z.enum([
    "passed",
    "failed",
    "infrastructure_failed",
    "not_applicable",
    "not_run",
  ]),
  model: z.string(),
  modelProvider: z.string().nullable(),
  modelName: z.string().nullable(),
});
export const langSmithTraceReferenceSchema = z.object({
  projectName: z.string().nullable(),
  runId: z.string().nullable(),
  traceUrl: z.string().nullable(),
  projectUrl: z.string().nullable(),
});
const sessionStateViewModelSchema = z.object({
  sessionId: z.string(),
  targetLabel: z.string(),
  targetDirectory: z.string(),
  activePhase: z.enum(["code", "target-manager"]),
  workspaceDirectory: z.string(),
  turnCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  discoverySummary: z.string(),
  discovery: discoverySchema,
  projectRulesLoaded: z.boolean(),
  tracePath: z.string(),
});
export const sessionRunSummarySchema = z.object({
  sessionId: z.string(),
  targetLabel: z.string(),
  targetDirectory: z.string(),
  activePhase: z.enum(["code", "target-manager"]),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  turnCount: z.number().int().nonnegative(),
  latestInstruction: z.string().nullable(),
  latestSummary: z.string().nullable(),
  latestStatus: turnStatusSchema.nullable(),
  isCurrent: z.boolean(),
});
const activityItemSchema = z.object({
  id: z.string(),
  kind: activityKindSchema,
  title: z.string(),
  detail: z.string(),
  tone: activityToneSchema,
  toolName: z.string().optional(),
  callId: z.string().optional(),
  detailBody: z.string().optional(),
  path: z.string().optional(),
  diff: z.string().optional(),
  beforePreview: z.string().nullable().optional(),
  afterPreview: z.string().nullable().optional(),
  addedLines: z.number().int().nonnegative().optional(),
  removedLines: z.number().int().nonnegative().optional(),
  command: z.string().optional(),
});
const turnViewModelSchema = z.object({
  id: z.string(),
  instruction: z.string(),
  status: turnStatusSchema,
  startedAt: z.string(),
  summary: z.string(),
  contextPreview: z.array(z.string()),
  agentMessages: z.array(z.string()),
  langSmithTrace: langSmithTraceReferenceSchema.nullable().optional().default(null),
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
  beforePreview: z.string().nullable().optional(),
  afterPreview: z.string().nullable().optional(),
});
const contextReceiptSchema = z.object({
  id: z.string(),
  text: z.string(),
  submittedAt: z.string(),
  turnId: z.string(),
});
export const uploadReceiptSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  storedRelativePath: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mediaType: z.string(),
  previewText: z.string(),
  previewSummary: z.string(),
  uploadedAt: z.string(),
});
export const deploySummarySchema = z.object({
  status: deployStatusSchema,
  platform: z.enum(["vercel"]),
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
  productionUrl: z.string().nullable(),
  summary: z.string(),
  logExcerpt: z.string().nullable(),
  command: z.string().nullable(),
  requestedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
const pendingToolCallSchema = z.object({
  turnId: z.string(),
  fileEventId: z.string().optional(),
  toolName: z.string(),
});
export const targetSummarySchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  framework: z.string().nullable(),
  hasProfile: z.boolean(),
});
export const targetEnrichmentStateSchema = z.object({
  status: enrichmentStatusSchema,
  message: z.string().nullable(),
});
export const targetManagerStateSchema = z.object({
  currentTarget: targetSummarySchema,
  availableTargets: z.array(targetSummarySchema),
  enrichmentStatus: targetEnrichmentStateSchema,
});
export const projectBoardProjectSchema = z.object({
  projectId: z.string(),
  targetPath: z.string(),
  targetName: z.string(),
  description: z.string().nullable(),
  activePhase: z.enum(["code", "target-manager"]),
  status: uiConnectionStateSchema,
  agentStatus: z.string(),
  hasProfile: z.boolean(),
  lastActiveAt: z.string(),
  turnCount: z.number().int().nonnegative(),
});
export const projectBoardStateSchema = z.object({
  activeProjectId: z.string().nullable(),
  openProjects: z.array(projectBoardProjectSchema),
});
export const runtimeAssistStateSchema = z.object({
  activeProfileId: z.string().nullable(),
  activeProfileName: z.string().nullable(),
  activeProfileRoute: z.string().nullable(),
  loadedSkills: z.array(z.string()),
});
export const workbenchStateSchema = z.object({
  connectionState: uiConnectionStateSchema,
  agentStatus: z.string(),
  sessionState: sessionStateViewModelSchema.nullable(),
  sessionHistory: z.array(sessionRunSummarySchema),
  turns: z.array(turnViewModelSchema),
  fileEvents: z.array(fileEventSchema),
  activeTurnId: z.string().nullable(),
  pendingToolCalls: z.record(z.string(), pendingToolCallSchema),
  latestError: z.string().nullable(),
  nextTurnNumber: z.number().int().nonnegative(),
  nextEventNumber: z.number().int().nonnegative(),
  nextFileEventNumber: z.number().int().nonnegative(),
  contextHistory: z.array(contextReceiptSchema),
  pendingUploads: z.array(uploadReceiptSchema).default([]),
  latestDeploy: deploySummarySchema,
  previewState: previewStateSchema,
  targetManager: targetManagerStateSchema.nullable(),
  projectBoard: projectBoardStateSchema.nullable().default(null),
  pipelineState: pipelineWorkbenchStateSchema.nullable().default(null),
  runtimeAssist: runtimeAssistStateSchema,
});

export const uploadReceiptsResponseSchema = z.object({
  receipts: z.array(uploadReceiptSchema),
});

export const uploadDeleteResponseSchema = z.object({
  removedId: z.string(),
});

export const uploadErrorResponseSchema = z.object({
  error: z.string(),
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

export const targetSwitchRequestMessageSchema = z.object({
  type: z.literal("target:switch_request"),
  targetPath: nonEmptyTextSchema,
});

export const targetCreateRequestMessageSchema = z.object({
  type: z.literal("target:create_request"),
  name: nonEmptyTextSchema,
  description: nonEmptyTextSchema,
  scaffoldType: scaffoldTypeSchema.optional(),
});

export const projectActivateRequestMessageSchema = z.object({
  type: z.literal("project:activate_request"),
  projectId: nonEmptyTextSchema,
});

export const targetEnrichRequestMessageSchema = z.object({
  type: z.literal("target:enrich_request"),
  userDescription: z.string().trim().optional(),
});

export const deployRequestMessageSchema = z.object({
  type: z.literal("deploy:request"),
  platform: z.enum(["vercel"]).default("vercel"),
});

export const sessionResumeRequestMessageSchema = z.object({
  type: z.literal("session:resume_request"),
  sessionId: nonEmptyTextSchema,
});

export const frontendToBackendMessageSchema = z.discriminatedUnion("type", [
  instructionMessageSchema,
  cancelMessageSchema,
  statusMessageSchema,
  sessionResumeRequestMessageSchema,
  targetSwitchRequestMessageSchema,
  targetCreateRequestMessageSchema,
  projectActivateRequestMessageSchema,
  targetEnrichRequestMessageSchema,
  deployRequestMessageSchema,
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
  activePhase: z.enum(["code", "target-manager"]),
  workspaceDirectory: z.string(),
  turnCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  discovery: discoverySchema,
  discoverySummary: z.string(),
  projectRulesLoaded: z.boolean(),
  sessionHistory: z.array(sessionRunSummarySchema),
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
  detail: z.string().optional(),
  command: z.string().optional(),
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
  beforePreview: z.string().nullable().optional(),
  afterPreview: z.string().nullable().optional(),
  addedLines: z.number().int().nonnegative().optional(),
  removedLines: z.number().int().nonnegative().optional(),
});

export const agentDoneMessageSchema = z.object({
  type: z.literal("agent:done"),
  status: z.enum(["success", "error", "cancelled"]),
  summary: z.string(),
  langSmithTrace: langSmithTraceReferenceSchema.nullable().optional(),
  executionFingerprint: turnExecutionFingerprintSchema.nullable().optional(),
});

export const agentErrorMessageSchema = z.object({
  type: z.literal("agent:error"),
  message: z.string(),
});

export const previewStateMessageSchema = z.object({
  type: z.literal("preview:state"),
  preview: previewStateSchema,
});

export const targetStateMessageSchema = z.object({
  type: z.literal("target:state"),
  state: targetManagerStateSchema,
});

export const projectsStateMessageSchema = z.object({
  type: z.literal("projects:state"),
  state: projectBoardStateSchema,
});

export const targetSwitchCompleteMessageSchema = z.object({
  type: z.literal("target:switch_complete"),
  success: z.boolean(),
  message: z.string().nullable(),
  state: targetManagerStateSchema,
  projectId: z.string().nullable().optional(),
});

export const targetEnrichmentProgressMessageSchema = z.object({
  type: z.literal("target:enrichment_progress"),
  status: enrichmentStatusSchema,
  message: z.string(),
});

export const deployStateMessageSchema = z.object({
  type: z.literal("deploy:state"),
  deploy: deploySummarySchema,
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
  previewStateMessageSchema,
  targetStateMessageSchema,
  projectsStateMessageSchema,
  targetSwitchCompleteMessageSchema,
  targetEnrichmentProgressMessageSchema,
  deployStateMessageSchema,
]);

export type BackendToFrontendMessage = z.infer<
  typeof backendToFrontendMessageSchema
>;
export type UiLangSmithTraceReference = z.infer<
  typeof langSmithTraceReferenceSchema
>;
export type UiTurnExecutionFingerprint = z.infer<
  typeof turnExecutionFingerprintSchema
>;
export type SessionRunSummary = z.infer<typeof sessionRunSummarySchema>;
export type TargetManagerState = z.infer<typeof targetManagerStateSchema>;
export type TargetSummary = z.infer<typeof targetSummarySchema>;
export type TargetEnrichmentState = z.infer<
  typeof targetEnrichmentStateSchema
>;
export type ProjectBoardState = z.infer<typeof projectBoardStateSchema>;
export type UploadReceipt = z.infer<typeof uploadReceiptSchema>;
export type DeploySummary = z.infer<typeof deploySummarySchema>;
export type UploadReceiptsResponse = z.infer<typeof uploadReceiptsResponseSchema>;
export type UploadDeleteResponse = z.infer<typeof uploadDeleteResponseSchema>;
export type UploadErrorResponse = z.infer<typeof uploadErrorResponseSchema>;

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

  const knownMessageTypes = new Set([
    "instruction",
    "cancel",
    "status",
    "session:resume_request",
    "target:switch_request",
    "target:create_request",
    "project:activate_request",
    "target:enrich_request",
    "deploy:request",
  ]);

  if (hasMessageType(parsed)) {
    if (knownMessageTypes.has(parsed.type)) {
      throw new Error(
        `Invalid client message payload for "${parsed.type}".`,
      );
    }

    throw new Error(
      `Invalid client message type: ${parsed.type}. Expected instruction, cancel, status, session:resume_request, target:switch_request, target:create_request, project:activate_request, target:enrich_request, or deploy:request.`,
    );
  }

  throw new Error(
    "Invalid client message: expected instruction, cancel, status, session:resume_request, target:switch_request, target:create_request, project:activate_request, target:enrich_request, or deploy:request.",
  );
}

export function serializeBackendMessage(
  message: BackendToFrontendMessage,
): string {
  return JSON.stringify(backendToFrontendMessageSchema.parse(message));
}
