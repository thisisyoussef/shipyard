import { nanoid } from "nanoid";

import type { AgentRoleId } from "../agents/profiles.js";
import type { ActiveTaskContext } from "../artifacts/types.js";
import { createDefaultCoordinationState } from "../coordination/contracts.js";
import { loadCoordinationState } from "../coordination/store.js";
import type { SessionState } from "../engine/state.js";
import { createDefaultHostedRuntimeState } from "../hosting/contracts.js";
import { loadHostedRuntimeState } from "../hosting/store.js";
import { createCodePhase } from "../phases/code/index.js";
import type { Phase } from "../phases/phase.js";
import {
  createDefaultSourceControlState,
  SOURCE_CONTROL_PR_OPS_ROLE_ID,
  type PersistedSourceControlState,
} from "../source-control/contracts.js";
import { loadSourceControlState } from "../source-control/store.js";
import type { InstructionTurnResult } from "../engine/turn.js";
import type { PersistedTaskGraphState, StoryNode, TaskNode } from "../tasks/contracts.js";
import { syncTaskGraphState } from "../tasks/runtime.js";
import {
  createDefaultCoordinatorCapacity,
  createDefaultCoordinatorRun,
  createDefaultOrchestrationState,
  createIdleOrchestrationWorkbenchState,
  type ConflictRecoveryItem,
  type CoordinatorAuditEntry,
  type CoordinatorAuditKind,
  type CoordinatorCapacity,
  type CoordinatorLane,
  type CoordinatorMode,
  type CoordinatorRun,
  type CoordinatorReroute,
  type CoordinatorWorkerAssignment,
  type CoordinatorWorkerProjection,
  type CoordinatorWorkerStatus,
  type HumanIntervention,
  type OrchestrationWorkbenchState,
  type PersistedOrchestrationState,
} from "./contracts.js";
import {
  loadOrchestrationState,
  saveOrchestrationState,
} from "./store.js";

const NON_TERMINAL_WORKER_STATUSES = new Set<CoordinatorWorkerStatus>([
  "queued",
  "running",
  "waiting",
  "blocked",
  "stale",
]);

const ACTIVE_WORKER_STATUSES = new Set<CoordinatorWorkerStatus>([
  "queued",
  "running",
  "waiting",
]);

const BLOCKED_MERGE_ACTIONS = new Set([
  "open_pull_request",
  "merge_pull_request",
]);

export interface CoordinatorFeedbackEntryInput {
  id?: string;
  text: string;
  submittedAt?: string;
}

export interface CoordinatorRuntimeDependencies {
  now?: () => string;
  idFactory?: () => string;
  taskGraphState?: PersistedTaskGraphState | null;
  sourceControlState?: PersistedSourceControlState | null;
}

export interface AdvanceCoordinatorRunOptions extends CoordinatorRuntimeDependencies {
  brief: string;
  pendingHumanFeedback?: CoordinatorFeedbackEntryInput[];
  hostedRuntimeState?: Awaited<ReturnType<typeof loadHostedRuntimeState>>;
}

export interface SyncSessionOrchestrationStateOptions
  extends CoordinatorRuntimeDependencies {
  brief?: string;
  hostedRuntimeState?: Awaited<ReturnType<typeof loadHostedRuntimeState>>;
}

export interface CompleteCoordinatorWorkerTurnOptions
  extends CoordinatorRuntimeDependencies {
  runId: string;
  workerId: string;
  turnResult: Pick<InstructionTurnResult, "status" | "summary" | "finalText">;
  hostedRuntimeState?: Awaited<ReturnType<typeof loadHostedRuntimeState>>;
}

export interface CoordinatorDispatchDecision {
  kind: "dispatch";
  summary: string;
  run: CoordinatorRun;
  state: PersistedOrchestrationState;
  worker: CoordinatorWorkerAssignment;
  instruction: string;
  phaseOverride: Phase;
  activeTask: ActiveTaskContext;
}

export interface CoordinatorPauseDecision {
  kind: "wait" | "blocked" | "idle" | "fallback";
  summary: string;
  run: CoordinatorRun | null;
  state: PersistedOrchestrationState;
}

export type CoordinatorCycleDecision =
  | CoordinatorDispatchDecision
  | CoordinatorPauseDecision;

export interface AdvanceCoordinatorRunResult {
  state: PersistedOrchestrationState;
  decision: CoordinatorCycleDecision;
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

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function appendAuditEntries(
  state: PersistedOrchestrationState,
  entries: CoordinatorAuditEntry[],
): PersistedOrchestrationState {
  if (entries.length === 0) {
    return state;
  }

  return {
    ...state,
    updatedAt: entries[0]?.at ?? state.updatedAt,
    auditTrail: [...entries, ...state.auditTrail].slice(0, 64),
  };
}

function createAuditEntry(
  kind: CoordinatorAuditKind,
  message: string,
  options: {
    at: string;
    idFactory?: () => string;
  },
): CoordinatorAuditEntry {
  return {
    id: createIdentifier("coord-run-audit", options.idFactory),
    at: options.at,
    kind,
    message,
  };
}

function coordinatorLaneForRole(
  roleId: AgentRoleId,
  options?: {
    recovery?: boolean;
  },
): CoordinatorLane {
  if (options?.recovery) {
    return "merge-recovery";
  }

  switch (roleId) {
    case "discovery":
      return "discovery";
    case "pm":
      return "pm";
    case "test-author":
    case "reviewer":
      return "tdd";
    case "qa":
      return "qa";
    case "deploy":
      return "deploy";
    case "pr-ops":
      return "merge";
    case "implementer":
    default:
      return "implement";
  }
}

function normalizeRerouteRole(
  value: string | null,
): AgentRoleId | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "discovery":
    case "pm":
    case "implementer":
    case "reviewer":
    case "qa":
    case "deploy":
    case "pr-ops":
    case "test-author":
      return normalized;
    case "merge":
    case "merge-recovery":
      return "pr-ops";
    case "tdd":
      return "test-author";
    default:
      return null;
  }
}

