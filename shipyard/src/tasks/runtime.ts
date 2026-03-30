import { nanoid } from "nanoid";
import { z } from "zod";

import type { AgentRoleId } from "../agents/profiles.js";
import { queryArtifacts } from "../artifacts/registry/index.js";
import type {
  ArtifactContent,
  ArtifactLocator,
  ArtifactRecord,
} from "../artifacts/types.js";
import {
  createDefaultCoordinationState,
  type PersistedCoordinationState,
} from "../coordination/contracts.js";
import { loadCoordinationState } from "../coordination/store.js";
import type { PersistedHostedRuntimeState } from "../hosting/contracts.js";
import type { SessionState } from "../engine/state.js";
import { loadHostedRuntimeState } from "../hosting/store.js";
import type { PersistedSourceControlState } from "../source-control/contracts.js";
import { loadSourceControlState } from "../source-control/store.js";
import type { PersistedTddLane } from "../tdd/contracts.js";
import { listTddLanes } from "../tdd/store.js";
import {
  createDefaultTaskGraphState,
  createEmptyBoardProjection,
  createEmptyHostedWorkspaceRef,
  createEmptySourceControlRef,
  createEmptyStoryPlanningRef,
  createEmptyTaskTddRef,
  type BoardCardProjection,
  type BoardColumnId,
  type BoardColumnProjection,
  type BoardProjection,
  type HostedWorkspaceRef,
  type PersistedTaskGraphState,
  type SourceControlRef,
  type StoryNode,
  type StoryPlanningRef,
  type TaskAssignment,
  type TaskDependency,
  type TaskGraphAuditEntry,
  type TaskNode,
  type TaskTddRef,
} from "./contracts.js";
import { loadTaskGraphState, saveTaskGraphState } from "./store.js";

const backlogEntrySchema = z.object({
  storyId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  epicId: z.string().trim().min(1).nullable(),
  priority: z.number().int().positive(),
  rank: z.number().int().positive(),
  status: z.enum(["ready", "blocked", "done"]),
  dependencies: z.array(z.string().trim().min(1)),
  specId: z.string().trim().min(1).nullable(),
});

const backlogArtifactContentSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  orderedStoryIds: z.array(z.string().trim().min(1)),
  entries: z.array(backlogEntrySchema),
});

const userStoryArtifactContentSchema = z.object({
  stories: z.array(
    z.object({
      id: z.string().trim().min(1),
      epicId: z.string().trim().min(1).nullable(),
      title: z.string().trim().min(1),
      dependencies: z.array(z.string().trim().min(1)).default([]),
      priority: z.number().int().positive().default(1),
    }),
  ),
});

const technicalSpecArtifactContentSchema = z.object({
  specs: z.array(
    z.object({
      id: z.string().trim().min(1),
      storyId: z.string().trim().min(1),
      title: z.string().trim().min(1),
    }),
  ),
});

