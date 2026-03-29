import { access, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WebSocketServer,
  type WebSocket,
} from "ws";

import {
  createInstructionRuntimeState,
  executeInstructionTurn,
  type InstructionRuntimeMode,
  type InstructionRuntimeState,
  type InstructionTurnReporter,
  type TurnStateEvent,
} from "../engine/turn.js";
import {
  DEFAULT_ULTIMATE_MODE_TURN_ROTATION_INTERVAL,
  createUltimateModeController,
  executeUltimateMode,
  formatUltimateModeStatus,
  parseUltimateModeCommand,
  type ExecuteUltimateModeOptions,
  type UltimateModeController,
} from "../engine/ultimate-mode.js";
import { formatTurnExecutionFingerprint } from "../engine/turn-fingerprint.js";
import {
  executePlanningTurn,
  isPlanModeInstruction,
  type ExecutePlanningTurnOptions,
} from "../plans/turn.js";
import {
  executePipelineTurn,
  isPipelineInstruction,
  type ExecutePipelineTurnOptions,
} from "../pipeline/turn.js";
import {
  executeTaskRunnerTurn,
  isTaskRunnerInstruction,
  type ExecuteTaskRunnerTurnOptions,
} from "../plans/task-runner.js";
import {
  executeTddTurn,
  isTddInstruction,
  type ExecuteTddTurnOptions,
} from "../tdd/turn.js";
import { abortTurn } from "../engine/cancellation.js";
import type { AgentRuntimeDependencies } from "../engine/graph.js";
import type { PreviewCapabilityReport, PreviewState } from "../artifacts/types.js";
import { discoverTarget } from "../context/discovery.js";
import {
  listSessionRunSummaries,
  loadSessionState,
  saveSessionState,
  switchTarget,
  type SessionState,
} from "../engine/state.js";
import {
  getTargetEnrichmentInvoker,
  planAutomaticEnrichment,
  resolveAutomaticTargetEnrichmentCapability,
} from "../engine/target-enrichment.js";
import { applySessionSwitchToRuntime } from "../engine/runtime-context.js";
import { createPreviewSupervisor } from "../preview/supervisor.js";
import type { PreviewSupervisor } from "../preview/supervisor.js";
import { shouldUseStarterCanvasForScratchTarget } from "../preview/contracts.js";
import type {
  BackendToFrontendMessage,
  DeploySummary,
  ProjectBoardState,
  TargetEnrichmentState,
  TargetManagerState,
} from "./contracts.js";
import {
  createClearedAccessCookie,
  createGrantedAccessCookie,
  getUiAccessState,
  isRequestAuthorized,
  isValidAccessToken,
  readAccessTokenFromRequest,
  redactAccessToken,
} from "./access.js";
import {
  parseFrontendMessage,
  serializeBackendMessage,
} from "./contracts.js";
import {
  createSessionStateMessage,
  createUiInstructionReporter,
} from "./events.js";
import {
  applyBackendMessage,
  appendPendingUploadReceipts,
  consumePendingUploadsForInstruction,
  createInitialDeploySummary,
  queueInstructionTurn,
  removePendingUploadReceipt,
  rotateInstructionTurn,
} from "./workbench-state.js";
import {
  createLocalTraceLogger,
  type LocalTraceLogger,
} from "../tracing/local-log.js";
import { buildTargetManagerState, IDLE_TARGET_ENRICHMENT_STATE } from "./target-manager.js";
import { createTargetTool } from "../tools/target-manager/create-target.js";
import { enrichTargetTool } from "../tools/target-manager/enrich-target.js";
import {
  deleteStoredUpload,
  MAX_UPLOAD_REQUEST_BYTES,
  readRequestBodyWithLimit,
  storeUploadCandidates,
  UploadValidationError,
} from "./uploads.js";
import {
  deployTargetTool,
  type DeployInput,
  type DeployResultData,
} from "../tools/deploy.js";
import type {
  ToolExecutionContext,
  ToolResult,
} from "../tools/registry.js";

const CLOSE_ENRICHMENT_DRAIN_TIMEOUT_MS = 100;
const ULTIMATE_MODE_TURN_ROTATION_INTERVAL =
  DEFAULT_ULTIMATE_MODE_TURN_ROTATION_INTERVAL;

export interface StartUiRuntimeServerOptions {
  sessionState: SessionState;
  host?: string;
  port?: number;
  projectRules: string;
  projectRulesLoaded: boolean;
  baseInjectedContext?: string[];
  targetEnrichmentInvoker?: (
    prompt: string,
  ) => Promise<{
    text: string;
    model: string;
  }>;
  runtimeMode?: InstructionRuntimeMode;
  runtimeDependencies?: AgentRuntimeDependencies;
  executePlanTurn?: (
    options: ExecutePlanningTurnOptions,
  ) => Promise<Awaited<ReturnType<typeof executePlanningTurn>>>;
  executePipelineTurn?: (
    options: ExecutePipelineTurnOptions,
  ) => Promise<Awaited<ReturnType<typeof executePipelineTurn>>>;
  executeDeploy?: (
    input: DeployInput,
    targetDirectory: string,
    context?: ToolExecutionContext,
  ) => Promise<ToolResult>;
  executeTaskTurn?: (
    options: ExecuteTaskRunnerTurnOptions,
  ) => Promise<Awaited<ReturnType<typeof executeTaskRunnerTurn>>>;
  executeTddTurn?: (
    options: ExecuteTddTurnOptions,
  ) => Promise<Awaited<ReturnType<typeof executeTddTurn>>>;
  executeUltimateMode?: (
    options: ExecuteUltimateModeOptions,
  ) => Promise<Awaited<ReturnType<typeof executeUltimateMode>>>;
}

export interface UiRuntimeServer {
  host: string;
  port: number;
  url: string;
  socketUrl: string;
  requestedPort: number;
  targetDirectory: string;
  workspaceDirectory: string;
  portResolution: UiPortResolution;
  close: () => Promise<void>;
  closed: Promise<void>;
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const workspaceDirectory = path.resolve(packageRoot, "..");
const builtUiDirectory = path.join(packageRoot, "dist", "ui");
const builtUiIndexPath = path.join(builtUiDirectory, "index.html");

interface UiHealthResponse {
  ok: true;
  runtimeMode: "ui";
  accessProtected: boolean;
  sessionId?: string;
  targetLabel?: string;
  targetDirectory?: string;
  workspaceDirectory?: string;
  turnCount?: number;
}

interface BrowserProjectRuntime {
  projectId: string;
  sessionState: SessionState;
  runtimeState: InstructionRuntimeState;
  projectRulesLoaded: boolean;
  traceLogger: LocalTraceLogger;
  targetManagerState: TargetManagerState;
  previewSupervisor: PreviewSupervisor;
  previewStarted: boolean;
  activeInstruction: Promise<void> | null;
  activeInstructionController: AbortController | null;
  activeUltimateController: UltimateModeController | null;
  activeDeploy: Promise<void> | null;
  activeDeployController: AbortController | null;
  deployInFlight: boolean;
  enrichmentRunSequence: number;
  activeEnrichmentRun:
    | {
        runId: number;
        targetPath: string;
      }
    | null;
  pendingEnrichmentTasks: Set<Promise<void>>;
}

export interface ExistingUiRuntimeInfo {
  url: string;
  sessionId: string;
  targetLabel: string;
  targetDirectory: string | null;
  workspaceDirectory: string | null;
}

export interface UiPortResolution {
  requestedPort: number;
  actualPort: number;
  usedFallbackPort: boolean;
  existingRuntime: ExistingUiRuntimeInfo | null;
}

function createHealthResponse(
  sessionState: SessionState,
  options: {
    accessProtected: boolean;
    includeRuntimeDetails: boolean;
  },
): UiHealthResponse {
  const baseResponse: UiHealthResponse = {
    ok: true,
    runtimeMode: "ui",
    accessProtected: options.accessProtected,
  };

  if (!options.includeRuntimeDetails) {
    return baseResponse;
  }

  return {
    ...baseResponse,
    sessionId: sessionState.sessionId,
    targetLabel: path.basename(sessionState.targetDirectory) || sessionState.targetDirectory,
    targetDirectory: sessionState.targetDirectory,
    workspaceDirectory,
    turnCount: sessionState.turnCount,
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function toHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(name, entry));
      continue;
    }

    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

function readCookie(
  request: IncomingMessage,
  name: string,
): string | null {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookieEntries = cookieHeader.split(";").map((entry) => entry.trim());

  for (const cookieEntry of cookieEntries) {
    if (!cookieEntry.startsWith(`${name}=`)) {
      continue;
    }

    return decodeURIComponent(cookieEntry.slice(name.length + 1));
  }

  return null;
}

function readAccessToken(request: IncomingMessage): string | null {
  const authorizationHeader = request.headers.authorization;

  if (typeof authorizationHeader === "string") {
    const bearerMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);

    if (bearerMatch?.[1]?.trim()) {
      return bearerMatch[1].trim();
    }
  }

  const tokenHeader = request.headers["x-shipyard-access-token"];

  if (typeof tokenHeader === "string" && tokenHeader.trim()) {
    return tokenHeader.trim();
  }

  return readCookie(request, "shipyard_access_token");
}

function requestIsAuthorized(request: IncomingMessage): boolean {
  const expectedToken = process.env.SHIPYARD_ACCESS_TOKEN?.trim();

  if (!expectedToken) {
    return true;
  }

  return readAccessToken(request) === expectedToken;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUiHealthResponse(value: unknown): value is UiHealthResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.runtimeMode === "ui" &&
    typeof value.accessProtected === "boolean"
  );
}

function hasUiHealthRuntimeDetails(
  value: UiHealthResponse,
): value is UiHealthResponse & {
  sessionId: string;
  targetLabel: string;
  targetDirectory: string;
  workspaceDirectory: string;
  turnCount: number;
} {
  return (
    typeof value.sessionId === "string" &&
    typeof value.targetLabel === "string" &&
    typeof value.targetDirectory === "string" &&
    typeof value.workspaceDirectory === "string" &&
    typeof value.turnCount === "number"
  );
}

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function hasSamePreviewCapability(
  left: PreviewCapabilityReport,
  right: PreviewCapabilityReport,
): boolean {
  return (
    left.status === right.status &&
    left.kind === right.kind &&
    left.runner === right.runner &&
    left.scriptName === right.scriptName &&
    left.command === right.command &&
    left.reason === right.reason &&
    left.autoRefresh === right.autoRefresh
  );
}