function determineCapacity(
  sessionState: SessionState,
  hostedRuntimeState: Awaited<ReturnType<typeof loadHostedRuntimeState>> | null,
): CoordinatorCapacity {
  if (!hostedRuntimeState) {
    return createDefaultCoordinatorCapacity();
  }

  if (!hostedRuntimeState.profile.active || hostedRuntimeState.profile.mode === "local") {
    return createDefaultCoordinatorCapacity();
  }

  if (hostedRuntimeState.degraded.active) {
    return {
      mode: hostedRuntimeState.profile.mode === "persistent" ? "persistent" : "hosted",
      maxWorkers: 1,
      availableWorkers: 1,
      blocked: false,
      summary:
        `${hostedRuntimeState.degraded.summary} Coordinator is staying on one safe worker slot while degraded hosted mode is active.`,
    };
  }

  if (
    hostedRuntimeState.profile.mode === "persistent" &&
    hostedRuntimeState.profile.mountHealthy
  ) {
    return {
      mode: "persistent",
      maxWorkers: 2,
      availableWorkers: 2,
      blocked: false,
      summary:
        `Persistent hosted workspace ${hostedRuntimeState.workspaceBinding.summary} Coordinator can keep two worker slots queued while preserving isolated write boundaries.`,
    };
  }

  return {
    mode: "hosted",
    maxWorkers: 1,
    availableWorkers: 1,
    blocked: false,
    summary:
      `Hosted runtime is active for ${sessionState.discovery.projectName ?? "this target"}, but Shipyard is keeping one worker slot until persistent capacity is confirmed.`,
  };
}

function createPhaseForWorker(worker: CoordinatorWorkerAssignment): Phase {
  const base = createCodePhase();
  const roleSpecificGuidance = [
    `You are executing as the ${worker.roleId} role inside the master coordinator.`,
    `Lane: ${worker.lane}.`,
    `Task: ${worker.taskId} (${worker.title}).`,
    worker.conflictTicketId
      ? `This worker is handling first-merge-wins recovery for ${worker.conflictTicketId}.`
      : null,
  ].filter(Boolean).join("\n");

  const defaultSkills =
    worker.roleId === "discovery"
      ? ["artifact-writing"]
      : worker.roleId === "pm"
        ? ["artifact-writing", "spec-writing", "technical-planning"]
        : ["runtime-safety"];

  return {
    ...base,
    name: worker.phaseName,
    description: worker.summary,
    systemPrompt: `${base.systemPrompt}\n\n${roleSpecificGuidance}`,
    agentProfileId: worker.roleId,
    defaultSkills,
  };
}

function createActiveTaskContext(
  runId: string,
  worker: CoordinatorWorkerAssignment,
): ActiveTaskContext {
  return {
    planId: runId,
    taskId: worker.taskId,
    title: worker.title,
    instruction: worker.instruction,
    goal: worker.summary,
    checklist: worker.contextHints,
    targetFilePaths: [],
    specRefs: [],
    status: "in_progress",
    startedAt: worker.createdAt,
    updatedAt: worker.updatedAt,
    summary: worker.summary,
  };
}

function hasOpenLeaseConflict(
  storyId: string,
  taskId: string,
  coordinationState: Awaited<ReturnType<typeof loadCoordinationState>> | null,
): boolean {
  if (!coordinationState) {
    return false;
  }

  return coordinationState.fileLeases.some((lease) =>
    lease.status === "active" &&
    (lease.taskId === taskId || lease.storyId === storyId)
  );
}

function isBlockedByMergePolicy(
  roleId: AgentRoleId,
  sourceControlState: PersistedSourceControlState,
  hostedRuntimeState: Awaited<ReturnType<typeof loadHostedRuntimeState>> | null,
): string | null {
  if (roleId !== SOURCE_CONTROL_PR_OPS_ROLE_ID && roleId !== "deploy") {
    return null;
  }

  if (sourceControlState.degraded.active) {
    return sourceControlState.degraded.summary;
  }

  if (
    hostedRuntimeState?.degraded.active &&
    hostedRuntimeState.degraded.blockedActions.some((action) =>
      BLOCKED_MERGE_ACTIONS.has(action)
    )
  ) {
    return hostedRuntimeState.degraded.summary;
  }

  return null;
}

function applyPriorityOverride(
  items: TaskNode[],
  run: CoordinatorRun,
): TaskNode[] {
  const priorityIndex = new Map(
    run.priorityOverrides.map((id, index) => [id, index]),
  );

  return [...items].sort((left, right) => {
    const leftOverride = priorityIndex.get(left.storyId) ?? priorityIndex.get(left.id);
    const rightOverride = priorityIndex.get(right.storyId) ?? priorityIndex.get(right.id);

    if (leftOverride !== undefined || rightOverride !== undefined) {
      return (leftOverride ?? Number.MAX_SAFE_INTEGER) - (rightOverride ?? Number.MAX_SAFE_INTEGER);
    }

    const storyPriorityDifference = left.storyId.localeCompare(right.storyId);

    if (storyPriorityDifference !== 0) {
      return storyPriorityDifference;
    }

    return left.title.localeCompare(right.title);
  });
}

