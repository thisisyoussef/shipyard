import type { PreviewState } from "../artifacts/types.js";
import type { WorkbenchConnectionState } from "./workbench-state.js";

export interface UiRuntimeMemoryUsage {
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

export interface UiRuntimePreviewDiagnostics {
  status: PreviewState["status"];
  summary: string;
  url: string | null;
  logTail: string[];
  lastRestartReason: string | null;
}

export interface UiRuntimeUltimateDiagnostics {
  active: boolean;
  brief: string | null;
  startedAt: string | null;
  pendingHumanFeedback: number;
  statusText: string;
}

export interface UiRuntimeDiagnostics {
  pid: number;
  uptimeMs: number;
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  latestError: string | null;
  activeTurnId: string | null;
  instructionInFlight: boolean;
  deployInFlight: boolean;
  memoryUsage: UiRuntimeMemoryUsage;
  preview: UiRuntimePreviewDiagnostics;
  ultimate: UiRuntimeUltimateDiagnostics;
  lastActiveAt: string;
}

export interface UiHealthResponse {
  ok: true;
  runtimeMode: "ui";
  accessProtected: boolean;
  sessionId?: string;
  targetLabel?: string;
  targetDirectory?: string;
  workspaceDirectory?: string;
  turnCount?: number;
  runtime?: UiRuntimeDiagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isUiHealthResponse(value: unknown): value is UiHealthResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.runtimeMode === "ui" &&
    typeof value.accessProtected === "boolean"
  );
}

export function hasUiHealthRuntimeDetails(
  value: UiHealthResponse,
): value is UiHealthResponse & {
  sessionId: string;
  targetLabel: string;
  targetDirectory: string;
  workspaceDirectory: string;
  turnCount: number;
  runtime: UiRuntimeDiagnostics;
} {
  return (
    typeof value.sessionId === "string" &&
    typeof value.targetLabel === "string" &&
    typeof value.targetDirectory === "string" &&
    typeof value.workspaceDirectory === "string" &&
    typeof value.turnCount === "number" &&
    isRecord(value.runtime)
  );
}
