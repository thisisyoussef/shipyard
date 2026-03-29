import { z } from "zod";

import { AGENT_ROLE_IDS } from "../agents/agent-role-ids.js";

export const ORCHESTRATION_STATE_VERSION = 1;

export const coordinatorModeSchema = z.enum([
  "idle",
  "simulator-fallback",
  "task-graph",
]);

export const coordinatorRunStatusSchema = z.enum([
  "idle",
  "running",
  "waiting",
  "blocked",
  "cancelled",
  "completed",
  "error",
]);

export const coordinatorWorkerStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "stale",
  "released",
]);

export const coordinatorLaneSchema = z.enum([
  "discovery",
  "pm",
  "implement",
  "tdd",
  "qa",
  "deploy",
  "merge",
  "merge-recovery",
]);

export const coordinatorCapacityModeSchema = z.enum([
  "local",
  "hosted",
  "persistent",
]);

export const humanInterventionKindSchema = z.enum([
  "feedback",
  "reprioritize",
  "reroute",
  "stop",
]);

export const conflictRecoveryStatusSchema = z.enum([
  "open",
  "resolved",
]);

export const coordinatorAuditKindSchema = z.enum([
  "run-started",
  "worker-queued",
  "worker-started",
  "worker-finished",
  "worker-stale",
  "intervention-recorded",
  "intervention-applied",
  "recovery-queued",
  "run-waiting",
  "run-blocked",
  "run-cancelled",
  "run-completed",
  "run-fallback",
]);

const nonEmptyTextSchema = z.string().trim().min(1);

export const coordinatorCapacitySchema = z.object({
  mode: coordinatorCapacityModeSchema,
  maxWorkers: z.number().int().positive(),
  availableWorkers: z.number().int().nonnegative(),
  blocked: z.boolean(),
  summary: nonEmptyTextSchema,
});

export const humanInterventionSchema = z.object({
  id: nonEmptyTextSchema,
  kind: humanInterventionKindSchema,
  text: nonEmptyTextSchema,
  storyId: z.string().trim().min(1).nullable(),
  taskId: z.string().trim().min(1).nullable(),
  roleId: z.enum(AGENT_ROLE_IDS).nullable(),
  createdAt: nonEmptyTextSchema,
  appliedAt: z.string().trim().min(1).nullable(),
  summary: nonEmptyTextSchema,
});

export const coordinatorRerouteSchema = z.object({
  id: nonEmptyTextSchema,
  storyId: z.string().trim().min(1).nullable(),
  taskId: z.string().trim().min(1).nullable(),
  roleId: z.enum(AGENT_ROLE_IDS),
  createdAt: nonEmptyTextSchema,
  summary: nonEmptyTextSchema,
});