function resolveTaskStory(
  task: TaskNode,
  stories: StoryNode[],
): StoryNode | null {
  return stories.find((story) => story.id === task.storyId) ?? null;
}

function findOpenConflictRecovery(
  run: CoordinatorRun,
  conflictTicketId: string,
): ConflictRecoveryItem | null {
  return run.recoveryQueue.find((item) =>
    item.conflictTicketId === conflictTicketId && item.status === "open"
  ) ?? null;
}

function pickRoleForTask(
  task: TaskNode,
  run: CoordinatorRun,
  sourceControlState: PersistedSourceControlState,
): {
  roleId: AgentRoleId;
  lane: CoordinatorLane;
  phaseName: string;
  conflictTicketId: string | null;
} {
  const reroute = run.reroutes.find((entry) =>
    entry.taskId === task.id || entry.storyId === task.storyId
  ) ?? null;

  if (reroute) {
    return {
      roleId: reroute.roleId,
      lane: coordinatorLaneForRole(reroute.roleId),
      phaseName: reroute.roleId === "pr-ops" ? "pr-ops" : reroute.roleId,
      conflictTicketId: null,
    };
  }

  const conflictTicket = sourceControlState.conflictTickets.find((ticket) =>
    ticket.storyId === task.storyId && ticket.status === "open"
  ) ?? null;

  if (
    conflictTicket ||
    task.sourceControl.branchStatus === "stale" ||
    task.sourceControl.reviewStatus === "stale"
  ) {
    return {
      roleId: SOURCE_CONTROL_PR_OPS_ROLE_ID,
      lane: "merge-recovery",
      phaseName: "pr-ops",
      conflictTicketId: conflictTicket?.id ?? null,
    };
  }

  if (
    task.sourceControl.reviewStatus === "open" ||
    task.sourceControl.reviewStatus === "draft"
  ) {
    return {
      roleId: SOURCE_CONTROL_PR_OPS_ROLE_ID,
      lane: "merge",
      phaseName: "pr-ops",
      conflictTicketId: null,
    };
  }

  if (task.tdd.status === "running" && task.tdd.stage) {
    const roleId =
      task.tdd.stage === "test-author"
        ? "test-author"
        : task.tdd.stage === "reviewer"
          ? "reviewer"
          : "implementer";

    return {
      roleId,
      lane: "tdd",
      phaseName: "tdd",
      conflictTicketId: null,
    };
  }

  if (task.tdd.status === "completed") {
    return {
      roleId: "qa",
      lane: "qa",
      phaseName: "qa",
      conflictTicketId: null,
    };
  }

  if (!task.planning.specId) {
    return {
      roleId: "pm",
      lane: "pm",
      phaseName: "pm",
      conflictTicketId: null,
    };
  }

  return {
    roleId: "implementer",
    lane: "implement",
    phaseName: "code",
    conflictTicketId: null,
  };
}

