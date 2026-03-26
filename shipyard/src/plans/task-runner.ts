import type {
  ActiveTaskContext,
  ExecutionSpec,
  PersistedTaskQueue,
  PlanTask,
  PlanTaskStatus,
  PlanningMode,
  TaskPlan,
} from "../artifacts/types.js";
import {
  saveSessionState,
  type ContextEnvelope,
  type SessionState,
} from "../engine/state.js";
import {
  executeInstructionTurn,
  type ExecuteInstructionTurnOptions,
  type InstructionRuntimeMode,
  type InstructionRuntimeState,
  type InstructionTurnReporter,
  type InstructionTurnResult,
} from "../engine/turn.js";
import type { RuntimeSurface, TurnExecutionFingerprint } from "../engine/turn-fingerprint.js";
import {
  createExecutionTurnSummary,
  truncateText,
  updateRollingSummary,
} from "../engine/turn-summary.js";
import { loadSpecTool } from "../tools/index.js";
import type { LangSmithTraceReference } from "../tracing/langsmith.js";
import {
  listPlanTaskQueues,
  loadPlanTaskQueue,
  writePlanTaskQueue,
} from "./store.js";

const NEXT_INSTRUCTION_PATTERN = /^next$/i;
const CONTINUE_INSTRUCTION_PATTERN = /^continue$/i;

export type TaskRunnerCommand = "next" | "continue";

export type TaskRunnerRoute =
  | "next-pending"
  | "next-blocked-in-progress"
  | "continue-in-progress"
  | "continue-fallback"
  | "no-active-plan"
  | "plan-complete"
  | "plan-failed"
  | "spec-load-error";

export interface ExecuteTaskRunnerTurnOptions {
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  instruction: string;
  injectedContext?: string[];
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
  runtimeSurface?: RuntimeSurface;
  executeTurn?: (
    options: ExecuteInstructionTurnOptions,
  ) => Promise<InstructionTurnResult>;
}

export interface TaskRunnerTurnResult {
  phaseName: string;
  runtimeMode: InstructionRuntimeMode;
  planningMode: PlanningMode;
  executionFingerprint?: TurnExecutionFingerprint | null;
  contextEnvelope: ContextEnvelope | null;
  taskPlan: TaskPlan | null;
  executionSpec: ExecutionSpec | null;
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  selectedTargetPath: string | null;
  langSmithTrace: LangSmithTraceReference | null;
  plan: PersistedTaskQueue | null;
  planId: string | null;
  taskId: string | null;
  route: TaskRunnerRoute;
  command: TaskRunnerCommand;
  loadedSpecRefs: string[];
  taskTransition: {
    from: PlanTaskStatus | null;
    to: PlanTaskStatus | null;
  } | null;
}