async function inspectExistingUiRuntime(
  host: string,
  port: number,
): Promise<ExistingUiRuntimeInfo | null> {
  try {
    const response = await fetch(`http://${host}:${String(port)}/api/health`);

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();

    if (!isUiHealthResponse(payload)) {
      return null;
    }

    if (!hasUiHealthRuntimeDetails(payload)) {
      return null;
    }

    return {
      url: `http://${host}:${String(port)}`,
      sessionId: payload.sessionId,
      targetLabel: payload.targetLabel,
      targetDirectory: payload.targetDirectory,
      workspaceDirectory: payload.workspaceDirectory,
    };
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath);

  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/html; charset=utf-8";
  }
}

function createFallbackUiHtml(sessionState: SessionState): string {
  const sessionMessage = createSessionStateMessage({
    sessionState,
    connectionState: "ready",
    projectRulesLoaded: false,
    sessionHistory: [],
    workspaceDirectory,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shipyard UI Runtime</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #121416;
        --panel: rgba(21, 25, 28, 0.9);
        --panel-border: rgba(255, 255, 255, 0.08);
        --accent: #d78c4b;
        --text: #edf1f3;
        --muted: #9aa8b0;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(215, 140, 75, 0.14), transparent 32rem),
          linear-gradient(180deg, #0b0d0f, var(--bg));
        color: var(--text);
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      }

      main {
        width: min(72rem, calc(100vw - 2rem));
        margin: 0 auto;
        padding: 2rem 0 3rem;
      }

      .hero {
        display: grid;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .badge {
        display: inline-flex;
        width: fit-content;
        border: 1px solid rgba(215, 140, 75, 0.4);
        border-radius: 999px;
        padding: 0.35rem 0.75rem;
        color: var(--accent);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.72rem;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 1.25rem;
        padding: 1.25rem;
        box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.22);
      }

      .grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      }

      pre {
        margin: 0;
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 0.9rem;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .muted {
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="badge">Shipyard UI Runtime</span>
        <div class="panel">
          <h1>Browser mode is live.</h1>
          <p class="muted">
            The React/Vite shell has not been built yet, so Shipyard is serving
            the fallback runtime contract view. Run <code>pnpm --dir shipyard build</code>
            to serve the bundled UI shell.
          </p>
        </div>
      </section>
      <section class="grid">
        <div class="panel">
          <h2>Shared Session Model</h2>
          <pre>${JSON.stringify(sessionMessage, null, 2)}</pre>
        </div>
        <div class="panel">
          <h2>Expected Frontend Messages</h2>
          <pre>{
  "instruction": { "text": "string", "injectedContext": ["string"] },
  "cancel": { "requestId": "string?" },
  "status": {},
  "target:switch_request": { "targetPath": "string" },
  "target:create_request": { "name": "string", "description": "string", "scaffoldType": "ts-pnpm-workspace|empty|react-ts|express-ts|python|go?" },
  "target:enrich_request": { "userDescription": "string?" },
  "deploy:request": { "platform": "vercel" }
}</pre>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

async function serveBuiltUi(
  requestPath: string,
  response: ServerResponse,
  fallbackHtml: string,
): Promise<void> {
  const normalizedPath = requestPath === "/"
    ? "index.html"
    : path.normalize(requestPath.replace(/^\/+/, ""));
  const resolvedPath = path.resolve(builtUiDirectory, normalizedPath);

  if (
    resolvedPath !== builtUiDirectory &&
    !resolvedPath.startsWith(`${builtUiDirectory}${path.sep}`)
  ) {
    response.writeHead(403, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Forbidden");
    return;
  }

  const assetExists = await fileExists(resolvedPath);

  if (assetExists) {
    const contents = await readFile(resolvedPath);
    response.writeHead(200, {
      "content-type": contentTypeFor(resolvedPath),
    });
    response.end(contents);
    return;
  }

  if (await fileExists(builtUiIndexPath)) {
    const indexHtml = await readFile(builtUiIndexPath);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(indexHtml);
    return;
  }

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(fallbackHtml);
}

function sendMessage(
  socket: WebSocket,
  message: BackendToFrontendMessage,
): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(serializeBackendMessage(message));
}

function createErrorMessage(message: string): BackendToFrontendMessage {
  return {
    type: "agent:error",
    message,
  };
}

function composeUltimateModeHumanFeedback(
  text: string,
  injectedContext?: string[],
): string {
  const parts = [
    text.trim(),
    ...(injectedContext ?? []).map((entry, index) =>
      `Attached human context ${String(index + 1)}:\n${entry}`
    ),
  ].filter((value) => value.trim().length > 0);

  return parts.join("\n\n");
}

function hasVercelToken(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL_TOKEN?.trim());
}

function getDeployUnavailableReason(
  sessionState: SessionState,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (sessionState.activePhase !== "code") {
    return "Select or create a target before deploying to Vercel.";
  }

  if (!hasVercelToken(env)) {
    return "Configure VERCEL_TOKEN on the hosted Shipyard service to enable deploys.";
  }

  return null;
}

function isDeployResultData(value: unknown): value is DeployResultData {
  return (
    isRecord(value) &&
    value.platform === "vercel" &&
    typeof value.productionUrl === "string" &&
    typeof value.command === "string" &&
    typeof value.logExcerpt === "string" &&
    (typeof value.exitCode === "number" || value.exitCode === null) &&
    typeof value.timedOut === "boolean"
  );
}

function synchronizeDeploySummary(
  currentSummary: DeploySummary | undefined,
  sessionState: SessionState,
  options: {
    deploying: boolean;
    now?: string;
  },
): DeploySummary {
  const baseline = createInitialDeploySummary(currentSummary);
  const defaultIdleSummary = createInitialDeploySummary().summary;
  const unavailableReason = options.deploying
    ? "A deploy is already in progress."
    : getDeployUnavailableReason(sessionState);
  const nextSummary: DeploySummary = {
    ...baseline,
    available: unavailableReason === null,
    unavailableReason,
  };

  if (baseline.status === "deploying" && !options.deploying) {
    nextSummary.status = "error";
    nextSummary.summary =
      "The previous deploy did not finish before Shipyard stopped tracking it. Retry the deploy when ready.";
    nextSummary.completedAt = baseline.completedAt ?? options.now ?? new Date().toISOString();
  }

  if (nextSummary.status === "idle") {
    if (unavailableReason) {
      nextSummary.summary = unavailableReason;
    } else if (!baseline.summary.trim() || baseline.summary === defaultIdleSummary) {
      nextSummary.summary =
        "Auto-publish is ready. Shipyard will publish the next successful code change to Vercel.";
    }
  }

  return nextSummary;
}

function createDeployingSummary(
  currentSummary: DeploySummary | undefined,
  sessionState: SessionState,
  requestedAt: string,
): DeploySummary {
  const baseline = synchronizeDeploySummary(currentSummary, sessionState, {
    deploying: false,
    now: requestedAt,
  });

  return {
    ...baseline,
    status: "deploying",
    available: false,
    unavailableReason: "A deploy is already in progress.",
    summary: "Deploying the current target to Vercel.",
    logExcerpt: null,
    requestedAt,
    completedAt: null,
  };
}

function createSuccessfulDeploySummary(
  currentSummary: DeploySummary | undefined,
  sessionState: SessionState,
  data: DeployResultData,
  requestedAt: string,
  completedAt: string,
): DeploySummary {
  const baseline = synchronizeDeploySummary(currentSummary, sessionState, {
    deploying: false,
    now: completedAt,
  });

  return {
    ...baseline,
    status: "success",
    productionUrl: data.productionUrl,
    summary: `Deploy completed. Public URL: ${data.productionUrl}`,
    logExcerpt: data.logExcerpt || null,
    command: data.command || null,
    requestedAt,
    completedAt,
  };
}

function createFailedDeploySummary(
  currentSummary: DeploySummary | undefined,
  sessionState: SessionState,
  result: ToolResult,
  requestedAt: string,
  completedAt: string,
): DeploySummary {
  const baseline = synchronizeDeploySummary(currentSummary, sessionState, {
    deploying: false,
    now: completedAt,
  });
  const data = isDeployResultData(result.data) ? result.data : null;
  const rawFailureDetail = (data?.logExcerpt || result.error || "").trim();
  const missingToken =
    rawFailureDetail.includes("VERCEL_TOKEN is required") ||
    rawFailureDetail.includes("VERCEL_TOKEN");
  const timedOut = data?.timedOut === true;
  let summary = "Deploy failed. Review the provider output excerpt and retry.";

  if (missingToken) {
    summary =
      "Deploy unavailable until VERCEL_TOKEN is configured on the hosted Shipyard service.";
  } else if (timedOut) {
    summary =
      "Deploy timed out before Vercel reported a production URL. Retry once the provider is healthy.";
  } else if (/interrupted|cancelled|canceled/i.test(rawFailureDetail)) {
    summary = "Deploy cancelled before Vercel reported a production URL.";
  }

  return {
    ...baseline,
    status: "error",
    available: missingToken ? false : baseline.available,
    unavailableReason: missingToken
      ? "Configure VERCEL_TOKEN on the hosted Shipyard service to enable deploys."
      : baseline.unavailableReason,
    summary,
    logExcerpt: rawFailureDetail || null,
    command: data?.command ?? baseline.command,
    requestedAt,
    completedAt,
  };
}

export function resolveUiHost(hostOverride?: string): string {
  if (hostOverride?.trim()) {
    return hostOverride.trim();
  }

  const envHost = process.env.SHIPYARD_UI_HOST?.trim();

  if (envHost) {
    return envHost;
  }

  return "127.0.0.1";
}

export function resolveUiPort(portOverride: number | undefined): number {
  if (portOverride !== undefined) {
    return portOverride;
  }

  const envPort = process.env.SHIPYARD_UI_PORT ?? process.env.PORT;

  if (!envPort) {
    return 3210;
  }

  const parsedPort = Number.parseInt(envPort, 10);

  if (Number.isNaN(parsedPort) || parsedPort < 0) {
    throw new Error(
      `Invalid SHIPYARD_UI_PORT value: ${envPort}. Expected a non-negative integer.`,
    );
  }

  return parsedPort;
}

async function listenOnPort(
  httpServer: ReturnType<typeof createServer>,
  host: string,
  port: number,
): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("error", onError);
      reject(error);
    };

    httpServer.once("error", onError);
    httpServer.listen(port, host, () => {
      httpServer.off("error", onError);
      resolve();
    });
  });

  const address = httpServer.address();

  if (!address || typeof address === "string") {
    throw new Error("UI runtime failed to resolve a listening address.");
  }

  return address;
}

