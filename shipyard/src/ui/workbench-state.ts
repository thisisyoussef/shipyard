import type { PreviewState } from "../artifacts/types.js";
import { formatTurnExecutionFingerprint } from "../engine/turn-fingerprint.js";
import type { HostingWorkbenchState } from "../hosting/contracts.js";
import { createDefaultHostingWorkbenchState } from "../hosting/contracts.js";
import type { OrchestrationWorkbenchState } from "../orchestration/contracts.js";
import { createIdleOrchestrationWorkbenchState } from "../orchestration/contracts.js";
import type { PipelineWorkbenchState } from "../pipeline/contracts.js";
import {
  createInitialPreviewState,
  createIdlePreviewState,
} from "../preview/contracts.js";
import type { SourceControlWorkbenchState } from "../source-control/contracts.js";
import {
  createDefaultSourceControlWorkbenchState,
} from "../source-control/contracts.js";
import type { RuntimeAssistSummary } from "../skills/contracts.js";
import type { TddWorkbenchState } from "../tdd/contracts.js";
import { createIdleTddWorkbenchState } from "../tdd/contracts.js";
import { createIdleUltimateUiState } from "./contracts.js";
import type {
  BackendToFrontendMessage,
  DeploySummary,
  ProjectBoardState,
  UploadReceipt,
  SessionRunSummary,
  TaskBoardState,
  TargetEnrichmentState,
  TargetManagerState,
  TargetSummary,
  UiLangSmithTraceReference,
  UltimateUiState,
} from "./contracts.js";

export type WorkbenchConnectionState =
  | "connecting"
  | "ready"
  | "agent-busy"
  | "disconnected"
  | "error";

export interface SessionStateViewModel {
  sessionId: string;
  targetLabel: string;
  targetDirectory: string;
  activePhase: "code" | "target-manager";
  workspaceDirectory: string;
  turnCount: number;
  startedAt: string;
  lastActiveAt: string;
  discoverySummary: string;
  discovery: Extract<BackendToFrontendMessage, { type: "session:state" }>["discovery"];
  projectRulesLoaded: boolean;
  tracePath: string;
}

export interface ActivityItemViewModel {
  id: string;
  kind: "thinking" | "tool" | "text" | "edit" | "done" | "error";
  title: string;
  detail: string;
  tone: "neutral" | "working" | "success" | "danger";
  toolName?: string;
  callId?: string;
  detailBody?: string;
  path?: string;
  diff?: string;
  beforePreview?: string | null;
  afterPreview?: string | null;
  addedLines?: number;
  removedLines?: number;
  command?: string;
}

export interface TurnViewModel {
  id: string;
  instruction: string;
  status: "working" | "success" | "error" | "cancelled" | "idle";
  startedAt: string;
  summary: string;
  contextPreview: string[];
  agentMessages: string[];
  langSmithTrace: UiLangSmithTraceReference | null;
  activity: ActivityItemViewModel[];
}

export interface DiffLineViewModel {
  id: string;
  kind: "meta" | "context" | "add" | "remove";
  text: string;
}

export interface FileEventViewModel {
  id: string;
  path: string;
  status: "running" | "success" | "error" | "cancelled" | "diff";
  title: string;
  summary: string;
  toolName?: string;
  callId?: string;
  turnId: string;
  diffLines: DiffLineViewModel[];
  beforePreview?: string | null;
  afterPreview?: string | null;
}

export interface ContextReceiptViewModel {
  id: string;
  text: string;
  submittedAt: string;
  turnId: string;
}

export interface UploadReceiptViewModel extends UploadReceipt {}

export interface PendingUploadReceiptViewModel extends UploadReceiptViewModel {}

export interface LatestDeployViewModel extends DeploySummary {}

export interface PendingToolCall {
  turnId: string;
  fileEventId?: string;
  toolName: string;
}

export interface PreviewStateViewModel extends PreviewState {}

export interface TargetSummaryViewModel extends TargetSummary {}

export interface TargetEnrichmentStateViewModel extends TargetEnrichmentState {}

export interface TargetManagerViewModel extends TargetManagerState {}

export type ProjectBoardProjectViewModel =
  ProjectBoardState["openProjects"][number];

export type ProjectBoardViewModel = ProjectBoardState;

export type TaskBoardViewModel = TaskBoardState;

export interface SessionRunSummaryViewModel extends SessionRunSummary {}

export interface PipelineWorkbenchStateViewModel extends PipelineWorkbenchState {}

export interface TddWorkbenchStateViewModel extends TddWorkbenchState {}

export interface RuntimeAssistViewModel extends RuntimeAssistSummary {}

export interface OrchestrationViewModel extends OrchestrationWorkbenchState {}

export interface SourceControlViewModel extends SourceControlWorkbenchState {}

export interface HostingViewModel extends HostingWorkbenchState {}
export interface UltimateUiStateViewModel extends UltimateUiState {}

