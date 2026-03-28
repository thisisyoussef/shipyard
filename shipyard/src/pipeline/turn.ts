import { nanoid } from "nanoid";

import {
  loadArtifact,
  saveArtifact,
} from "../artifacts/registry/index.js";
import type {
  ArtifactContent,
  ArtifactContentKind,
  ArtifactLocator,
  ArtifactRecord,
} from "../artifacts/types.js";
import {
  DEFAULT_TURN_CANCELLED_REASON,
  toTurnCancelledError,
} from "../engine/cancellation.js";
import {
  createUserTurnMessage,
  type ModelAdapter,
} from "../engine/model-adapter.js";
import { createModelAdapterForRoute } from "../engine/model-routing.js";
import {
  saveSessionState,
  type SessionState,
} from "../engine/state.js";
import {
  createCancelledTurnText,
  createExecutionTurnSummary,
  truncateText,
  updateRollingSummary,
} from "../engine/turn-summary.js";
import type {
  InstructionRuntimeState,
  InstructionTurnReporter,
  TurnStateEvent,
} from "../engine/turn.js";
import {
  runWithLangSmithTrace,
  type LangSmithTraceReference,
} from "../tracing/langsmith.js";
import {
  createDefaultPipelineDefinition,
} from "./defaults.js";
import {
  formatArtifactLocator,
  type ApprovalGateMode,
  type PersistedPipelineRun,
  type PhasePipelineDefinition,
  type PipelineAuditEntry,
  type PipelineAuditKind,
  type PipelinePhaseDefinition,
  type PipelinePhaseRunState,
  type PipelineWorkbenchAuditEntry,
  type PipelineWorkbenchState,
} from "./contracts.js";
import { loadPipelineRun, savePipelineRun } from "./store.js";

const PIPELINE_PREFIX = /^pipeline\b/i;
const PIPELINE_START_PREFIX = /^pipeline\s+start(?:\s+|$)/i;
const PIPELINE_STATUS_PREFIX = /^pipeline\s+status$/i;
const PIPELINE_CONTINUE_PREFIX = /^pipeline\s+continue$/i;
const PIPELINE_APPROVE_PREFIX = /^pipeline\s+approve$/i;
const PIPELINE_REJECT_PREFIX = /^pipeline\s+reject(?:\s+|$)/i;
const PIPELINE_EDIT_PREFIX = /^pipeline\s+edit(?:\s+|$)/i;
const PIPELINE_SKIP_PREFIX = /^pipeline\s+skip(?:\s+|$)/i;
const PIPELINE_RERUN_PREFIX = /^pipeline\s+rerun(?:\s+|$)/i;
const PIPELINE_BACK_PREFIX = /^pipeline\s+back(?:\s+|$)/i;
const PIPELINE_RECENT_AUDIT_LIMIT = 8;

export type PipelineCommand =
  | { type: "start"; brief: string }
  | { type: "status" }
  | { type: "continue" }
  | { type: "approve" }
  | { type: "reject"; feedback: string }
  | { type: "edit"; content: string }
  | { type: "skip"; phaseId?: string | undefined }
  | { type: "rerun"; phaseId?: string | undefined }
  | { type: "back"; phaseId?: string | undefined };

export interface ExecutePipelineTurnOptions {
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  instruction: string;
  pipelineDefinition?: PhasePipelineDefinition;
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
  operatorId?: string;
}

export interface PipelineTurnResult {
  command: PipelineCommand["type"];
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  run: PersistedPipelineRun | null;
  langSmithTrace: LangSmithTraceReference | null;
}

interface ResolvedModelSelection {
  modelAdapter: ModelAdapter;
  model: string | undefined;
}

function rememberRecent(
  values: string[],
  nextValue: string,
  limit = 5,
): void {
  values.push(nextValue);

  while (values.length > limit) {
    values.shift();
  }
}

function createPipelineAuditEntry(
  kind: PipelineAuditKind,
  message: string,
  options: {
    phaseId?: string | null;
    artifact?: ArtifactLocator | null;
    at?: string;
  } = {},
): PipelineAuditEntry {
  return {
    id: `pipeline-audit-${nanoid(8)}`,
    at: options.at ?? new Date().toISOString(),
    kind,
    phaseId: options.phaseId ?? null,
    message,
    artifact: options.artifact ?? null,
  };
}

function createIdlePipelineWorkbenchState(): PipelineWorkbenchState {
  return {
    activeRunId: null,
    pipelineId: null,
    pipelineTitle: null,
    status: "idle",
    currentPhaseId: null,
    currentPhaseTitle: null,
    currentPhaseIndex: null,
    totalPhases: 0,
    waitingForApproval: false,
    approvalMode: null,
    pendingArtifact: null,
    latestArtifact: null,
    summary: "No active pipeline.",
    updatedAt: null,
    recentAudit: [],
  };
}