async function resolveUiPortBinding(
  httpServer: ReturnType<typeof createServer>,
  host: string,
  portOverride: number | undefined,
): Promise<UiPortResolution> {
  const requestedPort = resolveUiPort(portOverride);

  if (requestedPort === 0) {
    const address = await listenOnPort(httpServer, host, 0);

    return {
      requestedPort,
      actualPort: address.port,
      usedFallbackPort: false,
      existingRuntime: null,
    };
  }

  let candidatePort = requestedPort;
  let existingRuntime: ExistingUiRuntimeInfo | null = null;

  for (let attempts = 0; attempts < 25; attempts += 1) {
    try {
      const address = await listenOnPort(httpServer, host, candidatePort);

      return {
        requestedPort,
        actualPort: address.port,
        usedFallbackPort: candidatePort !== requestedPort,
        existingRuntime,
      };
    } catch (error) {
      if (!isPortInUseError(error)) {
        throw error;
      }

      if (candidatePort === requestedPort && existingRuntime === null) {
        existingRuntime = await inspectExistingUiRuntime(host, candidatePort);
      }

      candidatePort += 1;
    }
  }

  throw new Error(
    `Unable to find an open UI port starting at ${String(requestedPort)}.`,
  );
}

export async function startUiRuntimeServer(
  options: StartUiRuntimeServerOptions,
): Promise<UiRuntimeServer> {
  const host = resolveUiHost(options.host);
  const initialSessionState = options.sessionState;
  const fallbackHtml = createFallbackUiHtml(initialSessionState);
  const executePlanTurn = options.executePlanTurn ?? executePlanningTurn;
  const executePipelineTurnImpl =
    options.executePipelineTurn ?? executePipelineTurn;
  const executeDeploy = options.executeDeploy ?? deployTargetTool;
  const executeTaskTurn = options.executeTaskTurn ?? executeTaskRunnerTurn;
  const executeTddTurnImpl = options.executeTddTurn ?? executeTddTurn;
  const executeUltimateModeTurn = options.executeUltimateMode ?? executeUltimateMode;
  const projectRuntimes = new Map<string, BrowserProjectRuntime>();
  let activeProjectId = "";

  const createProjectId = (sessionState: SessionState): string =>
    sessionState.activePhase === "target-manager"
      ? sessionState.targetsDirectory
      : sessionState.targetDirectory;

  const getProject = (projectId: string): BrowserProjectRuntime => {
    const project = projectRuntimes.get(projectId);

    if (!project) {
      throw new Error(`Project runtime ${projectId} is not available.`);
    }

    return project;
  };

  const getActiveProject = (): BrowserProjectRuntime => getProject(activeProjectId);

  const createProjectRuntime = async (
    sessionState: SessionState,
    seed?: {
      projectRules?: string;
      projectRulesLoaded?: boolean;
      baseInjectedContext?: string[];
    },
  ): Promise<BrowserProjectRuntime> => {
    const runtimeState = createInstructionRuntimeState({
      projectRules: seed?.projectRules ?? "",
      baseInjectedContext: seed?.baseInjectedContext,
      targetEnrichmentInvoker: options.targetEnrichmentInvoker,
      runtimeMode: options.runtimeMode,
      runtimeDependencies: options.runtimeDependencies,
    });

    if (!seed) {
      await applySessionSwitchToRuntime(sessionState, runtimeState);
    }

    const project = {
      projectId: createProjectId(sessionState),
      sessionState,
      runtimeState,
      projectRulesLoaded: seed?.projectRulesLoaded ?? Boolean(runtimeState.projectRules),
      traceLogger: await createLocalTraceLogger(
        sessionState.targetDirectory,
        sessionState.sessionId,
      ),
      targetManagerState: await buildTargetManagerState(sessionState),
      previewSupervisor: null as unknown as PreviewSupervisor,
      previewStarted: false,
      activeInstruction: null,
      activeInstructionController: null,
      activeUltimateController: null,
      activeDeploy: null,
      activeDeployController: null,
      deployInFlight: false,
      enrichmentRunSequence: 0,
      activeEnrichmentRun: null,
      pendingEnrichmentTasks: new Set<Promise<void>>(),
    } satisfies BrowserProjectRuntime;

    project.sessionState.workbenchState.targetManager = project.targetManagerState;
    project.sessionState.workbenchState.latestDeploy = synchronizeDeploySummary(
      project.sessionState.workbenchState.latestDeploy,
      project.sessionState,
      {
        deploying: false,
      },
    );

    return project;
  };

  const initialProject = await createProjectRuntime(initialSessionState, {
    projectRules: options.projectRules,
    projectRulesLoaded: options.projectRulesLoaded,
    baseInjectedContext: options.baseInjectedContext,
  });
  projectRuntimes.set(initialProject.projectId, initialProject);
  activeProjectId = initialProject.projectId;
  await initialProject.traceLogger.log("session.start", {
    sessionId: initialProject.sessionState.sessionId,
    targetDirectory: initialProject.sessionState.targetDirectory,
    discovery: initialProject.sessionState.discovery,
    phase: initialProject.sessionState.activePhase,
    runtimeMode: "ui",
  });
  await saveSessionState(initialProject.sessionState);
  const httpServer = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const requestLocation = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? `${host}:${String(options.port ?? 3210)}`}`,
      );
      const requestPath = requestLocation.pathname;
      const accessState = getUiAccessState(request);

      if (requestPath === "/api/health") {
        const activeProject = getActiveProject();
        sendJson(
          response,
          200,
          createHealthResponse(activeProject.sessionState, {
            accessProtected: accessState.required,
            includeRuntimeDetails:
              accessState.authenticated || !accessState.required,
          }),
        );
        return;
      }

      if (requestPath === "/api/access") {
        if (request.method === "GET") {
          response.writeHead(200, {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          });
          response.end(JSON.stringify(accessState));
          return;
        }

        if (request.method === "POST") {
          if (!accessState.required) {
            response.writeHead(200, {
              "cache-control": "no-store",
              "content-type": "application/json; charset=utf-8",
            });
            response.end(
              JSON.stringify({
                required: false,
                authenticated: true,
              }),
            );
            return;
          }

          try {
            const providedToken = await readAccessTokenFromRequest(request);

            if (!isValidAccessToken(providedToken)) {
              response.writeHead(401, {
                "cache-control": "no-store",
                "content-type": "application/json; charset=utf-8",
                "set-cookie": createClearedAccessCookie(request),
              });
              response.end(
                JSON.stringify({
                  required: true,
                  authenticated: false,
                  message:
                    "Invalid access token. Enter the shared token to continue.",
                }),
              );
              return;
            }

            response.writeHead(200, {
              "cache-control": "no-store",
              "content-type": "application/json; charset=utf-8",
              "set-cookie": createGrantedAccessCookie(request),
            });
            response.end(
              JSON.stringify({
                required: true,
                authenticated: true,
              }),
            );
            return;
          } catch (error) {
            const errorMessage = redactAccessToken(
              error instanceof Error
                ? error.message
                : "Invalid access token payload.",
            );
            response.writeHead(400, {
              "cache-control": "no-store",
              "content-type": "application/json; charset=utf-8",
              "set-cookie": createClearedAccessCookie(request),
            });
            response.end(
              JSON.stringify({
                required: true,
                authenticated: false,
                message: errorMessage,
              }),
            );
            return;
          }
        }

        response.writeHead(405, {
          allow: "GET, POST",
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify({ error: "Method not allowed." }));
        return;
      }

      if (requestPath === "/api/uploads") {
        await handleUploadRequest(request, response, requestLocation);
        return;
      }

      if (requestPath.startsWith("/api/uploads/")) {
        await handleUploadDeleteRequest(request, response, requestLocation);
        return;
      }

      await serveBuiltUi(requestPath, response, fallbackHtml);
    },
  );
  const socketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  let isClosing = false;
  const closed = new Promise<void>((resolve) => {
    httpServer.once("close", () => {
      resolve();
    });
  });

  const projectConnectionState = (
    project: BrowserProjectRuntime,
  ): "ready" | "agent-busy" => {
    if (project.activeInstruction !== null || project.deployInFlight) {
      return "agent-busy";
    }

    return "ready";
  };

  const projectBoardStatus = (
    project: BrowserProjectRuntime,
  ): "ready" | "agent-busy" | "error" => {
    if (project.activeInstruction !== null || project.deployInFlight) {
      return "agent-busy";
    }

    if (
      project.sessionState.workbenchState.connectionState === "error" ||
      project.sessionState.workbenchState.latestError
    ) {
      return "error";
    }

    return "ready";
  };

  const sendToSocket = async (
    socket: WebSocket,
    message: BackendToFrontendMessage,
  ): Promise<void> => {
    try {
      sendMessage(socket, message);
    } catch {
      // Keep the local engine running if a browser connection drops mid-turn.
    }
  };

  const broadcast = async (message: BackendToFrontendMessage): Promise<void> => {
    await Promise.all(
      [...sockets].map((socket) => sendToSocket(socket, message)),
    );
  };

  const createProjectBoardState = (): ProjectBoardState => {
    const openProjects = [...projectRuntimes.values()]
      .map((project) => {
        const targetManager =
          project.sessionState.workbenchState.targetManager ??
          project.targetManagerState;
        const currentTarget = targetManager.currentTarget;

        return {
          projectId: project.projectId,
          targetPath: project.sessionState.targetDirectory,
          targetName: currentTarget.name,
          description: currentTarget.description,
          activePhase: project.sessionState.activePhase,
          status: projectBoardStatus(project),
          agentStatus: project.sessionState.workbenchState.agentStatus,
          hasProfile: currentTarget.hasProfile,
          lastActiveAt: project.sessionState.lastActiveAt,
          turnCount: project.sessionState.turnCount,
        };
      })
      .sort((left, right) => {
        if (left.projectId === activeProjectId) {
          return -1;
        }

        if (right.projectId === activeProjectId) {
          return 1;
        }

        return Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt);
      });
    const boardState: ProjectBoardState = {
      activeProjectId: activeProjectId || null,
      openProjects,
    };

    for (const project of projectRuntimes.values()) {
      project.sessionState.workbenchState.projectBoard = boardState;
    }

    return boardState;
  };

  const sendProjectsState = async (socket: WebSocket): Promise<ProjectBoardState> => {
    const state = createProjectBoardState();
    await sendToSocket(socket, {
      type: "projects:state",
      state,
    });
    return state;
  };

  const broadcastProjectsState = async (): Promise<ProjectBoardState> => {
    const state = createProjectBoardState();
    await broadcast({
      type: "projects:state",
      state,
    });
    return state;
  };

  const emitProjectMessage = async (
    project: BrowserProjectRuntime,
    message: BackendToFrontendMessage,
    options: {
      broadcastIfActive?: boolean;
      syncProjects?: boolean;
    } = {},
  ): Promise<void> => {
    project.sessionState.workbenchState =
      message.type === "session:state"
        ? message.workbenchState
        : applyBackendMessage(project.sessionState.workbenchState, message);

    if (message.type === "target:state" || message.type === "target:switch_complete") {
      project.targetManagerState = message.state;
    }

    if ((options.broadcastIfActive ?? true) && project.projectId === activeProjectId) {
      await broadcast(message);
    }

    if (options.syncProjects ?? true) {
      await broadcastProjectsState();
    }
  };

  const syncLatestDeploy = (
    project: BrowserProjectRuntime,
  ): DeploySummary => {
    const nextDeploy = synchronizeDeploySummary(
      project.sessionState.workbenchState.latestDeploy,
      project.sessionState,
      {
        deploying: project.deployInFlight,
      },
    );
    project.sessionState.workbenchState.latestDeploy = nextDeploy;
    return nextDeploy;
  };

  const currentEnrichmentState = (
    project: BrowserProjectRuntime,
  ): TargetEnrichmentState =>
    project.sessionState.workbenchState.targetManager?.enrichmentStatus ??
    IDLE_TARGET_ENRICHMENT_STATE;

  const syncTargetManagerState = async (
    project: BrowserProjectRuntime,
    enrichmentState: TargetEnrichmentState = currentEnrichmentState(project),
  ): Promise<TargetManagerState> => {
    project.targetManagerState = await buildTargetManagerState(
      project.sessionState,
      enrichmentState,
    );
    project.sessionState.workbenchState.targetManager = project.targetManagerState;
    return project.targetManagerState;
  };

  const createSessionMessage = async (
    project: BrowserProjectRuntime,
  ): Promise<Extract<BackendToFrontendMessage, { type: "session:state" }>> => {
    await syncTargetManagerState(project);
    syncLatestDeploy(project);
    createProjectBoardState();
    const sessionHistory = await listSessionRunSummaries(
      project.sessionState.targetDirectory,
      project.sessionState.sessionId,
    );

    return createSessionStateMessage({
      sessionState: project.sessionState,
      connectionState: projectConnectionState(project),
      projectRulesLoaded: project.projectRulesLoaded,
      sessionHistory,
      workspaceDirectory,
    }) as Extract<BackendToFrontendMessage, { type: "session:state" }>;
  };

  const publishPreviewState = async (
    project: BrowserProjectRuntime,
    previewState: PreviewState,
  ): Promise<void> => {
    project.sessionState.workbenchState = applyBackendMessage(
      project.sessionState.workbenchState,
      {
        type: "preview:state",
        preview: previewState,
      },
    );

    await project.traceLogger.log("preview.state", {
      sessionId: project.sessionState.sessionId,
      preview: previewState,
    });
    await saveSessionState(project.sessionState);

    if (project.projectId === activeProjectId) {
      await broadcast({
        type: "preview:state",
        preview: previewState,
      });
    }
  };

  const createPreviewBridge = (project: BrowserProjectRuntime) =>
    createPreviewSupervisor({
      targetDirectory: project.sessionState.targetDirectory,
      capability: project.sessionState.discovery.previewCapability,
      starterCanvasOnUnavailable: shouldUseStarterCanvasForScratchTarget({
        activePhase: project.sessionState.activePhase,
        discovery: project.sessionState.discovery,
      }),
      starterCanvasOnStartupFailure: project.sessionState.activePhase === "code",
      onState: (previewState) => publishPreviewState(project, previewState),
    });

  initialProject.previewSupervisor = createPreviewBridge(initialProject);
  createProjectBoardState();

  const sendSessionState = async (
    socket: WebSocket,
    project: BrowserProjectRuntime = getActiveProject(),
  ): Promise<void> => {
    await sendToSocket(socket, await createSessionMessage(project));
  };

  const broadcastSessionState = async (
    project: BrowserProjectRuntime = getActiveProject(),
  ): Promise<void> => {
    const message = await createSessionMessage(project);

    if (project.projectId === activeProjectId) {
      await broadcast(message);
    }

    await saveSessionState(project.sessionState);
    await broadcastProjectsState();
  };

  const sendTargetState = async (
    socket: WebSocket,
    project: BrowserProjectRuntime = getActiveProject(),
  ): Promise<void> => {
    const nextTargetManagerState = await syncTargetManagerState(project);
    await sendToSocket(socket, {
      type: "target:state",
      state: nextTargetManagerState,
    });
  };

  const broadcastTargetState = async (
    project: BrowserProjectRuntime = getActiveProject(),
    enrichmentState: TargetEnrichmentState = currentEnrichmentState(project),
  ): Promise<TargetManagerState> => {
    const nextTargetManagerState = await syncTargetManagerState(
      project,
      enrichmentState,
    );
    await emitProjectMessage(project, {
      type: "target:state",
      state: nextTargetManagerState,
    });
    await saveSessionState(project.sessionState);
    return nextTargetManagerState;
  };

  const broadcastTargetSwitchComplete = async (
    project: BrowserProjectRuntime,
    success: boolean,
    message: string,
    nextTargetManagerState: TargetManagerState,
  ): Promise<void> => {
    await emitProjectMessage(project, {
      type: "target:switch_complete",
      success,
      message,
      state: nextTargetManagerState,
      projectId: project.projectId,
    });
    await saveSessionState(project.sessionState);
  };

  const broadcastEnrichmentProgress = async (
    project: BrowserProjectRuntime,
    status: "queued" | "started" | "in-progress" | "complete" | "error",
    message: string,
  ): Promise<void> => {
    await emitProjectMessage(project, {
      type: "target:enrichment_progress",
      status,
      message,
    });
    await saveSessionState(project.sessionState);
  };

  const broadcastDeployState = async (
    project: BrowserProjectRuntime = getActiveProject(),
    deploy: DeploySummary = syncLatestDeploy(project),
  ): Promise<DeploySummary> => {
    await emitProjectMessage(project, {
      type: "deploy:state",
      deploy,
    });
    await saveSessionState(project.sessionState);
    return deploy;
  };

  const logUploadTrace = async (
    event: "upload.accepted" | "upload.rejected" | "upload.removed" | "upload.handoff",
    payload: Record<string, unknown>,
    project: BrowserProjectRuntime = getActiveProject(),
  ): Promise<void> => {
    await project.traceLogger.log(event, {
      sessionId: project.sessionState.sessionId,
      targetDirectory: project.sessionState.targetDirectory,
      runtimeMode: "ui",
      ...payload,
    });
  };

  const parseUploadRequest = async (
    request: IncomingMessage,
    requestLocation: URL,
  ): Promise<{
    sessionId: string;
    candidates: Array<{
      originalName: string;
      mediaType: string;
      contents: Buffer;
    }>;
  }> => {
    const requestBody = await readRequestBodyWithLimit(
      request as AsyncIterable<string | Buffer>,
      MAX_UPLOAD_REQUEST_BYTES,
    );
    const multipartRequest = new Request(requestLocation, {
      method: request.method ?? "POST",
      headers: toHeaders(request),
      body: new Uint8Array(requestBody),
    });
    const formData = await multipartRequest.formData();
    const sessionId = formData.get("sessionId");

    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new UploadValidationError(
        "Upload requests must include the active session id.",
        400,
      );
    }

    const files = formData.getAll("files").filter((value): value is File =>
      value instanceof File
    );

    if (files.length === 0) {
      throw new UploadValidationError("Attach at least one file before uploading.", 400);
    }

    const candidates = await Promise.all(
      files.map(async (file) => ({
        originalName: file.name,
        mediaType: file.type || "text/plain",
        contents: Buffer.from(await file.arrayBuffer()),
      })),
    );

    return {
      sessionId: sessionId.trim(),
      candidates,
    };
  };

  const handleUploadRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    requestLocation: URL,
  ): Promise<void> => {
    const project = getActiveProject();

    try {
      if (!requestIsAuthorized(request)) {
        sendJson(response, 401, {
          error: "Upload access token is missing or invalid.",
        });
        return;
      }

      if (request.method !== "POST") {
        sendJson(response, 405, {
          error: "Uploads require POST.",
        });
        return;
      }

      const { sessionId, candidates } = await parseUploadRequest(
        request,
        requestLocation,
      );

      if (sessionId !== project.sessionState.sessionId) {
        throw new UploadValidationError(
          "The requested upload session does not match the active browser session.",
          409,
        );
      }

      const receipts = await storeUploadCandidates({
        sessionId,
        targetDirectory: project.sessionState.targetDirectory,
        existingReceipts: project.sessionState.workbenchState.pendingUploads,
        candidates,
      });

      project.sessionState.workbenchState = appendPendingUploadReceipts(
        project.sessionState.workbenchState,
        receipts,
      );
      await saveSessionState(project.sessionState);
      await broadcastSessionState(project);
      await logUploadTrace("upload.accepted", {
        files: receipts.map((receipt) => ({
          id: receipt.id,
          originalName: receipt.originalName,
          storedRelativePath: receipt.storedRelativePath,
          sizeBytes: receipt.sizeBytes,
          mediaType: receipt.mediaType,
        })),
      }, project);
      sendJson(response, 201, {
        receipts,
      });
    } catch (error) {
      const statusCode = error instanceof UploadValidationError
        ? error.statusCode
        : 400;
      const message = error instanceof Error
        ? error.message
        : "Upload request failed.";
      await logUploadTrace("upload.rejected", {
        message,
        path: requestLocation.pathname,
      }, project);
      sendJson(response, statusCode, {
        error: message,
      });
    }
  };

  const handleUploadDeleteRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    requestLocation: URL,
  ): Promise<void> => {
    const project = getActiveProject();

    try {
      if (!requestIsAuthorized(request)) {
        sendJson(response, 401, {
          error: "Upload access token is missing or invalid.",
        });
        return;
      }

      if (request.method !== "DELETE") {
        sendJson(response, 405, {
          error: "Upload removal requires DELETE.",
        });
        return;
      }

      const sessionId = requestLocation.searchParams.get("sessionId")?.trim();

      if (!sessionId) {
        throw new UploadValidationError(
          "Upload removal requires the active session id.",
          400,
        );
      }

      if (sessionId !== project.sessionState.sessionId) {
        throw new UploadValidationError(
          "The requested upload session does not match the active browser session.",
          409,
        );
      }

      const uploadId = requestLocation.pathname.replace("/api/uploads/", "").trim();

      if (!uploadId) {
        throw new UploadValidationError("Upload removal requires an upload id.", 400);
      }

      const receipt = project.sessionState.workbenchState.pendingUploads.find(
        (pendingUpload) => pendingUpload.id === uploadId,
      );

      if (!receipt) {
        sendJson(response, 404, {
          error: `Pending upload ${uploadId} was not found.`,
        });
        return;
      }

      await deleteStoredUpload({
        sessionId,
        targetDirectory: project.sessionState.targetDirectory,
        receipt,
      });
      project.sessionState.workbenchState = removePendingUploadReceipt(
        project.sessionState.workbenchState,
        uploadId,
      );
      await saveSessionState(project.sessionState);
      await broadcastSessionState(project);
      await logUploadTrace("upload.removed", {
        id: receipt.id,
        originalName: receipt.originalName,
        storedRelativePath: receipt.storedRelativePath,
      }, project);
      sendJson(response, 200, {
        removedId: uploadId,
      });
    } catch (error) {
      const statusCode = error instanceof UploadValidationError
        ? error.statusCode
        : 400;
      const message = error instanceof Error
        ? error.message
        : "Upload removal failed.";
      await logUploadTrace("upload.rejected", {
        message,
        path: requestLocation.pathname,
      }, project);
      sendJson(response, statusCode, {
        error: message,
      });
    }
  };

  const logTargetEnrichment = async (
    project: BrowserProjectRuntime,
    event: {
      targetPath: string;
      trigger: "automatic" | "manual";
      status: string;
      message: string;
      reason: string;
    },
  ): Promise<void> => {
    await project.traceLogger.log("target.enrichment", {
      sessionId: project.sessionState.sessionId,
      targetDirectory: event.targetPath,
      trigger: event.trigger,
      status: event.status,
      message: event.message,
      reason: event.reason,
      runtimeMode: "ui",
    });
  };

  const isStaleEnrichmentRun = (
    project: BrowserProjectRuntime,
    runId: number,
    targetPath: string,
  ): boolean =>
    isClosing ||
    project.activeEnrichmentRun?.runId !== runId ||
    project.activeEnrichmentRun.targetPath !== targetPath ||
    project.sessionState.activePhase !== "code" ||
    project.sessionState.targetDirectory !== targetPath;

  const runBrowserTargetEnrichment = async (
    project: BrowserProjectRuntime,
    options: {
      targetPath: string;
      trigger: "automatic" | "manual";
      userDescription?: string;
      reason: string;
    },
  ): Promise<void> => {
    const runId = ++project.enrichmentRunSequence;
    project.activeEnrichmentRun = {
      runId,
      targetPath: options.targetPath,
    };

    try {
      const profile = await enrichTargetTool(
        {
          targetPath: options.targetPath,
          userDescription: options.userDescription,
        },
        {
          invokeModel: getTargetEnrichmentInvoker({
            invokeModel: project.runtimeState.targetEnrichmentInvoker,
            modelRouting: project.runtimeState.modelRouting,
            env: project.runtimeState.modelRoutingEnv,
          }),
          shouldCancel: () => isStaleEnrichmentRun(project, runId, options.targetPath),
          async onProgress(event) {
            if (isStaleEnrichmentRun(project, runId, options.targetPath)) {
              return;
            }

            await broadcastEnrichmentProgress(project, event.status, event.message);
          },
        },
      );

      if (isStaleEnrichmentRun(project, runId, options.targetPath)) {
        return;
      }

      project.sessionState.targetProfile = profile;
      await broadcastTargetState(project, {
        status: "complete",
        message: "Target profile saved.",
      });
      await broadcastSessionState(project);
      await logTargetEnrichment(project, {
        targetPath: options.targetPath,
        trigger: options.trigger,
        status: "complete",
        message: "Target profile saved.",
        reason: options.reason,
      });
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Target enrichment failed.";

      if (isStaleEnrichmentRun(project, runId, options.targetPath)) {
        return;
      }

      await broadcastTargetState(project, {
        status: "error",
        message: errorMessage,
      });
      await broadcastSessionState(project);
      await logTargetEnrichment(project, {
        targetPath: options.targetPath,
        trigger: options.trigger,
        status: "error",
        message: errorMessage,
        reason: options.reason,
      });
    } finally {
      if (project.activeEnrichmentRun?.runId === runId) {
        project.activeEnrichmentRun = null;
      }
    }
  };

  const startBrowserTargetEnrichment = (
    project: BrowserProjectRuntime,
    options: Parameters<typeof runBrowserTargetEnrichment>[1],
  ): void => {
    const task = runBrowserTargetEnrichment(project, options);
    project.pendingEnrichmentTasks.add(task);
    void task.finally(() => {
      project.pendingEnrichmentTasks.delete(task);
    });
  };

  const maybeAutoEnrichBrowserTarget = async (
    project: BrowserProjectRuntime,
    options: {
      creationDescription?: string;
      reason: string;
    },
  ): Promise<void> => {
    if (isClosing || project.sessionState.activePhase !== "code") {
      return;
    }

    const targetPath = project.sessionState.targetDirectory;

    if (project.activeEnrichmentRun?.targetPath === targetPath) {
      return;
    }

    const plan = planAutomaticEnrichment({
      discovery: project.sessionState.discovery,
      targetProfile: project.sessionState.targetProfile,
      creationDescription: options.creationDescription,
    });

    if (plan.kind === "skip-existing-profile") {
      return;
    }

    const capability = resolveAutomaticTargetEnrichmentCapability({
      invokeModel: project.runtimeState.targetEnrichmentInvoker,
      modelRouting: project.runtimeState.modelRouting,
      env: project.runtimeState.modelRoutingEnv,
    });

    if (!capability.available) {
      const message =
        capability.reason
        ?? "Automatic analysis is unavailable until target enrichment is configured.";

      await broadcastTargetState(project, {
        status: "idle",
        message,
      });
      await logTargetEnrichment(project, {
        targetPath,
        trigger: "automatic",
        status: "skipped",
        message,
        reason: options.reason,
      });
      return;
    }

    if (plan.kind === "needs-description") {
      await broadcastTargetState(project, {
        status: "idle",
        message: plan.message,
      });
      await logTargetEnrichment(project, {
        targetPath,
        trigger: "automatic",
        status: "needs-context",
        message: plan.message,
        reason: options.reason,
      });
      return;
    }

    await broadcastEnrichmentProgress(project, "queued", plan.queuedMessage);
    await logTargetEnrichment(project, {
      targetPath,
      trigger: "automatic",
      status: "queued",
      message: plan.queuedMessage,
      reason: options.reason,
    });
    startBrowserTargetEnrichment(project, {
      targetPath,
      trigger: "automatic",
      userDescription: plan.userDescription,
      reason: options.reason,
    });
  };

  const restartPreviewSupervisor = async (
    project: BrowserProjectRuntime,
    options?: { silent?: boolean },
  ): Promise<void> => {
    await project.previewSupervisor.stop(options);
    project.previewStarted = false;
    project.previewSupervisor = createPreviewBridge(project);
    await publishPreviewState(project, project.previewSupervisor.getState());

    if (sockets.size > 0) {
      project.previewStarted = true;
      void project.previewSupervisor.start();
    }
  };

  const replaceProjectSession = async (
    project: BrowserProjectRuntime,
    nextState: SessionState,
    reason: string,
    enrichmentState: TargetEnrichmentState = IDLE_TARGET_ENRICHMENT_STATE,
  ): Promise<TargetManagerState> => {
    const previousProjectId = project.projectId;
    project.sessionState = nextState;
    project.projectId = createProjectId(nextState);
    project.sessionState.workbenchState.latestDeploy = synchronizeDeploySummary(
      project.sessionState.workbenchState.latestDeploy,
      project.sessionState,
      {
        deploying: project.deployInFlight,
      },
    );
    await applySessionSwitchToRuntime(project.sessionState, project.runtimeState);
    project.projectRulesLoaded = Boolean(project.runtimeState.projectRules);
    project.traceLogger = await createLocalTraceLogger(
      project.sessionState.targetDirectory,
      project.sessionState.sessionId,
    );

    if (previousProjectId !== project.projectId) {
      projectRuntimes.delete(previousProjectId);
      projectRuntimes.set(project.projectId, project);
    }

    await project.traceLogger.log("session.switch", {
      sessionId: project.sessionState.sessionId,
      targetDirectory: project.sessionState.targetDirectory,
      phase: project.sessionState.activePhase,
      reason,
      runtimeMode: "ui",
    });
    await restartPreviewSupervisor(project, { silent: true });
    return syncTargetManagerState(project, enrichmentState);
  };

  const ensureProjectRuntimeForTarget = async (
    sourceProject: BrowserProjectRuntime,
    targetPath: string,
  ): Promise<{ project: BrowserProjectRuntime; reused: boolean }> => {
    const resolvedTargetPath = path.resolve(targetPath);
    const existingProject = projectRuntimes.get(resolvedTargetPath);

    if (existingProject) {
      existingProject.sessionState.lastActiveAt = new Date().toISOString();
      return {
        project: existingProject,
        reused: true,
      };
    }

    const nextState = await switchTarget(sourceProject.sessionState, resolvedTargetPath);
    const nextProject = await createProjectRuntime(nextState);
    nextProject.previewSupervisor = createPreviewBridge(nextProject);
    projectRuntimes.set(nextProject.projectId, nextProject);

    if (sockets.size > 0) {
      nextProject.previewStarted = true;
      void nextProject.previewSupervisor.start();
    }

    await nextProject.traceLogger.log("session.switch", {
      sessionId: nextProject.sessionState.sessionId,
      targetDirectory: nextProject.sessionState.targetDirectory,
      phase: nextProject.sessionState.activePhase,
      reason: `browser:open:${resolvedTargetPath}`,
      runtimeMode: "ui",
    });

    return {
      project: nextProject,
      reused: false,
    };
  };

  const activateProject = async (
    project: BrowserProjectRuntime,
    options: {
      successMessage?: string | null;
      enrichmentState?: TargetEnrichmentState;
      autoEnrichReason?: string;
      creationDescription?: string;
    } = {},
  ): Promise<void> => {
    activeProjectId = project.projectId;
    project.sessionState.lastActiveAt = new Date().toISOString();
    createProjectBoardState();
    await broadcastProjectsState();

    if (options.successMessage) {
      const nextTargetManagerState = await syncTargetManagerState(
        project,
        options.enrichmentState,
      );
      await broadcastTargetSwitchComplete(
        project,
        true,
        options.successMessage,
        nextTargetManagerState,
      );
    }

    await broadcastTargetState(project, options.enrichmentState);
    await broadcastSessionState(project);

    if (options.autoEnrichReason) {
      await maybeAutoEnrichBrowserTarget(project, {
        creationDescription: options.creationDescription,
        reason: options.autoEnrichReason,
      });
    }
  };

  const runBrowserInstruction = async (
    project: BrowserProjectRuntime,
    instruction: string,
    injectedContext: string[] | undefined,
    signal?: AbortSignal,
  ): Promise<void> => {
    const baseReporter = createUiInstructionReporter({
      send(message) {
        return emitProjectMessage(project, message);
      },
      projectRulesLoaded: project.projectRulesLoaded,
      sessionHistory(nextSessionState) {
        return listSessionRunSummaries(
          nextSessionState.targetDirectory,
          nextSessionState.sessionId,
        );
      },
      workspaceDirectory,
    });
    let pendingTurnState: TurnStateEvent | null = null;
    let turnProducedEdits = false;
    const reporter: InstructionTurnReporter = {
      ...baseReporter,
      async onEdit(event) {
        turnProducedEdits = true;
        await baseReporter.onEdit?.(event);

        const previousPreviewCapability = project.sessionState.discovery.previewCapability;
        const nextDiscovery = await discoverTarget(project.sessionState.targetDirectory);
        const previewCapabilityChanged = !hasSamePreviewCapability(
          previousPreviewCapability,
          nextDiscovery.previewCapability,
        );

        project.sessionState.discovery = nextDiscovery;

        void (async () => {
          try {
            if (
              previewCapabilityChanged ||
              (
                nextDiscovery.previewCapability.status === "available" &&
                project.previewSupervisor.isStarterCanvasActive()
              )
            ) {
              await restartPreviewSupervisor(project, { silent: true });
              return;
            }

            await project.previewSupervisor.refresh(event.path);
          } catch (error) {
            await project.traceLogger.log("preview.refresh.error", {
              sessionId: project.sessionState.sessionId,
              targetDirectory: project.sessionState.targetDirectory,
              runtimeMode: "ui",
              path: event.path,
              message: error instanceof Error
                ? error.message
                : "Preview refresh failed after an edit.",
            });
          }
        })();
      },
      async onTurnState(event) {
        if (event.connectionState === "agent-busy") {
          await baseReporter.onTurnState?.(event);
          return;
        }

        pendingTurnState = event;
      },
    };
    const ultimateCommand = parseUltimateModeCommand(instruction);

    if (ultimateCommand?.type === "start") {
      const controller =
        project.activeUltimateController
        ?? createUltimateModeController(ultimateCommand.brief);

      project.activeUltimateController = controller;

      const ultimateResult = await executeUltimateModeTurn({
        sessionState: project.sessionState,
        runtimeState: project.runtimeState,
        brief: ultimateCommand.brief,
        injectedContext,
        controller,
        reporter,
        signal,
        runtimeSurface: "ui",
        cycleRotationInterval: ULTIMATE_MODE_TURN_ROTATION_INTERVAL,
        onCycleRotation: async ({ iteration, turnResult }) => {
          const previousStatus = turnResult.status === "error"
            ? "error"
            : "idle";
          const cycleLabel = `cycle ${String(iteration)}`;

          project.sessionState.workbenchState = rotateInstructionTurn(
            project.sessionState.workbenchState,
            {
              nextInstruction:
                `ultimate continue ${ultimateCommand.brief}`,
              nextSummary:
                `Continuing ultimate mode after ${cycleLabel}.`,
              previousStatus,
              previousSummary:
                `Rotated to a fresh live turn after ${cycleLabel} to keep ultimate mode responsive. Latest cycle: ${turnResult.summary}`,
            },
          );

          await broadcastSessionState(project);
        },
      });

      await project.traceLogger.log("instruction.ultimate", {
        instruction,
        brief: ultimateCommand.brief,
        status: ultimateResult.status,
        summary: ultimateResult.summary,
        iterations: ultimateResult.iterations,
        lastTurn: ultimateResult.lastTurn
          ? {
              status: ultimateResult.lastTurn.status,
              summary: ultimateResult.lastTurn.summary,
              taskPlan: ultimateResult.lastTurn.taskPlan,
              executionSpec: ultimateResult.lastTurn.executionSpec,
              harnessRoute: ultimateResult.lastTurn.harnessRoute,
              executionFingerprint: ultimateResult.lastTurn.executionFingerprint ?? null,
              langSmithTrace: ultimateResult.lastTurn.langSmithTrace,
              selectedTargetPath: ultimateResult.lastTurn.selectedTargetPath,
            }
          : null,
        recentHistory: ultimateResult.history,
        runtimeSurface: "ui",
      });
      await saveSessionState(project.sessionState);

      if (pendingTurnState) {
        await baseReporter.onTurnState?.(pendingTurnState);
        pendingTurnState = null;
      }

      return;
    }

    if (isPipelineInstruction(instruction)) {
      const pipelineResult = await executePipelineTurnImpl({
        sessionState: project.sessionState,
        runtimeState: project.runtimeState,
        instruction,
        reporter,
        signal,
      });
      await project.traceLogger.log("instruction.pipeline", {
        instruction,
        command: pipelineResult.command,
        status: pipelineResult.status,
        summary: pipelineResult.summary,
        run: pipelineResult.run
          ? {
              runId: pipelineResult.run.runId,
              pipelineId: pipelineResult.run.pipeline.id,
              pipelineStatus: pipelineResult.run.status,
              currentPhaseIndex: pipelineResult.run.currentPhaseIndex,
              pendingApproval: pipelineResult.run.pendingApproval,
            }
          : null,
        langSmithTrace: pipelineResult.langSmithTrace,
        runtimeSurface: "ui",
      });
      await saveSessionState(project.sessionState);
    } else if (isTddInstruction(instruction)) {
      const tddResult = await executeTddTurnImpl({
        sessionState: project.sessionState,
        runtimeState: project.runtimeState,
        instruction,
        reporter,
        signal,
        runtimeSurface: "ui",
      });
      await project.traceLogger.log("instruction.tdd", {
        instruction,
        command: tddResult.command,
        status: tddResult.status,
        summary: tddResult.summary,
        lane: tddResult.lane
          ? {
              laneId: tddResult.lane.laneId,
              status: tddResult.lane.status,
              currentStage: tddResult.lane.currentStage,
              selection: tddResult.lane.selection,
              focusedValidationCommand: tddResult.lane.focusedValidationCommand,
              stageAttempts: tddResult.lane.stageAttempts,
              latestHandoffArtifact: tddResult.lane.latestHandoffArtifact,
              latestEscalationArtifact: tddResult.lane.latestEscalationArtifact,
              latestQualityArtifact: tddResult.lane.latestQualityArtifact,
              optionalChecks: tddResult.lane.optionalChecks,
            }
          : null,
        runtimeAssist: tddResult.runtimeAssist,
        langSmithTrace: tddResult.langSmithTrace,
        runtimeSurface: "ui",
      });
      await saveSessionState(project.sessionState);
    } else if (isTaskRunnerInstruction(instruction)) {
      const taskTurnResult = await executeTaskTurn({
        sessionState: project.sessionState,
        runtimeState: project.runtimeState,
        instruction,
        injectedContext,
        reporter,
        signal,
        runtimeSurface: "ui",
      });
      await project.traceLogger.log("instruction.plan", {
        instruction,
        phase: taskTurnResult.phaseName,
        runtimeMode: taskTurnResult.runtimeMode,
        planningMode: taskTurnResult.planningMode,
        route: taskTurnResult.route,
        command: taskTurnResult.command,
        contextEnvelope: taskTurnResult.contextEnvelope,
        taskPlan: taskTurnResult.taskPlan,
        executionSpec: taskTurnResult.executionSpec,
        executionFingerprint: taskTurnResult.executionFingerprint,
        executionFingerprintLabel: taskTurnResult.executionFingerprint
          ? formatTurnExecutionFingerprint(taskTurnResult.executionFingerprint)
          : null,
        taskQueue: taskTurnResult.plan,
        planId: taskTurnResult.planId,
        taskId: taskTurnResult.taskId,
        loadedSpecRefs: taskTurnResult.loadedSpecRefs,
        taskTransition: taskTurnResult.taskTransition,
        status: taskTurnResult.status,
        summary: taskTurnResult.summary,
        langSmithTrace: taskTurnResult.langSmithTrace,
        runtimeSurface: "ui",
      });
      await saveSessionState(project.sessionState);
    } else if (isPlanModeInstruction(instruction)) {
      const planResult = await executePlanTurn({
        sessionState: project.sessionState,
        runtimeState: project.runtimeState,
        instruction,
        injectedContext,
        reporter,
        signal,
      });
      await project.traceLogger.log("instruction.plan", {
        instruction,
        phase: planResult.phaseName,
        runtimeMode: planResult.runtimeMode,
        planningMode: planResult.planningMode,
        route: "planning-only",
        contextEnvelope: planResult.contextEnvelope,
        executionSpec: planResult.executionSpec,
        taskQueue: planResult.plan,
        loadedSpecRefs: planResult.loadedSpecRefs,
        status: planResult.status,
        summary: planResult.summary,
        langSmithTrace: planResult.langSmithTrace,
        runtimeSurface: "ui",
      });
      await saveSessionState(project.sessionState);
    } else {
      const turnResult = await executeInstructionTurn({
        sessionState: project.sessionState,
        runtimeState: project.runtimeState,
        instruction,
        injectedContext,
        reporter,
        signal,
        runtimeSurface: "ui",
      });
      await project.traceLogger.log("instruction.plan", {
        instruction,
        phase: turnResult.phaseName,
        runtimeMode: turnResult.runtimeMode,
        planningMode: turnResult.planningMode,
        harnessRoute: turnResult.harnessRoute,
        executionFingerprint: turnResult.executionFingerprint,
        executionFingerprintLabel: turnResult.executionFingerprint
          ? formatTurnExecutionFingerprint(turnResult.executionFingerprint)
          : null,
        contextEnvelope: turnResult.contextEnvelope,
        taskPlan: turnResult.taskPlan,
        executionSpec: turnResult.executionSpec,
        status: turnResult.status,
        summary: turnResult.summary,
        langSmithTrace: turnResult.langSmithTrace,
        handoff: turnResult.handoff,
        runtimeSurface: "ui",
      });
      await saveSessionState(project.sessionState);

      if (turnResult.selectedTargetPath) {
        const { project: selectedProject } = await ensureProjectRuntimeForTarget(
          project,
          turnResult.selectedTargetPath,
        );
        await activateProject(selectedProject, {
          successMessage: `Switched to ${selectedProject.targetManagerState.currentTarget.name}.`,
          enrichmentState: IDLE_TARGET_ENRICHMENT_STATE,
          autoEnrichReason: "tool:select_target",
        });
      }

      if (
        turnResult.status === "success" &&
        turnProducedEdits &&
        turnResult.selectedTargetPath === null &&
        project.sessionState.activePhase === "code" &&
        !signal?.aborted
      ) {
        const deployUnavailableReason = getDeployUnavailableReason(project.sessionState);

        if (deployUnavailableReason === null) {
          project.deployInFlight = true;

          try {
            await runBrowserDeploy(
              project,
              {
                platform: "vercel",
              },
              signal,
              {
                mode: "automatic",
              },
            );
          } finally {
            project.deployInFlight = false;
            syncLatestDeploy(project);
            await saveSessionState(project.sessionState);
            await broadcastProjectsState();
          }

          if (pendingTurnState) {
            await baseReporter.onTurnState?.(pendingTurnState);
            pendingTurnState = null;
          }
        }
      }
    }

    if (pendingTurnState) {
      await baseReporter.onTurnState?.(pendingTurnState);
    }
  };

  const runBrowserDeploy = async (
    project: BrowserProjectRuntime,
    input: DeployInput,
    signal?: AbortSignal,
    options: {
      mode?: "manual" | "automatic";
    } = {},
  ): Promise<void> => {
    const mode = options.mode ?? "manual";
    const requestedAt = new Date().toISOString();
    const callId = `deploy-${Date.now().toString(36)}`;
    const turnInstruction = mode === "automatic"
      ? "Auto-publish updated target to Vercel"
      : "Deploy current target to Vercel";
    const toolCallSummary = mode === "automatic"
      ? "Publishing the updated target to Vercel."
      : "Deploying current target to Vercel.";

    project.sessionState.turnCount += 1;
    project.sessionState.lastActiveAt = requestedAt;
    project.sessionState.workbenchState = queueInstructionTurn(
      project.sessionState.workbenchState,
      turnInstruction,
      [],
    );
    project.sessionState.workbenchState.latestDeploy = createDeployingSummary(
      project.sessionState.workbenchState.latestDeploy,
      project.sessionState,
      requestedAt,
    );
    await saveSessionState(project.sessionState);
    await broadcastSessionState(project);
    await broadcastDeployState(project, project.sessionState.workbenchState.latestDeploy);
    await emitProjectMessage(project, {
      type: "agent:tool_call",
      callId,
      toolName: "deploy_target",
      summary: toolCallSummary,
    });
    await saveSessionState(project.sessionState);

    let result: ToolResult;

    try {
      result = await executeDeploy(input, project.sessionState.targetDirectory, { signal });
    } catch (error) {
      result = {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Deploy failed.",
      };
    }

    const completedAt = new Date().toISOString();
    const deployResultData = isDeployResultData(result.data) ? result.data : null;
    const validSuccess = result.success && deployResultData !== null;
    const deploySummary = validSuccess
      ? createSuccessfulDeploySummary(
          project.sessionState.workbenchState.latestDeploy,
          project.sessionState,
          deployResultData,
          requestedAt,
          completedAt,
        )
      : createFailedDeploySummary(
          project.sessionState.workbenchState.latestDeploy,
          project.sessionState,
          result,
          requestedAt,
          completedAt,
        );
    const turnStatus =
      signal?.aborted ||
        /interrupted|cancelled|canceled/i.test(result.error ?? "")
        ? "cancelled"
        : validSuccess
          ? "success"
          : "error";

    project.sessionState.lastActiveAt = completedAt;
    project.sessionState.workbenchState.latestDeploy = deploySummary;
    await project.traceLogger.log("deploy.browser", {
      sessionId: project.sessionState.sessionId,
      targetDirectory: project.sessionState.targetDirectory,
      platform: input.platform,
      trigger: mode,
      status: deploySummary.status,
      summary: deploySummary.summary,
      productionUrl: deploySummary.productionUrl,
      runtimeMode: "ui",
    });
    await broadcastDeployState(project, deploySummary);
    await emitProjectMessage(project, {
      type: "agent:tool_result",
      callId,
      toolName: "deploy_target",
      success: validSuccess,
      summary: deploySummary.summary,
      detail: validSuccess
        ? result.output
        : result.error ?? "Deploy failed.",
      command: deploySummary.command ?? undefined,
    });
    await emitProjectMessage(project, {
      type: "agent:done",
      status: turnStatus,
      summary: deploySummary.summary,
      langSmithTrace: null,
    });
    await saveSessionState(project.sessionState);
  };

  socketServer.on("connection", (socket) => {
    sockets.add(socket);
    void (async () => {
      try {
        await sendSessionState(socket);
        await sendTargetState(socket);
        await sendProjectsState(socket);

        if (sockets.size === 1) {
          for (const project of projectRuntimes.values()) {
            if (!project.previewStarted) {
              project.previewStarted = true;
              void project.previewSupervisor.start();
            }
          }

          await maybeAutoEnrichBrowserTarget(getActiveProject(), {
            reason: "browser:initial-sync",
          });
        }
      } catch (error) {
        if (isClosing || isMissingFileError(error)) {
          return;
        }

        const message = error instanceof Error
          ? error.message
          : "Failed to finish the initial browser sync.";
        await sendToSocket(socket, createErrorMessage(message));
      }
    })();

    socket.on("close", () => {
      sockets.delete(socket);
    });

    socket.on("message", (rawData) => {
      const rawMessage = rawData.toString();

      void (async () => {
        try {
          const message = parseFrontendMessage(rawMessage);

          switch (message.type) {
            case "status": {
              const activeProject = getActiveProject();
              await sendSessionState(socket, activeProject);
              await sendTargetState(socket, activeProject);
              await sendProjectsState(socket);
              break;
            }
            case "cancel": {
              const activeProject = getActiveProject();
              const activeController =
                activeProject.activeInstructionController ??
                activeProject.activeDeployController;

              if (activeController === null) {
                activeProject.sessionState.workbenchState = {
                  ...activeProject.sessionState.workbenchState,
                  latestError: null,
                  agentStatus: "No active browser-driven turn, ultimate mode run, or deploy is running.",
                };
                await broadcastSessionState(activeProject);
                break;
              }

              if (activeController.signal.aborted) {
                activeProject.sessionState.workbenchState = {
                  ...activeProject.sessionState.workbenchState,
                  latestError: null,
                  agentStatus:
                    activeProject.activeUltimateController
                      ? "Cancellation already requested. Waiting for ultimate mode to stop."
                      : activeProject.activeInstructionController
                      ? "Cancellation already requested. Waiting for the active turn to stop."
                      : "Cancellation already requested. Waiting for the active deploy to stop.",
                };
                await broadcastSessionState(activeProject);
                break;
              }

              activeProject.sessionState.workbenchState = {
                ...activeProject.sessionState.workbenchState,
                latestError: null,
                agentStatus:
                  activeProject.activeUltimateController
                    ? "Cancellation requested. Waiting for ultimate mode to stop."
                    : activeProject.activeInstructionController
                    ? "Cancellation requested. Waiting for the active turn to stop."
                    : "Cancellation requested. Waiting for the active deploy to stop.",
              };
              await broadcastSessionState(activeProject);
              abortTurn(
                activeController,
                activeProject.activeUltimateController
                  ? "Human stopped ultimate mode."
                  : activeProject.activeInstructionController
                  ? undefined
                  : "Operator interrupted the active deploy.",
              );
              break;
            }
            case "session:resume_request": {
              const activeProject = getActiveProject();

              if (activeProject.activeInstruction !== null || activeProject.deployInFlight) {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    "Finish the current browser action before opening another saved run.",
                  ),
                );
                break;
              }

              const resumedSession = await loadSessionState(
                activeProject.sessionState.targetDirectory,
                message.sessionId,
              );

              if (resumedSession === null) {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    `Saved run ${message.sessionId} was not found for the current target.`,
                  ),
                );
                break;
              }

              const nextTargetManagerState = await replaceProjectSession(
                activeProject,
                resumedSession,
                `browser:resume:${message.sessionId}`,
                IDLE_TARGET_ENRICHMENT_STATE,
              );
              await activeProject.traceLogger.log("session.resume", {
                sessionId: activeProject.sessionState.sessionId,
                targetDirectory: activeProject.sessionState.targetDirectory,
                phase: activeProject.sessionState.activePhase,
                resumedSessionId: message.sessionId,
                runtimeMode: "ui",
              });
              await broadcastTargetState(
                activeProject,
                nextTargetManagerState.enrichmentStatus,
              );
              await broadcastSessionState(activeProject);
              await maybeAutoEnrichBrowserTarget(activeProject, {
                reason: `browser:resume:${message.sessionId}`,
              });
              break;
            }
            case "project:activate_request": {
              const targetProject = projectRuntimes.get(message.projectId);

              if (!targetProject) {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    `Open project ${message.projectId} was not found.`,
                  ),
                );
                break;
              }

              await activateProject(targetProject);
              break;
            }
            case "target:switch_request": {
              try {
                const sourceProject = getActiveProject();
                const { project } = await ensureProjectRuntimeForTarget(
                  sourceProject,
                  message.targetPath,
                );
                await activateProject(project, {
                  successMessage: `Switched to ${project.targetManagerState.currentTarget.name}.`,
                  autoEnrichReason: `browser:switch:${message.targetPath}`,
                });
              } catch (error) {
                const errorMessage = error instanceof Error
                  ? error.message
                  : "Target switch failed.";
                const activeProject = getActiveProject();
                const nextTargetManagerState = await syncTargetManagerState(activeProject);
                await broadcastTargetSwitchComplete(
                  activeProject,
                  false,
                  errorMessage,
                  nextTargetManagerState,
                );
              }
              break;
            }
            case "target:create_request": {
              try {
                const sourceProject = getActiveProject();
                const createdTarget = await createTargetTool({
                  name: message.name,
                  description: message.description,
                  targetsDir: sourceProject.sessionState.targetsDirectory,
                  scaffoldType: message.scaffoldType,
                });
                const { project } = await ensureProjectRuntimeForTarget(
                  sourceProject,
                  createdTarget.path,
                );
                await activateProject(project, {
                  successMessage:
                    `Created and selected ${project.targetManagerState.currentTarget.name}.`,
                  autoEnrichReason: `browser:create:${createdTarget.path}`,
                  creationDescription: message.description,
                });
              } catch (error) {
                const errorMessage = error instanceof Error
                  ? error.message
                  : "Target creation failed.";
                const activeProject = getActiveProject();
                const nextTargetManagerState = await syncTargetManagerState(activeProject);
                await broadcastTargetSwitchComplete(
                  activeProject,
                  false,
                  errorMessage,
                  nextTargetManagerState,
                );
              }
              break;
            }
            case "target:enrich_request": {
              const activeProject = getActiveProject();

              if (activeProject.activeInstruction !== null || activeProject.deployInFlight) {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    "Finish the current browser action before enriching a target.",
                  ),
                );
                break;
              }

              if (activeProject.sessionState.activePhase !== "code") {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    "Select or create a target before running enrichment.",
                  ),
                );
                break;
              }

              const capability = resolveAutomaticTargetEnrichmentCapability({
                invokeModel: activeProject.runtimeState.targetEnrichmentInvoker,
                modelRouting: activeProject.runtimeState.modelRouting,
                env: activeProject.runtimeState.modelRoutingEnv,
              });

              if (!capability.available) {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    capability.reason
                    ?? "Target enrichment is unavailable until a model provider is configured.",
                  ),
                );
                break;
              }

              try {
                await logTargetEnrichment(activeProject, {
                  targetPath: activeProject.sessionState.targetDirectory,
                  trigger: "manual",
                  status: "queued",
                  message: "Manual target analysis requested.",
                  reason: "browser:manual-request",
                });
                startBrowserTargetEnrichment(activeProject, {
                  targetPath: activeProject.sessionState.targetDirectory,
                  trigger: "manual",
                  userDescription: message.userDescription,
                  reason: "browser:manual-request",
                });
              } catch (error) {
                const errorMessage = error instanceof Error
                  ? error.message
                  : "Target enrichment failed.";
                await broadcastTargetState(activeProject, {
                  status: "error",
                  message: errorMessage,
                });
                await broadcastSessionState(activeProject);
              }
              break;
            }
            case "deploy:request": {
              const activeProject = getActiveProject();

              if (activeProject.activeInstruction !== null || activeProject.deployInFlight) {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    activeProject.deployInFlight
                      ? "A deploy is already in progress for this session."
                      : "Finish the current browser instruction before starting a deploy.",
                  ),
                );
                break;
              }

              if (activeProject.sessionState.activePhase !== "code") {
                await sendToSocket(
                  socket,
                  createErrorMessage(
                    "Select or create a target before deploying.",
                  ),
                );
                break;
              }

              const deployUnavailableReason = getDeployUnavailableReason(
                activeProject.sessionState,
              );

              if (deployUnavailableReason) {
                activeProject.sessionState.workbenchState.latestDeploy =
                  synchronizeDeploySummary(
                    activeProject.sessionState.workbenchState.latestDeploy,
                    activeProject.sessionState,
                    {
                      deploying: false,
                    },
                  );
                await broadcastDeployState(
                  activeProject,
                  activeProject.sessionState.workbenchState.latestDeploy,
                );
                await sendToSocket(socket, createErrorMessage(deployUnavailableReason));
                break;
              }

              const deployController = new AbortController();
              activeProject.activeDeployController = deployController;
              activeProject.deployInFlight = true;
              activeProject.activeDeploy = runBrowserDeploy(
                activeProject,
                {
                  platform: message.platform,
                },
                deployController.signal,
              );

              try {
                await activeProject.activeDeploy;
              } finally {
                activeProject.activeDeploy = null;
                activeProject.activeDeployController = null;
                activeProject.deployInFlight = false;
                syncLatestDeploy(activeProject);
                await saveSessionState(activeProject.sessionState);
                await broadcastSessionState(activeProject);
              }
              break;
            }
            case "instruction": {
              const activeProject = getActiveProject();
              const ultimateCommand = parseUltimateModeCommand(message.text);

              if (activeProject.activeInstruction !== null || activeProject.deployInFlight) {
                if (activeProject.deployInFlight) {
                  await sendToSocket(
                    socket,
                    createErrorMessage("A deploy is already in progress for this session."),
                  );
                  break;
                }

                if (activeProject.activeUltimateController !== null) {
                  if (ultimateCommand?.type === "status") {
                    await emitProjectMessage(activeProject, {
                      type: "agent:thinking",
                      message: formatUltimateModeStatus(
                        activeProject.activeUltimateController,
                      ),
                    });
                    await saveSessionState(activeProject.sessionState);
                    break;
                  }

                  if (ultimateCommand?.type === "stop") {
                    if (activeProject.activeInstructionController !== null) {
                      abortTurn(
                        activeProject.activeInstructionController,
                        "Human stopped ultimate mode.",
                      );
                    }
                    await emitProjectMessage(activeProject, {
                      type: "agent:thinking",
                      message:
                        "Human interrupt received. Stopping ultimate mode after the current cycle shuts down cleanly.",
                    });
                    await saveSessionState(activeProject.sessionState);
                    break;
                  }

                  const feedbackText = composeUltimateModeHumanFeedback(
                    ultimateCommand?.type === "feedback"
                      ? ultimateCommand.feedback
                      : ultimateCommand?.type === "start"
                        ? ultimateCommand.brief
                        : message.text,
                    message.injectedContext,
                  );

                  activeProject.activeUltimateController.enqueueHumanFeedback(
                    feedbackText,
                  );
                  await emitProjectMessage(activeProject, {
                    type: "agent:thinking",
                    message:
                      "Queued human feedback for ultimate mode. It will be folded into the next simulator review cycle.",
                  });
                  await saveSessionState(activeProject.sessionState);
                  break;
                }

                await sendToSocket(
                  socket,
                  createErrorMessage(
                    "A browser instruction is already in progress for this session.",
                  ),
                );
                break;
              }

              if (ultimateCommand && ultimateCommand.type !== "start") {
                activeProject.sessionState.workbenchState = {
                  ...activeProject.sessionState.workbenchState,
                  latestError: null,
                  agentStatus:
                    ultimateCommand.type === "status"
                      ? formatUltimateModeStatus(null)
                      : "Ultimate mode is not active.",
                };
                await broadcastSessionState(activeProject);
                break;
              }

              const pendingUploads =
                activeProject.sessionState.workbenchState.pendingUploads;
              const handoff = consumePendingUploadsForInstruction(
                activeProject.sessionState.workbenchState,
                message.injectedContext,
              );

              activeProject.sessionState.workbenchState = queueInstructionTurn(
                handoff.nextState,
                message.text,
                handoff.contextPreview,
              );

              if (pendingUploads.length > 0) {
                await logUploadTrace(
                  "upload.handoff",
                  {
                    instruction: message.text,
                    files: pendingUploads.map((receipt) => ({
                      id: receipt.id,
                      originalName: receipt.originalName,
                      storedRelativePath: receipt.storedRelativePath,
                    })),
                  },
                  activeProject,
                );
              }

              await saveSessionState(activeProject.sessionState);
              const turnController = new AbortController();
              if (ultimateCommand?.type === "start") {
                activeProject.activeUltimateController = createUltimateModeController(
                  ultimateCommand.brief,
                );
              }
              activeProject.activeInstructionController = turnController;
              activeProject.activeInstruction = runBrowserInstruction(
                activeProject,
                message.text,
                handoff.injectedContext,
                turnController.signal,
              );

              try {
                await activeProject.activeInstruction;
              } finally {
                activeProject.activeInstruction = null;
                activeProject.activeInstructionController = null;
                activeProject.activeUltimateController = null;
                await broadcastProjectsState();
              }
              break;
            }
          }
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : "Invalid client message.";
          await sendToSocket(socket, createErrorMessage(message));
        }
      })();
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const upgradeUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${host}:${String(options.port ?? 3210)}`}`,
    );

    if (upgradeUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    if (!isRequestAuthorized(request)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      socketServer.emit("connection", webSocket, request);
    });
  });

  const portResolution = await resolveUiPortBinding(
    httpServer,
    host,
    options.port,
  );
  const url = `http://${host}:${String(portResolution.actualPort)}`;
  const socketUrl = `ws://${host}:${String(portResolution.actualPort)}/ws`;

  return {
    host,
    port: portResolution.actualPort,
    url,
    socketUrl,
    requestedPort: portResolution.requestedPort,
    targetDirectory: options.sessionState.targetDirectory,
    workspaceDirectory,
    portResolution,
    async close(): Promise<void> {
      isClosing = true;

      for (const project of projectRuntimes.values()) {
        project.activeEnrichmentRun = null;
      }

      const pendingEnrichmentTasks = [...projectRuntimes.values()].flatMap((project) =>
        [...project.pendingEnrichmentTasks]
      );

      if (pendingEnrichmentTasks.length > 0) {
        await Promise.race([
          Promise.allSettled(pendingEnrichmentTasks),
          new Promise<void>((resolve) => {
            setTimeout(resolve, CLOSE_ENRICHMENT_DRAIN_TIMEOUT_MS);
          }),
        ]);
      }

      for (const project of projectRuntimes.values()) {
        if (project.activeInstructionController !== null) {
          abortTurn(project.activeInstructionController);
        }

        if (project.activeDeployController !== null) {
          abortTurn(
            project.activeDeployController,
            "Operator interrupted the active deploy.",
          );
        }

        await project.previewSupervisor.stop();
      }

      for (const client of socketServer.clients) {
        client.close(1001, "Shipyard UI shutting down");
      }

      await new Promise<void>((resolve, reject) => {
        socketServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    closed,
  };
}