function buildWorkerInstruction(
  task: TaskNode,
  story: StoryNode | null,
  roleId: AgentRoleId,
  lane: CoordinatorLane,
  options?: {
    conflictTicketId?: string | null;
    sourceControlSummary?: string | null;
  },
): {
  instruction: string;
  summary: string;
  contextHints: string[];
} {
  const storyTitle = story?.title ?? task.storyId;
  const baseHints = [
    `Story: ${storyTitle}`,
    `Task: ${task.title}`,
    task.planning.specId ? `Spec: ${task.planning.specId}` : null,
    options?.sourceControlSummary ?? null,
    options?.conflictTicketId ? `Conflict ticket: ${options.conflictTicketId}` : null,
  ].filter((value): value is string => Boolean(value));

  switch (lane) {
    case "discovery":
      return {
        instruction: `Clarify the remaining discovery gaps for "${storyTitle}" and capture the next concrete runtime decisions.`,
        summary: `Discovery is clarifying "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "pm":
      return {
        instruction: `Refine the product and spec details for "${storyTitle}" so the implementation lane can proceed cleanly.`,
        summary: `PM is refining "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "tdd":
      return {
        instruction: `Advance the active TDD lane for "${storyTitle}" as the ${roleId} role, keeping RED/GREEN handoff discipline intact.`,
        summary: `${roleId} is advancing the TDD lane for "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "qa":
      return {
        instruction: `Run a QA-style verification pass for "${storyTitle}" and surface any contract drift or missing validation.`,
        summary: `QA is validating "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "deploy":
      return {
        instruction: `Prepare deploy readiness for "${storyTitle}" and report any blocked release concerns before publish.`,
        summary: `Deploy is checking "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "merge":
      return {
        instruction: `Advance GitHub branch, PR, and merge hygiene for "${storyTitle}" using the first-merge-wins policy.`,
        summary: `PR Ops is handling merge workflow for "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "merge-recovery":
      return {
        instruction: `Resolve the first-merge-wins recovery path for "${storyTitle}" without force-merging stale work.`,
        summary: `PR Ops is recovering stale branch state for "${storyTitle}".`,
        contextHints: baseHints,
      };
    case "implement":
    default:
      return {
        instruction: `Implement the approved work for "${storyTitle}" and move the task forward without widening scope.`,
        summary: `Implementation is active for "${storyTitle}".`,
        contextHints: baseHints,
      };
  }
}

function createWorkerKey(
  taskId: string,
  lane: CoordinatorLane,
  conflictTicketId: string | null,
): string {
  return `${taskId}::${lane}::${conflictTicketId ?? "none"}`;
}

function projectWorkers(
  run: CoordinatorRun | null,
): CoordinatorWorkerProjection[] {
  if (!run) {
    return [];
  }

  return run.workers
    .filter((worker) => NON_TERMINAL_WORKER_STATUSES.has(worker.status))
    .map((worker) => ({
      workerId: worker.id,
      storyId: worker.storyId,
      taskId: worker.taskId,
      title: worker.title,
      roleId: worker.roleId,
      lane: worker.lane,
      phaseName: worker.phaseName,
      status: worker.status,
      summary: worker.summary,
      branchName: worker.branchName,
      conflictTicketId: worker.conflictTicketId,
      updatedAt: worker.updatedAt,
    }));
}

function createProjection(options: {
  run: CoordinatorRun | null;
  taskGraphState: PersistedTaskGraphState | null;
  capacity: CoordinatorCapacity;
  waitingForApproval: boolean;
  sourceControlState: PersistedSourceControlState | null;
  updatedAt: string;
}): OrchestrationWorkbenchState {
  const activeWorkers = projectWorkers(options.run);
  const activeWorkerCount = activeWorkers.filter((worker) =>
    ACTIVE_WORKER_STATUSES.has(worker.status)
  ).length;
  const queuedWorkerCount = activeWorkers.filter((worker) =>
    worker.status === "queued"
  ).length;
  const availableWorkers = Math.max(
    0,
    options.capacity.maxWorkers - activeWorkerCount,
  );
  const board = options.taskGraphState?.boardProjection ?? null;

  if (!options.run) {
    return {
      ...createIdleOrchestrationWorkbenchState(),
      readyTaskCount: board?.readyCount ?? 0,
      blockedTaskCount: board?.blockedCount ?? 0,
      hostedCapacitySummary: options.capacity.summary,
      sourceControlSummary: options.sourceControlState?.degraded.summary ?? null,
      updatedAt: options.updatedAt,
    };
  }

  return {
    active: options.run.status !== "cancelled" && options.run.status !== "completed",
    runId: options.run.runId,
    mode: options.run.mode,
    status: options.run.status,
    summary: options.run.lastSummary,
    maxWorkers: options.capacity.maxWorkers,
    availableWorkers,
    activeWorkerCount,
    queuedWorkerCount,
    waitingForApproval: options.waitingForApproval,
    readyTaskCount: board?.readyCount ?? 0,
    blockedTaskCount: board?.blockedCount ?? 0,
    recoveryQueueCount: options.run.recoveryQueue.filter((item) =>
      item.status === "open"
    ).length,
    pendingInterventionCount: options.run.interventions.filter((entry) =>
      entry.appliedAt === null
    ).length,
    hostedCapacitySummary: options.capacity.summary,
    sourceControlSummary: options.sourceControlState?.degraded.summary ?? null,
    nextTaskIds: applyPriorityOverride(
      options.taskGraphState?.taskNodes.filter((task) =>
        task.status === "ready" || task.status === "review"
      ) ?? [],
      options.run,
    ).map((task) => task.id).slice(0, 5),
    activeWorkers,
    recoveryQueue: options.run.recoveryQueue.filter((item) =>
      item.status === "open"
    ),
    updatedAt: options.updatedAt,
  };
}

function createSummaryForPausedRun(
  run: CoordinatorRun,
  options: {
    waitingForApproval: boolean;
    readyCount: number;
    blockedCount: number;
    sourceControlSummary: string | null;
  },
): string {
  if (options.waitingForApproval) {
    return "Coordinator is waiting for a human approval gate before dispatching more work.";
  }

  if (options.readyCount === 0 && options.blockedCount > 0) {
    return options.sourceControlSummary
      ? `Coordinator is blocked. ${options.sourceControlSummary}`
      : "Coordinator is blocked until dependency or source-control blockers clear.";
  }

  if (options.readyCount === 0) {
    return "Coordinator has no ready tasks right now and is idling cleanly.";
  }

  return run.lastSummary;
}

function applyHumanFeedback(
  run: CoordinatorRun,
  feedbackEntries: CoordinatorFeedbackEntryInput[],
  now: string,
  options: {
    idFactory?: () => string;
  },
): {
  run: CoordinatorRun;
  auditEntries: CoordinatorAuditEntry[];
} {
  if (feedbackEntries.length === 0) {
    return {
      run,
      auditEntries: [],
    };
  }

  const nextRun: CoordinatorRun = {
    ...run,
    interventions: [...run.interventions],
    priorityOverrides: [...run.priorityOverrides],
    reroutes: [...run.reroutes],
  };
  const auditEntries: CoordinatorAuditEntry[] = [];

  for (const entry of feedbackEntries) {
    const text = entry.text.trim();

    if (!text) {
      continue;
    }

    const reprioritizeMatch = text.match(
      /\b(?:reprioritize|prioritize)\s+([A-Za-z0-9._:-]+)/iu,
    );
    const rerouteMatch = text.match(
      /\breroute\s+([A-Za-z0-9._:-]+)\s+to\s+([A-Za-z-]+)/iu,
    );
    const stopMatch = text.match(/^\s*stop\b/iu);

    let kind: HumanIntervention["kind"] = "feedback";
    let storyId: string | null = null;
    let taskId: string | null = null;
    let roleId: AgentRoleId | null = null;
    let summary = `Queued feedback: ${text}`;

    if (reprioritizeMatch?.[1]) {
      kind = "reprioritize";
      const targetId = reprioritizeMatch[1];
      storyId = targetId;
      nextRun.priorityOverrides = [
        targetId,
        ...nextRun.priorityOverrides.filter((value) => value !== targetId),
      ];
      summary = `Reprioritized ${targetId} to the front of the coordinator queue.`;
    } else if (rerouteMatch?.[1] && rerouteMatch[2]) {
      const targetId = rerouteMatch[1];
      const resolvedRole = normalizeRerouteRole(rerouteMatch[2]);

      if (resolvedRole) {
        kind = "reroute";
        storyId = targetId.startsWith("STORY-") ? targetId : null;
        taskId = targetId.startsWith("task-") ? targetId : null;
        roleId = resolvedRole;
        nextRun.reroutes = [
          {
            id: createIdentifier("coord-reroute", options.idFactory),
            storyId,
            taskId,
            roleId: resolvedRole,
            createdAt: now,
            summary: `Reroute ${targetId} to ${resolvedRole}.`,
          },
          ...nextRun.reroutes.filter((reroute) =>
            reroute.storyId !== storyId || reroute.taskId !== taskId
          ),
        ];
        summary = `Rerouted ${targetId} to ${resolvedRole}.`;
      }
    } else if (stopMatch) {
      kind = "stop";
      summary = "Human requested that the coordinator stop.";
    }

    nextRun.interventions.unshift({
      id: entry.id?.trim() || createIdentifier("coord-intervention", options.idFactory),
      kind,
      text,
      storyId,
      taskId,
      roleId,
      createdAt: entry.submittedAt?.trim() || now,
      appliedAt: now,
      summary,
    });
    auditEntries.push(
      createAuditEntry(
        "intervention-applied",
        summary,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
    );
  }

  return {
    run: nextRun,
    auditEntries,
  };
}

function reconcileRecoveryQueue(
  run: CoordinatorRun,
  sourceControlState: PersistedSourceControlState,
  now: string,
  options: {
    idFactory?: () => string;
  },
): {
  run: CoordinatorRun;
  auditEntries: CoordinatorAuditEntry[];
} {
  const openTickets = sourceControlState.conflictTickets.filter((ticket) =>
    ticket.status === "open"
  );
  const nextRun: CoordinatorRun = {
    ...run,
    recoveryQueue: [...run.recoveryQueue],
    workers: [...run.workers],
  };
  const auditEntries: CoordinatorAuditEntry[] = [];

  for (const ticket of openTickets) {
    if (!findOpenConflictRecovery(nextRun, ticket.id)) {
      nextRun.recoveryQueue.unshift({
        id: createIdentifier("coord-recovery", options.idFactory),
        storyId: ticket.storyId,
        taskId: `task-${ticket.storyId.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
        branchName: ticket.branchName,
        conflictTicketId: ticket.id,
        ownerRoleId: ticket.ownerProfileId,
        status: "open",
        summary: ticket.summary,
        recoveryHint: ticket.recoveryHint,
        createdAt: now,
        updatedAt: now,
      });
      auditEntries.push(
        createAuditEntry(
          "recovery-queued",
          `Queued conflict recovery for ${ticket.storyId}.`,
          {
            at: now,
            idFactory: options.idFactory,
          },
        ),
      );
    }

    nextRun.workers = nextRun.workers.map((worker) => {
      if (
        worker.storyId !== ticket.storyId ||
        !NON_TERMINAL_WORKER_STATUSES.has(worker.status)
      ) {
        return worker;
      }

      if (worker.conflictTicketId === ticket.id) {
        return worker;
      }

      return {
        ...worker,
        status: "stale",
        updatedAt: now,
        summary:
          `Stale after first-merge-wins invalidated ${worker.branchName ?? worker.taskId}. Recovery is now required.`,
        conflictTicketId: ticket.id,
      };
    });
  }

  return {
    run: nextRun,
    auditEntries,
  };
}

function createWorkerAssignment(
  task: TaskNode,
  story: StoryNode | null,
  options: {
    roleId: AgentRoleId;
    lane: CoordinatorLane;
    phaseName: string;
    conflictTicketId: string | null;
    now: string;
    idFactory?: () => string;
  },
): CoordinatorWorkerAssignment {
  const built = buildWorkerInstruction(
    task,
    story,
    options.roleId,
    options.lane,
    {
      conflictTicketId: options.conflictTicketId,
      sourceControlSummary: task.sourceControl.summary,
    },
  );

  return {
    id: createIdentifier("coord-worker", options.idFactory),
    storyId: task.storyId,
    taskId: task.id,
    title: story?.title ?? task.title,
    roleId: options.roleId,
    lane: options.lane,
    phaseName: options.phaseName,
    status: "queued",
    priority: story?.priority ?? 1,
    rank: story?.rank ?? 1,
    summary: built.summary,
    instruction: built.instruction,
    contextHints: built.contextHints,
    branchName: task.sourceControl.branchName,
    conflictTicketId: options.conflictTicketId,
    attemptCount: 0,
    createdAt: options.now,
    updatedAt: options.now,
    completedAt: null,
    lastTurnStatus: null,
    lastTurnSummary: null,
  };
}

function pickDispatchWorker(
  run: CoordinatorRun,
): CoordinatorWorkerAssignment | null {
  return [...run.workers]
    .filter((worker) => worker.status === "queued")
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.createdAt.localeCompare(right.createdAt);
    })[0] ?? null;
}

async function loadRuntimeInputs(
  sessionState: SessionState,
  options: CoordinatorRuntimeDependencies & {
    hostedRuntimeState?: Awaited<ReturnType<typeof loadHostedRuntimeState>>;
  },
): Promise<{
  taskGraphState: PersistedTaskGraphState;
  sourceControlState: PersistedSourceControlState;
  hostedRuntimeState: Awaited<ReturnType<typeof loadHostedRuntimeState>>;
  coordinationState: Awaited<ReturnType<typeof loadCoordinationState>>;
}> {
  const now = resolveNow(options.now);
  const sourceControlState =
    options.sourceControlState
    ?? await loadSourceControlState(sessionState.targetDirectory)
    ?? createDefaultSourceControlState(now);
  const hostedRuntimeState =
    options.hostedRuntimeState
    ?? await loadHostedRuntimeState(sessionState.targetDirectory)
    ?? createDefaultHostedRuntimeState(now, {
      targetDirectory: sessionState.targetDirectory,
      workspaceRoot: sessionState.targetsDirectory,
    });
  const coordinationState =
    await loadCoordinationState(sessionState.targetDirectory)
    ?? createDefaultCoordinationState(now);
  const taskGraphState =
    options.taskGraphState
    ?? (
      await syncTaskGraphState(sessionState.targetDirectory, {
        now: options.now,
        idFactory: options.idFactory,
        sourceControlState,
        hostedRuntimeState,
        coordinationState,
      })
    ).state;

  return {
    taskGraphState,
    sourceControlState,
    hostedRuntimeState,
    coordinationState,
  };
}

export async function advanceCoordinatorRun(
  sessionState: SessionState,
  options: AdvanceCoordinatorRunOptions,
): Promise<AdvanceCoordinatorRunResult> {
  const now = resolveNow(options.now);
  const loadedState =
    await loadOrchestrationState(sessionState.targetDirectory)
    ?? createDefaultOrchestrationState(now);
  const runtimeInputs = await loadRuntimeInputs(sessionState, options);
  const capacity = determineCapacity(sessionState, runtimeInputs.hostedRuntimeState);
  const waitingForApproval =
    sessionState.workbenchState.pipelineState?.waitingForApproval ?? false;
  const taskGraphState = runtimeInputs.taskGraphState;
  const sourceControlState = runtimeInputs.sourceControlState;
  const readyTasks = taskGraphState.taskNodes.filter((task) =>
    task.status === "ready" || task.status === "review"
  );
  const blockedTasks = taskGraphState.taskNodes.filter((task) =>
    task.status === "blocked"
  );
  let run =
    loadedState.activeRun &&
    loadedState.activeRun.status !== "cancelled" &&
    loadedState.activeRun.brief === options.brief.trim()
      ? loadedState.activeRun
      : createDefaultCoordinatorRun(options.brief, now);

  let nextState: PersistedOrchestrationState = {
    ...loadedState,
    updatedAt: now,
    activeRun: run,
    lastRunId: run.runId,
  };
  const auditEntries: CoordinatorAuditEntry[] = [];

  if (!loadedState.activeRun || loadedState.activeRun.runId !== run.runId) {
    auditEntries.push(
      createAuditEntry(
        "run-started",
        `Started coordinator run ${run.runId}.`,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
    );
  }

  const feedbackApplied = applyHumanFeedback(
    run,
    options.pendingHumanFeedback ?? [],
    now,
    {
      idFactory: options.idFactory,
    },
  );
  run = feedbackApplied.run;
  auditEntries.push(...feedbackApplied.auditEntries);

  if (run.interventions.some((entry) => entry.kind === "stop")) {
    run = {
      ...run,
      status: "cancelled",
      updatedAt: now,
      lastActiveAt: now,
      lastSummary: "Coordinator stopped after a human intervention.",
    };
    nextState = appendAuditEntries(
      {
        ...nextState,
        activeRun: run,
        projection: createProjection({
          run,
          taskGraphState,
          capacity,
          waitingForApproval,
          sourceControlState,
          updatedAt: now,
        }),
      },
      [
        ...auditEntries,
        createAuditEntry(
          "run-cancelled",
          run.lastSummary,
          {
            at: now,
            idFactory: options.idFactory,
          },
        ),
      ],
    );
    const savedCancelled = await saveOrchestrationState(
      sessionState.targetDirectory,
      nextState,
    );
    sessionState.workbenchState.orchestration = savedCancelled.projection;

    return {
      state: savedCancelled,
      decision: {
        kind: "idle",
        summary: run.lastSummary,
        run,
        state: savedCancelled,
      },
    };
  }

  const recoveryReconciled = reconcileRecoveryQueue(run, sourceControlState, now, {
    idFactory: options.idFactory,
  });
  run = recoveryReconciled.run;
  auditEntries.push(...recoveryReconciled.auditEntries);

  if (taskGraphState.storyNodes.length === 0) {
    run = {
      ...run,
      mode: "simulator-fallback",
      status: "running",
      updatedAt: now,
      lastActiveAt: now,
      lastSummary:
        "No approved task graph is available yet, so the coordinator is falling back to the simulator-driven loop.",
    };
    nextState = appendAuditEntries(
      {
        ...nextState,
        activeRun: run,
        projection: createProjection({
          run,
          taskGraphState,
          capacity,
          waitingForApproval,
          sourceControlState,
          updatedAt: now,
        }),
      },
      [
        ...auditEntries,
        createAuditEntry(
          "run-fallback",
          run.lastSummary,
          {
            at: now,
            idFactory: options.idFactory,
          },
        ),
      ],
    );
    const savedFallback = await saveOrchestrationState(
      sessionState.targetDirectory,
      nextState,
    );
    sessionState.workbenchState.orchestration = savedFallback.projection;

    return {
      state: savedFallback,
      decision: {
        kind: "fallback",
        summary: run.lastSummary,
        run,
        state: savedFallback,
      },
    };
  }

  if (waitingForApproval) {
    run = {
      ...run,
      status: "waiting",
      updatedAt: now,
      lastActiveAt: now,
      lastSummary: createSummaryForPausedRun(run, {
        waitingForApproval,
        readyCount: readyTasks.length,
        blockedCount: blockedTasks.length,
        sourceControlSummary: sourceControlState.degraded.summary,
      }),
    };
    nextState = appendAuditEntries(
      {
        ...nextState,
        activeRun: run,
        projection: createProjection({
          run,
          taskGraphState,
          capacity,
          waitingForApproval,
          sourceControlState,
          updatedAt: now,
        }),
      },
      [
        ...auditEntries,
        createAuditEntry(
          "run-waiting",
          run.lastSummary,
          {
            at: now,
            idFactory: options.idFactory,
          },
        ),
      ],
    );
    const savedWaiting = await saveOrchestrationState(
      sessionState.targetDirectory,
      nextState,
    );
    sessionState.workbenchState.orchestration = savedWaiting.projection;

    return {
      state: savedWaiting,
      decision: {
        kind: "wait",
        summary: run.lastSummary,
        run,
        state: savedWaiting,
      },
    };
  }

  const openWorkerKeys = new Set(
    run.workers
      .filter((worker) => NON_TERMINAL_WORKER_STATUSES.has(worker.status))
      .map((worker) => createWorkerKey(
        worker.taskId,
        worker.lane,
        worker.conflictTicketId,
      )),
  );
  const completedWorkerKeys = new Set(
    run.workers
      .filter((worker) =>
        !NON_TERMINAL_WORKER_STATUSES.has(worker.status) &&
        worker.status !== "released"
      )
      .map((worker) => createWorkerKey(
        worker.taskId,
        worker.lane,
        worker.conflictTicketId,
      )),
  );

  const currentlyScheduledWorkers = run.workers.filter((worker) =>
    ACTIVE_WORKER_STATUSES.has(worker.status)
  );
  const stories = taskGraphState.storyNodes;
  const sortedReadyTasks = applyPriorityOverride(readyTasks, run);

  for (const task of sortedReadyTasks) {
    if (currentlyScheduledWorkers.length >= capacity.maxWorkers) {
      break;
    }

    if (hasOpenLeaseConflict(task.storyId, task.id, runtimeInputs.coordinationState)) {
      continue;
    }

    const roleSelection = pickRoleForTask(task, run, sourceControlState);
    const blockedByMode = isBlockedByMergePolicy(
      roleSelection.roleId,
      sourceControlState,
      runtimeInputs.hostedRuntimeState,
    );

    if (blockedByMode) {
      continue;
    }

    const workerKey = createWorkerKey(
      task.id,
      roleSelection.lane,
      roleSelection.conflictTicketId,
    );

    if (openWorkerKeys.has(workerKey) || completedWorkerKeys.has(workerKey)) {
      continue;
    }

    const story = resolveTaskStory(task, stories);
    const worker = createWorkerAssignment(task, story, {
      roleId: roleSelection.roleId,
      lane: roleSelection.lane,
      phaseName: roleSelection.phaseName,
      conflictTicketId: roleSelection.conflictTicketId,
      now,
      idFactory: options.idFactory,
    });

    run = {
      ...run,
      workers: [worker, ...run.workers],
      updatedAt: now,
      lastActiveAt: now,
      lastSummary: `Queued ${worker.roleId} for ${worker.title}.`,
    };
    openWorkerKeys.add(workerKey);
    currentlyScheduledWorkers.push(worker);
    auditEntries.push(
      createAuditEntry(
        "worker-queued",
        `Queued ${worker.roleId} for ${worker.taskId}.`,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
    );
  }

  const dispatchWorker = pickDispatchWorker(run);

  if (!dispatchWorker) {
    const nextStatus =
      blockedTasks.length > 0 || run.recoveryQueue.some((item) => item.status === "open")
        ? "blocked"
        : "completed";
    run = {
      ...run,
      status: nextStatus,
      updatedAt: now,
      lastActiveAt: now,
      lastSummary: createSummaryForPausedRun(run, {
        waitingForApproval,
        readyCount: readyTasks.length,
        blockedCount: blockedTasks.length,
        sourceControlSummary: sourceControlState.degraded.summary,
      }),
    };
    nextState = appendAuditEntries(
      {
        ...nextState,
        activeRun: run,
        projection: createProjection({
          run,
          taskGraphState,
          capacity,
          waitingForApproval,
          sourceControlState,
          updatedAt: now,
        }),
      },
      [
        ...auditEntries,
        createAuditEntry(
          nextStatus === "completed" ? "run-completed" : "run-blocked",
          run.lastSummary,
          {
            at: now,
            idFactory: options.idFactory,
          },
        ),
      ],
    );
    const savedPaused = await saveOrchestrationState(
      sessionState.targetDirectory,
      nextState,
    );
    sessionState.workbenchState.orchestration = savedPaused.projection;

    return {
      state: savedPaused,
      decision: {
        kind: nextStatus === "completed" ? "idle" : "blocked",
        summary: run.lastSummary,
        run,
        state: savedPaused,
      },
    };
  }

  const updatedDispatchWorker: CoordinatorWorkerAssignment = {
    ...dispatchWorker,
    status: "running",
    attemptCount: dispatchWorker.attemptCount + 1,
    updatedAt: now,
  };
  run = {
    ...run,
    status: "running",
    updatedAt: now,
    lastActiveAt: now,
    lastSummary: `Dispatching ${updatedDispatchWorker.roleId} on ${updatedDispatchWorker.title}.`,
    workers: run.workers.map((worker) =>
      worker.id === updatedDispatchWorker.id ? updatedDispatchWorker : worker
    ),
  };
  nextState = appendAuditEntries(
    {
      ...nextState,
      activeRun: run,
      projection: createProjection({
        run,
        taskGraphState,
        capacity,
        waitingForApproval,
        sourceControlState,
        updatedAt: now,
      }),
    },
    [
      ...auditEntries,
      createAuditEntry(
        "worker-started",
        `Dispatching ${updatedDispatchWorker.roleId} on ${updatedDispatchWorker.taskId}.`,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
    ],
  );
  const savedDispatch = await saveOrchestrationState(
    sessionState.targetDirectory,
    nextState,
  );
  sessionState.workbenchState.orchestration = savedDispatch.projection;

  return {
    state: savedDispatch,
    decision: {
      kind: "dispatch",
      summary: run.lastSummary,
      run,
      state: savedDispatch,
      worker: updatedDispatchWorker,
      instruction: updatedDispatchWorker.instruction,
      phaseOverride: createPhaseForWorker(updatedDispatchWorker),
      activeTask: createActiveTaskContext(run.runId, updatedDispatchWorker),
    },
  };
}

export async function completeCoordinatorWorkerTurn(
  sessionState: SessionState,
  options: CompleteCoordinatorWorkerTurnOptions,
): Promise<PersistedOrchestrationState> {
  const now = resolveNow(options.now);
  const loadedState =
    await loadOrchestrationState(sessionState.targetDirectory)
    ?? createDefaultOrchestrationState(now);

  if (!loadedState.activeRun || loadedState.activeRun.runId !== options.runId) {
    return loadedState;
  }

  const runtimeInputs = await loadRuntimeInputs(sessionState, options);
  const capacity = determineCapacity(sessionState, runtimeInputs.hostedRuntimeState);
  const waitingForApproval =
    sessionState.workbenchState.pipelineState?.waitingForApproval ?? false;
  const worker = loadedState.activeRun.workers.find((candidate) =>
    candidate.id === options.workerId
  );

  if (!worker) {
    return loadedState;
  }

  const nextStatus: CoordinatorWorkerStatus =
    options.turnResult.status === "success"
      ? "completed"
      : options.turnResult.status === "cancelled"
        ? "cancelled"
        : "failed";
  const nextRun: CoordinatorRun = {
    ...loadedState.activeRun,
    updatedAt: now,
    lastActiveAt: now,
    lastSummary: `${worker.roleId} finished ${worker.title} with ${options.turnResult.status}. ${options.turnResult.summary}`,
    workers: loadedState.activeRun.workers.map((candidate) =>
      candidate.id === worker.id
        ? {
            ...candidate,
            status: nextStatus,
            updatedAt: now,
            completedAt: now,
            lastTurnStatus: options.turnResult.status,
            lastTurnSummary: options.turnResult.summary,
            summary: `${candidate.summary} Latest result: ${options.turnResult.summary}`,
          }
        : candidate
    ),
    recoveryQueue: loadedState.activeRun.recoveryQueue.map((item) =>
      item.conflictTicketId === worker.conflictTicketId && nextStatus === "completed"
        ? {
            ...item,
            status: "resolved",
            updatedAt: now,
          }
        : item
    ),
  };
  const nextState = appendAuditEntries(
    {
      ...loadedState,
      updatedAt: now,
      activeRun: nextRun,
      projection: createProjection({
        run: nextRun,
        taskGraphState: runtimeInputs.taskGraphState,
        capacity,
        waitingForApproval,
        sourceControlState: runtimeInputs.sourceControlState,
        updatedAt: now,
      }),
    },
    [
      createAuditEntry(
        "worker-finished",
        `${worker.roleId} finished ${worker.taskId} with ${options.turnResult.status}.`,
        {
          at: now,
          idFactory: options.idFactory,
        },
      ),
    ],
  );
  const saved = await saveOrchestrationState(
    sessionState.targetDirectory,
    nextState,
  );
  sessionState.workbenchState.orchestration = saved.projection;

  return saved;
}

export async function syncSessionOrchestrationState(
  sessionState: SessionState,
  options: SyncSessionOrchestrationStateOptions = {},
): Promise<OrchestrationWorkbenchState> {
  const now = resolveNow(options.now);
  const loadedState =
    await loadOrchestrationState(sessionState.targetDirectory)
    ?? createDefaultOrchestrationState(now);
  const runtimeInputs = await loadRuntimeInputs(sessionState, options);
  const capacity = determineCapacity(sessionState, runtimeInputs.hostedRuntimeState);
  const waitingForApproval =
    sessionState.workbenchState.pipelineState?.waitingForApproval ?? false;

  let nextState = loadedState;

  if (options.brief) {
    const advanced = await advanceCoordinatorRun(sessionState, {
      ...options,
      brief: options.brief,
      pendingHumanFeedback: [],
    });
    nextState = advanced.state;
  } else {
    nextState = {
      ...loadedState,
      updatedAt: now,
      projection: createProjection({
        run: loadedState.activeRun,
        taskGraphState: runtimeInputs.taskGraphState,
        capacity,
        waitingForApproval,
        sourceControlState: runtimeInputs.sourceControlState,
        updatedAt: now,
      }),
    };
  }

  sessionState.workbenchState.orchestration = nextState.projection;
  return nextState.projection;
}