function createPipelineWorkbenchState(
  run: PersistedPipelineRun,
): PipelineWorkbenchState {
  const currentPhase = run.pipeline.phases[run.currentPhaseIndex]
    ?? run.pipeline.phases.at(-1)
    ?? null;
  const latestPhaseWithArtifact = [...run.phases]
    .reverse()
    .find((phase) => phase.latestArtifact !== null || phase.approvedArtifact !== null)
    ?? null;
  const recentAudit: PipelineWorkbenchAuditEntry[] = run.auditTrail
    .slice(-PIPELINE_RECENT_AUDIT_LIMIT)
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      kind: entry.kind,
      phaseId: entry.phaseId,
      message: entry.message,
    }));

  return {
    activeRunId: run.runId,
    pipelineId: run.pipeline.id,
    pipelineTitle: run.pipeline.title,
    status: run.status,
    currentPhaseId: currentPhase?.id ?? null,
    currentPhaseTitle: currentPhase?.title ?? null,
    currentPhaseIndex:
      run.currentPhaseIndex < run.pipeline.phases.length
        ? run.currentPhaseIndex
        : null,
    totalPhases: run.pipeline.phases.length,
    waitingForApproval: run.pendingApproval !== null,
    approvalMode: run.pendingApproval?.mode ?? null,
    pendingArtifact: formatArtifactLocator(run.pendingApproval?.artifact ?? null),
    latestArtifact: formatArtifactLocator(
      latestPhaseWithArtifact?.approvedArtifact
      ?? latestPhaseWithArtifact?.latestArtifact
      ?? run.briefArtifact,
    ),
    summary: run.lastSummary,
    updatedAt: run.updatedAt,
    recentAudit,
  };
}

function syncPipelineWorkbenchState(
  sessionState: SessionState,
  run: PersistedPipelineRun | null,
): void {
  sessionState.workbenchState = {
    ...sessionState.workbenchState,
    pipelineState: run
      ? createPipelineWorkbenchState(run)
      : createIdlePipelineWorkbenchState(),
  };
}

function currentPipelineRunId(sessionState: SessionState): string | null {
  return sessionState.workbenchState.pipelineState?.activeRunId ?? null;
}

function parseOptionalPhaseId(
  instruction: string,
  prefix: RegExp,
): string | undefined {
  const trimmed = instruction.trim();
  const phaseId = trimmed.replace(prefix, "").trim();
  return phaseId || undefined;
}

function parseRequiredPayload(
  instruction: string,
  prefix: RegExp,
  label: string,
): string {
  const payload = instruction.trim().replace(prefix, "");
  const trimmed = payload.trim();

  if (!trimmed) {
    throw new Error(`Pipeline ${label} commands require additional content.`);
  }

  return trimmed;
}

export function isPipelineInstruction(instruction: string): boolean {
  return PIPELINE_PREFIX.test(instruction.trim());
}

export function parsePipelineCommand(
  instruction: string,
): PipelineCommand | null {
  const trimmed = instruction.trim();

  if (!PIPELINE_PREFIX.test(trimmed)) {
    return null;
  }

  if (PIPELINE_STATUS_PREFIX.test(trimmed)) {
    return { type: "status" };
  }

  if (PIPELINE_CONTINUE_PREFIX.test(trimmed)) {
    return { type: "continue" };
  }

  if (PIPELINE_APPROVE_PREFIX.test(trimmed)) {
    return { type: "approve" };
  }

  if (PIPELINE_START_PREFIX.test(trimmed)) {
    return {
      type: "start",
      brief: parseRequiredPayload(trimmed, PIPELINE_START_PREFIX, "start"),
    };
  }

  if (PIPELINE_REJECT_PREFIX.test(trimmed)) {
    return {
      type: "reject",
      feedback: parseRequiredPayload(trimmed, PIPELINE_REJECT_PREFIX, "reject"),
    };
  }

  if (PIPELINE_EDIT_PREFIX.test(trimmed)) {
    return {
      type: "edit",
      content: parseRequiredPayload(trimmed, PIPELINE_EDIT_PREFIX, "edit"),
    };
  }

  if (PIPELINE_SKIP_PREFIX.test(trimmed)) {
    return {
      type: "skip",
      phaseId: parseOptionalPhaseId(trimmed, PIPELINE_SKIP_PREFIX),
    };
  }

  if (PIPELINE_RERUN_PREFIX.test(trimmed)) {
    return {
      type: "rerun",
      phaseId: parseOptionalPhaseId(trimmed, PIPELINE_RERUN_PREFIX),
    };
  }

  if (PIPELINE_BACK_PREFIX.test(trimmed)) {
    return {
      type: "back",
      phaseId: parseOptionalPhaseId(trimmed, PIPELINE_BACK_PREFIX),
    };
  }

  throw new Error(
    "Unknown pipeline command. Use pipeline start, status, continue, approve, reject, edit, skip, rerun, or back.",
  );
}

function createPipelineRunId(pipelineId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
  return `${pipelineId}-${timestamp}-${nanoid(6)}`;
}

function createInitialPhaseState(
  phase: PipelinePhaseDefinition,
  timestamp: string,
): PipelinePhaseRunState {
  return {
    phaseId: phase.id,
    title: phase.title,
    status: "pending",
    attemptCount: 0,
    latestArtifact: null,
    approvedArtifact: null,
    consumedArtifacts: [],
    lastSummary: null,
    lastUpdatedAt: timestamp,
    pendingFeedback: [],
    completedAt: null,
  };
}

function createBriefArtifactContent(brief: string): string {
  return [
    "# Pipeline Brief",
    "",
    brief.trim(),
  ].join("\n");
}

function serializeArtifactContentForPrompt(
  record: ArtifactRecord<ArtifactContent>,
): string {
  if (record.contentKind === "markdown" && typeof record.content === "string") {
    return record.content;
  }

  return JSON.stringify(record.content ?? null, null, 2);
}

function parseEditedArtifactContent(
  contentKind: ArtifactContentKind,
  rawContent: string,
): ArtifactContent {
  const trimmed = rawContent.trim();

  if (!trimmed) {
    throw new Error("Edited artifact content must not be blank.");
  }

  if (contentKind === "markdown") {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed) as ArtifactContent;
  } catch {
    throw new Error(
      "Edited artifact content must be valid JSON for this phase output.",
    );
  }
}

