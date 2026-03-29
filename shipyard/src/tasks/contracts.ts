import { z } from "zod";

import {
  AGENT_ROLE_IDS,
  type AgentRoleId,
} from "../agents/agent-role-ids.js";
import {
  tddLaneStatusSchema,
  tddStageSchema,
} from "../tdd/contracts.js";
import type {
  ArtifactLocator,
  TddLaneStatus,
  TddStage,
} from "../artifacts/types.js";

export const TASK_GRAPH_STATE_VERSION = 1;

export const artifactLocatorSchema = z.object({
  type: z.string().trim().min(1),
  id: z.string().trim().min(1),
  version: z.number().int().positive(),
});

export const nodeStatusSchema = z.enum([
  "ready",
  "blocked",
  "in_progress",
  "review",
  "done",
]);

export const taskPhaseSchema = z.enum([
  "spec-ready",
  "blocked",
  "red",
  "green",
  "review",
  "merged",
  "done",
]);

export const taskDependencyKindSchema = z.enum(["blocks"]);
export const taskAssignmentStatusSchema = z.enum(["active", "released"]);
export const sourceControlRefModeSchema = z.enum([
  "bound",
  "degraded",
  "unbound",
]);
export const sourceControlBranchStateSchema = z.enum([
  "ready",
  "stale",
  "merged",
  "closed",
]);
export const sourceControlReviewStateSchema = z.enum([
  "draft",
  "open",
  "merged",
  "closed",
  "stale",
  "blocked",
]);
export const hostedWorkspaceModeSchema = z.enum([
  "local",
  "hosted",
  "persistent",
]);
export const hostedWorkspaceRestoreStatusSchema = z.enum([
  "local",
  "restored",
  "synced",
  "degraded",
]);
export const hostedRepositoryStatusSchema = z.enum([
  "bound",
  "pending_bind",
  "local_only",
]);
export const boardColumnIdSchema = z.enum([
  "ready",
  "blocked",
  "in_progress",
  "review",
  "done",
]);
export const boardCardNodeTypeSchema = z.enum(["task"]);
export const taskGraphAuditKindSchema = z.enum([
  "graph-synced",
  "assignment-upserted",
  "orphaned-dependency",
]);

export const storyPlanningRefSchema = z.object({
  backlogArtifact: artifactLocatorSchema.nullable(),
  storyArtifact: artifactLocatorSchema.nullable(),
  technicalSpecArtifact: artifactLocatorSchema.nullable(),
  storyRecordId: z.string().trim().min(1).nullable(),
  specId: z.string().trim().min(1).nullable(),
});

export const sourceControlRefSchema = z.object({
  provider: z.string().trim().min(1).nullable(),
  mode: sourceControlRefModeSchema,
  repositorySlug: z.string().trim().min(1).nullable(),
  defaultBranch: z.string().trim().min(1).nullable(),
  defaultBranchRevision: z.number().int().nonnegative().nullable(),
  branchName: z.string().trim().min(1).nullable(),
  branchStatus: sourceControlBranchStateSchema.nullable(),
  reviewRequestId: z.string().trim().min(1).nullable(),
  reviewRequestNumber: z.number().int().positive().nullable(),
  reviewStatus: sourceControlReviewStateSchema.nullable(),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
  summary: z.string().trim().min(1),
  freshnessAt: z.string().trim().min(1).nullable(),
});

export const hostedWorkspaceRefSchema = z.object({
  provider: z.string().trim().min(1).nullable(),
  mode: hostedWorkspaceModeSchema.nullable(),
  workspaceRoot: z.string().trim().min(1).nullable(),
  relativeTargetPath: z.string().trim().min(1).nullable(),
  repositoryStatus: hostedRepositoryStatusSchema.nullable(),
  restoreStatus: hostedWorkspaceRestoreStatusSchema.nullable(),
  privatePreviewUrl: z.string().trim().min(1).nullable(),
  publicDeploymentUrl: z.string().trim().min(1).nullable(),
  degraded: z.boolean(),
  summary: z.string().trim().min(1),
  freshnessAt: z.string().trim().min(1).nullable(),
});

export const taskTddRefSchema = z.object({
  laneId: z.string().trim().min(1).nullable(),
  stage: tddStageSchema.nullable(),
  status: tddLaneStatusSchema.nullable(),
  latestHandoffArtifact: artifactLocatorSchema.nullable(),
  latestEscalationArtifact: artifactLocatorSchema.nullable(),
  latestQualityArtifact: artifactLocatorSchema.nullable(),
  updatedAt: z.string().trim().min(1).nullable(),
  summary: z.string().trim().min(1),
});