export interface WorkbenchViewState {
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  sessionState: SessionStateViewModel | null;
  sessionHistory: SessionRunSummaryViewModel[];
  turns: TurnViewModel[];
  fileEvents: FileEventViewModel[];
  activeTurnId: string | null;
  pendingToolCalls: Record<string, PendingToolCall>;
  latestError: string | null;
  nextTurnNumber: number;
  nextEventNumber: number;
  nextFileEventNumber: number;
  contextHistory: ContextReceiptViewModel[];
  pendingUploads: UploadReceiptViewModel[];
  latestDeploy: LatestDeployViewModel;
  previewState: PreviewStateViewModel;
  targetManager: TargetManagerViewModel | null;
  projectBoard: ProjectBoardViewModel | null;
  taskBoard: TaskBoardViewModel | null;
  pipelineState: PipelineWorkbenchStateViewModel | null;
  tddState: TddWorkbenchStateViewModel;
  orchestration: OrchestrationViewModel;
  sourceControl: SourceControlViewModel;
  hosting: HostingViewModel;
  ultimateState: UltimateUiStateViewModel;
  runtimeAssist: RuntimeAssistViewModel;
}

export interface RotateInstructionTurnOptions {
  nextInstruction: string;
  nextSummary?: string;
  previousSummary?: string;
  previousStatus?: TurnViewModel["status"];
  contextPreview?: string[];
}

export interface PreparedInstructionSubmission {
  instruction: string;
  injectedContext?: string[];
  contextPreview: string[];
  clearedContextDraft: string;
}

export function createInitialDeploySummary(
  overrides: Partial<LatestDeployViewModel> = {},
): LatestDeployViewModel {
  return {
    status: "idle",
    platform: "vercel",
    available: false,
    unavailableReason: "Waiting for Shipyard to sync deploy availability.",
    productionUrl: null,
    summary: "Waiting for Shipyard to sync deploy availability.",
    logExcerpt: null,
    command: null,
    requestedAt: null,
    completedAt: null,
    ...overrides,
  };
}

export function createInitialRuntimeAssistState(
  overrides: Partial<RuntimeAssistViewModel> = {},
): RuntimeAssistViewModel {
  return {
    activeProfileId: null,
    activeProfileName: null,
    activeProfileRoute: null,
    loadedSkills: [],
    ...overrides,
  };
}

function createTracePath(
  targetDirectory: string,
  sessionId: string,
): string {
  return `${targetDirectory}/.shipyard/traces/${sessionId}.jsonl`;
}

function createEventId(state: WorkbenchViewState): [WorkbenchViewState, string] {
  const nextState = {
    ...state,
    nextEventNumber: state.nextEventNumber + 1,
  };

  return [nextState, `event-${String(state.nextEventNumber)}`];
}

function createFileEventId(
  state: WorkbenchViewState,
): [WorkbenchViewState, string] {
  const nextState = {
    ...state,
    nextFileEventNumber: state.nextFileEventNumber + 1,
  };

  return [nextState, `file-${String(state.nextFileEventNumber)}`];
}

function createTurnId(state: WorkbenchViewState): [WorkbenchViewState, string] {
  const nextState = {
    ...state,
    nextTurnNumber: state.nextTurnNumber + 1,
  };

  return [nextState, `turn-${String(state.nextTurnNumber)}`];
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/_/g, " ");
}