function assertPhaseRunState(
  run: PersistedPipelineRun,
  phaseIndex: number,
): PipelinePhaseRunState {
  const phaseState = run.phases[phaseIndex];

  if (!phaseState) {
    throw new Error(
      `Pipeline phase index ${String(phaseIndex)} is out of bounds for run ${run.runId}.`,
    );
  }

  return phaseState;
}

function assertPipelinePhase(
  run: PersistedPipelineRun,
  phaseIndex: number,
): PipelinePhaseDefinition {
  const phase = run.pipeline.phases[phaseIndex];

  if (!phase) {
    throw new Error(
      `Pipeline phase index ${String(phaseIndex)} is out of bounds for run ${run.runId}.`,
    );
  }

  return phase;
}

function resetPipelineFromPhase(
  run: PersistedPipelineRun,
  phaseIndex: number,
  options: {
    feedback?: string;
    kind: "phase-rerun" | "phase-backtracked";
    message: string;
  },
): PersistedPipelineRun {
  const now = new Date().toISOString();

  for (let index = phaseIndex; index < run.phases.length; index += 1) {
    const phaseState = assertPhaseRunState(run, index);
    run.phases[index] = {
      ...phaseState,
      status: "pending",
      approvedArtifact: null,
      consumedArtifacts: [],
      lastUpdatedAt: now,
      completedAt: null,
      pendingFeedback:
        index === phaseIndex && options.feedback
          ? [...phaseState.pendingFeedback, options.feedback]
          : phaseState.pendingFeedback,
    };
  }

  run.currentPhaseIndex = phaseIndex;
  run.pendingApproval = null;
  run.status = "running";
  run.updatedAt = now;
  run.lastSummary = options.message;
  run.auditTrail.push(
    createPipelineAuditEntry(options.kind, options.message, {
      phaseId: assertPipelinePhase(run, phaseIndex).id,
      at: now,
    }),
  );

  return run;
}

async function emitTurnState(
  reporter: InstructionTurnReporter | undefined,
  sessionState: SessionState,
  connectionState: TurnStateEvent["connectionState"],
): Promise<void> {
  await reporter?.onTurnState?.({
    sessionState,
    connectionState,
  });
}

async function resolveActivePipelineRun(
  sessionState: SessionState,
): Promise<PersistedPipelineRun> {
  const runId = currentPipelineRunId(sessionState);

  if (!runId) {
    throw new Error("No active pipeline is available for this session.");
  }

  const run = await loadPipelineRun(sessionState.targetDirectory, runId);

  if (!run) {
    throw new Error(`Pipeline run ${runId} could not be loaded.`);
  }

  return run;
}

async function loadArtifactContentRecord(
  targetDirectory: string,
  locator: ArtifactLocator,
): Promise<ArtifactRecord<ArtifactContent>> {
  const loaded = await loadArtifact(targetDirectory, locator, {
    includeContent: true,
  });

  if (!loaded.record || loaded.error) {
    throw new Error(
      loaded.error
      ?? `Artifact ${formatArtifactLocator(locator)} could not be loaded.`,
    );
  }

  return loaded.record as ArtifactRecord<ArtifactContent>;
}

async function resolveConsumedArtifacts(
  targetDirectory: string,
  run: PersistedPipelineRun,
  phaseIndex: number,
): Promise<ArtifactRecord<ArtifactContent>[]> {
  const phase = run.pipeline.phases[phaseIndex];

  if (!phase) {
    throw new Error(
      `Pipeline phase index ${String(phaseIndex)} is out of bounds for run ${run.runId}.`,
    );
  }

  const consumedRecords: ArtifactRecord<ArtifactContent>[] = [];

  for (const artifactType of phase.consumesArtifacts) {
    if (artifactType === "pipeline-brief") {
      consumedRecords.push(
        await loadArtifactContentRecord(targetDirectory, run.briefArtifact),
      );
      continue;
    }

    let matchingLocator: ArtifactLocator | null = null;

    for (let index = phaseIndex - 1; index >= 0; index -= 1) {
      const upstreamPhase = run.pipeline.phases[index];
      const upstreamState = run.phases[index];

      if (
        upstreamPhase?.producesArtifacts.includes(artifactType) &&
        upstreamState?.approvedArtifact
      ) {
        matchingLocator = upstreamState.approvedArtifact;
        break;
      }
    }

    if (!matchingLocator) {
      throw new Error(
        `Phase "${phase.id}" requires approved artifact type "${artifactType}", but none is available yet.`,
      );
    }

    consumedRecords.push(
      await loadArtifactContentRecord(targetDirectory, matchingLocator),
    );
  }

  return consumedRecords;
}

async function resolveModelSelection(
  runtimeState: InstructionRuntimeState,
  phase: PipelinePhaseDefinition,
): Promise<ResolvedModelSelection> {
  const rawLoopOptions =
    await runtimeState.runtimeDependencies?.createRawLoopOptions?.(
      {} as never,
      {
        routeId: phase.modelRoute,
      },
    )
    ?? {};

  if (rawLoopOptions.modelAdapter) {
    return {
      modelAdapter: rawLoopOptions.modelAdapter,
      model: rawLoopOptions.model,
    };
  }

  const selection = createModelAdapterForRoute({
    routing: runtimeState.modelRouting,
    routeId: phase.modelRoute,
    env: runtimeState.modelRoutingEnv,
  });

  return {
    modelAdapter: selection.modelAdapter,
    model: rawLoopOptions.model ?? selection.model ?? undefined,
  };
}

