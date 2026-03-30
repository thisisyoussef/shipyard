import { nanoid } from "nanoid";

import {
  loadArtifact,
  queryArtifacts,
  saveArtifact,
} from "../artifacts/registry/index.js";
import type {
  ArtifactContent,
  ArtifactLocator,
  ArtifactRecord,
  TechnicalSpecArtifact,
  TechnicalSpecRecord,
  TddEscalationArtifact,
  TddHandoffArtifact,
  TddOptionalCheckKind,
  TddOptionalCheckRecord,
  TddQualityFinding,
  TddQualityReportArtifact,
  TddStage,
  TddValidationObservedOutcome,
} from "../artifacts/types.js";
import {
  saveSessionState,
  type SessionState,
} from "../engine/state.js";
import {
  executeInstructionTurn,
  type ExecuteInstructionTurnOptions,
  type InstructionRuntimeState,
  type InstructionTurnReporter,
  type InstructionTurnResult,
  type TurnStateEvent,
} from "../engine/turn.js";
import type { RuntimeSurface } from "../engine/turn-fingerprint.js";
import {
  createExecutionTurnSummary,
  truncateText,
  updateRollingSummary,
} from "../engine/turn-summary.js";
import type { Phase } from "../phases/phase.js";
import { createCodePhase } from "../phases/code/index.js";
import {
  runWithLangSmithTrace,
  type LangSmithTraceReference,
} from "../tracing/langsmith.js";
import { executeProcess } from "../tools/run-command.js";
import type { RuntimeAssistSummary } from "../skills/contracts.js";
import {
  TDD_LANE_VERSION,
  buildQualitySummary,
  createEmptyTddStageAttempts,
  createIdleTddWorkbenchState,
  createOptionalCheckRecord,
  createTddValidationRecord,
  createTddWorkbenchState,
  formatArtifactLocator,
  type PersistedTddLane,
  type TddAuditEntry,
  type TddAuditKind,
  type TddSelection,
} from "./contracts.js";
import {
  listTddLanes,
  loadTddLane,
  saveTddLane,
} from "./store.js";

const TDD_PREFIX = /^tdd\b/i;
const TDD_STATUS_PREFIX = /^tdd\s+status$/i;
const TDD_CONTINUE_PREFIX = /^tdd\s+continue$/i;
const TDD_START_PREFIX = /^tdd\s+start(?:\s+|$)/i;
const DEFAULT_VALIDATION_TIMEOUT_MS = 60_000;
const TEST_AUTHOR_TOOLS = [
  "read_file",
  "load_spec",
  "write_file",
  "edit_block",
  "list_files",
  "search_files",
  "run_command",
  "git_diff",
] as const;
const IMPLEMENTER_TOOLS = [
  "read_file",
  "load_spec",
  "write_file",
  "edit_block",
  "list_files",
  "search_files",
  "run_command",
  "git_diff",
] as const;

export type TddCommand =
  | {
      type: "start";
      validationCommand: string;
      requestPropertyCheck: boolean;
      requestMutationCheck: boolean;
      storyId?: string;
      specId?: string;
      artifact?: ArtifactLocator;
    }
  | { type: "continue" }
  | { type: "status" };

export interface RunTddValidationRequest {
  targetDirectory: string;
  lane: PersistedTddLane;
  command: string;
  stage: TddStage;
  signal?: AbortSignal;
}

export interface TddValidationCommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
}

export interface ExecuteTddTurnOptions {
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  instruction: string;
  reporter?: InstructionTurnReporter;
  signal?: AbortSignal;
  runtimeSurface?: RuntimeSurface;
  executeTurn?: (
    options: ExecuteInstructionTurnOptions,
  ) => Promise<InstructionTurnResult>;
  runValidationCommand?: (
    request: RunTddValidationRequest,
  ) => Promise<TddValidationCommandResult>;
}

export interface TddTurnResult {
  command: TddCommand["type"];
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  lane: PersistedTddLane | null;
  langSmithTrace: LangSmithTraceReference | null;
  runtimeAssist: RuntimeAssistSummary;
}

interface ResolvedTechnicalSpecSelection {
  selection: TddSelection;
  artifactRecord: ArtifactRecord<ArtifactContent>;
  technicalSpec: TechnicalSpecRecord;
}

interface StageRunCapture {
  editedPaths: string[];
  result: InstructionTurnResult;
}

interface TddStartOptions {
  requestPropertyCheck: boolean;
  requestMutationCheck: boolean;
  storyId?: string;
  specId?: string;
  artifact?: ArtifactLocator;
}

function createEmptyRuntimeAssistState(): RuntimeAssistSummary {
  return {
    activeProfileId: null,
    activeProfileName: null,
    activeProfileRoute: null,
    loadedSkills: [],
  };
}

function snapshotRuntimeAssistState(
  sessionState: SessionState,
): RuntimeAssistSummary {
  return sessionState.workbenchState.runtimeAssist ?? createEmptyRuntimeAssistState();
}

function syncTddWorkbenchState(
  sessionState: SessionState,
  lane: PersistedTddLane | null,
): void {
  sessionState.workbenchState = {
    ...sessionState.workbenchState,
    tddState: lane
      ? createTddWorkbenchState(lane)
      : createIdleTddWorkbenchState(),
  };
}

function updateTddWorkbenchSummary(
  sessionState: SessionState,
  summary: string,
): void {
  const tddState = sessionState.workbenchState.tddState ?? createIdleTddWorkbenchState();
  sessionState.workbenchState = {
    ...sessionState.workbenchState,
    tddState: {
      ...tddState,
      summary,
    },
  };
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))];
}

function isTestLikePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");

  return /(^|\/)(test|tests|__tests__)($|\/)/u.test(normalized)
    || /\.(test|spec)\.[^/]+$/u.test(normalized);
}