function extractPathFromSummary(summary: string): string | null {
  const match = summary.match(/path:\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

function parseDiffLines(diff: string): DiffLineViewModel[] {
  return diff
    .split("\n")
    .filter(Boolean)
    .slice(0, 14)
    .map((line, index) => {
      let kind: DiffLineViewModel["kind"] = "context";

      if (line.startsWith("@@") || line.startsWith("diff --git")) {
        kind = "meta";
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        kind = "add";
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        kind = "remove";
      }

      return {
        id: `diff-${String(index)}`,
        kind,
        text: line,
      };
    });
}

function createSessionStateViewModel(
  message: Extract<BackendToFrontendMessage, { type: "session:state" }>,
): SessionStateViewModel {
  return {
    sessionId: message.sessionId,
    targetLabel: message.targetLabel,
    targetDirectory: message.targetDirectory,
    activePhase: message.activePhase,
    workspaceDirectory: message.workspaceDirectory,
    turnCount: message.turnCount,
    startedAt: message.startedAt,
    lastActiveAt: message.lastActiveAt,
    discoverySummary: message.discoverySummary,
    discovery: message.discovery,
    projectRulesLoaded: message.projectRulesLoaded,
    tracePath: createTracePath(message.targetDirectory, message.sessionId),
  };
}

function createTargetManagerAgentStatus(
  targetManager: TargetManagerViewModel | null,
): string | null {
  if (!targetManager) {
    return null;
  }

  const { currentTarget, enrichmentStatus } = targetManager;

  if (
    enrichmentStatus.status === "queued" ||
    enrichmentStatus.status === "started" ||
    enrichmentStatus.status === "in-progress"
  ) {
    return enrichmentStatus.message ?? `Enriching ${currentTarget.name}...`;
  }

  if (enrichmentStatus.status === "error") {
    return enrichmentStatus.message ?? `Failed to enrich ${currentTarget.name}.`;
  }

  return `Active target: ${currentTarget.name}`;
}

function createPipelineAgentStatus(
  pipelineState: PipelineWorkbenchStateViewModel | null,
): string | null {
  if (!pipelineState || pipelineState.status === "idle") {
    return null;
  }

  if (pipelineState.waitingForApproval) {
    return pipelineState.summary || "Pipeline is waiting for approval.";
  }

  return pipelineState.summary || null;
}

function createSourceControlAgentStatus(
  sourceControl: SourceControlViewModel | null,
): string | null {
  if (!sourceControl || !sourceControl.updatedAt) {
    return null;
  }

  if (sourceControl.degraded || sourceControl.pendingConflictTicket) {
    return sourceControl.summary;
  }

  return null;
}

function createOrchestrationAgentStatus(
  orchestration: OrchestrationViewModel | null,
): string | null {
  if (!orchestration || orchestration.mode === "idle") {
    return null;
  }

  if (
    orchestration.status === "waiting" ||
    orchestration.status === "blocked" ||
    orchestration.activeWorkerCount > 0
  ) {
    return orchestration.summary;
  }

  return null;
}

function createTddAgentStatus(
  tddState: TddWorkbenchStateViewModel | null,
): string | null {
  if (!tddState || tddState.status === "idle") {
    return null;
  }

  return tddState.summary || null;
}

function ensureActiveTurn(
  state: WorkbenchViewState,
): WorkbenchViewState {
  if (state.activeTurnId !== null) {
    return state;
  }

  const fallbackTurn = state.turns.find((turn) => turn.status === "working") ??
    state.turns[0];

  if (fallbackTurn) {
    return {
      ...state,
      activeTurnId: fallbackTurn.id,
    };
  }

  const [withTurnId, turnId] = createTurnId(state);
  const nextTurn: TurnViewModel = {
    id: turnId,
    instruction: "Recovered browser turn",
    status: "working",
    startedAt: new Date().toISOString(),
    summary: "Shipyard resumed a browser turn without a local draft.",
    contextPreview: [],
    agentMessages: [],
    langSmithTrace: null,
    activity: [],
  };

  return {
    ...withTurnId,
    activeTurnId: turnId,
    turns: [nextTurn, ...withTurnId.turns],
  };
}

function appendActivity(
  state: WorkbenchViewState,
  activity: Omit<ActivityItemViewModel, "id">,
): WorkbenchViewState {
  const ensuredState = ensureActiveTurn(state);
  const [withEventId, eventId] = createEventId(ensuredState);

  return {
    ...withEventId,
    turns: withEventId.turns.map((turn) =>
      turn.id === withEventId.activeTurnId
        ? {
            ...turn,
            activity: [
              ...turn.activity,
              {
                id: eventId,
                ...activity,
              },
            ],
          }
        : turn,
    ),
  };
}

function updateActiveTurn(
  state: WorkbenchViewState,
  updater: (turn: TurnViewModel) => TurnViewModel,
): WorkbenchViewState {
  const ensuredState = ensureActiveTurn(state);

  return {
    ...ensuredState,
    turns: ensuredState.turns.map((turn) =>
      turn.id === ensuredState.activeTurnId ? updater(turn) : turn,
    ),
  };
}

function createDoneAgentStatus(
  message: Extract<BackendToFrontendMessage, { type: "agent:done" }>,
): string {
  if (message.executionFingerprint) {
    return formatTurnExecutionFingerprint(message.executionFingerprint);
  }

  return message.summary;
}

function createContextReceipts(
  turnId: string,
  contextPreview: string[],
  submittedAt: string,
): ContextReceiptViewModel[] {
  return contextPreview.map((text, index) => ({
    id: `context-${turnId}-${String(index + 1)}`,
    text,
    submittedAt,
    turnId,
  }));
}

function hasRecoveredHistory(state: WorkbenchViewState): boolean {
  return (
    state.turns.length > 0 ||
    state.fileEvents.length > 0 ||
    state.contextHistory.length > 0 ||
    state.pendingUploads.length > 0 ||
    state.tddState.status !== "idle" ||
    (
      state.pipelineState !== null &&
      state.pipelineState.status !== "idle"
    )
  );
}

export function createUploadContextPreview(
  receipt: UploadReceiptViewModel,
): string {
  return `Upload: ${receipt.originalName} -> ${receipt.storedRelativePath}`;
}

export function createUploadInjectedContext(
  receipt: UploadReceiptViewModel,
): string {
  const previewBody = receipt.previewText.trim()
    ? receipt.previewText.trim()
    : "(empty file)";

  return [
    "Uploaded file reference",
    `Original filename: ${receipt.originalName}`,
    `Stored path: ${receipt.storedRelativePath}`,
    `Media type: ${receipt.mediaType}`,
    `Size: ${String(receipt.sizeBytes)} bytes`,
    `Summary: ${receipt.previewSummary}`,
    "Preview:",
    previewBody,
    "Use read_file on the stored path if you need the full contents.",
  ].join("\n");
}

function createDoneTone(
  status: Extract<
    BackendToFrontendMessage,
    { type: "agent:done" }
  >["status"],
): ActivityItemViewModel["tone"] {
  switch (status) {
    case "success":
      return "success";
    case "cancelled":
      return "neutral";
    default:
      return "danger";
  }
}

function createTurnStatusFromDone(
  status: Extract<
    BackendToFrontendMessage,
    { type: "agent:done" }
  >["status"],
): TurnViewModel["status"] {
  switch (status) {
    case "success":
      return "success";
    case "cancelled":
      return "cancelled";
    default:
      return "error";
  }
}

const MAX_PERSISTED_SESSION_HISTORY = 20;
const MAX_PERSISTED_TURNS = 8;
const MAX_PERSISTED_COMPLETED_ACTIVITY_ITEMS = 20;
const MAX_PERSISTED_ACTIVE_ACTIVITY_ITEMS = 40;
const MAX_PERSISTED_FILE_EVENTS = 40;
const MAX_PERSISTED_CONTEXT_HISTORY = 30;
const MAX_PERSISTED_AGENT_MESSAGES = 6;
const MAX_PERSISTED_DIFF_LINES = 12;
const MAX_PERSISTED_TEXT_CHARS = 1_200;
const MAX_PERSISTED_PREVIEW_CHARS = 600;
const MAX_PERSISTED_DETAIL_BODY_CHARS = 800;
const MAX_PERSISTED_DIFF_CHARS = 240;

function truncateWorkbenchText(
  value: string | undefined,
  limit: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(limit - 1, 0))}…`;
}

function truncateWorkbenchPreview(
  value: string | null | undefined,
  limit: number,
): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  return truncateWorkbenchText(value, limit);
}

function compactActivityItem(
  item: ActivityItemViewModel,
  preserveRichFields: boolean,
): ActivityItemViewModel {
  return {
    ...item,
    title: truncateWorkbenchText(item.title, 160) ?? item.title,
    detail: truncateWorkbenchText(item.detail, MAX_PERSISTED_TEXT_CHARS) ?? item.detail,
    detailBody: preserveRichFields
      ? truncateWorkbenchText(item.detailBody, MAX_PERSISTED_DETAIL_BODY_CHARS)
      : undefined,
    diff: preserveRichFields
      ? truncateWorkbenchText(item.diff, MAX_PERSISTED_DETAIL_BODY_CHARS)
      : undefined,
    beforePreview: preserveRichFields
      ? truncateWorkbenchPreview(item.beforePreview, MAX_PERSISTED_PREVIEW_CHARS)
      : undefined,
    afterPreview: preserveRichFields
      ? truncateWorkbenchPreview(item.afterPreview, MAX_PERSISTED_PREVIEW_CHARS)
      : undefined,
    command: truncateWorkbenchText(item.command, 240),
    path: truncateWorkbenchText(item.path, 240),
  };
}

function compactDiffLines(
  diffLines: DiffLineViewModel[],
): DiffLineViewModel[] {
  return diffLines.slice(0, MAX_PERSISTED_DIFF_LINES).map((line) => ({
    ...line,
    text: truncateWorkbenchText(line.text, MAX_PERSISTED_DIFF_CHARS) ?? line.text,
  }));
}

function selectRetainedTurnIds(state: WorkbenchViewState): Set<string> {
  const mustKeepIds = new Set(
    state.turns
      .filter((turn) => turn.id === state.activeTurnId || turn.status === "working")
      .map((turn) => turn.id),
  );
  const remainingSlots = Math.max(MAX_PERSISTED_TURNS - mustKeepIds.size, 0);
  const supplementalTurns = state.turns
    .filter((turn) => !mustKeepIds.has(turn.id))
    .slice(0, remainingSlots);

  return new Set([
    ...mustKeepIds,
    ...supplementalTurns.map((turn) => turn.id),
  ]);
}

export function compactWorkbenchStateForPersistence(
  state: WorkbenchViewState,
): WorkbenchViewState {
  const retainedTurnIds = selectRetainedTurnIds(state);
  const retainedTurns = state.turns
    .filter((turn) => retainedTurnIds.has(turn.id))
    .map((turn) => {
      const preserveRichFields =
        turn.id === state.activeTurnId || turn.status === "working";
      const retainedActivityCount = preserveRichFields
        ? MAX_PERSISTED_ACTIVE_ACTIVITY_ITEMS
        : MAX_PERSISTED_COMPLETED_ACTIVITY_ITEMS;

      return {
        ...turn,
        instruction: truncateWorkbenchText(turn.instruction, MAX_PERSISTED_TEXT_CHARS) ?? turn.instruction,
        summary: truncateWorkbenchText(turn.summary, 600) ?? turn.summary,
        contextPreview: turn.contextPreview.map((item) =>
          truncateWorkbenchText(item, 400) ?? item
        ),
        agentMessages: turn.agentMessages
          .slice(-MAX_PERSISTED_AGENT_MESSAGES)
          .map((message) =>
            truncateWorkbenchText(message, 600) ?? message
          ),
        activity: turn.activity
          .slice(-retainedActivityCount)
          .map((item) => compactActivityItem(item, preserveRichFields)),
      };
    });

  const retainedFileEvents = [
    ...state.fileEvents.filter((event) => retainedTurnIds.has(event.turnId)),
    ...state.fileEvents.filter((event) => !retainedTurnIds.has(event.turnId)),
  ]
    .slice(0, MAX_PERSISTED_FILE_EVENTS)
    .map((event) => ({
      ...event,
      summary: truncateWorkbenchText(event.summary, 600) ?? event.summary,
      diffLines: compactDiffLines(event.diffLines),
      beforePreview: truncateWorkbenchPreview(
        event.beforePreview,
        MAX_PERSISTED_PREVIEW_CHARS,
      ),
      afterPreview: truncateWorkbenchPreview(
        event.afterPreview,
        MAX_PERSISTED_PREVIEW_CHARS,
      ),
    }));

  const retainedPendingToolCalls = Object.fromEntries(
    Object.entries(state.pendingToolCalls).filter(([, call]) =>
      retainedTurnIds.has(call.turnId)
    ),
  );

  return {
    ...state,
    agentStatus: truncateWorkbenchText(state.agentStatus, 400) ?? state.agentStatus,
    sessionHistory: state.sessionHistory.slice(0, MAX_PERSISTED_SESSION_HISTORY),
    turns: retainedTurns,
    fileEvents: retainedFileEvents,
    activeTurnId:
      state.activeTurnId !== null && retainedTurnIds.has(state.activeTurnId)
        ? state.activeTurnId
        : null,
    pendingToolCalls: retainedPendingToolCalls,
    latestError: truncateWorkbenchText(state.latestError ?? undefined, 600) ?? null,
    contextHistory: state.contextHistory.slice(-MAX_PERSISTED_CONTEXT_HISTORY),
    ultimateState: {
      ...state.ultimateState,
      currentBrief:
        truncateWorkbenchText(state.ultimateState.currentBrief ?? undefined, 600) ?? null,
      lastCycleSummary:
        truncateWorkbenchText(state.ultimateState.lastCycleSummary ?? undefined, 600) ?? null,
    },
  };
}

export function ensureWorkbenchStateDefaults(
  state: Partial<WorkbenchViewState> | WorkbenchViewState,
): WorkbenchViewState {
  const initialState = createInitialWorkbenchState();

  return {
    ...initialState,
    ...state,
    sessionHistory: [...(state.sessionHistory ?? initialState.sessionHistory)],
    turns: [...(state.turns ?? initialState.turns)],
    fileEvents: [...(state.fileEvents ?? initialState.fileEvents)],
    pendingToolCalls: {
      ...(state.pendingToolCalls ?? initialState.pendingToolCalls),
    },
    contextHistory: [...(state.contextHistory ?? initialState.contextHistory)],
    pendingUploads: [...(state.pendingUploads ?? [])],
    latestDeploy: state.latestDeploy ?? initialState.latestDeploy,
    previewState: state.previewState ?? initialState.previewState,
    targetManager: state.targetManager ?? initialState.targetManager,
    projectBoard: state.projectBoard ?? initialState.projectBoard,
    taskBoard: state.taskBoard ?? initialState.taskBoard,
    pipelineState: state.pipelineState ?? initialState.pipelineState,
    tddState: state.tddState ?? initialState.tddState,
    orchestration: state.orchestration ?? initialState.orchestration,
    sourceControl: state.sourceControl ?? initialState.sourceControl,
    hosting: state.hosting ?? initialState.hosting,
    ultimateState: state.ultimateState ?? initialState.ultimateState,
    runtimeAssist: state.runtimeAssist ?? initialState.runtimeAssist,
  };
}

export function createInitialWorkbenchState(): WorkbenchViewState {
  return {
    connectionState: "connecting",
    agentStatus: "Connecting to Shipyard...",
    sessionState: null,
    sessionHistory: [],
    turns: [],
    fileEvents: [],
    activeTurnId: null,
    pendingToolCalls: {},
    latestError: null,
    nextTurnNumber: 1,
    nextEventNumber: 1,
    nextFileEventNumber: 1,
    contextHistory: [],
    pendingUploads: [],
    latestDeploy: createInitialDeploySummary(),
    previewState: createIdlePreviewState(
      "Waiting for Shipyard to publish preview state.",
    ),
    targetManager: null,
    projectBoard: null,
    taskBoard: null,
    pipelineState: null,
    tddState: createIdleTddWorkbenchState(),
    orchestration: createIdleOrchestrationWorkbenchState(),
    sourceControl: createDefaultSourceControlWorkbenchState(),
    hosting: createDefaultHostingWorkbenchState(),
    ultimateState: createIdleUltimateUiState(),
    runtimeAssist: createInitialRuntimeAssistState(),
  };
}

export function addPendingUploads(
  state: WorkbenchViewState,
  uploads: PendingUploadReceiptViewModel[],
): WorkbenchViewState {
  if (uploads.length === 0) {
    return state;
  }

  return appendPendingUploadReceipts(state, uploads);
}

export function removePendingUpload(
  state: WorkbenchViewState,
  uploadId: string,
): WorkbenchViewState {
  return removePendingUploadReceipt(state, uploadId);
}

export function clearPendingUploads(
  state: WorkbenchViewState,
): WorkbenchViewState {
  if (state.pendingUploads.length === 0) {
    return state;
  }

  return {
    ...state,
    pendingUploads: [],
  };
}

export function prepareInstructionSubmission(
  instructionDraft: string,
  contextDraft: string,
  pendingUploads: UploadReceiptViewModel[] = [],
): PreparedInstructionSubmission | null {
  const instruction = instructionDraft.trim();

  if (!instruction) {
    return null;
  }

  const trimmedContext = contextDraft.trim();
  const contextPreview = [
    ...(trimmedContext ? [trimmedContext] : []),
    ...pendingUploads.map(createUploadContextPreview),
  ];

  return {
    instruction,
    injectedContext: trimmedContext ? [trimmedContext] : undefined,
    contextPreview,
    clearedContextDraft: "",
  };
}

export function appendPendingUploadReceipts(
  state: WorkbenchViewState,
  receipts: UploadReceiptViewModel[],
): WorkbenchViewState {
  return {
    ...state,
    pendingUploads: [
      ...receipts,
      ...state.pendingUploads.filter((existingReceipt) =>
        !receipts.some((receipt) => receipt.id === existingReceipt.id)
      ),
    ],
  };
}

export function removePendingUploadReceipt(
  state: WorkbenchViewState,
  receiptId: string,
): WorkbenchViewState {
  return {
    ...state,
    pendingUploads: state.pendingUploads.filter((receipt) => receipt.id !== receiptId),
  };
}

export function consumePendingUploadsForInstruction(
  state: WorkbenchViewState,
  injectedContext: string[] | undefined,
): {
  nextState: WorkbenchViewState;
  injectedContext?: string[];
  contextPreview: string[];
} {
  const nextInjectedContext = [
    ...(injectedContext ?? []),
    ...state.pendingUploads.map(createUploadInjectedContext),
  ];
  const contextPreview = [
    ...(injectedContext ?? []),
    ...state.pendingUploads.map(createUploadContextPreview),
  ];

  return {
    nextState: {
      ...state,
      pendingUploads: [],
    },
    injectedContext: nextInjectedContext.length > 0
      ? nextInjectedContext
      : undefined,
    contextPreview,
  };
}

export function setTransportState(
  state: WorkbenchViewState,
  connectionState: WorkbenchConnectionState,
  agentStatus?: string,
): WorkbenchViewState {
  return {
    ...state,
    connectionState,
    agentStatus: agentStatus ?? state.agentStatus,
  };
}

export function applySessionSnapshot(
  state: WorkbenchViewState,
  message: Extract<BackendToFrontendMessage, { type: "session:state" }>,
): WorkbenchViewState {
  const recoveredState = ensureWorkbenchStateDefaults(message.workbenchState ?? state);
  const previewState = recoveredState.previewState ??
    createInitialPreviewState({
      activePhase: message.activePhase,
      discovery: message.discovery,
    });
  const recoveredAfterReload =
    state.sessionState === null && hasRecoveredHistory(recoveredState);
  const nextConnectionState = message.connectionState;
  const preservedAgentStatus =
    recoveredState.agentStatus &&
    recoveredState.agentStatus !== "Connecting to Shipyard..."
      ? recoveredState.agentStatus
      : null;
  const nextAgentStatus = recoveredAfterReload
    ? "Recovered session history after reload."
    : nextConnectionState === "agent-busy"
      ? `Turn ${String(message.turnCount)} is in progress.`
      : recoveredState.latestError ??
        preservedAgentStatus ??
        "Ready for the next instruction.";

  return {
    ...recoveredState,
    sessionState: createSessionStateViewModel(message),
    sessionHistory: message.sessionHistory,
    connectionState: nextConnectionState,
    agentStatus:
      createTddAgentStatus(
        recoveredState.tddState ?? state.tddState ?? null,
      )
      ?? createPipelineAgentStatus(
        recoveredState.pipelineState ?? state.pipelineState ?? null,
      )
      ?? createOrchestrationAgentStatus(
        recoveredState.orchestration ?? state.orchestration ?? null,
      )
      ?? createSourceControlAgentStatus(
        recoveredState.sourceControl ?? state.sourceControl ?? null,
      )
      ?? createTargetManagerAgentStatus(
        recoveredState.targetManager ?? state.targetManager,
      ) ?? nextAgentStatus,
    latestDeploy: recoveredState.latestDeploy,
    previewState,
    targetManager: recoveredState.targetManager ?? state.targetManager ?? null,
    projectBoard: recoveredState.projectBoard ?? state.projectBoard ?? null,
    taskBoard: recoveredState.taskBoard ?? state.taskBoard ?? null,
    pipelineState: recoveredState.pipelineState ?? state.pipelineState ?? null,
    tddState:
      recoveredState.tddState
      ?? state.tddState
      ?? createIdleTddWorkbenchState(),
    orchestration:
      recoveredState.orchestration
      ?? state.orchestration
      ?? createIdleOrchestrationWorkbenchState(),
    sourceControl:
      recoveredState.sourceControl
      ?? state.sourceControl
      ?? createDefaultSourceControlWorkbenchState(),
    hosting:
      recoveredState.hosting
      ?? state.hosting
      ?? createDefaultHostingWorkbenchState(),
  };
}

export function queueInstructionTurn(
  state: WorkbenchViewState,
  instruction: string,
  contextPreview: string[],
): WorkbenchViewState {
  const [withTurnId, turnId] = createTurnId(state);
  const submittedAt = new Date().toISOString();
  const nextTurn: TurnViewModel = {
    id: turnId,
    instruction,
    status: "working",
    startedAt: submittedAt,
    summary: "Waiting for Shipyard to begin streaming activity.",
    contextPreview,
    agentMessages: [],
    langSmithTrace: null,
    activity: [],
  };

  return {
    ...withTurnId,
    activeTurnId: turnId,
    turns: [nextTurn, ...withTurnId.turns],
    agentStatus: `Queued: ${instruction}`,
    latestError: null,
    contextHistory: [
      ...createContextReceipts(turnId, contextPreview, submittedAt),
      ...withTurnId.contextHistory,
    ].slice(0, 8),
  };
}

export function rotateInstructionTurn(
  state: WorkbenchViewState,
  options: RotateInstructionTurnOptions,
): WorkbenchViewState {
  const ensuredState = ensureActiveTurn(state);
  const previousTurnId = ensuredState.activeTurnId;
  const nextState = {
    ...ensuredState,
    turns: ensuredState.turns.map((turn) =>
      turn.id === previousTurnId
        ? {
            ...turn,
            status: options.previousStatus ?? "idle",
            summary: options.previousSummary ?? turn.summary,
          }
        : turn,
    ),
  };
  const queuedState = queueInstructionTurn(
    nextState,
    options.nextInstruction,
    options.contextPreview ?? [],
  );

  if (!options.nextSummary) {
    return queuedState;
  }

  return updateActiveTurn(queuedState, (turn) => ({
    ...turn,
    summary: options.nextSummary ?? turn.summary,
  }));
}

export function applyBackendMessage(
  state: WorkbenchViewState,
  message: BackendToFrontendMessage,
): WorkbenchViewState {
  switch (message.type) {
    case "session:state":
      return applySessionSnapshot(state, message);

    case "agent:thinking": {
      const withActivity = appendActivity(state, {
        kind: "thinking",
        title: "Thinking",
        detail: message.message,
        tone: "working",
      });

      return updateActiveTurn(withActivity, (turn) => ({
        ...turn,
        summary: message.message,
      }));
    }

    case "agent:tool_call": {
      const withActivity = appendActivity(state, {
        kind: "tool",
        title: humanizeToolName(message.toolName),
        detail: message.summary ?? "Running tool.",
        tone: "working",
        toolName: message.toolName,
        callId: message.callId,
      });
      const path = extractPathFromSummary(message.summary ?? "");

      if (path === null) {
        return {
          ...withActivity,
          pendingToolCalls: {
            ...withActivity.pendingToolCalls,
            [message.callId]: {
              turnId: withActivity.activeTurnId ?? "turn-unknown",
              toolName: message.toolName,
            },
          },
          agentStatus: `Running ${humanizeToolName(message.toolName)}...`,
        };
      }

      const [withFileId, fileEventId] = createFileEventId(withActivity);
      const nextFileEvent: FileEventViewModel = {
        id: fileEventId,
        path,
        status: "running",
        title: humanizeToolName(message.toolName),
        summary: message.summary ?? "",
        toolName: message.toolName,
        callId: message.callId,
        turnId: withFileId.activeTurnId ?? "turn-unknown",
        diffLines: [],
      };

      return {
        ...withFileId,
        fileEvents: [nextFileEvent, ...withFileId.fileEvents].slice(0, 14),
        pendingToolCalls: {
          ...withFileId.pendingToolCalls,
          [message.callId]: {
            turnId: withFileId.activeTurnId ?? "turn-unknown",
            fileEventId,
            toolName: message.toolName,
          },
        },
        agentStatus: `Running ${humanizeToolName(message.toolName)}...`,
      };
    }

    case "agent:tool_result": {
      const withActivity = appendActivity(state, {
        kind: "tool",
        title: `${humanizeToolName(message.toolName)} ${
          message.success ? "finished" : "failed"
        }`,
        detail: message.summary,
        tone: message.success ? "success" : "danger",
        toolName: message.toolName,
        callId: message.callId,
        detailBody: message.detail,
        command: message.command,
      });
      const pendingCall = withActivity.pendingToolCalls[message.callId];

      return {
        ...withActivity,
        fileEvents: withActivity.fileEvents.map<FileEventViewModel>((fileEvent) =>
          fileEvent.id === pendingCall?.fileEventId
            ? {
                ...fileEvent,
                status: message.success ? "success" : "error",
                summary: message.summary,
              }
            : fileEvent,
        ),
        pendingToolCalls: Object.fromEntries(
          Object.entries(withActivity.pendingToolCalls).filter(
            ([callId]) => callId !== message.callId,
          ),
        ),
        agentStatus: message.summary,
      };
    }

    case "agent:text": {
      const withActivity = appendActivity(state, {
        kind: "text",
        title: "Agent response",
        detail: message.text,
        tone: "neutral",
      });

      return updateActiveTurn(withActivity, (turn) => ({
        ...turn,
        agentMessages: [...turn.agentMessages, message.text],
        summary: message.text,
      }));
    }

    case "agent:edit": {
      const withActivity = appendActivity(state, {
        kind: "edit",
        title: message.path,
        detail: message.summary,
        tone: "success",
        path: message.path,
        diff: message.diff,
        beforePreview: message.beforePreview ?? null,
        afterPreview: message.afterPreview ?? null,
        addedLines: message.addedLines,
        removedLines: message.removedLines,
      });
      const [withFileId, fileEventId] = createFileEventId(withActivity);
      const nextFileEvent: FileEventViewModel = {
        id: fileEventId,
        path: message.path,
        status: "diff",
        title: "Diff preview",
        summary: message.summary,
        turnId: withFileId.activeTurnId ?? "turn-unknown",
        diffLines: parseDiffLines(message.diff),
        beforePreview: message.beforePreview ?? null,
        afterPreview: message.afterPreview ?? null,
      };

      return {
        ...withFileId,
        fileEvents: [nextFileEvent, ...withFileId.fileEvents].slice(0, 14),
        agentStatus: `Diff preview updated for ${message.path}.`,
      };
    }

    case "agent:error": {
      const withActivity = appendActivity(state, {
        kind: "error",
        title: "Agent error",
        detail: message.message,
        tone: "danger",
      });

      return updateActiveTurn(
        {
          ...withActivity,
          connectionState: "error",
          latestError: message.message,
          agentStatus: message.message,
        },
        (turn) => ({
          ...turn,
          status: "error",
          summary: message.message,
        }),
      );
    }

    case "agent:done": {
      const activeTurnId = state.activeTurnId;
      const doneAgentStatus = createDoneAgentStatus(message);
      const withActivity = appendActivity(state, {
        kind: "done",
        title: "Turn complete",
        detail: message.summary,
        detailBody: message.executionFingerprint
          ? formatTurnExecutionFingerprint(message.executionFingerprint)
          : undefined,
        tone: createDoneTone(message.status),
      });
      const pendingFileEventIds = new Set(
        Object.values(withActivity.pendingToolCalls)
          .filter((pendingCall) => pendingCall.turnId === activeTurnId)
          .map((pendingCall) => pendingCall.fileEventId)
          .filter((fileEventId): fileEventId is string => Boolean(fileEventId)),
      );

      return {
        ...withActivity,
        activeTurnId: null,
        fileEvents: withActivity.fileEvents.map((fileEvent) =>
          pendingFileEventIds.has(fileEvent.id)
            ? {
                ...fileEvent,
                status: message.status === "cancelled" ? "cancelled" : "error",
                summary: message.summary,
              }
            : fileEvent
        ),
        pendingToolCalls: Object.fromEntries(
          Object.entries(withActivity.pendingToolCalls).filter(
            ([, pendingCall]) => pendingCall.turnId !== activeTurnId,
          ),
        ),
        latestError: message.status === "error" ? message.summary : null,
        agentStatus: doneAgentStatus,
        turns: withActivity.turns.map((turn) =>
          turn.id === activeTurnId
            ? {
                ...turn,
                status: createTurnStatusFromDone(message.status),
                summary: message.summary,
                langSmithTrace: message.langSmithTrace ?? turn.langSmithTrace,
              }
            : turn
        ),
      };
    }

    case "preview:state":
      return {
        ...state,
        previewState: message.preview,
      };

    case "deploy:state":
      return {
        ...state,
        latestDeploy: message.deploy,
        latestError:
          message.deploy.status === "error" ? message.deploy.summary : null,
        agentStatus:
          message.deploy.status === "idle" && message.deploy.available
            ? state.agentStatus
            : message.deploy.summary,
      };

    case "ultimate:state":
      return {
        ...state,
        ultimateState: message.state,
      };

    case "target:state":
      return {
        ...state,
        targetManager: message.state,
        latestError:
          message.state.enrichmentStatus.status === "error"
            ? message.state.enrichmentStatus.message
            : null,
        agentStatus:
          createTargetManagerAgentStatus(message.state) ?? state.agentStatus,
      };

    case "target:switch_complete":
      return {
        ...state,
        targetManager: message.state,
        latestError: message.success ? null : message.message,
        agentStatus:
          message.message ??
          createTargetManagerAgentStatus(message.state) ??
          state.agentStatus,
      };

    case "target:enrichment_progress": {
      const targetManager = state.targetManager
        ? {
            ...state.targetManager,
            enrichmentStatus: {
              status: message.status,
              message: message.message,
            },
          }
        : state.targetManager;

      return {
        ...state,
        targetManager,
        latestError: message.status === "error" ? message.message : null,
        agentStatus: message.message,
      };
    }

    case "projects:state":
      return {
        ...state,
        projectBoard: message.state,
      };

    case "tasks:state":
      return {
        ...state,
        taskBoard: message.state,
      };

    case "orchestration:state":
      return {
        ...state,
        orchestration: message.state,
      };
  }
}