function buildPhasePrompt(options: {
  run: PersistedPipelineRun;
  phase: PipelinePhaseDefinition;
  phaseState: PipelinePhaseRunState;
  consumedArtifacts: ArtifactRecord<ArtifactContent>[];
}): string {
  const artifactSections = options.consumedArtifacts.map((record) => [
    `Artifact: ${formatArtifactLocator(record.metadata) ?? record.metadata.type}`,
    `Title: ${record.title ?? "Untitled"}`,
    `Summary: ${record.summary}`,
    "",
    serializeArtifactContentForPrompt(record),
  ].join("\n"));
  const feedbackSection = options.phaseState.pendingFeedback.length > 0
    ? [
      "Operator feedback to address before finalizing this artifact:",
      ...options.phaseState.pendingFeedback.map((entry) => `- ${entry}`),
      "",
    ].join("\n")
    : "";

  return [
    `Pipeline: ${options.run.pipeline.title}`,
    `Phase: ${options.phase.title}`,
    `Output artifact type: ${options.phase.output.type}`,
    `Output format: ${options.phase.output.contentKind}`,
    "",
    "Phase instructions:",
    options.phase.instructions,
    "",
    "Initial brief:",
    options.run.initialBrief,
    "",
    feedbackSection,
    "Approved upstream artifacts:",
    artifactSections.join("\n\n---\n\n"),
    "",
    "Return only the artifact body with no surrounding commentary.",
  ]
    .join("\n")
    .trim();
}

async function generatePhaseArtifact(options: {
  runtimeState: InstructionRuntimeState;
  run: PersistedPipelineRun;
  phase: PipelinePhaseDefinition;
  phaseState: PipelinePhaseRunState;
  consumedArtifacts: ArtifactRecord<ArtifactContent>[];
  signal?: AbortSignal;
}): Promise<{
  content: ArtifactContent;
  modelProvider: string;
  modelName: string | null;
}> {
  const prompt = buildPhasePrompt({
    run: options.run,
    phase: options.phase,
    phaseState: options.phaseState,
    consumedArtifacts: options.consumedArtifacts,
  });
  const selection = await resolveModelSelection(options.runtimeState, options.phase);
  const turn = await selection.modelAdapter.createTurn(
    {
      systemPrompt: options.phase.systemPrompt,
      messages: [createUserTurnMessage(prompt)],
      model: selection.model,
      temperature: 0.2,
    },
    {
      signal: options.signal,
    },
  );

  if (turn.stopReason !== "completed") {
    throw new Error(
      `Pipeline phase "${options.phase.id}" stopped with "${turn.stopReason}".`,
    );
  }

  return {
    content: parseEditedArtifactContent(
      options.phase.output.contentKind,
      turn.finalText,
    ),
    modelProvider: selection.modelAdapter.provider,
    modelName: turn.model ?? selection.model ?? null,
  };
}

function createDecisionArtifactTags(
  existingTags: string[],
  status: "approved" | "rejected",
): string[] {
  return [...new Set([...existingTags, status])];
}

function toArtifactLocator(record: ArtifactRecord): ArtifactLocator {
  return {
    type: record.metadata.type,
    id: record.metadata.id,
    version: record.metadata.version,
  };
}