function createAuditEntry(
  kind: TddAuditKind,
  message: string,
  options: {
    stage?: TddStage | null;
    artifact?: ArtifactLocator | null;
    at?: string;
  } = {},
): TddAuditEntry {
  return {
    id: `tdd-audit-${nanoid(8)}`,
    at: options.at ?? new Date().toISOString(),
    kind,
    stage: options.stage ?? null,
    message,
    artifact: options.artifact ?? null,
  };
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

function createMessageOnlySummary(
  state: SessionState,
  runtimeState: InstructionRuntimeState,
  instruction: string,
  status: "success" | "error" | "cancelled",
  message: string,
): string {
  state.turnCount += 1;
  state.lastActiveAt = new Date().toISOString();
  const executionStatus = status === "success"
    ? "done"
    : status === "cancelled"
      ? "cancelled"
      : "failed";
  const summary = createExecutionTurnSummary(
    state.turnCount,
    runtimeState.runtimeMode,
    executionStatus,
    message,
  );

  state.rollingSummary = updateRollingSummary(
    state.rollingSummary,
    state.turnCount,
    instruction,
    summary,
  );

  return summary;
}

async function createMessageOnlyResult(
  options: ExecuteTddTurnOptions & {
    command: TddCommand["type"];
    status: "success" | "error" | "cancelled";
    message: string;
    lane: PersistedTddLane | null;
  },
): Promise<TddTurnResult> {
  const summary = createMessageOnlySummary(
    options.sessionState,
    options.runtimeState,
    options.instruction,
    options.status,
    options.message,
  );
  syncTddWorkbenchState(options.sessionState, options.lane);

  await options.reporter?.onText?.(options.message);

  if (options.status === "error") {
    await options.reporter?.onError?.(options.message);
  }

  await options.reporter?.onDone?.({
    status: options.status,
    summary: options.message,
    langSmithTrace: null,
  });
  await saveSessionState(options.sessionState);

  return {
    command: options.command,
    status: options.status,
    summary,
    finalText: options.message,
    lane: options.lane,
    langSmithTrace: null,
    runtimeAssist: snapshotRuntimeAssistState(options.sessionState),
  };
}

function createStageInstruction(
  stage: TddStage,
  selection: ResolvedTechnicalSpecSelection,
  lane: PersistedTddLane,
): string {
  const spec = selection.technicalSpec;
  const lines = [
    `Approved story: ${selection.selection.storyId ?? spec.storyId}`,
    `Approved spec: ${selection.selection.specId ?? spec.id}`,
    `Spec artifact: ${formatArtifactLocator(selection.selection.artifact)}`,
    `Focused validation command: ${lane.focusedValidationCommand}`,
    `Overview: ${spec.overview}`,
  ];

  if (stage === "test-author") {
    return [
      "TDD stage: test-author",
      ...lines,
      `Test expectations: ${spec.testExpectations.join("; ") || "Use the approved spec as the source of truth."}`,
      "Write the narrowest failing contract that proves the approved spec.",
      "Only create or modify test files in this stage.",
      "Do not change implementation files or weaken existing assertions.",
      "Leave the focused validation command red when you finish.",
    ].join("\n");
  }

  return [
    "TDD stage: implementer",
    ...lines,
    `Immutable test files: ${lane.immutableTestPaths.join(", ") || "(none recorded)"}`,
    `Implementation order: ${spec.implementationOrder.join("; ") || "Use the approved spec order."}`,
    "Make the focused validation command green without modifying the immutable test files.",
    "Implementation changes should stay within the approved spec and avoid unrelated edits.",
  ].join("\n");
}

function createTestAuthorPhase(): Phase {
  const basePhase = createCodePhase();

  return {
    ...basePhase,
    description: "TDD test-author execution lane.",
    systemPrompt: [
      basePhase.systemPrompt,
      "TDD stage rules:",
      "- You are the test author.",
      "- Produce only the narrowest failing tests needed for the approved spec.",
      "- Do not edit implementation code in this stage.",
      "- Prefer small, reviewable diffs in test files only.",
    ].join("\n\n"),
    tools: [...TEST_AUTHOR_TOOLS],
    agentProfileId: "test-author",
  };
}

function createImplementerPhase(): Phase {
  const basePhase = createCodePhase();

  return {
    ...basePhase,
    description: "TDD implementer execution lane.",
    systemPrompt: [
      basePhase.systemPrompt,
      "TDD stage rules:",
      "- You are the implementer.",
      "- Treat the immutable test-author outputs as read-only contracts.",
      "- Make the focused validation command green without editing those tests.",
      "- Keep diffs narrow and aligned to the approved spec.",
    ].join("\n\n"),
    tools: [...IMPLEMENTER_TOOLS],
    agentProfileId: "implementer",
  };
}

function createStageAuditMessage(
  stage: TddStage,
  laneId: string,
): string {
  return `TDD lane ${laneId} entered ${stage}.`;
}

function parseArtifactLocator(rawValue: string): ArtifactLocator {
  const trimmed = rawValue.trim();
  const match = trimmed.match(
    /^(?<type>[^/@:]+(?:[-_./][^/@:]+)*)[/:](?<id>[^@]+)@(?<version>\d+)$/u,
  );

  if (!match?.groups) {
    throw new Error(
      `Invalid --artifact value "${trimmed}". Expected "type/id@version".`,
    );
  }

  const type = match.groups.type;
  const id = match.groups.id;
  const version = match.groups.version;

  if (!type || !id || !version) {
    throw new Error(
      `Invalid --artifact value "${trimmed}". Expected "type/id@version".`,
    );
  }

  return {
    type,
    id,
    version: Number.parseInt(version, 10),
  };
}

export function isTddInstruction(instruction: string): boolean {
  return TDD_PREFIX.test(instruction.trim());
}

export function parseTddCommand(instruction: string): TddCommand | null {
  const trimmed = instruction.trim();

  if (!TDD_PREFIX.test(trimmed)) {
    return null;
  }

  if (TDD_STATUS_PREFIX.test(trimmed)) {
    return { type: "status" };
  }

  if (TDD_CONTINUE_PREFIX.test(trimmed)) {
    return { type: "continue" };
  }

  if (!TDD_START_PREFIX.test(trimmed)) {
    throw new Error(
      "TDD commands must use `tdd start`, `tdd continue`, or `tdd status`.",
    );
  }

  const payload = trimmed.replace(TDD_START_PREFIX, "").trim();

  if (!payload) {
    throw new Error("TDD start commands require a focused validation command.");
  }

  const tokens = payload.split(/\s+/u);
  let cursor = 0;
  let requestPropertyCheck = false;
  let requestMutationCheck = false;
  let storyId: string | undefined;
  let specId: string | undefined;
  let artifact: ArtifactLocator | undefined;

  while (cursor < tokens.length) {
    const token = tokens[cursor];

    if (token === "--property") {
      requestPropertyCheck = true;
      cursor += 1;
      continue;
    }

    if (token === "--mutation") {
      requestMutationCheck = true;
      cursor += 1;
      continue;
    }

    if (token === "--story") {
      storyId = tokens[cursor + 1]?.trim();

      if (!storyId) {
        throw new Error("`--story` requires a story id.");
      }

      cursor += 2;
      continue;
    }

    if (token === "--spec") {
      specId = tokens[cursor + 1]?.trim();

      if (!specId) {
        throw new Error("`--spec` requires a spec id.");
      }

      cursor += 2;
      continue;
    }

    if (token === "--artifact") {
      const rawArtifact = tokens[cursor + 1]?.trim();

      if (!rawArtifact) {
        throw new Error("`--artifact` requires a locator.");
      }

      artifact = parseArtifactLocator(rawArtifact);
      cursor += 2;
      continue;
    }

    break;
  }

  const validationCommand = tokens.slice(cursor).join(" ").trim();

  if (!validationCommand) {
    throw new Error(
      "TDD start commands require a focused validation command after any flags.",
    );
  }

  return {
    type: "start",
    validationCommand,
    requestPropertyCheck,
    requestMutationCheck,
    storyId,
    specId,
    artifact,
  };
}

function isTechnicalSpecArtifactContent(
  value: ArtifactContent | undefined,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Array.isArray((value as Partial<TechnicalSpecArtifact>).specs);
}

async function loadArtifactRecordContent(
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

async function resolveTechnicalSpecSelection(
  targetDirectory: string,
  options: TddStartOptions,
): Promise<ResolvedTechnicalSpecSelection> {
  const approvedRecords = options.artifact
    ? [await loadArtifactRecordContent(targetDirectory, options.artifact)]
    : (
        await queryArtifacts(targetDirectory, {
          type: "technical-spec-artifact",
          status: "approved",
          includeContent: true,
          latestOnly: true,
        })
      ).records as ArtifactRecord<ArtifactContent>[];

  for (const record of approvedRecords) {
    if (record.metadata.type !== "technical-spec-artifact") {
      continue;
    }

    if (record.metadata.status !== "approved") {
      continue;
    }

    if (!isTechnicalSpecArtifactContent(record.content)) {
      continue;
    }

    const content = record.content as unknown as TechnicalSpecArtifact;
    const matchingSpec = content.specs.find((spec) => {
      if (options.specId && spec.id !== options.specId) {
        return false;
      }

      if (options.storyId && spec.storyId !== options.storyId) {
        return false;
      }

      return true;
    }) ?? null;

    if (!matchingSpec) {
      continue;
    }

    return {
      selection: {
        artifact: {
          type: record.metadata.type,
          id: record.metadata.id,
          version: record.metadata.version,
        },
        storyId: matchingSpec.storyId,
        specId: matchingSpec.id,
      },
      artifactRecord: record,
      technicalSpec: matchingSpec,
    };
  }

  const requestedRef = options.specId
    ? `spec ${options.specId}`
    : options.storyId
      ? `story ${options.storyId}`
      : options.artifact
        ? formatArtifactLocator(options.artifact)
        : "an approved technical spec";

  throw new Error(`No approved technical spec is available for ${requestedRef}.`);
}

async function resolveActiveLane(
  sessionState: SessionState,
): Promise<PersistedTddLane | null> {
  const explicitLaneId = sessionState.activeTddLaneId;

  if (explicitLaneId) {
    const explicitLane = await loadTddLane(
      sessionState.targetDirectory,
      explicitLaneId,
    );

    if (explicitLane) {
      return explicitLane;
    }
  }

  return (await listTddLanes(sessionState.targetDirectory))[0] ?? null;
}

async function persistLane(
  sessionState: SessionState,
  lane: PersistedTddLane,
): Promise<PersistedTddLane> {
  const persisted = await saveTddLane(sessionState.targetDirectory, lane);
  sessionState.activeTddLaneId = persisted.laneId;
  syncTddWorkbenchState(sessionState, persisted);
  await saveSessionState(sessionState);
  return persisted;
}

function createValidationSummary(
  stage: TddStage,
  observedOutcome: TddValidationObservedOutcome,
  command: string,
): string {
  switch (observedOutcome) {
    case "red":
      return `Focused validation stayed red for ${stage} via \`${command}\`.`;
    case "green":
      return `Focused validation is green for ${stage} via \`${command}\`.`;
    case "already-green":
      return `Focused validation was already green before implementation via \`${command}\`.`;
    default:
      return `Focused validation was blocked for ${stage} via \`${command}\`.`;
  }
}

async function runValidation(
  options: ExecuteTddTurnOptions,
  lane: PersistedTddLane,
  stage: TddStage,
  command: string,
): Promise<TddValidationCommandResult> {
  if (options.runValidationCommand) {
    return options.runValidationCommand({
      targetDirectory: options.sessionState.targetDirectory,
      lane,
      command,
      stage,
      signal: options.signal,
    });
  }

  const result = await executeProcess({
    cwd: options.sessionState.targetDirectory,
    command,
    shell: true,
    timeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
    signal: options.signal,
    displayCommand: command,
  });

  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    signal: result.signal,
  };
}

function normalizeOptionalCheckResult(
  kind: TddOptionalCheckKind,
  result: TddValidationCommandResult | null,
  error: Error | null,
): TddOptionalCheckRecord {
  if (!result && error) {
    return createOptionalCheckRecord({
      kind,
      command: null,
      status: "blocked",
      exitCode: null,
      summary: truncateText(error.message, 200),
    });
  }

  if (!result) {
    return createOptionalCheckRecord({
      kind,
      command: null,
      status: "skipped",
      exitCode: null,
      summary: `${kind} checks are unavailable because no adapter is configured.`,
    });
  }

  return createOptionalCheckRecord({
    kind,
    command: result.command,
    status: result.exitCode === 0 ? "passed" : "blocked",
    exitCode: result.exitCode,
    summary:
      result.exitCode === 0
        ? `${kind} checks passed.`
        : `${kind} checks reported blocking failures.`,
  });
}

async function runOptionalChecks(
  options: ExecuteTddTurnOptions,
  lane: PersistedTddLane,
): Promise<TddOptionalCheckRecord[]> {
  const checks: TddOptionalCheckRecord[] = [];
  const scripts = options.sessionState.discovery.scripts;

  const entries: Array<{
    enabled: boolean;
    kind: TddOptionalCheckKind;
    command: string | null;
  }> = [
    {
      enabled: lane.requestPropertyCheck,
      kind: "property",
      command: scripts["test:property"] ?? null,
    },
    {
      enabled: lane.requestMutationCheck,
      kind: "mutation",
      command: scripts["test:mutation"] ?? null,
    },
  ];

  for (const entry of entries) {
    if (!entry.enabled) {
      continue;
    }

    if (!entry.command) {
      checks.push(
        createOptionalCheckRecord({
          kind: entry.kind,
          command: null,
          status: "skipped",
          exitCode: null,
          summary:
            `No ${entry.kind} adapter is configured. Add discovery script ` +
            `\`test:${entry.kind}\` to enable it.`,
        }),
      );
      continue;
    }

    try {
      const result = await runValidation(
        options,
        lane,
        "implementer",
        entry.command,
      );
      checks.push(normalizeOptionalCheckResult(entry.kind, result, null));
    } catch (error) {
      checks.push(
        normalizeOptionalCheckResult(
          entry.kind,
          null,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }

  return checks;
}

function wrapStageReporter(
  reporter: InstructionTurnReporter | undefined,
  editedPaths: string[],
): InstructionTurnReporter {
  return {
    ...reporter,
    async onEdit(event) {
      editedPaths.push(event.path);
      await reporter?.onEdit?.(event);
    },
  };
}

async function executeStageTurn(
  options: ExecuteTddTurnOptions,
  lane: PersistedTddLane,
  selection: ResolvedTechnicalSpecSelection,
  stage: "test-author" | "implementer",
): Promise<StageRunCapture> {
  const executeTurn = options.executeTurn ?? executeInstructionTurn;
  const editedPaths: string[] = [];
  const stageInstruction = createStageInstruction(stage, selection, lane);
  const phaseOverride = stage === "test-author"
    ? createTestAuthorPhase()
    : createImplementerPhase();
  const stageReporter = wrapStageReporter(options.reporter, editedPaths);

  await options.reporter?.onThinking?.(
    `${stage === "test-author" ? "Authoring" : "Implementing"} TDD lane ${lane.laneId} for ${selection.selection.specId ?? selection.technicalSpec.id}.`,
  );

  const result = await executeTurn({
    sessionState: options.sessionState,
    runtimeState: options.runtimeState,
    instruction: stageInstruction,
    injectedContext: [
      `TDD lane: ${lane.laneId}`,
      `Story id: ${selection.selection.storyId ?? selection.technicalSpec.storyId}`,
      `Spec id: ${selection.selection.specId ?? selection.technicalSpec.id}`,
      `Validation command: ${lane.focusedValidationCommand}`,
      `Immutable tests: ${lane.immutableTestPaths.join(", ") || "(none yet)"}`,
    ],
    reporter: stageReporter,
    signal: options.signal,
    runtimeSurface: options.runtimeSurface,
    phaseOverride,
  });

  return {
    editedPaths: uniqueStrings(editedPaths),
    result,
  };
}

function mapTurnStatusToLaneStatus(
  status: InstructionTurnResult["status"],
): PersistedTddLane["status"] {
  switch (status) {
    case "success":
      return "running";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

function createTddArtifactTags(
  lane: PersistedTddLane,
): string[] {
  return uniqueStrings([
    "tdd",
    lane.currentStage,
    lane.selection.storyId ? `story:${lane.selection.storyId}` : "",
    lane.selection.specId ? `spec:${lane.selection.specId}` : "",
  ]);
}

function createTddArtifactDependsOn(
  lane: PersistedTddLane,
): string[] {
  return [
    formatArtifactLocator(lane.selection.artifact) ?? "",
  ].filter(Boolean);
}

async function saveTddHandoffArtifact(
  sessionState: SessionState,
  lane: PersistedTddLane,
  content: TddHandoffArtifact,
): Promise<ArtifactLocator> {
  const record = await saveArtifact(sessionState.targetDirectory, {
    type: "tdd-handoff",
    id: lane.laneId,
    parentId: lane.selection.artifact.id,
    status: "generated",
    producedBy: lane.currentStage,
    tags: createTddArtifactTags(lane),
    dependsOn: createTddArtifactDependsOn(lane),
    contentKind: "json",
    content: content as unknown as ArtifactContent,
    title: `TDD ${lane.currentStage} handoff`,
    summary: content.summary,
  });

  return {
    type: record.metadata.type,
    id: record.metadata.id,
    version: record.metadata.version,
  };
}

async function saveTddEscalationArtifact(
  sessionState: SessionState,
  lane: PersistedTddLane,
  content: TddEscalationArtifact,
): Promise<ArtifactLocator> {
  const record = await saveArtifact(sessionState.targetDirectory, {
    type: "tdd-escalation",
    id: lane.laneId,
    parentId: lane.selection.artifact.id,
    status: "generated",
    producedBy: lane.currentStage,
    tags: createTddArtifactTags(lane),
    dependsOn: createTddArtifactDependsOn(lane),
    contentKind: "json",
    content: content as unknown as ArtifactContent,
    title: `TDD ${lane.currentStage} escalation`,
    summary: content.summary,
  });

  return {
    type: record.metadata.type,
    id: record.metadata.id,
    version: record.metadata.version,
  };
}

async function saveTddQualityArtifact(
  sessionState: SessionState,
  lane: PersistedTddLane,
  content: TddQualityReportArtifact,
): Promise<ArtifactLocator> {
  const record = await saveArtifact(sessionState.targetDirectory, {
    type: "tdd-quality-report",
    id: lane.laneId,
    parentId: lane.selection.artifact.id,
    status: "generated",
    producedBy: "reviewer",
    tags: createTddArtifactTags(lane),
    dependsOn: createTddArtifactDependsOn(lane),
    contentKind: "json",
    content: content as unknown as ArtifactContent,
    title: "TDD reviewer quality report",
    summary: content.summary,
  });

  return {
    type: record.metadata.type,
    id: record.metadata.id,
    version: record.metadata.version,
  };
}

async function handleStart(
  options: ExecuteTddTurnOptions,
  command: Extract<TddCommand, { type: "start" }>,
): Promise<TddTurnResult> {
  const selection = await resolveTechnicalSpecSelection(
    options.sessionState.targetDirectory,
    command,
  );
  const now = new Date().toISOString();
  const laneId = `tdd-${nanoid(10)}`;
  let lane: PersistedTddLane = {
    version: TDD_LANE_VERSION,
    laneId,
    status: "running",
    currentStage: "test-author",
    createdAt: now,
    updatedAt: now,
    startedBy: "operator",
    focusedValidationCommand: command.validationCommand,
    selection: selection.selection,
    requestPropertyCheck: command.requestPropertyCheck,
    requestMutationCheck: command.requestMutationCheck,
    immutableTestPaths: [],
    implementationPaths: [],
    stageAttempts: createEmptyTddStageAttempts(),
    focusedValidation: null,
    optionalChecks: [],
    latestHandoffArtifact: null,
    latestEscalationArtifact: null,
    latestQualityArtifact: null,
    lastSummary:
      `Started TDD lane ${laneId} for ${selection.selection.specId ?? selection.technicalSpec.id}.`,
    auditTrail: [
      createAuditEntry(
        "lane-started",
        `Started TDD lane ${laneId}.`,
        { at: now },
      ),
      createAuditEntry(
        "stage-started",
        createStageAuditMessage("test-author", laneId),
        {
          at: now,
          stage: "test-author",
        },
      ),
    ],
  };
  lane = await persistLane(options.sessionState, lane);

  const stageRun = await executeStageTurn(
    options,
    lane,
    selection,
    "test-author",
  );

  if (stageRun.result.status !== "success") {
    lane = {
      ...lane,
      status: mapTurnStatusToLaneStatus(stageRun.result.status),
      updatedAt: new Date().toISOString(),
      lastSummary: stageRun.result.summary,
    };
    lane = await persistLane(options.sessionState, lane);

    return {
      command: "start",
      status: stageRun.result.status,
      summary: stageRun.result.summary,
      finalText: stageRun.result.finalText,
      lane,
      langSmithTrace: stageRun.result.langSmithTrace,
      runtimeAssist: stageRun.result.runtimeAssist,
    };
  }

  lane = {
    ...lane,
    stageAttempts: {
      ...lane.stageAttempts,
      testAuthor: lane.stageAttempts.testAuthor + 1,
    },
    updatedAt: new Date().toISOString(),
  };
  const validationResult = await runValidation(
    options,
    lane,
    "test-author",
    lane.focusedValidationCommand,
  );
  const observedOutcome: TddValidationObservedOutcome =
    validationResult.exitCode === 0
      ? "already-green"
      : validationResult.timedOut
        ? "blocked"
        : "red";
  const validation = createTddValidationRecord({
    command: validationResult.command,
    expectedOutcome: "red",
    observedOutcome,
    exitCode: validationResult.exitCode,
    stdout: validationResult.stdout,
    stderr: validationResult.stderr,
    timedOut: validationResult.timedOut,
    signal: validationResult.signal,
    summary: createValidationSummary(
      "test-author",
      observedOutcome,
      validationResult.command,
    ),
  });
  lane.focusedValidation = validation;
  lane.auditTrail.push(
    createAuditEntry(
      "validation-recorded",
      validation.summary,
      {
        stage: "test-author",
      },
    ),
  );

  const immutableTestPaths = uniqueStrings(
    stageRun.editedPaths.filter(isTestLikePath),
  );
  lane.immutableTestPaths = immutableTestPaths;

  const handoffArtifact = await saveTddHandoffArtifact(
    options.sessionState,
    lane,
    {
      laneId: lane.laneId,
      stage: "test-author",
      stageAttempt: lane.stageAttempts.testAuthor,
      summary: observedOutcome === "red"
        ? "Test-author stage established a red contract."
        : "Test-author stage produced a contract that was already green.",
      finalText: stageRun.result.finalText,
      immutableTestPaths,
      editedPaths: stageRun.editedPaths,
      validation,
      nextStage: observedOutcome === "red" ? "implementer" : null,
      optionalChecks: [],
    },
  );
  lane.latestHandoffArtifact = handoffArtifact;
  lane.auditTrail.push(
    createAuditEntry(
      "handoff-recorded",
      `Recorded test-author handoff ${formatArtifactLocator(handoffArtifact)}.`,
      {
        stage: "test-author",
        artifact: handoffArtifact,
      },
    ),
  );

  if (observedOutcome === "already-green") {
    const escalationSummary =
      "Focused validation was already green. Review the contract before implementation continues.";
    const escalationArtifact = await saveTddEscalationArtifact(
      options.sessionState,
      lane,
      {
        laneId: lane.laneId,
        stage: "test-author",
        reason: "already-green-contract",
        summary: escalationSummary,
        immutableTestPaths,
        offendingPaths: stageRun.editedPaths,
        validation,
      },
    );
    lane = {
      ...lane,
      status: "blocked",
      updatedAt: new Date().toISOString(),
      lastSummary: escalationSummary,
      latestEscalationArtifact: escalationArtifact,
    };
    lane.auditTrail.push(
      createAuditEntry(
        "escalation-recorded",
        `Recorded test-author escalation ${formatArtifactLocator(escalationArtifact)}.`,
        {
          stage: "test-author",
          artifact: escalationArtifact,
        },
      ),
      createAuditEntry(
        "lane-blocked",
        escalationSummary,
        {
          stage: "test-author",
          artifact: escalationArtifact,
        },
      ),
    );
  } else {
    lane = {
      ...lane,
      status: "running",
      currentStage: "implementer",
      updatedAt: new Date().toISOString(),
      lastSummary:
        `RED confirmed for ${selection.selection.specId ?? selection.technicalSpec.id}. Implementer may continue.`,
    };
    lane.auditTrail.push(
      createAuditEntry(
        "stage-started",
        createStageAuditMessage("implementer", lane.laneId),
        {
          stage: "implementer",
        },
      ),
    );
  }

  lane = await persistLane(options.sessionState, lane);

  return {
    command: "start",
    status: "success",
    summary: lane.lastSummary,
    finalText: lane.lastSummary,
    lane,
    langSmithTrace: stageRun.result.langSmithTrace,
    runtimeAssist: stageRun.result.runtimeAssist,
  };
}

async function handleContinueImplementer(
  options: ExecuteTddTurnOptions,
  lane: PersistedTddLane,
  selection: ResolvedTechnicalSpecSelection,
): Promise<TddTurnResult> {
  const stageRun = await executeStageTurn(
    options,
    lane,
    selection,
    "implementer",
  );

  if (stageRun.result.status !== "success") {
    lane = {
      ...lane,
      status: mapTurnStatusToLaneStatus(stageRun.result.status),
      updatedAt: new Date().toISOString(),
      lastSummary: stageRun.result.summary,
      stageAttempts: {
        ...lane.stageAttempts,
        implementer: lane.stageAttempts.implementer + 1,
      },
    };
    lane = await persistLane(options.sessionState, lane);

    return {
      command: "continue",
      status: stageRun.result.status,
      summary: stageRun.result.summary,
      finalText: stageRun.result.finalText,
      lane,
      langSmithTrace: stageRun.result.langSmithTrace,
      runtimeAssist: stageRun.result.runtimeAssist,
    };
  }

  lane = {
    ...lane,
    stageAttempts: {
      ...lane.stageAttempts,
      implementer: lane.stageAttempts.implementer + 1,
    },
    updatedAt: new Date().toISOString(),
    implementationPaths: uniqueStrings([
      ...lane.implementationPaths,
      ...stageRun.editedPaths,
    ]),
  };

  const offendingPaths = stageRun.editedPaths.filter((editedPath) =>
    lane.immutableTestPaths.includes(editedPath)
  );

  if (offendingPaths.length > 0) {
    const escalationSummary =
      "Implementer attempted to modify immutable test-author artifacts.";
    const escalationArtifact = await saveTddEscalationArtifact(
      options.sessionState,
      lane,
      {
        laneId: lane.laneId,
        stage: "implementer",
        reason: "immutable-test-artifact-modified",
        summary: escalationSummary,
        immutableTestPaths: lane.immutableTestPaths,
        offendingPaths,
        validation: lane.focusedValidation,
      },
    );
    lane = {
      ...lane,
      status: "blocked",
      updatedAt: new Date().toISOString(),
      lastSummary: escalationSummary,
      latestEscalationArtifact: escalationArtifact,
    };
    lane.auditTrail.push(
      createAuditEntry(
        "escalation-recorded",
        `Recorded implementer escalation ${formatArtifactLocator(escalationArtifact)}.`,
        {
          stage: "implementer",
          artifact: escalationArtifact,
        },
      ),
      createAuditEntry(
        "lane-blocked",
        escalationSummary,
        {
          stage: "implementer",
          artifact: escalationArtifact,
        },
      ),
    );
    lane = await persistLane(options.sessionState, lane);

    return {
      command: "continue",
      status: "success",
      summary: lane.lastSummary,
      finalText: lane.lastSummary,
      lane,
      langSmithTrace: stageRun.result.langSmithTrace,
      runtimeAssist: stageRun.result.runtimeAssist,
    };
  }

  const validationResult = await runValidation(
    options,
    lane,
    "implementer",
    lane.focusedValidationCommand,
  );
  const observedOutcome: TddValidationObservedOutcome =
    validationResult.exitCode === 0
      ? "green"
      : validationResult.timedOut
        ? "blocked"
        : "red";
  const validation = createTddValidationRecord({
    command: validationResult.command,
    expectedOutcome: "green",
    observedOutcome,
    exitCode: validationResult.exitCode,
    stdout: validationResult.stdout,
    stderr: validationResult.stderr,
    timedOut: validationResult.timedOut,
    signal: validationResult.signal,
    summary: createValidationSummary(
      "implementer",
      observedOutcome,
      validationResult.command,
    ),
  });
  lane.focusedValidation = validation;
  lane.auditTrail.push(
    createAuditEntry(
      "validation-recorded",
      validation.summary,
      {
        stage: "implementer",
      },
    ),
  );

  if (observedOutcome !== "green") {
    lane = {
      ...lane,
      status: "blocked",
      updatedAt: new Date().toISOString(),
      lastSummary:
        "Focused validation is not green yet. Keep the implementer lane narrow and retry.",
    };
    lane.auditTrail.push(
      createAuditEntry(
        "lane-blocked",
        lane.lastSummary,
        {
          stage: "implementer",
        },
      ),
    );
    lane = await persistLane(options.sessionState, lane);

    return {
      command: "continue",
      status: "success",
      summary: lane.lastSummary,
      finalText: lane.lastSummary,
      lane,
      langSmithTrace: stageRun.result.langSmithTrace,
      runtimeAssist: stageRun.result.runtimeAssist,
    };
  }

  const optionalChecks = await runOptionalChecks(options, lane);
  lane.optionalChecks = optionalChecks;

  for (const check of optionalChecks) {
    lane.auditTrail.push(
      createAuditEntry(
        "optional-check-recorded",
        `${check.kind} ${check.status}`,
        {
          stage: "implementer",
        },
      ),
    );
  }

  const handoffArtifact = await saveTddHandoffArtifact(
    options.sessionState,
    lane,
    {
      laneId: lane.laneId,
      stage: "implementer",
      stageAttempt: lane.stageAttempts.implementer,
      summary: "Implementer stage turned the focused validation green.",
      finalText: stageRun.result.finalText,
      immutableTestPaths: lane.immutableTestPaths,
      editedPaths: stageRun.editedPaths,
      validation,
      nextStage: "reviewer",
      optionalChecks,
    },
  );
  lane.latestHandoffArtifact = handoffArtifact;
  lane.currentStage = "reviewer";
  lane.status = "running";
  lane.updatedAt = new Date().toISOString();
  lane.lastSummary =
    "GREEN confirmed. Reviewer can emit the quality report.";
  lane.auditTrail.push(
    createAuditEntry(
      "handoff-recorded",
      `Recorded implementer handoff ${formatArtifactLocator(handoffArtifact)}.`,
      {
        stage: "implementer",
        artifact: handoffArtifact,
      },
    ),
    createAuditEntry(
      "stage-started",
      createStageAuditMessage("reviewer", lane.laneId),
      {
        stage: "reviewer",
      },
    ),
  );
  lane = await persistLane(options.sessionState, lane);

  return {
    command: "continue",
    status: "success",
    summary: lane.lastSummary,
    finalText: lane.lastSummary,
    lane,
    langSmithTrace: stageRun.result.langSmithTrace,
    runtimeAssist: stageRun.result.runtimeAssist,
  };
}

function createReviewerFindings(lane: PersistedTddLane): TddQualityFinding[] {
  const findings: TddQualityFinding[] = [];

  for (const check of lane.optionalChecks) {
    if (check.status === "blocked") {
      findings.push({
        severity: "warning",
        message: `${check.kind} checks are still blocked: ${check.summary}`,
      });
    } else if (check.status === "skipped") {
      findings.push({
        severity: "info",
        message: `${check.kind} checks were skipped: ${check.summary}`,
      });
    }
  }

  if (lane.implementationPaths.length === 0) {
    findings.push({
      severity: "warning",
      message:
        "Reviewer did not see any implementation paths. Confirm the lane actually changed code.",
    });
  }

  return findings;
}

function createMissingTestRecommendations(
  lane: PersistedTddLane,
): string[] {
  const recommendations: string[] = [];

  if (lane.requestPropertyCheck && !lane.optionalChecks.some((check) =>
    check.kind === "property" && check.status === "passed"
  )) {
    recommendations.push("Follow up on property-based coverage for this story.");
  }

  if (lane.requestMutationCheck && !lane.optionalChecks.some((check) =>
    check.kind === "mutation" && check.status === "passed"
  )) {
    recommendations.push("Follow up on mutation coverage for this story.");
  }

  return recommendations;
}

async function handleContinueReviewer(
  options: ExecuteTddTurnOptions,
  lane: PersistedTddLane,
): Promise<TddTurnResult> {
  await emitTurnState(options.reporter, options.sessionState, "agent-busy");

  const findings = createReviewerFindings(lane);
  const report: TddQualityReportArtifact = {
    laneId: lane.laneId,
    stage: "reviewer",
    summary: "Reviewer published the TDD quality report.",
    focusedValidation: lane.focusedValidation,
    optionalChecks: lane.optionalChecks,
    immutableTestPaths: lane.immutableTestPaths,
    implementationPaths: lane.implementationPaths,
    missingTestRecommendations: createMissingTestRecommendations(lane),
    findings,
  };
  const qualityArtifact = await saveTddQualityArtifact(
    options.sessionState,
    lane,
    report,
  );
  lane = {
    ...lane,
    status: "completed",
    updatedAt: new Date().toISOString(),
    latestQualityArtifact: qualityArtifact,
    lastSummary: buildQualitySummary(report),
  };
  lane.auditTrail.push(
    createAuditEntry(
      "quality-recorded",
      `Recorded reviewer quality report ${formatArtifactLocator(qualityArtifact)}.`,
      {
        stage: "reviewer",
        artifact: qualityArtifact,
      },
    ),
    createAuditEntry(
      "lane-completed",
      lane.lastSummary,
      {
        stage: "reviewer",
        artifact: qualityArtifact,
      },
    ),
  );
  lane = await persistLane(options.sessionState, lane);
  const finalText = `TDD lane ${lane.laneId} completed. ${lane.lastSummary}`;
  const summary = createMessageOnlySummary(
    options.sessionState,
    options.runtimeState,
    options.instruction,
    "success",
    finalText,
  );

  await options.reporter?.onText?.(finalText);
  await options.reporter?.onDone?.({
    status: "success",
    summary: finalText,
    langSmithTrace: null,
  });
  await emitTurnState(options.reporter, options.sessionState, "ready");
  await saveSessionState(options.sessionState);

  return {
    command: "continue",
    status: "success",
    summary,
    finalText,
    lane,
    langSmithTrace: null,
    runtimeAssist: snapshotRuntimeAssistState(options.sessionState),
  };
}

async function handleContinue(
  options: ExecuteTddTurnOptions,
): Promise<TddTurnResult> {
  const lane = await resolveActiveLane(options.sessionState);

  if (!lane) {
    return createMessageOnlyResult({
      ...options,
      command: "continue",
      status: "error",
      message:
        "No active TDD lane is available. Start one with `tdd start <focused validation command>`.",
      lane: null,
    });
  }

  if (
    lane.status === "completed"
    || lane.status === "cancelled"
    || lane.status === "failed"
  ) {
    return createMessageOnlyResult({
      ...options,
      command: "continue",
      status: "error",
      message:
        `TDD lane ${lane.laneId} is ${lane.status}. Start a new lane to continue working.`,
      lane,
    });
  }

  if (lane.currentStage === "reviewer") {
    return handleContinueReviewer(options, lane);
  }

  if (lane.currentStage === "test-author") {
    return createMessageOnlyResult({
      ...options,
      command: "continue",
      status: "error",
      message:
        `TDD lane ${lane.laneId} is still blocked in test-author. Review the contract or start a new lane before continuing.`,
      lane,
    });
  }

  const selection = await resolveTechnicalSpecSelection(
    options.sessionState.targetDirectory,
    {
      artifact: lane.selection.artifact,
      storyId: lane.selection.storyId ?? undefined,
      specId: lane.selection.specId ?? undefined,
      requestPropertyCheck: lane.requestPropertyCheck,
      requestMutationCheck: lane.requestMutationCheck,
    },
  );

  return handleContinueImplementer(options, lane, selection);
}

async function handleStatus(
  options: ExecuteTddTurnOptions,
): Promise<TddTurnResult> {
  const lane = await resolveActiveLane(options.sessionState);

  if (!lane) {
    return createMessageOnlyResult({
      ...options,
      command: "status",
      status: "success",
      message: "No active TDD lane.",
      lane: null,
    });
  }

  const summary = [
    `TDD lane ${lane.laneId}`,
    `status=${lane.status}`,
    `stage=${lane.currentStage}`,
    `spec=${lane.selection.specId ?? "unknown"}`,
    `story=${lane.selection.storyId ?? "unknown"}`,
  ].join(" ");

  return createMessageOnlyResult({
    ...options,
    command: "status",
    status: "success",
    message: summary,
    lane,
  });
}

async function runCoreTddCommand(
  options: ExecuteTddTurnOptions,
  command: TddCommand,
): Promise<TddTurnResult> {
  switch (command.type) {
    case "start":
      return handleStart(options, command);
    case "continue":
      return handleContinue(options);
    case "status":
      return handleStatus(options);
    default:
      return createMessageOnlyResult({
        ...options,
        command: "status",
        status: "error",
        message: `Unsupported TDD command: ${(command as { type: string }).type}`,
        lane: null,
      });
  }
}

export async function executeTddTurn(
  options: ExecuteTddTurnOptions,
): Promise<TddTurnResult> {
  let command: TddCommand;

  try {
    const parsedCommand = parseTddCommand(options.instruction);

    if (!parsedCommand) {
      throw new Error(
        `TDD runtime expected a \`tdd ...\` instruction, received: ${options.instruction}`,
      );
    }

    command = parsedCommand;
  } catch (error) {
    return createMessageOnlyResult({
      ...options,
      command: "status",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      lane: null,
    });
  }

  updateTddWorkbenchSummary(
    options.sessionState,
    `Preparing TDD ${command.type} command...`,
  );

  const traced = await runWithLangSmithTrace({
    name: "shipyard.tdd-turn",
    runType: "chain",
    tags: ["shipyard", "tdd-turn", command.type],
    metadata: {
      sessionId: options.sessionState.sessionId,
      targetDirectory: options.sessionState.targetDirectory,
      command: command.type,
      instruction: options.instruction,
      activeLaneId: options.sessionState.activeTddLaneId,
      runtimeSurface: options.runtimeSurface ?? "cli",
    },
    getResultMetadata: (result) => ({
      sessionId: options.sessionState.sessionId,
      targetDirectory: options.sessionState.targetDirectory,
      command: result.command,
      status: result.status,
      summary: result.summary,
      laneId: result.lane?.laneId ?? null,
      laneStatus: result.lane?.status ?? null,
      laneStage: result.lane?.currentStage ?? null,
      runtimeAssist: result.runtimeAssist,
    }),
    fn: runCoreTddCommand,
    args: [options, command],
  });

  return traced.trace
    ? {
        ...traced.result,
        langSmithTrace: traced.trace,
      }
    : traced.result;
}