const BOARD_COLUMN_LABELS: Record<BoardColumnId, string> = {
  ready: "Ready",
  blocked: "Blocked",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export interface SyncTaskGraphStateOptions {
  now?: () => string;
  idFactory?: () => string;
  sourceControlState?: PersistedSourceControlState | null;
  hostedRuntimeState?: PersistedHostedRuntimeState | null;
  coordinationState?: PersistedCoordinationState | null;
}

export interface AssignTaskNodeOptions {
  nodeId: string;
  ownerRoleId: AgentRoleId;
  assignedByRoleId: AgentRoleId;
  summary: string;
  now?: () => string;
  idFactory?: () => string;
}

export interface SyncTaskGraphStateResult {
  state: PersistedTaskGraphState;
}

function resolveNow(override?: () => string): string {
  return override ? override() : new Date().toISOString();
}

function createIdentifier(
  prefix: string,
  override?: () => string,
): string {
  return override ? override() : `${prefix}-${nanoid(10)}`;
}

function recordToLocator(
  record: ArtifactRecord<ArtifactContent> | null,
): ArtifactLocator | null {
  if (!record) {
    return null;
  }

  return {
    type: record.metadata.type,
    id: record.metadata.id,
    version: record.metadata.version,
  };
}

function deriveTaskId(storyId: string): string {
  return `task-${storyId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function latestByProducedAt(
  records: ArtifactRecord<ArtifactContent>[],
): ArtifactRecord<ArtifactContent> | null {
  return records[0] ?? null;
}

function parseArtifactContent<TValue>(
  record: ArtifactRecord<ArtifactContent> | null,
  schema: z.ZodType<TValue>,
): TValue | null {
  if (!record?.content) {
    return null;
  }

  return schema.parse(record.content);
}

function createAuditEntry(
  kind: TaskGraphAuditEntry["kind"],
  message: string,
  options: {
    at: string;
    idFactory?: () => string;
  },
): TaskGraphAuditEntry {
  return {
    id: createIdentifier("task-graph-audit", options.idFactory),
    at: options.at,
    kind,
    message,
  };
}

function appendAuditEntries(
  state: PersistedTaskGraphState,
  entries: TaskGraphAuditEntry[],
): PersistedTaskGraphState {
  if (entries.length === 0) {
    return state;
  }

  return {
    ...state,
    auditTrail: [...entries, ...state.auditTrail].slice(0, 64),
  };
}

function createSourceControlRef(
  state: PersistedSourceControlState | null,
  storyId: string,
): SourceControlRef {
  if (!state) {
    return createEmptySourceControlRef();
  }

  const branch = state.storyBranches.find((candidate) =>
    candidate.storyId === storyId
  ) ?? null;
  const reviewRequest = state.pullRequests.find((candidate) =>
    candidate.storyId === storyId
  ) ?? null;

  return {
    provider: state.repository.provider ?? state.capability.provider ?? null,
    mode:
      state.degraded.active
        ? "degraded"
        : state.repository.status === "bound"
          ? "bound"
          : "unbound",
    repositorySlug: state.repository.slug,
    defaultBranch: state.repository.defaultBranch,
    defaultBranchRevision: state.repository.defaultBranchRevision,
    branchName: branch?.branchName ?? null,
    branchStatus: branch?.status ?? null,
    reviewRequestId: reviewRequest?.id ?? null,
    reviewRequestNumber: reviewRequest?.number ?? null,
    reviewStatus: reviewRequest?.status ?? null,
    degraded: state.degraded.active,
    degradedReason: state.degraded.reason,
    summary:
      reviewRequest
        ? `Review request ${reviewRequest.number ? `#${String(reviewRequest.number)}` : reviewRequest.title} is ${reviewRequest.status}.`
        : branch
          ? `Branch ${branch.branchName} is ${branch.status}.`
          : state.degraded.summary,
    freshnessAt: state.updatedAt,
  };
}

function createHostedWorkspaceRef(
  state: PersistedHostedRuntimeState | null,
): HostedWorkspaceRef {
  if (!state) {
    return createEmptyHostedWorkspaceRef();
  }

  return {
    provider: state.profile.provider,
    mode: state.profile.mode,
    workspaceRoot: state.workspaceBinding.workspaceRoot,
    relativeTargetPath: state.workspaceBinding.relativeTargetPath,
    repositoryStatus: state.workspaceBinding.repositoryStatus,
    restoreStatus: state.workspaceBinding.restoreStatus,
    privatePreviewUrl: state.availability.privatePreviewUrl,
    publicDeploymentUrl: state.availability.publicDeploymentUrl,
    degraded: state.degraded.active,
    summary: state.degraded.active
      ? state.degraded.summary
      : state.workspaceBinding.summary,
    freshnessAt: state.updatedAt,
  };
}

function createTddRef(
  lane: PersistedTddLane | null,
): TaskTddRef {
  if (!lane) {
    return createEmptyTaskTddRef();
  }

  return {
    laneId: lane.laneId,
    stage: lane.currentStage,
    status: lane.status,
    latestHandoffArtifact: lane.latestHandoffArtifact,
    latestEscalationArtifact: lane.latestEscalationArtifact,
    latestQualityArtifact: lane.latestQualityArtifact,
    updatedAt: lane.updatedAt,
    summary: lane.lastSummary || "TDD lane is active.",
  };
}

function findMatchingTddLane(
  lanes: PersistedTddLane[],
  storyId: string,
  specId: string | null,
): PersistedTddLane | null {
  return lanes.find((lane) =>
    lane.selection.storyId === storyId ||
    (specId !== null && lane.selection.specId === specId)
  ) ?? null;
}

function isTaskDone(task: {
  backlogStatus: "ready" | "blocked" | "done";
  sourceControl: SourceControlRef;
}): boolean {
  return (
    task.backlogStatus === "done" ||
    task.sourceControl.reviewStatus === "merged" ||
    task.sourceControl.branchStatus === "merged"
  );
}

function deriveTaskStatus(options: {
  backlogStatus: "ready" | "blocked" | "done";
  blockedByTaskIds: string[];
  sourceControl: SourceControlRef;
  tdd: TaskTddRef;
}): {
  status: TaskNode["status"];
  phase: TaskNode["phase"];
} {
  if (options.backlogStatus === "done" || options.sourceControl.reviewStatus === "merged") {
    return {
      status: "done",
      phase: options.sourceControl.reviewStatus === "merged" ? "merged" : "done",
    };
  }

  if (options.blockedByTaskIds.length > 0 || options.backlogStatus === "blocked") {
    return {
      status: "blocked",
      phase: "blocked",
    };
  }

  if (options.tdd.status === "blocked") {
    return {
      status: "blocked",
      phase: "blocked",
    };
  }

  if (options.tdd.status === "running" && options.tdd.stage === "test-author") {
    return {
      status: "in_progress",
      phase: "red",
    };
  }

  if (options.tdd.status === "running" && options.tdd.stage === "implementer") {
    return {
      status: "in_progress",
      phase: "green",
    };
  }

  if (
    options.sourceControl.reviewStatus === "open" ||
    options.sourceControl.reviewStatus === "draft" ||
    options.sourceControl.reviewStatus === "stale" ||
    options.sourceControl.reviewStatus === "blocked" ||
    options.tdd.stage === "reviewer" ||
    options.tdd.status === "completed"
  ) {
    return {
      status: "review",
      phase: "review",
    };
  }

  return {
    status: "ready",
    phase: "spec-ready",
  };
}

function createTaskSummary(task: TaskNode): string {
  if (task.status === "blocked" && task.blockedByTaskIds.length > 0) {
    return `Blocked by ${task.blockedByTaskIds.join(", ")}.`;
  }

  if (task.status === "in_progress") {
    return task.tdd.summary;
  }

  if (task.status === "review") {
    return task.sourceControl.reviewRequestNumber
      ? `Awaiting review on #${String(task.sourceControl.reviewRequestNumber)}.`
      : "Awaiting review.";
  }

  if (task.status === "done") {
    return "Task is complete.";
  }

  return "Task is ready for assignment.";
}