async function advancePipelineRun(options: {
  run: PersistedPipelineRun;
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
}): Promise<PersistedPipelineRun> {
  const run = options.run;

  while (run.currentPhaseIndex < run.pipeline.phases.length) {
    if (options.signal?.aborted) {
      throw new Error(DEFAULT_TURN_CANCELLED_REASON);
    }

    const phase = assertPipelinePhase(run, run.currentPhaseIndex);
    const phaseState = assertPhaseRunState(run, run.currentPhaseIndex);
    const now = new Date().toISOString();

    phaseState.status = "running";
    phaseState.attemptCount += 1;
    phaseState.lastUpdatedAt = now;
    phaseState.completedAt = null;
    run.updatedAt = now;
    run.status = "running";
    run.lastSummary =
      `Running phase "${phase.title}" (attempt ${String(phaseState.attemptCount)}).`;
    run.auditTrail.push(
      createPipelineAuditEntry(
        "phase-started",
        `Started phase "${phase.title}" (attempt ${String(phaseState.attemptCount)}).`,
        {
          phaseId: phase.id,
          at: now,
        },
      ),
    );
    syncPipelineWorkbenchState(options.sessionState, run);
    await savePipelineRun(options.sessionState.targetDirectory, run);

    await options.reporter?.onThinking?.(
      `Pipeline ${run.pipeline.title}: running "${phase.title}" (attempt ${String(phaseState.attemptCount)}).`,
    );

    const consumedArtifacts = await resolveConsumedArtifacts(
      options.sessionState.targetDirectory,
      run,
      run.currentPhaseIndex,
    );
    phaseState.consumedArtifacts = consumedArtifacts.map((record) =>
      toArtifactLocator(record)
    );

    const generated = await generatePhaseArtifact({
      runtimeState: options.runtimeState,
      run,
      phase,
      phaseState,
      consumedArtifacts,
      signal: options.signal,
    });
    const autoApprove = phase.approvalGate !== "required";
    const producedAt = new Date().toISOString();
    const producedRecord = await saveArtifact(
      options.sessionState.targetDirectory,
      {
        type: phase.output.type,
        id: `${run.runId}-${phase.id}`,
        status: autoApprove ? "approved" : "draft",
        producedBy: phase.id,
        producedAt,
        approvedAt: autoApprove ? producedAt : null,
        approvedBy: autoApprove
          ? phase.approvalGate === "advisory"
            ? "shipyard:auto"
            : "shipyard:auto"
          : null,
        tags: [
          "pipeline",
          run.pipeline.id,
          phase.id,
          ...(autoApprove ? ["approved"] : ["draft"]),
        ],
        dependsOn: phaseState.consumedArtifacts.map((locator) =>
          formatArtifactLocator(locator) ?? locator.type
        ),
        title: null,
        summary: null,
        contentKind: phase.output.contentKind,
        content: generated.content,
      },
    );
    const producedLocator = toArtifactLocator(producedRecord);
    phaseState.latestArtifact = producedLocator;
    phaseState.lastSummary = producedRecord.summary;
    phaseState.lastUpdatedAt = producedAt;
    phaseState.pendingFeedback = [];
    rememberRecent(
      options.runtimeState.recentToolOutputs,
      `${phase.id} -> ${phase.output.type}@${String(producedLocator.version)}`,
    );
    run.auditTrail.push(
      createPipelineAuditEntry(
        "artifact-produced",
        `Produced ${formatArtifactLocator(producedLocator) ?? phase.output.type}.`,
        {
          phaseId: phase.id,
          artifact: producedLocator,
          at: producedAt,
        },
      ),
    );

    if (phase.approvalGate === "required") {
      phaseState.status = "awaiting_approval";
      run.pendingApproval = {
        phaseId: phase.id,
        phaseIndex: run.currentPhaseIndex,
        mode: phase.approvalGate,
        artifact: producedLocator,
        requestedAt: producedAt,
        summary:
          `Waiting for approval on ${formatArtifactLocator(producedLocator) ?? phase.output.type}.`,
      };
      run.status = "awaiting_approval";
      run.updatedAt = producedAt;
      run.lastSummary =
        `Waiting for approval on "${phase.title}" (${formatArtifactLocator(producedLocator)}).`;
      run.auditTrail.push(
        createPipelineAuditEntry(
          "awaiting-approval",
          run.lastSummary,
          {
            phaseId: phase.id,
            artifact: producedLocator,
            at: producedAt,
          },
        ),
      );
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);
      return run;
    }

    phaseState.approvedArtifact = producedLocator;
    phaseState.status = "completed";
    phaseState.completedAt = producedAt;
    run.pendingApproval = null;
    run.currentPhaseIndex += 1;
    run.updatedAt = producedAt;
    run.lastSummary =
      phase.approvalGate === "advisory"
        ? `Auto-continued advisory approval for "${phase.title}".`
        : `Completed phase "${phase.title}".`;
    run.auditTrail.push(
      createPipelineAuditEntry(
        "phase-completed",
        run.lastSummary,
        {
          phaseId: phase.id,
          artifact: producedLocator,
          at: producedAt,
        },
      ),
    );
    syncPipelineWorkbenchState(options.sessionState, run);
    await savePipelineRun(options.sessionState.targetDirectory, run);
  }

  const completedAt = new Date().toISOString();
  run.status = "completed";
  run.pendingApproval = null;
  run.updatedAt = completedAt;
  run.lastSummary = `Pipeline "${run.pipeline.title}" completed.`;
  run.auditTrail.push(
    createPipelineAuditEntry(
      "run-completed",
      run.lastSummary,
      {
        at: completedAt,
      },
    ),
  );
  syncPipelineWorkbenchState(options.sessionState, run);
  await savePipelineRun(options.sessionState.targetDirectory, run);
  return run;
}

async function createPipelineRun(options: {
  sessionState: SessionState;
  pipelineDefinition: PhasePipelineDefinition;
  brief: string;
  operatorId: string;
}): Promise<PersistedPipelineRun> {
  const now = new Date().toISOString();
  const runId = createPipelineRunId(options.pipelineDefinition.id);
  const briefRecord = await saveArtifact(options.sessionState.targetDirectory, {
    type: "pipeline-brief",
    id: runId,
    status: "approved",
    producedBy: options.operatorId,
    producedAt: now,
    approvedAt: now,
    approvedBy: options.operatorId,
    tags: ["pipeline", options.pipelineDefinition.id, "brief", "approved"],
    dependsOn: [],
    title: "Pipeline Brief",
    summary: options.brief,
    contentKind: "markdown",
    content: createBriefArtifactContent(options.brief),
  });
  const run: PersistedPipelineRun = {
    version: 1,
    runId,
    pipeline: options.pipelineDefinition,
    status: "running",
    createdAt: now,
    updatedAt: now,
    startedBy: options.operatorId,
    initialBrief: options.brief.trim(),
    briefArtifact: toArtifactLocator(briefRecord),
    currentPhaseIndex: 0,
    phases: options.pipelineDefinition.phases.map((phase) =>
      createInitialPhaseState(phase, now)
    ),
    pendingApproval: null,
    auditTrail: [
      createPipelineAuditEntry(
        "run-started",
        `Started pipeline "${options.pipelineDefinition.title}".`,
        {
          at: now,
          artifact: toArtifactLocator(briefRecord),
        },
      ),
    ],
    lastSummary: `Started pipeline "${options.pipelineDefinition.title}".`,
  };
  syncPipelineWorkbenchState(options.sessionState, run);
  await savePipelineRun(options.sessionState.targetDirectory, run);
  return run;
}

