import type { PreviewState } from "../artifacts/types.js";
import {
  createInitialPreviewState,
  createIdlePreviewState,
} from "../preview/contracts.js";
import type {
  BackendToFrontendMessage,
  DeploySummary,
  UploadReceipt,
  SessionRunSummary,
  TargetEnrichmentState,
  TargetManagerState,
  TargetSummary,
  UiLangSmithTraceReference,
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

export interface PendingUploadReceiptViewModel extends UploadReceipt {}

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

export interface SessionRunSummaryViewModel extends SessionRunSummary {}

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
  pendingUploads: PendingUploadReceiptViewModel[];
  latestDeploy: LatestDeployViewModel;
  previewState: PreviewStateViewModel;
  targetManager: TargetManagerViewModel | null;
}

export interface PreparedInstructionSubmission {
  instruction: string;
  injectedContext?: string[];
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
    state.contextHistory.length > 0
  );
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
  };
}

export function addPendingUploads(
  state: WorkbenchViewState,
  uploads: PendingUploadReceiptViewModel[],
): WorkbenchViewState {
  const readyUploads = uploads.filter((upload) => upload.status === "ready");

  if (readyUploads.length === 0) {
    return state;
  }

  return {
    ...state,
    pendingUploads: [...readyUploads, ...state.pendingUploads].filter(
      (upload, index, collection) =>
        collection.findIndex((candidate) => candidate.id === upload.id) === index,
    ),
  };
}

export function removePendingUpload(
  state: WorkbenchViewState,
  uploadId: string,
): WorkbenchViewState {
  return {
    ...state,
    pendingUploads: state.pendingUploads.filter((upload) => upload.id !== uploadId),
  };
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
): PreparedInstructionSubmission | null {
  const instruction = instructionDraft.trim();

  if (!instruction) {
    return null;
  }

  const trimmedContext = contextDraft.trim();

  return {
    instruction,
    injectedContext: trimmedContext ? [trimmedContext] : undefined,
    clearedContextDraft: "",
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
  const recoveredState = message.workbenchState ?? state;
  const latestDeploy = recoveredState.latestDeploy ?? createInitialDeploySummary();
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
      createTargetManagerAgentStatus(
        recoveredState.targetManager ?? state.targetManager,
      ) ?? nextAgentStatus,
    latestDeploy,
    previewState,
    targetManager: recoveredState.targetManager ?? state.targetManager ?? null,
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
      const withActivity = appendActivity(state, {
        kind: "done",
        title: "Turn complete",
        detail: message.summary,
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
        agentStatus: message.summary,
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
  }
}
