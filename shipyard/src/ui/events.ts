import type { DiscoveryReport } from "../artifacts/types.js";
import type {
  DoneEvent,
  EditEvent,
  InstructionTurnReporter,
  ToolCallEvent,
  ToolResultEvent,
  TurnStateEvent,
} from "../engine/turn.js";
import type { BackendToFrontendMessage } from "./contracts.js";

interface CreateSessionStateMessageOptions {
  connectionState: TurnStateEvent["connectionState"];
  sessionState: TurnStateEvent["sessionState"];
  projectRulesLoaded: boolean;
}

export interface CreateUiInstructionReporterOptions {
  send: (message: BackendToFrontendMessage) => Promise<void> | void;
  projectRulesLoaded: boolean;
}

function createTargetLabel(targetDirectory: string): string {
  const parts = targetDirectory.split("/").filter(Boolean);
  return parts.at(-1) ?? targetDirectory;
}

function createDiscoverySummary(discovery: DiscoveryReport): string {
  if (discovery.isGreenfield) {
    return "greenfield target";
  }

  const parts = [
    discovery.language ?? "unknown language",
    discovery.framework ? `(${discovery.framework})` : null,
    discovery.packageManager ? `via ${discovery.packageManager}` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

export function createSessionStateMessage(
  options: CreateSessionStateMessageOptions,
): BackendToFrontendMessage {
  return {
    type: "session:state",
    runtimeMode: "ui",
    connectionState: options.connectionState,
    sessionId: options.sessionState.sessionId,
    targetLabel: createTargetLabel(options.sessionState.targetDirectory),
    targetDirectory: options.sessionState.targetDirectory,
    turnCount: options.sessionState.turnCount,
    startedAt: options.sessionState.startedAt,
    lastActiveAt: options.sessionState.lastActiveAt,
    discovery: options.sessionState.discovery,
    discoverySummary: createDiscoverySummary(options.sessionState.discovery),
    projectRulesLoaded: options.projectRulesLoaded,
  };
}

function createToolCallMessage(event: ToolCallEvent): BackendToFrontendMessage {
  return {
    type: "agent:tool_call",
    callId: event.callId,
    toolName: event.toolName,
    summary: event.summary,
  };
}

function createToolResultMessage(
  event: ToolResultEvent,
): BackendToFrontendMessage {
  return {
    type: "agent:tool_result",
    callId: event.callId,
    toolName: event.toolName,
    success: event.success,
    summary: event.summary,
  };
}

function createEditMessage(event: EditEvent): BackendToFrontendMessage {
  return {
    type: "agent:edit",
    path: event.path,
    summary: event.summary,
    diff: event.diff,
  };
}

function createDoneMessage(event: DoneEvent): BackendToFrontendMessage {
  return {
    type: "agent:done",
    status: event.status,
    summary: event.summary,
  };
}

export function createUiInstructionReporter(
  options: CreateUiInstructionReporterOptions,
): InstructionTurnReporter {
  return {
    async onTurnState(event) {
      await options.send(
        createSessionStateMessage({
          sessionState: event.sessionState,
          connectionState: event.connectionState,
          projectRulesLoaded: options.projectRulesLoaded,
        }),
      );
    },
    async onThinking(message) {
      await options.send({
        type: "agent:thinking",
        message,
      });
    },
    async onToolCall(event) {
      await options.send(createToolCallMessage(event));
    },
    async onToolResult(event) {
      await options.send(createToolResultMessage(event));
    },
    async onEdit(event) {
      await options.send(createEditMessage(event));
    },
    async onText(text) {
      await options.send({
        type: "agent:text",
        text,
      });
    },
    async onError(message) {
      await options.send({
        type: "agent:error",
        message,
      });
    },
    async onDone(event) {
      await options.send(createDoneMessage(event));
    },
  };
}