async function saveDecisionArtifactVersion(options: {
  sessionState: SessionState;
  run: PersistedPipelineRun;
  phase: PipelinePhaseDefinition;
  sourceRecord: ArtifactRecord<ArtifactContent>;
  status: "approved" | "rejected";
  operatorId: string;
  content?: ArtifactContent;
}): Promise<ArtifactRecord> {
  return saveArtifact(options.sessionState.targetDirectory, {
    type: options.sourceRecord.metadata.type,
    id: options.sourceRecord.metadata.id,
    status: options.status,
    producedBy: options.phase.id,
    producedAt: new Date().toISOString(),
    approvedAt: options.status === "approved"
      ? new Date().toISOString()
      : null,
    approvedBy: options.status === "approved"
      ? options.operatorId
      : null,
    tags: createDecisionArtifactTags(
      options.sourceRecord.metadata.tags,
      options.status,
    ),
    dependsOn: options.sourceRecord.metadata.dependsOn,
    title: options.sourceRecord.title,
    summary: options.sourceRecord.summary,
    contentKind: options.phase.output.contentKind,
    content: options.content ?? options.sourceRecord.content ?? "",
  });
}

function formatPipelineStatus(run: PersistedPipelineRun | null): string {
  if (!run) {
    return "No active pipeline is available for this session.";
  }

  const lines = [
    `Pipeline ${run.runId} (${run.pipeline.title})`,
    `Status: ${run.status}`,
  ];

  if (run.currentPhaseIndex < run.pipeline.phases.length) {
    const currentPhase = run.pipeline.phases[run.currentPhaseIndex];

    if (currentPhase) {
      lines.push(`Current phase: ${currentPhase.title} (${currentPhase.id})`);
    }
  }

  if (run.pendingApproval) {
    lines.push(
      `Waiting for approval: ${formatArtifactLocator(run.pendingApproval.artifact)}`,
    );
  }

  lines.push(`Summary: ${run.lastSummary}`);
  return lines.join("\n");
}