function createStorySummary(story: StoryNode): string {
  if (story.status === "blocked" && story.blockedByStoryIds.length > 0) {
    return `Blocked by ${story.blockedByStoryIds.join(", ")}.`;
  }

  if (story.status === "review") {
    return "Story is waiting for review.";
  }

  if (story.status === "in_progress") {
    return "Story is actively in progress.";
  }

  if (story.status === "done") {
    return "Story is complete.";
  }

  return "Story is ready for execution.";
}

function createBoardProjection(
  storyNodes: StoryNode[],
  taskNodes: TaskNode[],
  assignments: TaskAssignment[],
  coordinationState: PersistedCoordinationState,
  now: string,
): BoardProjection {
  const assignmentByNodeId = new Map(
    assignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => [assignment.nodeId, assignment]),
  );
  const storyById = new Map(storyNodes.map((story) => [story.id, story]));
  const activeLeaseCountByNodeId = new Map<string, number>();

  for (const lease of coordinationState.fileLeases) {
    if (lease.status !== "active" || !lease.nodeId) {
      continue;
    }

    activeLeaseCountByNodeId.set(
      lease.nodeId,
      (activeLeaseCountByNodeId.get(lease.nodeId) ?? 0) + 1,
    );
  }

  const openThreadCountByNodeId = new Map<string, number>();

  for (const thread of coordinationState.threads) {
    if (thread.status !== "open") {
      continue;
    }

    const nodeId = thread.taskId ?? thread.storyId;

    if (!nodeId) {
      continue;
    }

    openThreadCountByNodeId.set(
      nodeId,
      (openThreadCountByNodeId.get(nodeId) ?? 0) + 1,
    );
  }

  const cards: BoardCardProjection[] = taskNodes.map((task) => {
    const story = storyById.get(task.storyId);
    const assignment =
      assignmentByNodeId.get(task.id) ??
      assignmentByNodeId.get(task.storyId) ??
      null;
    const columnId: BoardColumnId = task.status === "in_progress"
      ? "in_progress"
      : task.status;

    return {
      cardId: `card-${task.id}`,
      nodeType: "task" as const,
      storyId: task.storyId,
      taskId: task.id,
      title: task.title,
      storyTitle: story?.title ?? task.title,
      status: task.status,
      phase: task.phase,
      columnId,
      ownerRoleId: assignment?.ownerRoleId ?? null,
      blockedByIds: task.blockedByTaskIds,
      activeLeaseCount: activeLeaseCountByNodeId.get(task.id) ?? 0,
      openThreadCount:
        (openThreadCountByNodeId.get(task.id) ?? 0) +
        (openThreadCountByNodeId.get(task.storyId) ?? 0),
      sourceControl: task.sourceControl,
      hostedWorkspace: task.hostedWorkspace,
      tdd: task.tdd,
      updatedAt: task.updatedAt,
      summary: task.summary,
    };
  }).sort((left, right) => {
    const leftStory = storyById.get(left.storyId);
    const rightStory = storyById.get(right.storyId);
    const leftRank = leftStory?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rightStory?.rank ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.title.localeCompare(right.title);
  });

  const columns = (
    ["ready", "blocked", "in_progress", "review", "done"] as BoardColumnId[]
  ).map((columnId) => {
    const columnCards = cards.filter((card) => card.columnId === columnId);

    return {
      id: columnId,
      label: BOARD_COLUMN_LABELS[columnId],
      count: columnCards.length,
      cards: columnCards,
    } satisfies BoardColumnProjection;
  });

  const blockedCount = columns.find((column) => column.id === "blocked")?.count ?? 0;
  const readyCount = columns.find((column) => column.id === "ready")?.count ?? 0;
  const inProgressCount =
    columns.find((column) => column.id === "in_progress")?.count ?? 0;
  const reviewCount = columns.find((column) => column.id === "review")?.count ?? 0;
  const doneCount = columns.find((column) => column.id === "done")?.count ?? 0;

  return {
    updatedAt: now,
    summary: `Task board projection updated for ${String(storyNodes.length)} ${storyNodes.length === 1 ? "story" : "stories"} and ${String(taskNodes.length)} task${taskNodes.length === 1 ? "" : "s"}.`,
    storyCount: storyNodes.length,
    taskCount: taskNodes.length,
    blockedCount,
    readyCount,
    inProgressCount,
    reviewCount,
    doneCount,
    columns,
  };
}