export const coordinatorWorkerAssignmentSchema = z.object({
  id: nonEmptyTextSchema,
  storyId: nonEmptyTextSchema,
  taskId: nonEmptyTextSchema,
  title: nonEmptyTextSchema,
  roleId: z.enum(AGENT_ROLE_IDS),
  lane: coordinatorLaneSchema,
  phaseName: nonEmptyTextSchema,
  status: coordinatorWorkerStatusSchema,
  priority: z.number().int().positive(),
  rank: z.number().int().positive(),
  summary: nonEmptyTextSchema,
  instruction: nonEmptyTextSchema,
  contextHints: z.array(nonEmptyTextSchema),
  branchName: z.string().trim().min(1).nullable(),
  conflictTicketId: z.string().trim().min(1).nullable(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: nonEmptyTextSchema,
  updatedAt: nonEmptyTextSchema,
  completedAt: z.string().trim().min(1).nullable(),
  lastTurnStatus: z.enum(["success", "error", "cancelled"]).nullable(),
  lastTurnSummary: z.string().nullable(),
});

export const coordinatorWorkerProjectionSchema = z.object({
  workerId: nonEmptyTextSchema,
  storyId: nonEmptyTextSchema,
  taskId: nonEmptyTextSchema,
  title: nonEmptyTextSchema,
  roleId: z.enum(AGENT_ROLE_IDS),
  lane: coordinatorLaneSchema,
  phaseName: nonEmptyTextSchema,
  status: coordinatorWorkerStatusSchema,
  summary: nonEmptyTextSchema,
  branchName: z.string().trim().min(1).nullable(),
  conflictTicketId: z.string().trim().min(1).nullable(),
  updatedAt: nonEmptyTextSchema,
});

export const conflictRecoveryItemSchema = z.object({
  id: nonEmptyTextSchema,
  storyId: nonEmptyTextSchema,
  taskId: z.string().trim().min(1).nullable(),
  branchName: nonEmptyTextSchema,
  conflictTicketId: nonEmptyTextSchema,
  ownerRoleId: z.enum(AGENT_ROLE_IDS),
  status: conflictRecoveryStatusSchema,
  summary: nonEmptyTextSchema,
  recoveryHint: nonEmptyTextSchema,
  createdAt: nonEmptyTextSchema,
  updatedAt: nonEmptyTextSchema,
});

export const coordinatorRunSchema = z.object({
  runId: nonEmptyTextSchema,
  brief: nonEmptyTextSchema,
  mode: coordinatorModeSchema,
  status: coordinatorRunStatusSchema,
  createdAt: nonEmptyTextSchema,
  updatedAt: nonEmptyTextSchema,
  lastActiveAt: nonEmptyTextSchema,
  priorityOverrides: z.array(nonEmptyTextSchema),
  reroutes: z.array(coordinatorRerouteSchema),
  workers: z.array(coordinatorWorkerAssignmentSchema),
  interventions: z.array(humanInterventionSchema),
  recoveryQueue: z.array(conflictRecoveryItemSchema),
  lastSummary: nonEmptyTextSchema,
});

export const coordinatorAuditEntrySchema = z.object({
  id: nonEmptyTextSchema,
  at: nonEmptyTextSchema,
  kind: coordinatorAuditKindSchema,
  message: nonEmptyTextSchema,
});

export const orchestrationWorkbenchStateSchema = z.object({
  active: z.boolean(),
  runId: z.string().trim().min(1).nullable(),
  mode: coordinatorModeSchema,
  status: coordinatorRunStatusSchema,
  summary: nonEmptyTextSchema,
  maxWorkers: z.number().int().positive(),
  availableWorkers: z.number().int().nonnegative(),
  activeWorkerCount: z.number().int().nonnegative(),
  queuedWorkerCount: z.number().int().nonnegative(),
  waitingForApproval: z.boolean(),
  readyTaskCount: z.number().int().nonnegative(),
  blockedTaskCount: z.number().int().nonnegative(),
  recoveryQueueCount: z.number().int().nonnegative(),
  pendingInterventionCount: z.number().int().nonnegative(),
  hostedCapacitySummary: nonEmptyTextSchema,
  sourceControlSummary: z.string().nullable(),
  nextTaskIds: z.array(nonEmptyTextSchema),
  activeWorkers: z.array(coordinatorWorkerProjectionSchema),
  recoveryQueue: z.array(conflictRecoveryItemSchema),
  updatedAt: z.string().trim().min(1).nullable(),
});

export const persistedOrchestrationStateSchema = z.object({
  version: z.literal(ORCHESTRATION_STATE_VERSION),
  updatedAt: nonEmptyTextSchema,
  activeRun: coordinatorRunSchema.nullable(),
  lastRunId: z.string().trim().min(1).nullable(),
  projection: orchestrationWorkbenchStateSchema,
  auditTrail: z.array(coordinatorAuditEntrySchema),
});

export type CoordinatorMode = z.infer<typeof coordinatorModeSchema>;
export type CoordinatorRunStatus = z.infer<typeof coordinatorRunStatusSchema>;
export type CoordinatorWorkerStatus = z.infer<typeof coordinatorWorkerStatusSchema>;
export type CoordinatorLane = z.infer<typeof coordinatorLaneSchema>;
export type CoordinatorCapacityMode = z.infer<typeof coordinatorCapacityModeSchema>;
export type HumanInterventionKind = z.infer<typeof humanInterventionKindSchema>;
export type ConflictRecoveryStatus = z.infer<typeof conflictRecoveryStatusSchema>;
export type CoordinatorAuditKind = z.infer<typeof coordinatorAuditKindSchema>;
export type CoordinatorCapacity = z.infer<typeof coordinatorCapacitySchema>;
export type HumanIntervention = z.infer<typeof humanInterventionSchema>;
export type CoordinatorReroute = z.infer<typeof coordinatorRerouteSchema>;
export type CoordinatorWorkerAssignment = z.infer<
  typeof coordinatorWorkerAssignmentSchema
>;
export type CoordinatorWorkerProjection = z.infer<
  typeof coordinatorWorkerProjectionSchema
>;
export type ConflictRecoveryItem = z.infer<typeof conflictRecoveryItemSchema>;
export type CoordinatorRun = z.infer<typeof coordinatorRunSchema>;
export type CoordinatorAuditEntry = z.infer<typeof coordinatorAuditEntrySchema>;
export type OrchestrationWorkbenchState = z.infer<
  typeof orchestrationWorkbenchStateSchema
>;
export type PersistedOrchestrationState = z.infer<
  typeof persistedOrchestrationStateSchema
>;

export function createDefaultCoordinatorCapacity(): CoordinatorCapacity {
  return {
    mode: "local",
    maxWorkers: 1,
    availableWorkers: 1,
    blocked: false,
    summary: "Local execution is active with one write-safe worker slot.",
  };
}

export function createIdleOrchestrationWorkbenchState(): OrchestrationWorkbenchState {
  const capacity = createDefaultCoordinatorCapacity();

  return {
    active: false,
    runId: null,
    mode: "idle",
    status: "idle",
    summary: "No active coordinator run.",
    maxWorkers: capacity.maxWorkers,
    availableWorkers: capacity.availableWorkers,
    activeWorkerCount: 0,
    queuedWorkerCount: 0,
    waitingForApproval: false,
    readyTaskCount: 0,
    blockedTaskCount: 0,
    recoveryQueueCount: 0,
    pendingInterventionCount: 0,
    hostedCapacitySummary: capacity.summary,
    sourceControlSummary: null,
    nextTaskIds: [],
    activeWorkers: [],
    recoveryQueue: [],
    updatedAt: null,
  };
}

export function createDefaultCoordinatorRun(
  brief: string,
  now: string,
): CoordinatorRun {
  return {
    runId: `coord-${now.replaceAll(/[^0-9]/g, "").slice(0, 14)}`,
    brief: brief.trim(),
    mode: "task-graph",
    status: "running",
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    priorityOverrides: [],
    reroutes: [],
    workers: [],
    interventions: [],
    recoveryQueue: [],
    lastSummary: "Coordinator run started.",
  };
}

export function createDefaultOrchestrationState(
  now: string,
): PersistedOrchestrationState {
  return {
    version: ORCHESTRATION_STATE_VERSION,
    updatedAt: now,
    activeRun: null,
    lastRunId: null,
    projection: createIdleOrchestrationWorkbenchState(),
    auditTrail: [],
  };
}