export const taskAssignmentSchema = z.object({
  id: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  ownerRoleId: z.enum(AGENT_ROLE_IDS),
  assignedByRoleId: z.enum(AGENT_ROLE_IDS),
  status: taskAssignmentStatusSchema,
  summary: z.string().trim().min(1),
  assignedAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  releasedAt: z.string().trim().min(1).nullable(),
});

export const taskDependencySchema = z.object({
  id: z.string().trim().min(1),
  fromTaskId: z.string().trim().min(1),
  toTaskId: z.string().trim().min(1),
  kind: taskDependencyKindSchema,
  createdAt: z.string().trim().min(1),
});

export const storyNodeSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  epicId: z.string().trim().min(1).nullable(),
  priority: z.number().int().positive(),
  rank: z.number().int().positive(),
  status: nodeStatusSchema,
  dependencyStoryIds: z.array(z.string().trim().min(1)),
  blockedByStoryIds: z.array(z.string().trim().min(1)),
  taskIds: z.array(z.string().trim().min(1)).min(1),
  specId: z.string().trim().min(1).nullable(),
  planning: storyPlanningRefSchema,
  sourceControl: sourceControlRefSchema,
  hostedWorkspace: hostedWorkspaceRefSchema,
  updatedAt: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export const taskNodeSchema = z.object({
  id: z.string().trim().min(1),
  storyId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: nodeStatusSchema,
  phase: taskPhaseSchema,
  dependencyIds: z.array(z.string().trim().min(1)),
  blockedByTaskIds: z.array(z.string().trim().min(1)),
  assignmentId: z.string().trim().min(1).nullable(),
  planning: storyPlanningRefSchema,
  sourceControl: sourceControlRefSchema,
  hostedWorkspace: hostedWorkspaceRefSchema,
  tdd: taskTddRefSchema,
  updatedAt: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export const boardCardProjectionSchema = z.object({
  cardId: z.string().trim().min(1),
  nodeType: boardCardNodeTypeSchema,
  storyId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  storyTitle: z.string().trim().min(1),
  status: nodeStatusSchema,
  phase: taskPhaseSchema,
  columnId: boardColumnIdSchema,
  ownerRoleId: z.enum(AGENT_ROLE_IDS).nullable(),
  blockedByIds: z.array(z.string().trim().min(1)),
  activeLeaseCount: z.number().int().nonnegative(),
  openThreadCount: z.number().int().nonnegative(),
  sourceControl: sourceControlRefSchema,
  hostedWorkspace: hostedWorkspaceRefSchema,
  tdd: taskTddRefSchema,
  updatedAt: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export const boardColumnProjectionSchema = z.object({
  id: boardColumnIdSchema,
  label: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  cards: z.array(boardCardProjectionSchema),
});

export const boardProjectionSchema = z.object({
  updatedAt: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  storyCount: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  readyCount: z.number().int().nonnegative(),
  inProgressCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  doneCount: z.number().int().nonnegative(),
  columns: z.array(boardColumnProjectionSchema).length(5),
});

export const taskGraphAuditEntrySchema = z.object({
  id: z.string().trim().min(1),
  at: z.string().trim().min(1),
  kind: taskGraphAuditKindSchema,
  message: z.string().trim().min(1),
});

export const persistedTaskGraphStateSchema = z.object({
  version: z.literal(TASK_GRAPH_STATE_VERSION),
  updatedAt: z.string().trim().min(1),
  backlogArtifact: artifactLocatorSchema.nullable(),
  storyArtifact: artifactLocatorSchema.nullable(),
  technicalSpecArtifact: artifactLocatorSchema.nullable(),
  storyNodes: z.array(storyNodeSchema),
  taskNodes: z.array(taskNodeSchema),
  dependencies: z.array(taskDependencySchema),
  assignments: z.array(taskAssignmentSchema),
  boardProjection: boardProjectionSchema,
  auditTrail: z.array(taskGraphAuditEntrySchema),
});

export type StoryPlanningRef = z.infer<typeof storyPlanningRefSchema> & {
  backlogArtifact: ArtifactLocator | null;
  storyArtifact: ArtifactLocator | null;
  technicalSpecArtifact: ArtifactLocator | null;
};
export type SourceControlRef = z.infer<typeof sourceControlRefSchema>;
export type HostedWorkspaceRef = z.infer<typeof hostedWorkspaceRefSchema>;
export type TaskTddRef = z.infer<typeof taskTddRefSchema> & {
  stage: TddStage | null;
  status: TddLaneStatus | null;
  latestHandoffArtifact: ArtifactLocator | null;
  latestEscalationArtifact: ArtifactLocator | null;
  latestQualityArtifact: ArtifactLocator | null;
};
export type TaskAssignment = z.infer<typeof taskAssignmentSchema> & {
  ownerRoleId: AgentRoleId;
  assignedByRoleId: AgentRoleId;
};
export type TaskDependency = z.infer<typeof taskDependencySchema>;
export type StoryNode = z.infer<typeof storyNodeSchema> & {
  planning: StoryPlanningRef;
  sourceControl: SourceControlRef;
  hostedWorkspace: HostedWorkspaceRef;
};
export type TaskNode = z.infer<typeof taskNodeSchema> & {
  planning: StoryPlanningRef;
  sourceControl: SourceControlRef;
  hostedWorkspace: HostedWorkspaceRef;
  tdd: TaskTddRef;
};
export type BoardColumnId = z.infer<typeof boardColumnIdSchema>;
export type BoardCardProjection = z.infer<typeof boardCardProjectionSchema> & {
  ownerRoleId: AgentRoleId | null;
  sourceControl: SourceControlRef;
  hostedWorkspace: HostedWorkspaceRef;
  tdd: TaskTddRef;
};
export type BoardColumnProjection = z.infer<typeof boardColumnProjectionSchema> & {
  cards: BoardCardProjection[];
};
export type BoardProjection = z.infer<typeof boardProjectionSchema> & {
  columns: BoardColumnProjection[];
};
export type TaskGraphAuditKind = z.infer<typeof taskGraphAuditKindSchema>;
export type TaskGraphAuditEntry = z.infer<typeof taskGraphAuditEntrySchema>;
export type PersistedTaskGraphState = z.infer<
  typeof persistedTaskGraphStateSchema
> & {
  backlogArtifact: ArtifactLocator | null;
  storyArtifact: ArtifactLocator | null;
  technicalSpecArtifact: ArtifactLocator | null;
  storyNodes: StoryNode[];
  taskNodes: TaskNode[];
  dependencies: TaskDependency[];
  assignments: TaskAssignment[];
  boardProjection: BoardProjection;
  auditTrail: TaskGraphAuditEntry[];
};

export function createEmptyStoryPlanningRef(): StoryPlanningRef {
  return {
    backlogArtifact: null,
    storyArtifact: null,
    technicalSpecArtifact: null,
    storyRecordId: null,
    specId: null,
  };
}

export function createEmptySourceControlRef(): SourceControlRef {
  return {
    provider: null,
    mode: "unbound",
    repositorySlug: null,
    defaultBranch: null,
    defaultBranchRevision: null,
    branchName: null,
    branchStatus: null,
    reviewRequestId: null,
    reviewRequestNumber: null,
    reviewStatus: null,
    degraded: true,
    degradedReason: "Source control state has not been synced yet.",
    summary: "Source control state has not been synced yet.",
    freshnessAt: null,
  };
}

export function createEmptyHostedWorkspaceRef(): HostedWorkspaceRef {
  return {
    provider: null,
    mode: null,
    workspaceRoot: null,
    relativeTargetPath: null,
    repositoryStatus: null,
    restoreStatus: null,
    privatePreviewUrl: null,
    publicDeploymentUrl: null,
    degraded: false,
    summary: "Hosted runtime state has not been synced yet.",
    freshnessAt: null,
  };
}

export function createEmptyTaskTddRef(): TaskTddRef {
  return {
    laneId: null,
    stage: null,
    status: null,
    latestHandoffArtifact: null,
    latestEscalationArtifact: null,
    latestQualityArtifact: null,
    updatedAt: null,
    summary: "No active TDD lane.",
  };
}

export function createEmptyBoardProjection(
  now: string,
  summary = "No approved backlog artifacts are available for task projection.",
): BoardProjection {
  return {
    updatedAt: now,
    summary,
    storyCount: 0,
    taskCount: 0,
    blockedCount: 0,
    readyCount: 0,
    inProgressCount: 0,
    reviewCount: 0,
    doneCount: 0,
    columns: [
      {
        id: "ready",
        label: "Ready",
        count: 0,
        cards: [],
      },
      {
        id: "blocked",
        label: "Blocked",
        count: 0,
        cards: [],
      },
      {
        id: "in_progress",
        label: "In Progress",
        count: 0,
        cards: [],
      },
      {
        id: "review",
        label: "Review",
        count: 0,
        cards: [],
      },
      {
        id: "done",
        label: "Done",
        count: 0,
        cards: [],
      },
    ],
  };
}

export function createDefaultTaskGraphState(
  now: string,
): PersistedTaskGraphState {
  return {
    version: TASK_GRAPH_STATE_VERSION,
    updatedAt: now,
    backlogArtifact: null,
    storyArtifact: null,
    technicalSpecArtifact: null,
    storyNodes: [],
    taskNodes: [],
    dependencies: [],
    assignments: [],
    boardProjection: createEmptyBoardProjection(now),
    auditTrail: [],
  };
}