function normalizeAssignments(
  assignments: TaskAssignment[],
  knownNodeIds: Set<string>,
): TaskAssignment[] {
  return assignments.filter((assignment) =>
    assignment.status === "active" && knownNodeIds.has(assignment.nodeId)
  );
}

export async function syncTaskGraphState(
  targetDirectory: string,
  options: SyncTaskGraphStateOptions = {},
): Promise<SyncTaskGraphStateResult> {
  const now = resolveNow(options.now);
  const existingState =
    await loadTaskGraphState(targetDirectory) ??
    createDefaultTaskGraphState(now);
  const sourceControlState =
    options.sourceControlState ??
    await loadSourceControlState(targetDirectory);
  const hostedRuntimeState =
    options.hostedRuntimeState ??
    await loadHostedRuntimeState(targetDirectory);
  const coordinationState =
    options.coordinationState ??
    await loadCoordinationState(targetDirectory) ??
    createDefaultCoordinationState(now);
  const tddLanes = await listTddLanes(targetDirectory);
  const [backlogQuery, storyQuery, specQuery] = await Promise.all([
    queryArtifacts(targetDirectory, {
      type: "backlog-artifact",
      status: "approved",
      latestOnly: true,
      includeContent: true,
      limit: 1,
    }),
    queryArtifacts(targetDirectory, {
      type: "user-story-artifact",
      status: "approved",
      latestOnly: true,
      includeContent: true,
      limit: 1,
    }),
    queryArtifacts(targetDirectory, {
      type: "technical-spec-artifact",
      status: "approved",
      latestOnly: true,
      includeContent: true,
      limit: 1,
    }),
  ]);

  const backlogRecord = latestByProducedAt(
    backlogQuery.records as ArtifactRecord<ArtifactContent>[],
  );
  const storyRecord = latestByProducedAt(
    storyQuery.records as ArtifactRecord<ArtifactContent>[],
  );
  const specRecord = latestByProducedAt(
    specQuery.records as ArtifactRecord<ArtifactContent>[],
  );
  const backlogArtifact = parseArtifactContent(
    backlogRecord,
    backlogArtifactContentSchema,
  );
  const storyArtifact = parseArtifactContent(
    storyRecord,
    userStoryArtifactContentSchema,
  );
  const technicalSpecArtifact = parseArtifactContent(
    specRecord,
    technicalSpecArtifactContentSchema,
  );

  if (!backlogArtifact) {
    const nextState = appendAuditEntries(
      {
        ...existingState,
        updatedAt: now,
        backlogArtifact: null,
        storyArtifact: recordToLocator(storyRecord),
        technicalSpecArtifact: recordToLocator(specRecord),
        storyNodes: [],
        taskNodes: [],
        dependencies: [],
        assignments: [],
        boardProjection: createEmptyBoardProjection(now),
      },
      [
        createAuditEntry("graph-synced", "Task graph synced without an approved backlog artifact.", {
          at: now,
          idFactory: options.idFactory,
        }),
      ],
    );
    const saved = await saveTaskGraphState(targetDirectory, nextState);
    return {
      state: saved,
    };
  }

  const storyById = new Map(
    (storyArtifact?.stories ?? []).map((story) => [story.id, story]),
  );
  const specByStoryId = new Map(
    (technicalSpecArtifact?.specs ?? []).map((spec) => [spec.storyId, spec]),
  );
  const taskIdsByStoryId = new Map<string, string>();

  for (const entry of backlogArtifact.entries) {
    taskIdsByStoryId.set(entry.storyId, deriveTaskId(entry.storyId));
  }

  const dependencies: TaskDependency[] = [];
  const auditEntries: TaskGraphAuditEntry[] = [];

  for (const entry of backlogArtifact.entries) {
    const fromTaskId = taskIdsByStoryId.get(entry.storyId);

    if (!fromTaskId) {
      continue;
    }

    for (const dependencyStoryId of entry.dependencies) {
      const toTaskId = taskIdsByStoryId.get(dependencyStoryId);

      if (!toTaskId) {
        auditEntries.push(
          createAuditEntry(
            "orphaned-dependency",
            `Ignored orphaned dependency ${dependencyStoryId} for ${entry.storyId}.`,
            {
              at: now,
              idFactory: options.idFactory,
            },
          ),
        );
        continue;
      }

      dependencies.push({
        id: `${fromTaskId}::${toTaskId}`,
        fromTaskId,
        toTaskId,
        kind: "blocks",
        createdAt: now,
      });
    }
  }

  const baseTasks = backlogArtifact.entries.map((entry) => {
    const storyDetails = storyById.get(entry.storyId);
    const specDetails = specByStoryId.get(entry.storyId);
    const taskId = taskIdsByStoryId.get(entry.storyId) ?? deriveTaskId(entry.storyId);
    const sourceControl = createSourceControlRef(sourceControlState, entry.storyId);
    const hostedWorkspace = createHostedWorkspaceRef(hostedRuntimeState);
    const tdd = createTddRef(
      findMatchingTddLane(tddLanes, entry.storyId, entry.specId ?? specDetails?.id ?? null),
    );

    return {
      id: taskId,
      storyId: entry.storyId,
      title: storyDetails?.title ?? entry.title,
      backlogStatus: entry.status,
      dependencyIds: dependencies
        .filter((dependency) => dependency.fromTaskId === taskId)
        .map((dependency) => dependency.toTaskId),
      planning: {
        backlogArtifact: recordToLocator(backlogRecord),
        storyArtifact: recordToLocator(storyRecord),
        technicalSpecArtifact: recordToLocator(specRecord),
        storyRecordId: entry.storyId,
        specId: entry.specId ?? specDetails?.id ?? null,
      } satisfies StoryPlanningRef,
      sourceControl,
      hostedWorkspace,
      tdd,
    };
  });

  const baseTaskById = new Map(baseTasks.map((task) => [task.id, task]));

  const taskNodes: TaskNode[] = baseTasks.map((baseTask) => {
    const blockedByTaskIds = baseTask.dependencyIds.filter((dependencyId) => {
      const dependencyTask = baseTaskById.get(dependencyId);
      return !dependencyTask || !isTaskDone(dependencyTask);
    });
    const derived = deriveTaskStatus({
      backlogStatus: baseTask.backlogStatus,
      blockedByTaskIds,
      sourceControl: baseTask.sourceControl,
      tdd: baseTask.tdd,
    });

    const task: TaskNode = {
      id: baseTask.id,
      storyId: baseTask.storyId,
      title: baseTask.title,
      status: derived.status,
      phase: derived.phase,
      dependencyIds: baseTask.dependencyIds,
      blockedByTaskIds,
      assignmentId: null,
      planning: baseTask.planning,
      sourceControl: baseTask.sourceControl,
      hostedWorkspace: baseTask.hostedWorkspace,
      tdd: baseTask.tdd,
      updatedAt: now,
      summary: "",
    };

    return {
      ...task,
      summary: createTaskSummary(task),
    };
  });

  const taskByStoryId = new Map(taskNodes.map((task) => [task.storyId, task]));
  const storyNodes: StoryNode[] = backlogArtifact.entries.map((entry) => {
    const task = taskByStoryId.get(entry.storyId);
    const storyDetails = storyById.get(entry.storyId);
    const taskIds = task ? [task.id] : [];
    const blockedByStoryIds = entry.dependencies.filter((dependencyStoryId) => {
      const dependencyTask = taskByStoryId.get(dependencyStoryId);
      return dependencyTask ? dependencyTask.status !== "done" : true;
    });
    const taskStatuses = task ? [task.status] : [];
    const status: StoryNode["status"] =
      taskStatuses.every((candidate) => candidate === "done")
        ? "done"
        : taskStatuses.some((candidate) => candidate === "review")
          ? "review"
          : taskStatuses.some((candidate) => candidate === "in_progress")
            ? "in_progress"
            : blockedByStoryIds.length > 0 || taskStatuses.some((candidate) => candidate === "blocked")
              ? "blocked"
              : "ready";
    const story: StoryNode = {
      id: entry.storyId,
      title: storyDetails?.title ?? entry.title,
      epicId: entry.epicId,
      priority: entry.priority,
      rank: entry.rank,
      status,
      dependencyStoryIds: entry.dependencies,
      blockedByStoryIds,
      taskIds,
      specId: task?.planning.specId ?? entry.specId,
      planning: task?.planning ?? createEmptyStoryPlanningRef(),
      sourceControl: task?.sourceControl ?? createEmptySourceControlRef(),
      hostedWorkspace: task?.hostedWorkspace ?? createEmptyHostedWorkspaceRef(),
      updatedAt: now,
      summary: "",
    };

    return {
      ...story,
      summary: createStorySummary(story),
    };
  });

  const knownNodeIds = new Set([
    ...storyNodes.map((story) => story.id),
    ...taskNodes.map((task) => task.id),
  ]);
  const assignments = normalizeAssignments(existingState.assignments, knownNodeIds);
  const assignmentByNodeId = new Map(assignments.map((assignment) => [
    assignment.nodeId,
    assignment,
  ]));
  const hydratedTaskNodes = taskNodes.map((task) => ({
    ...task,
    assignmentId: assignmentByNodeId.get(task.id)?.id ?? null,
  }));
  const boardProjection = createBoardProjection(
    storyNodes,
    hydratedTaskNodes,
    assignments,
    coordinationState,
    now,
  );

  let nextState: PersistedTaskGraphState = {
    version: existingState.version,
    updatedAt: now,
    backlogArtifact: recordToLocator(backlogRecord),
    storyArtifact: recordToLocator(storyRecord),
    technicalSpecArtifact: recordToLocator(specRecord),
    storyNodes,
    taskNodes: hydratedTaskNodes,
    dependencies,
    assignments,
    boardProjection,
    auditTrail: existingState.auditTrail,
  };
  nextState = appendAuditEntries(
    nextState,
    [
      createAuditEntry(
        "graph-synced",
        `Task graph synced for ${String(storyNodes.length)} stor${storyNodes.length === 1 ? "y" : "ies"}.`,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
      ...auditEntries,
    ],
  );

  const saved = await saveTaskGraphState(targetDirectory, nextState);

  return {
    state: saved,
  };
}

export async function assignTaskNode(
  targetDirectory: string,
  options: AssignTaskNodeOptions,
): Promise<SyncTaskGraphStateResult> {
  const now = resolveNow(options.now);
  const loadedState =
    await loadTaskGraphState(targetDirectory) ??
    (await syncTaskGraphState(targetDirectory, {
      now: options.now,
      idFactory: options.idFactory,
    })).state;
  const knownNodeIds = new Set([
    ...loadedState.storyNodes.map((story) => story.id),
    ...loadedState.taskNodes.map((task) => task.id),
  ]);

  if (!knownNodeIds.has(options.nodeId)) {
    throw new Error(`Task graph node ${options.nodeId} was not found.`);
  }

  const existingAssignment = loadedState.assignments.find((assignment) =>
    assignment.nodeId === options.nodeId && assignment.status === "active"
  );
  const nextAssignment: TaskAssignment = existingAssignment
    ? {
        ...existingAssignment,
        ownerRoleId: options.ownerRoleId,
        assignedByRoleId: options.assignedByRoleId,
        summary: options.summary.trim(),
        updatedAt: now,
      }
    : {
        id: createIdentifier("assignment", options.idFactory),
        nodeId: options.nodeId,
        ownerRoleId: options.ownerRoleId,
        assignedByRoleId: options.assignedByRoleId,
        status: "active",
        summary: options.summary.trim(),
        assignedAt: now,
        updatedAt: now,
        releasedAt: null,
      };
  const assignments = [
    nextAssignment,
    ...loadedState.assignments.filter((assignment) =>
      assignment.id !== nextAssignment.id && assignment.nodeId !== options.nodeId
    ),
  ];
  const coordinationState =
    await loadCoordinationState(targetDirectory) ??
    createDefaultCoordinationState(now);
  const taskNodes = loadedState.taskNodes.map((task) =>
    task.id === options.nodeId
      ? {
          ...task,
          assignmentId: nextAssignment.id,
        }
      : task
  );
  const boardProjection = createBoardProjection(
    loadedState.storyNodes,
    taskNodes,
    assignments,
    coordinationState,
    now,
  );
  const nextState = appendAuditEntries(
    {
      ...loadedState,
      updatedAt: now,
      taskNodes,
      assignments,
      boardProjection,
    },
    [
      createAuditEntry(
        "assignment-upserted",
        `Assigned ${options.nodeId} to ${options.ownerRoleId}.`,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
    ],
  );
  const saved = await saveTaskGraphState(targetDirectory, nextState);

  return {
    state: saved,
  };
}

export async function syncSessionTaskGraphState(
  sessionState: SessionState,
  options: SyncTaskGraphStateOptions = {},
): Promise<PersistedTaskGraphState> {
  const result = await syncTaskGraphState(sessionState.targetDirectory, options);

  sessionState.workbenchState = {
    ...sessionState.workbenchState,
    taskBoard: result.state.boardProjection,
  };

  return result.state;
}