interface SelectedPlanTask {
  plan: PersistedTaskQueue;
  task: PlanTask;
  route: TaskRunnerRoute;
  note: string;
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function getPhaseName(state: SessionState): string {
  return state.activePhase === "target-manager" ? "target-manager" : "code";
}

function toTaskRunnerCommand(instruction: string): TaskRunnerCommand | null {
  const trimmed = instruction.trim();

  if (NEXT_INSTRUCTION_PATTERN.test(trimmed)) {
    return "next";
  }

  if (CONTINUE_INSTRUCTION_PATTERN.test(trimmed)) {
    return "continue";
  }

  return null;
}

export function isTaskRunnerInstruction(instruction: string): boolean {
  return toTaskRunnerCommand(instruction) !== null;
}

function getInProgressTask(plan: PersistedTaskQueue): PlanTask | null {
  return plan.tasks.find((task) => task.status === "in_progress") ?? null;
}

function getFirstPendingTask(plan: PersistedTaskQueue): PlanTask | null {
  return plan.tasks.find((task) => task.status === "pending") ?? null;
}

function getFailedTasks(plan: PersistedTaskQueue): PlanTask[] {
  return plan.tasks.filter((task) => task.status === "failed");
}

function isPlanComplete(plan: PersistedTaskQueue): boolean {
  return plan.tasks.every((task) => task.status === "done");
}

function createTaskChecklist(
  plan: PersistedTaskQueue,
  task: PlanTask,
): string[] {
  return [
    `Deliver: ${task.description}`,
    ...(task.targetFilePaths?.length
      ? [`Focus files: ${task.targetFilePaths.join(", ")}`]
      : ["Focus files: inspect the relevant repo surface before editing."]),
    ...(task.specRefs?.length
      ? [`Spec refs: ${task.specRefs.join(", ")}`]
      : []),
    ...plan.executionSpec.acceptanceCriteria.slice(0, 1).map((criterion) =>
      `Accept: ${criterion}`
    ),
    ...plan.executionSpec.verificationIntent.slice(0, 1).map((intent) =>
      `Verify: ${intent}`
    ),
  ];
}

function createTaskInstruction(
  plan: PersistedTaskQueue,
  task: PlanTask,
): string {
  const lines = [
    `Complete only the current plan task: ${task.description}`,
    `Plan goal: ${plan.goal}`,
  ];

  if (task.targetFilePaths?.length) {
    lines.push(`Target files: ${task.targetFilePaths.join(", ")}`);
  }

  if (task.specRefs?.length) {
    lines.push(`Spec refs: ${task.specRefs.join(", ")}`);
  }

  lines.push("Do not start later plan tasks until this task is complete.");

  return lines.join("\n");
}

function createActiveTaskContext(options: {
  plan: PersistedTaskQueue;
  task: PlanTask;
  previousActiveTask: ActiveTaskContext | null;
  summary?: string;
}): ActiveTaskContext {
  const instruction = createTaskInstruction(options.plan, options.task);
  const now = new Date().toISOString();
  const previousActiveTask = options.previousActiveTask;
  const startedAt =
    previousActiveTask?.planId === options.plan.planId &&
      previousActiveTask.taskId === options.task.id
      ? previousActiveTask.startedAt
      : now;

  return {
    planId: options.plan.planId,
    taskId: options.task.id,
    title: options.task.description,
    instruction,
    goal: options.plan.goal,
    checklist: createTaskChecklist(options.plan, options.task),
    targetFilePaths: [...(options.task.targetFilePaths ?? [])],
    specRefs: [...(options.task.specRefs ?? [])],
    status: options.task.status,
    startedAt,
    updatedAt: now,
    ...(options.summary?.trim()
      ? {
          summary: options.summary.trim(),
        }
      : {}),
  };
}

function createPlanMessage(plan: PersistedTaskQueue, message: string): string {
  return `${message}\n\nPlan: ${plan.planId}`;
}

function createNoActivePlanMessage(command: TaskRunnerCommand): string {
  return `No active plan is available for \`${command}\`. Run \`plan:\` first to create a reviewable task queue.`;
}

function createCompletePlanMessage(plan: PersistedTaskQueue): string {
  return createPlanMessage(
    plan,
    `Plan ${plan.planId} is complete. No pending tasks remain.`,
  );
}

function createFailedPlanMessage(plan: PersistedTaskQueue): string {
  const failedTasks = getFailedTasks(plan);
  const failedLabel = failedTasks.map((task) => task.id).join(", ");

  return createPlanMessage(
    plan,
    `Plan ${plan.planId} has no pending or in-progress tasks. Failed tasks still need review: ${failedLabel}.`,
  );
}

function createUpdatedTask(
  task: PlanTask,
  status: PlanTaskStatus,
  summary: string,
  updatedAt: string,
): PlanTask {
  return {
    ...task,
    status,
    summary: truncateText(summary, 240),
    updatedAt,
  };
}

function updatePlanTask(
  plan: PersistedTaskQueue,
  taskId: string,
  status: PlanTaskStatus,
  summary: string,
): PersistedTaskQueue {
  const updatedAt = new Date().toISOString();

  return {
    ...plan,
    updatedAt,
    tasks: plan.tasks.map((task) =>
      task.id === taskId
        ? createUpdatedTask(task, status, summary, updatedAt)
        : task
    ),
  };
}

function buildTaskOutcomeSummary(result: InstructionTurnResult): string {
  const summary = result.status === "success"
    ? result.finalText
    : result.summary || result.finalText;

  return truncateText(summary, 240);
}

function prependRunnerNote(note: string, finalText: string): string {
  const trimmedNote = note.trim();
  const trimmedText = finalText.trim();

  if (!trimmedText) {
    return trimmedNote;
  }

  return `${trimmedNote}\n\n${trimmedText}`;
}

async function resolveActivePlan(
  sessionState: SessionState,
): Promise<PersistedTaskQueue | null> {
  const explicitPlanId = sessionState.activePlanId;

  if (explicitPlanId) {
    const explicitPlan = await loadPlanTaskQueue(
      sessionState.targetDirectory,
      explicitPlanId,
    );

    if (explicitPlan) {
      return explicitPlan;
    }
  }

  const plans = await listPlanTaskQueues(sessionState.targetDirectory);
  return plans.find((plan) => !isPlanComplete(plan)) ?? plans[0] ?? null;
}

function selectPlanTask(
  command: TaskRunnerCommand,
  plan: PersistedTaskQueue,
): SelectedPlanTask | null {
  const inProgressTask = getInProgressTask(plan);

  if (command === "continue" && inProgressTask) {
    return {
      plan,
      task: inProgressTask,
      route: "continue-in-progress",
      note: `Resuming in-progress task ${inProgressTask.id} from plan ${plan.planId}.`,
    };
  }

  if (command === "next" && inProgressTask) {
    return {
      plan,
      task: inProgressTask,
      route: "next-blocked-in-progress",
      note:
        `Plan ${plan.planId} already has task ${inProgressTask.id} in progress. ` +
        "Use `continue` to resume it before starting another task.",
    };
  }

  const pendingTask = getFirstPendingTask(plan);

  if (pendingTask) {
    return {
      plan,
      task: pendingTask,
      route: command === "next" ? "next-pending" : "continue-fallback",
      note: command === "next"
        ? `Starting next pending task ${pendingTask.id} from plan ${plan.planId}.`
        : `No in-progress task was found for plan ${plan.planId}; starting next pending task ${pendingTask.id}.`,
    };
  }

  return null;
}

async function loadTaskSpecContext(options: {
  targetDirectory: string;
  plan: PersistedTaskQueue;
  task: PlanTask;
}): Promise<{
  injectedContext: string[];
  loadedSpecRefs: string[];
}> {
  const requiredSpecRefs = uniqueStrings(options.task.specRefs ?? []);

  if (requiredSpecRefs.length === 0) {
    return {
      injectedContext: [],
      loadedSpecRefs: [],
    };
  }

  const pathByRef = new Map(
    (options.plan.loadedSpecs ?? []).map((spec) => [spec.ref, spec.path]),
  );
  const refsByPath = new Map<string, Set<string>>();

  for (const specRef of requiredSpecRefs) {
    const specPath = pathByRef.get(specRef);

    if (!specPath) {
      throw new Error(
        `Plan ${options.plan.planId} references ${specRef} but does not record a source path. Re-run \`plan:\` to refresh the task queue on this version.`,
      );
    }

    const refsForPath = refsByPath.get(specPath) ?? new Set<string>();
    refsForPath.add(specRef);
    refsByPath.set(specPath, refsForPath);
  }

  const injectedContext: string[] = [];
  const loadedSpecRefs = new Set<string>();

  for (const [specPath, specRefs] of refsByPath.entries()) {
    const loadedSpec = await loadSpecTool({
      targetDirectory: options.targetDirectory,
      path: specPath,
    });
    const availableDocuments = new Map(
      loadedSpec.documents.map((document) => [document.ref, document]),
    );

    for (const specRef of specRefs) {
      const document = availableDocuments.get(specRef);

      if (!document) {
        throw new Error(
          `Spec ref ${specRef} is missing from ${specPath}. Re-run \`plan:\` if the source documents changed.`,
        );
      }

      loadedSpecRefs.add(specRef);
      injectedContext.push(
        [
          `Plan Spec ${document.ref}`,
          `Path: ${document.path}`,
          document.content,
        ].join("\n"),
      );
    }
  }

  return {
    injectedContext,
    loadedSpecRefs: [...loadedSpecRefs],
  };
}

async function createMessageOnlyResult(
  options: ExecuteTaskRunnerTurnOptions & {
    command: TaskRunnerCommand;
    route: TaskRunnerRoute;
    plan: PersistedTaskQueue | null;
    message: string;
    status: "success" | "error";
  },
): Promise<TaskRunnerTurnResult> {
  const state = options.sessionState;
  const runtimeState = options.runtimeState;
  state.turnCount += 1;
  state.lastActiveAt = new Date().toISOString();
  const summary = createExecutionTurnSummary(
    state.turnCount,
    runtimeState.runtimeMode,
    options.status === "error" ? "failed" : "done",
    options.message,
  );

  state.rollingSummary = updateRollingSummary(
    state.rollingSummary,
    state.turnCount,
    options.instruction,
    summary,
  );

  await options.reporter?.onText?.(options.message);

  if (options.status === "error") {
    await options.reporter?.onError?.(options.message);
  }

  await options.reporter?.onDone?.({
    status: options.status,
    summary: options.message,
    langSmithTrace: null,
  });
  await saveSessionState(state);

  return {
    phaseName: getPhaseName(state),
    runtimeMode: runtimeState.runtimeMode,
    planningMode: options.plan?.planningMode ?? "lightweight",
    contextEnvelope: null,
    taskPlan: null,
    executionSpec: null,
    status: options.status,
    summary: options.message,
    finalText: options.message,
    selectedTargetPath: null,
    langSmithTrace: null,
    plan: options.plan,
    planId: options.plan?.planId ?? null,
    taskId: null,
    route: options.route,
    command: options.command,
    loadedSpecRefs: [],
    taskTransition: null,
  };
}

export async function executeTaskRunnerTurn(
  options: ExecuteTaskRunnerTurnOptions,
): Promise<TaskRunnerTurnResult> {
  const command = toTaskRunnerCommand(options.instruction);

  if (command === null) {
    throw new Error(
      `Task-runner turn expected "next" or "continue", received: ${options.instruction}`,
    );
  }

  const state = options.sessionState;
  const executeTurn = options.executeTurn ?? executeInstructionTurn;
  const resolvedPlan = await resolveActivePlan(state);

  if (!resolvedPlan) {
    return createMessageOnlyResult({
      ...options,
      command,
      route: "no-active-plan",
      plan: null,
      message: createNoActivePlanMessage(command),
      status: "success",
    });
  }

  state.activePlanId = resolvedPlan.planId;

  if (isPlanComplete(resolvedPlan)) {
    state.activeTask = null;

    return createMessageOnlyResult({
      ...options,
      command,
      route: "plan-complete",
      plan: resolvedPlan,
      message: createCompletePlanMessage(resolvedPlan),
      status: "success",
    });
  }

  const selection = selectPlanTask(command, resolvedPlan);

  if (!selection) {
    state.activeTask = null;

    return createMessageOnlyResult({
      ...options,
      command,
      route: "plan-failed",
      plan: resolvedPlan,
      message: createFailedPlanMessage(resolvedPlan),
      status: "success",
    });
  }

  if (selection.route === "next-blocked-in-progress") {
    return createMessageOnlyResult({
      ...options,
      command,
      route: selection.route,
      plan: resolvedPlan,
      message: selection.note,
      status: "success",
    });
  }

  let loadedSpecContext: {
    injectedContext: string[];
    loadedSpecRefs: string[];
  };

  try {
    loadedSpecContext = await loadTaskSpecContext({
      targetDirectory: state.targetDirectory,
      plan: selection.plan,
      task: selection.task,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return createMessageOnlyResult({
      ...options,
      command,
      route: "spec-load-error",
      plan: selection.plan,
      message,
      status: "error",
    });
  }

  const activeTask = createActiveTaskContext({
    plan: selection.plan,
    task: {
      ...selection.task,
      status: "in_progress",
    },
    previousActiveTask: state.activeTask,
    summary: selection.note,
  });

  const inProgressPlan = await writePlanTaskQueue(
    state.targetDirectory,
    updatePlanTask(
      selection.plan,
      selection.task.id,
      "in_progress",
      selection.note,
    ),
  );

  state.activePlanId = inProgressPlan.planId;
  state.activeTask = activeTask;
  await saveSessionState(state);
  await options.reporter?.onThinking?.(selection.note);

  const turnResult = await executeTurn({
    sessionState: state,
    runtimeState: options.runtimeState,
    instruction: activeTask.instruction,
    injectedContext: [
      ...(options.injectedContext ?? []),
      `Plan runner command: ${command}`,
      `Selected task: ${selection.task.id} (${selection.task.description})`,
      ...loadedSpecContext.injectedContext,
    ],
    reporter: options.reporter,
    signal: options.signal,
    runtimeSurface: options.runtimeSurface,
  });

  const outcomeSummary = buildTaskOutcomeSummary(turnResult);
  const finalStatus = turnResult.status === "success"
    ? "done"
    : turnResult.status === "error"
      ? "failed"
      : "in_progress";
  const updatedPlan = await writePlanTaskQueue(
    state.targetDirectory,
    updatePlanTask(
      inProgressPlan,
      selection.task.id,
      finalStatus,
      turnResult.status === "cancelled"
        ? `Execution cancelled. ${outcomeSummary}`
        : outcomeSummary,
    ),
  );

  if (turnResult.status === "success") {
    state.activeTask = null;
  } else if (turnResult.status === "error") {
    state.activeTask = {
      ...activeTask,
      status: "failed",
      updatedAt: new Date().toISOString(),
      summary: outcomeSummary,
    };
  } else {
    state.activeTask = {
      ...activeTask,
      updatedAt: new Date().toISOString(),
      summary: `Execution cancelled. ${outcomeSummary}`,
    };
  }

  state.activePlanId = updatedPlan.planId;
  await saveSessionState(state);

  return {
    phaseName: turnResult.phaseName,
    runtimeMode: turnResult.runtimeMode,
    planningMode: turnResult.planningMode,
    executionFingerprint: turnResult.executionFingerprint ?? null,
    contextEnvelope: turnResult.contextEnvelope,
    taskPlan: turnResult.taskPlan,
    executionSpec: turnResult.executionSpec,
    status: turnResult.status,
    summary: turnResult.summary,
    finalText: prependRunnerNote(selection.note, turnResult.finalText),
    selectedTargetPath: turnResult.selectedTargetPath,
    langSmithTrace: turnResult.langSmithTrace,
    plan: updatedPlan,
    planId: updatedPlan.planId,
    taskId: selection.task.id,
    route: selection.route,
    command,
    loadedSpecRefs: loadedSpecContext.loadedSpecRefs,
    taskTransition: {
      from: selection.task.status,
      to: finalStatus,
    },
  };
}