async function performPipelineCommand(options: {
  command: PipelineCommand;
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  reporter?: InstructionTurnReporter;
  pipelineDefinition?: PhasePipelineDefinition;
  signal?: AbortSignal;
  operatorId: string;
}): Promise<{
  run: PersistedPipelineRun | null;
  finalText: string;
  status: "success" | "error" | "cancelled";
}> {
  switch (options.command.type) {
    case "status": {
      const runId = currentPipelineRunId(options.sessionState);
      const run = runId
        ? await loadPipelineRun(options.sessionState.targetDirectory, runId)
        : null;
      syncPipelineWorkbenchState(options.sessionState, run);
      return {
        run,
        finalText: formatPipelineStatus(run),
        status: "success",
      };
    }
    case "start": {
      const existingRunId = currentPipelineRunId(options.sessionState);
      const existingRun = existingRunId
        ? await loadPipelineRun(options.sessionState.targetDirectory, existingRunId)
        : null;

      if (
        existingRun &&
        (existingRun.status === "running" || existingRun.status === "awaiting_approval")
      ) {
        throw new Error(
          `Pipeline ${existingRun.runId} is already active. Use pipeline status, continue, approve, reject, edit, skip, rerun, or back.`,
        );
      }

      const definition = options.pipelineDefinition ?? createDefaultPipelineDefinition();
      const run = await createPipelineRun({
        sessionState: options.sessionState,
        pipelineDefinition: definition,
        brief: options.command.brief,
        operatorId: options.operatorId,
      });
      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "continue": {
      const run = await resolveActivePipelineRun(options.sessionState);

      if (run.status === "awaiting_approval") {
        syncPipelineWorkbenchState(options.sessionState, run);
        return {
          run,
          finalText:
            `Pipeline ${run.runId} is waiting for approval. Use pipeline approve, reject, or edit before continuing.`,
          status: "success",
        };
      }

      if (run.status === "completed") {
        syncPipelineWorkbenchState(options.sessionState, run);
        return {
          run,
          finalText: formatPipelineStatus(run),
          status: "success",
        };
      }

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "approve": {
      const run = await resolveActivePipelineRun(options.sessionState);

      if (!run.pendingApproval) {
        throw new Error("The active pipeline is not waiting for approval.");
      }

      const approval = run.pendingApproval;
      const phase = assertPipelinePhase(run, approval.phaseIndex);
      const phaseState = assertPhaseRunState(run, approval.phaseIndex);
      const sourceRecord = await loadArtifactContentRecord(
        options.sessionState.targetDirectory,
        approval.artifact,
      );
      const approvedRecord = await saveDecisionArtifactVersion({
        sessionState: options.sessionState,
        run,
        phase,
        sourceRecord,
        status: "approved",
        operatorId: options.operatorId,
      });
      const approvedLocator = toArtifactLocator(approvedRecord);
      const now = new Date().toISOString();

      phaseState.approvedArtifact = approvedLocator;
      phaseState.latestArtifact = approvedLocator;
      phaseState.status = "completed";
      phaseState.completedAt = now;
      phaseState.lastUpdatedAt = now;
      phaseState.lastSummary = approvedRecord.summary;
      run.pendingApproval = null;
      run.currentPhaseIndex = approval.phaseIndex + 1;
      run.status = "running";
      run.updatedAt = now;
      run.lastSummary =
        `Approved ${formatArtifactLocator(approvedLocator)} and continued the pipeline.`;
      run.auditTrail.push(
        createPipelineAuditEntry(
          "artifact-approved",
          run.lastSummary,
          {
            phaseId: phase.id,
            artifact: approvedLocator,
            at: now,
          },
        ),
      );
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "edit": {
      const run = await resolveActivePipelineRun(options.sessionState);

      if (!run.pendingApproval) {
        throw new Error("The active pipeline is not waiting for an edited approval.");
      }

      const approval = run.pendingApproval;
      const phase = assertPipelinePhase(run, approval.phaseIndex);
      const phaseState = assertPhaseRunState(run, approval.phaseIndex);
      const sourceRecord = await loadArtifactContentRecord(
        options.sessionState.targetDirectory,
        approval.artifact,
      );
      const editedContent = parseEditedArtifactContent(
        phase.output.contentKind,
        options.command.content,
      );
      const editedRecord = await saveDecisionArtifactVersion({
        sessionState: options.sessionState,
        run,
        phase,
        sourceRecord,
        status: "approved",
        operatorId: options.operatorId,
        content: editedContent,
      });
      const editedLocator = toArtifactLocator(editedRecord);
      const now = new Date().toISOString();

      phaseState.approvedArtifact = editedLocator;
      phaseState.latestArtifact = editedLocator;
      phaseState.status = "completed";
      phaseState.completedAt = now;
      phaseState.lastUpdatedAt = now;
      phaseState.lastSummary = editedRecord.summary;
      run.pendingApproval = null;
      run.currentPhaseIndex = run.currentPhaseIndex + 1;
      run.status = "running";
      run.updatedAt = now;
      run.lastSummary =
        `Accepted edited approval for ${formatArtifactLocator(editedLocator)} and continued the pipeline.`;
      run.auditTrail.push(
        createPipelineAuditEntry(
          "artifact-edited",
          run.lastSummary,
          {
            phaseId: phase.id,
            artifact: editedLocator,
            at: now,
          },
        ),
      );
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "reject": {
      const run = await resolveActivePipelineRun(options.sessionState);

      if (!run.pendingApproval) {
        throw new Error("The active pipeline is not waiting for rejection feedback.");
      }

      const phaseIndex = run.pendingApproval.phaseIndex;
      const phase = assertPipelinePhase(run, phaseIndex);
      const phaseState = assertPhaseRunState(run, phaseIndex);
      const sourceRecord = await loadArtifactContentRecord(
        options.sessionState.targetDirectory,
        run.pendingApproval.artifact,
      );
      const rejectedRecord = await saveDecisionArtifactVersion({
        sessionState: options.sessionState,
        run,
        phase,
        sourceRecord,
        status: "rejected",
        operatorId: options.operatorId,
      });
      const rejectedLocator = toArtifactLocator(rejectedRecord);
      const now = new Date().toISOString();

      phaseState.latestArtifact = rejectedLocator;
      run.pendingApproval = null;
      run.updatedAt = now;
      run.auditTrail.push(
        createPipelineAuditEntry(
          "artifact-rejected",
          `Rejected ${formatArtifactLocator(rejectedLocator)} and queued the producing phase for regeneration.`,
          {
            phaseId: phase.id,
            artifact: rejectedLocator,
            at: now,
          },
        ),
      );
      resetPipelineFromPhase(run, phaseIndex, {
        feedback: options.command.feedback,
        kind: "phase-rerun",
        message:
          `Rejected "${phase.title}" and re-queued it with operator feedback.`,
      });
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "skip": {
      const run = await resolveActivePipelineRun(options.sessionState);
      const currentPhaseId = run.pipeline.phases[run.currentPhaseIndex]?.id;
      const requestedPhaseId = options.command.phaseId ?? currentPhaseId;

      if (!requestedPhaseId) {
        throw new Error("There is no phase available to skip.");
      }

      const phaseIndex = run.pipeline.phases.findIndex((phase) =>
        phase.id === requestedPhaseId
      );

      if (phaseIndex < 0) {
        throw new Error(`Pipeline phase "${requestedPhaseId}" does not exist.`);
      }

      const phaseState = assertPhaseRunState(run, phaseIndex);
      const now = new Date().toISOString();

      if (phaseIndex < run.currentPhaseIndex) {
        resetPipelineFromPhase(run, phaseIndex, {
          kind: "phase-backtracked",
          message: `Moved back to "${requestedPhaseId}" before skipping it.`,
        });
      }

      const nextPhaseState = assertPhaseRunState(run, phaseIndex);
      nextPhaseState.status = "skipped";
      nextPhaseState.lastUpdatedAt = now;
      nextPhaseState.completedAt = now;
      run.pendingApproval = null;
      run.currentPhaseIndex = phaseIndex + 1;
      run.status = "running";
      run.updatedAt = now;
      run.lastSummary = `Skipped phase "${requestedPhaseId}".`;
      run.auditTrail.push(
        createPipelineAuditEntry(
          "phase-skipped",
          run.lastSummary,
          {
            phaseId: requestedPhaseId,
            at: now,
          },
        ),
      );
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "rerun": {
      const run = await resolveActivePipelineRun(options.sessionState);
      const requestedPhaseId = options.command.phaseId
        ?? run.pipeline.phases[run.currentPhaseIndex]?.id
        ?? run.pipeline.phases.at(-1)?.id;

      if (!requestedPhaseId) {
        throw new Error("There is no phase available to rerun.");
      }

      const phaseIndex = run.pipeline.phases.findIndex((phase) =>
        phase.id === requestedPhaseId
      );

      if (phaseIndex < 0) {
        throw new Error(`Pipeline phase "${requestedPhaseId}" does not exist.`);
      }

      resetPipelineFromPhase(run, phaseIndex, {
        kind: "phase-rerun",
        message: `Re-running phase "${requestedPhaseId}".`,
      });
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
    case "back": {
      const run = await resolveActivePipelineRun(options.sessionState);
      const requestedPhaseId = options.command.phaseId
        ?? run.pipeline.phases[Math.max(run.currentPhaseIndex - 1, 0)]?.id
        ?? run.pipeline.phases[0]?.id;

      if (!requestedPhaseId) {
        throw new Error("There is no phase available to move back to.");
      }

      const phaseIndex = run.pipeline.phases.findIndex((phase) =>
        phase.id === requestedPhaseId
      );

      if (phaseIndex < 0) {
        throw new Error(`Pipeline phase "${requestedPhaseId}" does not exist.`);
      }

      resetPipelineFromPhase(run, phaseIndex, {
        kind: "phase-backtracked",
        message: `Moved back to phase "${requestedPhaseId}".`,
      });
      syncPipelineWorkbenchState(options.sessionState, run);
      await savePipelineRun(options.sessionState.targetDirectory, run);

      const advancedRun = await advancePipelineRun({
        run,
        sessionState: options.sessionState,
        runtimeState: options.runtimeState,
        reporter: options.reporter,
        signal: options.signal,
      });

      return {
        run: advancedRun,
        finalText: formatPipelineStatus(advancedRun),
        status: "success",
      };
    }
  }
}

export async function executePipelineTurn(
  options: ExecutePipelineTurnOptions,
): Promise<PipelineTurnResult> {
  const command = parsePipelineCommand(options.instruction);

  if (!command) {
    throw new Error("Pipeline execution requires a pipeline-prefixed instruction.");
  }

  const state = options.sessionState;
  const operatorId = options.operatorId ?? "human";
  let activeRun: PersistedPipelineRun | null = null;

  state.turnCount += 1;
  state.lastActiveAt = new Date().toISOString();

  await emitTurnState(options.reporter, state, "agent-busy");
  await options.reporter?.onThinking?.(
    `Pipeline turn ${String(state.turnCount)} handling "${command.type}" via ${options.runtimeState.runtimeMode} runtime.`,
  );

  try {
    const traced = await runWithLangSmithTrace({
      name: "pipeline.turn",
      runType: "chain",
      env: options.runtimeState.modelRoutingEnv,
      metadata: {
        sessionId: state.sessionId,
        targetDirectory: state.targetDirectory,
        command: command.type,
      },
      getResultMetadata(result) {
        return {
          status: result.status,
          runId: result.run?.runId ?? null,
          pipelineStatus: result.run?.status ?? null,
        };
      },
      fn: () =>
        performPipelineCommand({
          command,
          sessionState: state,
          runtimeState: options.runtimeState,
          reporter: options.reporter,
          pipelineDefinition: options.pipelineDefinition,
          signal: options.signal,
          operatorId,
        }),
      args: [],
    });

    activeRun = traced.result.run;
    const summary = createExecutionTurnSummary(
      state.turnCount,
      options.runtimeState.runtimeMode,
      "done",
      truncateText(traced.result.finalText, 140),
    );

    state.rollingSummary = updateRollingSummary(
      state.rollingSummary,
      state.turnCount,
      options.instruction,
      summary,
    );

    syncPipelineWorkbenchState(state, activeRun);
    await options.reporter?.onText?.(traced.result.finalText);
    await options.reporter?.onDone?.({
      status: "success",
      summary,
      langSmithTrace: traced.trace,
    });
    await emitTurnState(options.reporter, state, "ready");

    return {
      command: command.type,
      status: "success",
      summary,
      finalText: traced.result.finalText,
      run: activeRun,
      langSmithTrace: traced.trace,
    };
  } catch (error) {
    const cancelledError = toTurnCancelledError(error, options.signal);

    if (cancelledError) {
      const reason = cancelledError.message || DEFAULT_TURN_CANCELLED_REASON;
      const finalText = createCancelledTurnText(state.turnCount, reason);
      const summary = createExecutionTurnSummary(
        state.turnCount,
        options.runtimeState.runtimeMode,
        "cancelled",
        reason,
      );

      state.rollingSummary = updateRollingSummary(
        state.rollingSummary,
        state.turnCount,
        options.instruction,
        summary,
      );

      await options.reporter?.onText?.(finalText);
      await options.reporter?.onDone?.({
        status: "cancelled",
        summary: reason,
        langSmithTrace: null,
      });
      await emitTurnState(options.reporter, state, "ready");

      return {
        command: command.type,
        status: "cancelled",
        summary,
        finalText,
        run: activeRun,
        langSmithTrace: null,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    rememberRecent(options.runtimeState.recentErrors, message);

    try {
      activeRun = await resolveActivePipelineRun(state);
      syncPipelineWorkbenchState(state, activeRun);
    } catch {
      syncPipelineWorkbenchState(state, null);
    }

    const finalText = `Pipeline turn ${String(state.turnCount)} stopped: ${message}`;
    const summary = createExecutionTurnSummary(
      state.turnCount,
      options.runtimeState.runtimeMode,
      "failed",
      message,
    );

    state.rollingSummary = updateRollingSummary(
      state.rollingSummary,
      state.turnCount,
      options.instruction,
      summary,
    );

    await options.reporter?.onText?.(finalText);
    await options.reporter?.onError?.(message);
    await options.reporter?.onDone?.({
      status: "error",
      summary: message,
      langSmithTrace: null,
    });
    await emitTurnState(options.reporter, state, "error");

    return {
      command: command.type,
      status: "error",
      summary,
      finalText,
      run: activeRun,
      langSmithTrace: null,
    };
  } finally {
    await saveSessionState(state);
  }
}
