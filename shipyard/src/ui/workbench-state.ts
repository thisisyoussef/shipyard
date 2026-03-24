import type { BackendToFrontendMessage } from "./contracts.js";

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
}

export interface TurnViewModel {
  id: string;
  instruction: string;
  status: "working" | "success" | "error" | "idle";
  startedAt: string;
  summary: string;
  contextPreview: string[];
  agentMessages: string[];
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
  status: "running" | "success" | "error" | "diff";
  title: string;
  summary: string;
  toolName?: string;
  callId?: string;
  turnId: string;
  diffLines: DiffLineViewModel[];
}

export interface ContextReceiptViewModel {
  id: string;
  text: string;
  submittedAt: string;
  turnId: string;
}

export interface PendingToolCall {
  turnId: string;
  fileEventId?: string;
  toolName: string;
}

export interface WorkbenchViewState {
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  sessionState: SessionStateViewModel | null;
  turns: TurnViewModel[];
  fileEvents: FileEventViewModel[];
  activeTurnId: string | null;
  pendingToolCalls: Record<string, PendingToolCall>;
  latestError: string | null;
  nextTurnNumber: number;
  nextEventNumber: number;
  nextFileEventNumber: number;
  contextHistory: ContextReceiptViewModel[];
}

export interface PreparedInstructionSubmission {
  instruction: string;
  injectedContext?: string[];
  clearedContextDraft: string;
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

export function createInitialWorkbenchState(): WorkbenchViewState {
  return {
    connectionState: "connecting",
    agentStatus: "Connecting to Shipyard...",
    sessionState: null,
    turns: [],
    fileEvents: [],
    activeTurnId: null,
    pendingToolCalls: {},
    latestError: null,
    nextTurnNumber: 1,
    nextEventNumber: 1,
    nextFileEventNumber: 1,
    contextHistory: [],
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
  const recoveredAfterReload =
    state.sessionState === null && hasRecoveredHistory(recoveredState);
  const nextConnectionState = message.connectionState;
  const nextAgentStatus = recoveredAfterReload
    ? "Recovered session history after reload."
    : nextConnectionState === "agent-busy"
      ? `Turn ${String(message.turnCount)} is in progress.`
      : recoveredState.latestError ??
        recoveredState.agentStatus ??
        "Ready for the next instruction.";

  return {
    ...recoveredState,
    sessionState: createSessionStateViewModel(message),
    connectionState: nextConnectionState,
    agentStatus: nextAgentStatus,
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
      const withActivity = appendActivity(state, {
        kind: "done",
        title: "Turn complete",
        detail: message.summary,
        tone: message.status === "success" ? "success" : "danger",
      });

      return updateActiveTurn(
        {
          ...withActivity,
          activeTurnId: null,
          agentStatus: message.summary,
        },
        (turn) => ({
          ...turn,
          status: message.status === "success" ? "success" : "error",
          summary: message.summary,
        }),
      );
    }
  }
}
