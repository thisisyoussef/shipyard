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
  executePlanningTurn,
  isPlanModeInstruction,
  type ExecutePlanningTurnOptions,
} from "../plans/turn.js";
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
  hasAutomaticTargetEnrichmentCapability,
  planAutomaticEnrichment,
} from "../engine/target-enrichment.js";
import { applySessionSwitchToRuntime } from "../engine/runtime-context.js";
import { createPreviewSupervisor } from "../preview/supervisor.js";
import { shouldUseStarterCanvasForScratchTarget } from "../preview/contracts.js";
import type {
  BackendToFrontendMessage,
  DeploySummary,
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
  addPendingUploads,
  applyBackendMessage,
  clearPendingUploads,
  createInitialDeploySummary,
  queueInstructionTurn,
  removePendingUpload,
} from "./workbench-state.js";
import { createLocalTraceLogger } from "../tracing/local-log.js";
import { buildTargetManagerState, IDLE_TARGET_ENRICHMENT_STATE } from "./target-manager.js";
import { createTargetTool } from "../tools/target-manager/create-target.js";
import { enrichTargetTool } from "../tools/target-manager/enrich-target.js";
import {
  createUploadInjectedContext,
  deleteUploadedFile,
  storeUploadedFiles,
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
  executeDeploy?: (
    input: DeployInput,
    targetDirectory: string,
    context?: ToolExecutionContext,
  ) => Promise<ToolResult>;
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
      nextSummary.summary = "Ready to deploy this target to Vercel.";
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
  const sessionState = options.sessionState;
  const fallbackHtml = createFallbackUiHtml(sessionState);
  const runtimeState = createInstructionRuntimeState({
    projectRules: options.projectRules,
    baseInjectedContext: options.baseInjectedContext,
    targetEnrichmentInvoker: options.targetEnrichmentInvoker,
    runtimeMode: options.runtimeMode,
    runtimeDependencies: options.runtimeDependencies,
  });
  const executePlanTurn = options.executePlanTurn ?? executePlanningTurn;
  const executeDeploy = options.executeDeploy ?? deployTargetTool;
  let projectRulesLoaded = options.projectRulesLoaded;
  let traceLogger = await createLocalTraceLogger(
    sessionState.targetDirectory,
    sessionState.sessionId,
  );
  let targetManagerState = await buildTargetManagerState(sessionState);
  sessionState.workbenchState.targetManager = targetManagerState;
  sessionState.workbenchState.latestDeploy = synchronizeDeploySummary(
    sessionState.workbenchState.latestDeploy,
    sessionState,
    {
      deploying: false,
    },
  );
  await traceLogger.log("session.start", {
    sessionId: sessionState.sessionId,
    targetDirectory: sessionState.targetDirectory,
    discovery: sessionState.discovery,
    phase: sessionState.activePhase,
    runtimeMode: "ui",
  });
  await saveSessionState(sessionState);
  const httpServer = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const requestUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? `${host}:${String(options.port ?? 3210)}`}`,
      );
      const requestPath = requestUrl.pathname;
      const accessState = getUiAccessState(request);

      if (requestPath === "/api/health") {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify(
            createHealthResponse(sessionState, {
              accessProtected: accessState.required,
              includeRuntimeDetails:
                accessState.authenticated || !accessState.required,
            }),
          ),
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
        if (accessState.required && !accessState.authenticated) {
          response.writeHead(401, {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              message: "Hosted access is required before uploading files.",
            }),
          );
          return;
        }

        if (request.method !== "POST") {
          response.writeHead(405, {
            allow: "POST",
            "content-type": "application/json; charset=utf-8",
          });
          response.end(JSON.stringify({ error: "Method not allowed." }));
          return;
        }

        if (sessionState.activePhase !== "code") {
          response.writeHead(409, {
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              message: "Select or create a target before uploading reference files.",
            }),
          );
          return;
        }

        try {
          const uploadResult = await storeUploadedFiles({
            request,
            targetDirectory: sessionState.targetDirectory,
          });

          if (uploadResult.sessionId !== sessionState.sessionId) {
            response.writeHead(409, {
              "content-type": "application/json; charset=utf-8",
            });
            response.end(
              JSON.stringify({
                message:
                  "The browser is trying to upload against a stale Shipyard session. Refresh and try again.",
              }),
            );
            return;
          }

          sessionState.workbenchState = addPendingUploads(
            sessionState.workbenchState,
            uploadResult.receipts,
          );
          await saveSessionState(sessionState);
          await broadcastSessionState();
          response.writeHead(200, {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              receipts: uploadResult.receipts,
            }),
          );
          return;
        } catch (error) {
          response.writeHead(400, {
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              message:
                error instanceof Error
                  ? error.message
                  : "File upload failed.",
            }),
          );
          return;
        }
      }

      if (requestPath.startsWith("/api/uploads/")) {
        if (accessState.required && !accessState.authenticated) {
          response.writeHead(401, {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              message: "Hosted access is required before removing uploads.",
            }),
          );
          return;
        }

        if (request.method !== "DELETE") {
          response.writeHead(405, {
            allow: "DELETE",
            "content-type": "application/json; charset=utf-8",
          });
          response.end(JSON.stringify({ error: "Method not allowed." }));
          return;
        }

        const requestedSessionId = requestUrl.searchParams.get("sessionId")?.trim();

        if (!requestedSessionId || requestedSessionId !== sessionState.sessionId) {
          response.writeHead(409, {
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              message:
                "The browser is trying to modify uploads for a stale Shipyard session. Refresh and try again.",
            }),
          );
          return;
        }

        const receiptId = decodeURIComponent(
          requestPath.slice("/api/uploads/".length),
        );
        const matchingUpload = sessionState.workbenchState.pendingUploads.find(
          (upload) => upload.id === receiptId,
        );

        if (!matchingUpload) {
          response.writeHead(404, {
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              message: "That uploaded file is no longer pending in this session.",
            }),
          );
          return;
        }

        await deleteUploadedFile(sessionState.targetDirectory, matchingUpload);
        sessionState.workbenchState = removePendingUpload(
          sessionState.workbenchState,
          matchingUpload.id,
        );
        await saveSessionState(sessionState);
        await broadcastSessionState();
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            removedId: matchingUpload.id,
          }),
        );
        return;
      }

      await serveBuiltUi(requestPath, response, fallbackHtml);
    },
  );
  const socketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  let activeInstruction: Promise<void> | null = null;
  let activeInstructionController: AbortController | null = null;
  let activeDeploy: Promise<void> | null = null;
  let activeDeployController: AbortController | null = null;
  let deployInFlight = false;
  let previewStarted = false;
  let isClosing = false;
  let enrichmentRunSequence = 0;
  let activeEnrichmentRun:
    | {
        runId: number;
        targetPath: string;
      }
    | null = null;
  const closed = new Promise<void>((resolve) => {
    httpServer.once("close", () => {
      resolve();
    });
  });

  const connectionState = (): "ready" | "agent-busy" =>
    activeInstruction === null && !deployInFlight ? "ready" : "agent-busy";

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

  const broadcastBrowserMessage = async (
    message: BackendToFrontendMessage,
  ): Promise<void> => {
    sessionState.workbenchState =
      message.type === "session:state"
        ? message.workbenchState
        : applyBackendMessage(sessionState.workbenchState, message);

    await broadcast(message);
  };

  const syncLatestDeploy = (): DeploySummary => {
    const nextDeploy = synchronizeDeploySummary(
      sessionState.workbenchState.latestDeploy,
      sessionState,
      {
        deploying: deployInFlight,
      },
    );
    sessionState.workbenchState.latestDeploy = nextDeploy;
    return nextDeploy;
  };

  const currentEnrichmentState = (): TargetEnrichmentState =>
    sessionState.workbenchState.targetManager?.enrichmentStatus ??
    IDLE_TARGET_ENRICHMENT_STATE;

  const syncTargetManagerState = async (
    enrichmentState: TargetEnrichmentState = currentEnrichmentState(),
  ): Promise<TargetManagerState> => {
    targetManagerState = await buildTargetManagerState(
      sessionState,
      enrichmentState,
    );
    sessionState.workbenchState.targetManager = targetManagerState;
    return targetManagerState;
  };

  const publishPreviewState = async (previewState: PreviewState): Promise<void> => {
    sessionState.workbenchState = applyBackendMessage(
      sessionState.workbenchState,
      {
        type: "preview:state",
        preview: previewState,
      },
    );

    await traceLogger.log("preview.state", {
      sessionId: sessionState.sessionId,
      preview: previewState,
    });
    await saveSessionState(sessionState);
    await broadcast({
      type: "preview:state",
      preview: previewState,
    });
  };

  const createPreviewBridge = () =>
    createPreviewSupervisor({
      targetDirectory: sessionState.targetDirectory,
      capability: sessionState.discovery.previewCapability,
      starterCanvasOnUnavailable: shouldUseStarterCanvasForScratchTarget({
        activePhase: sessionState.activePhase,
        discovery: sessionState.discovery,
      }),
      starterCanvasOnStartupFailure: sessionState.activePhase === "code",
      onState: publishPreviewState,
    });

  let previewSupervisor = createPreviewBridge();

  const sendSessionState = async (socket: WebSocket): Promise<void> => {
    await syncTargetManagerState();
    syncLatestDeploy();
    const sessionHistory = await listSessionRunSummaries(
      sessionState.targetDirectory,
      sessionState.sessionId,
    );
    await sendToSocket(
      socket,
      createSessionStateMessage({
        sessionState,
        connectionState: connectionState(),
        projectRulesLoaded,
        sessionHistory,
        workspaceDirectory,
      }),
    );
  };

  const broadcastSessionState = async (): Promise<void> => {
    await syncTargetManagerState();
    syncLatestDeploy();
    const sessionHistory = await listSessionRunSummaries(
      sessionState.targetDirectory,
      sessionState.sessionId,
    );
    await broadcastBrowserMessage(
      createSessionStateMessage({
        sessionState,
        connectionState: connectionState(),
        projectRulesLoaded,
        sessionHistory,
        workspaceDirectory,
      }),
    );
    await saveSessionState(sessionState);
  };

  const broadcastDeployState = async (
    deploy: DeploySummary = syncLatestDeploy(),
  ): Promise<DeploySummary> => {
    await broadcastBrowserMessage({
      type: "deploy:state",
      deploy,
    });
    await saveSessionState(sessionState);
    return deploy;
  };

  const sendTargetState = async (socket: WebSocket): Promise<void> => {
    const nextTargetManagerState = await syncTargetManagerState();
    await sendToSocket(socket, {
      type: "target:state",
      state: nextTargetManagerState,
    });
  };

  const broadcastTargetState = async (
    enrichmentState: TargetEnrichmentState = currentEnrichmentState(),
  ): Promise<TargetManagerState> => {
    const nextTargetManagerState = await syncTargetManagerState(enrichmentState);
    await broadcastBrowserMessage({
      type: "target:state",
      state: nextTargetManagerState,
    });
    await saveSessionState(sessionState);
    return nextTargetManagerState;
  };

  const broadcastTargetSwitchComplete = async (
    success: boolean,
    message: string,
    nextTargetManagerState: TargetManagerState,
  ): Promise<void> => {
    await broadcastBrowserMessage({
      type: "target:switch_complete",
      success,
      message,
      state: nextTargetManagerState,
    });
    await saveSessionState(sessionState);
  };

  const broadcastEnrichmentProgress = async (
    status: "queued" | "started" | "in-progress" | "complete" | "error",
    message: string,
  ): Promise<void> => {
    await broadcastBrowserMessage({
      type: "target:enrichment_progress",
      status,
      message,
    });
    await saveSessionState(sessionState);
  };

  const logTargetEnrichment = async (
    event: {
      targetPath: string;
      trigger: "automatic" | "manual";
      status: string;
      message: string;
      reason: string;
    },
  ): Promise<void> => {
    await traceLogger.log("target.enrichment", {
      sessionId: sessionState.sessionId,
      targetDirectory: event.targetPath,
      trigger: event.trigger,
      status: event.status,
      message: event.message,
      reason: event.reason,
      runtimeMode: "ui",
    });
  };

  const isStaleEnrichmentRun = (
    runId: number,
    targetPath: string,
  ): boolean =>
    isClosing ||
    activeEnrichmentRun?.runId !== runId ||
    activeEnrichmentRun.targetPath !== targetPath ||
    sessionState.activePhase !== "code" ||
    sessionState.targetDirectory !== targetPath;

  const runBrowserTargetEnrichment = async (
    options: {
      targetPath: string;
      trigger: "automatic" | "manual";
      userDescription?: string;
      reason: string;
    },
  ): Promise<void> => {
    const runId = ++enrichmentRunSequence;
    activeEnrichmentRun = {
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
          invokeModel: runtimeState.targetEnrichmentInvoker,
          async onProgress(event) {
            if (isStaleEnrichmentRun(runId, options.targetPath)) {
              return;
            }

            await broadcastEnrichmentProgress(event.status, event.message);
          },
        },
      );

      if (isStaleEnrichmentRun(runId, options.targetPath)) {
        return;
      }

      sessionState.targetProfile = profile;
      await broadcastTargetState({
        status: "complete",
        message: "Target profile saved.",
      });
      await broadcastSessionState();
      await logTargetEnrichment({
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

      if (isStaleEnrichmentRun(runId, options.targetPath)) {
        return;
      }

      await broadcastTargetState({
        status: "error",
        message: errorMessage,
      });
      await broadcastSessionState();
      await logTargetEnrichment({
        targetPath: options.targetPath,
        trigger: options.trigger,
        status: "error",
        message: errorMessage,
        reason: options.reason,
      });
    } finally {
      if (activeEnrichmentRun?.runId === runId) {
        activeEnrichmentRun = null;
      }
    }
  };

  const maybeAutoEnrichBrowserTarget = async (
    options: {
      creationDescription?: string;
      reason: string;
    },
  ): Promise<void> => {
    if (sessionState.activePhase !== "code") {
      return;
    }

    const targetPath = sessionState.targetDirectory;

    if (activeEnrichmentRun?.targetPath === targetPath) {
      return;
    }

    const plan = planAutomaticEnrichment({
      discovery: sessionState.discovery,
      targetProfile: sessionState.targetProfile,
      creationDescription: options.creationDescription,
    });

    if (plan.kind === "skip-existing-profile") {
      return;
    }

    if (
      !hasAutomaticTargetEnrichmentCapability(
        runtimeState.targetEnrichmentInvoker,
      )
    ) {
      await broadcastTargetState({
        status: "idle",
        message:
          "Automatic analysis is unavailable until target enrichment is configured.",
      });
      await logTargetEnrichment({
        targetPath,
        trigger: "automatic",
        status: "skipped",
        message:
          "Automatic analysis is unavailable until target enrichment is configured.",
        reason: options.reason,
      });
      return;
    }

    if (plan.kind === "needs-description") {
      await broadcastTargetState({
        status: "idle",
        message: plan.message,
      });
      await logTargetEnrichment({
        targetPath,
        trigger: "automatic",
        status: "needs-context",
        message: plan.message,
        reason: options.reason,
      });
      return;
    }

    await broadcastEnrichmentProgress("queued", plan.queuedMessage);
    await logTargetEnrichment({
      targetPath,
      trigger: "automatic",
      status: "queued",
      message: plan.queuedMessage,
      reason: options.reason,
    });
    void runBrowserTargetEnrichment({
      targetPath,
      trigger: "automatic",
      userDescription: plan.userDescription,
      reason: options.reason,
    });
  };

  const restartPreviewSupervisor = async (
    options?: { silent?: boolean },
  ): Promise<void> => {
    await previewSupervisor.stop(options);
    previewStarted = false;
    previewSupervisor = createPreviewBridge();
    await publishPreviewState(previewSupervisor.getState());

    if (sockets.size > 0) {
      previewStarted = true;
      void previewSupervisor.start();
    }
  };

  const applySwitchedSessionState = async (
    nextState: SessionState,
    reason: string,
    enrichmentState: TargetEnrichmentState = IDLE_TARGET_ENRICHMENT_STATE,
  ): Promise<TargetManagerState> => {
    Object.assign(sessionState, nextState);
    sessionState.workbenchState.latestDeploy = synchronizeDeploySummary(
      sessionState.workbenchState.latestDeploy,
      sessionState,
      {
        deploying: false,
      },
    );
    await applySessionSwitchToRuntime(sessionState, runtimeState);
    projectRulesLoaded = Boolean(runtimeState.projectRules);
    traceLogger = await createLocalTraceLogger(
      sessionState.targetDirectory,
      sessionState.sessionId,
    );
    await traceLogger.log("session.switch", {
      sessionId: sessionState.sessionId,
      targetDirectory: sessionState.targetDirectory,
      phase: sessionState.activePhase,
      reason,
      runtimeMode: "ui",
    });
    await restartPreviewSupervisor({ silent: true });
    return syncTargetManagerState(enrichmentState);
  };

  const runBrowserInstruction = async (
    instruction: string,
    injectedContext: string[] | undefined,
    signal?: AbortSignal,
  ): Promise<void> => {
    const baseReporter = createUiInstructionReporter({
      send: broadcastBrowserMessage,
      projectRulesLoaded,
      sessionHistory(nextSessionState) {
        return listSessionRunSummaries(
          nextSessionState.targetDirectory,
          nextSessionState.sessionId,
        );
      },
      workspaceDirectory,
    });
    let pendingTurnState: TurnStateEvent | null = null;
    const reporter: InstructionTurnReporter = {
      ...baseReporter,
      async onEdit(event) {
        await baseReporter.onEdit?.(event);

        const previousPreviewCapability = sessionState.discovery.previewCapability;
        const nextDiscovery = await discoverTarget(sessionState.targetDirectory);
        const previewCapabilityChanged = !hasSamePreviewCapability(
          previousPreviewCapability,
          nextDiscovery.previewCapability,
        );

        sessionState.discovery = nextDiscovery;

        if (
          previewCapabilityChanged ||
          (
            nextDiscovery.previewCapability.status === "available" &&
            previewSupervisor.isStarterCanvasActive()
          )
        ) {
          await restartPreviewSupervisor({ silent: true });
          return;
        }

        await previewSupervisor.refresh(event.path);
      },
      async onTurnState(event) {
        if (event.connectionState === "agent-busy") {
          await baseReporter.onTurnState?.(event);
          return;
        }

        pendingTurnState = event;
      },
    };

    if (isPlanModeInstruction(instruction)) {
      const planResult = await executePlanTurn({
        sessionState,
        runtimeState,
        instruction,
        injectedContext,
        reporter,
        signal,
      });
      await traceLogger.log("instruction.plan", {
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
      await saveSessionState(sessionState);
    } else {
      const turnResult = await executeInstructionTurn({
        sessionState,
        runtimeState,
        instruction,
        injectedContext,
        reporter,
        signal,
      });
      await traceLogger.log("instruction.plan", {
        instruction,
        phase: turnResult.phaseName,
        runtimeMode: turnResult.runtimeMode,
        planningMode: turnResult.planningMode,
        contextEnvelope: turnResult.contextEnvelope,
        taskPlan: turnResult.taskPlan,
        executionSpec: turnResult.executionSpec,
        status: turnResult.status,
        summary: turnResult.summary,
        langSmithTrace: turnResult.langSmithTrace,
        runtimeSurface: "ui",
      });
      await saveSessionState(sessionState);

      if (turnResult.selectedTargetPath) {
        const nextState = await switchTarget(sessionState, turnResult.selectedTargetPath);
        const nextTargetManagerState = await applySwitchedSessionState(
          nextState,
          "tool:select_target",
          IDLE_TARGET_ENRICHMENT_STATE,
        );
        await broadcastTargetSwitchComplete(
          true,
          `Switched to ${nextTargetManagerState.currentTarget.name}.`,
          nextTargetManagerState,
        );
        await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
        await maybeAutoEnrichBrowserTarget({
          reason: "tool:select_target",
        });
        await broadcastSessionState();
      }
    }

    if (pendingTurnState) {
      await baseReporter.onTurnState?.(pendingTurnState);
    }
  };

  const runBrowserDeploy = async (
    input: DeployInput,
    signal?: AbortSignal,
  ): Promise<void> => {
    const requestedAt = new Date().toISOString();
    const callId = `deploy-${Date.now().toString(36)}`;

    sessionState.turnCount += 1;
    sessionState.lastActiveAt = requestedAt;
    sessionState.workbenchState = queueInstructionTurn(
      sessionState.workbenchState,
      "Deploy current target to Vercel",
      [],
    );
    sessionState.workbenchState.latestDeploy = createDeployingSummary(
      sessionState.workbenchState.latestDeploy,
      sessionState,
      requestedAt,
    );
    await saveSessionState(sessionState);
    await broadcastSessionState();
    await broadcastDeployState(sessionState.workbenchState.latestDeploy);
    await broadcastBrowserMessage({
      type: "agent:tool_call",
      callId,
      toolName: "deploy_target",
      summary: "Deploying current target to Vercel.",
    });
    await saveSessionState(sessionState);

    let result: ToolResult;

    try {
      result = await executeDeploy(input, sessionState.targetDirectory, { signal });
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
          sessionState.workbenchState.latestDeploy,
          sessionState,
          deployResultData,
          requestedAt,
          completedAt,
        )
      : createFailedDeploySummary(
          sessionState.workbenchState.latestDeploy,
          sessionState,
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

    sessionState.lastActiveAt = completedAt;
    sessionState.workbenchState.latestDeploy = deploySummary;
    await traceLogger.log("deploy.browser", {
      sessionId: sessionState.sessionId,
      targetDirectory: sessionState.targetDirectory,
      platform: input.platform,
      status: deploySummary.status,
      summary: deploySummary.summary,
      productionUrl: deploySummary.productionUrl,
      runtimeMode: "ui",
    });
    await broadcastDeployState(deploySummary);
    await broadcastBrowserMessage({
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
    await broadcastBrowserMessage({
      type: "agent:done",
      status: turnStatus,
      summary: deploySummary.summary,
      langSmithTrace: null,
    });
    await saveSessionState(sessionState);
  };

  socketServer.on("connection", (socket) => {
    sockets.add(socket);
    void (async () => {
      await sendSessionState(socket);
      await sendTargetState(socket);

      if (sockets.size === 1) {
        await maybeAutoEnrichBrowserTarget({
          reason: "browser:initial-sync",
        });
      }
    })();

    if (!previewStarted) {
      previewStarted = true;
      void previewSupervisor.start();
    }

    socket.on("close", () => {
      sockets.delete(socket);
    });

    socket.on("message", (rawData) => {
      const rawMessage = rawData.toString();

      void (async () => {
        try {
        const message = parseFrontendMessage(rawMessage);

        switch (message.type) {
          case "status":
            await sendSessionState(socket);
            await sendTargetState(socket);
            break;
          case "cancel":
            if (activeInstructionController === null && activeDeployController === null) {
              sessionState.workbenchState = {
                ...sessionState.workbenchState,
                latestError: null,
                agentStatus: "No active browser-driven turn or deploy is running.",
              };
              await broadcastSessionState();
              break;
            }

            if ((activeInstructionController ?? activeDeployController)?.signal.aborted) {
              sessionState.workbenchState = {
                ...sessionState.workbenchState,
                latestError: null,
                agentStatus:
                  activeInstructionController
                    ? "Cancellation already requested. Waiting for the active turn to stop."
                    : "Cancellation already requested. Waiting for the active deploy to stop.",
              };
              await broadcastSessionState();
              break;
            }

            sessionState.workbenchState = {
              ...sessionState.workbenchState,
              latestError: null,
              agentStatus:
                activeInstructionController
                  ? "Cancellation requested. Waiting for the active turn to stop."
                  : "Cancellation requested. Waiting for the active deploy to stop.",
            };
            await broadcastSessionState();
            abortTurn(
              activeInstructionController ?? activeDeployController as AbortController,
              activeInstructionController
                ? undefined
                : "Operator interrupted the active deploy.",
            );
            break;
          case "session:resume_request": {
            if (activeInstruction !== null || deployInFlight) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser action before opening another saved run.",
                ),
              );
              break;
            }

            const resumedSession = await loadSessionState(
              sessionState.targetDirectory,
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

            const nextTargetManagerState = await applySwitchedSessionState(
              resumedSession,
              `browser:resume:${message.sessionId}`,
              IDLE_TARGET_ENRICHMENT_STATE,
            );
            await traceLogger.log("session.resume", {
              sessionId: sessionState.sessionId,
              targetDirectory: sessionState.targetDirectory,
              phase: sessionState.activePhase,
              resumedSessionId: message.sessionId,
              runtimeMode: "ui",
            });
            await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
            await broadcastSessionState();
            await maybeAutoEnrichBrowserTarget({
              reason: `browser:resume:${message.sessionId}`,
            });
            break;
          }
          case "target:switch_request": {
            if (activeInstruction !== null || deployInFlight) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser action before switching targets.",
                ),
              );
              break;
            }

            try {
              const nextState = await switchTarget(
                sessionState,
                message.targetPath,
              );
              const nextTargetManagerState = await applySwitchedSessionState(
                nextState,
                `browser:switch:${message.targetPath}`,
                IDLE_TARGET_ENRICHMENT_STATE,
              );
              await broadcastTargetSwitchComplete(
                true,
                `Switched to ${nextTargetManagerState.currentTarget.name}.`,
                nextTargetManagerState,
              );
              await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
              await broadcastSessionState();
              await maybeAutoEnrichBrowserTarget({
                reason: `browser:switch:${message.targetPath}`,
              });
            } catch (error) {
              const errorMessage = error instanceof Error
                ? error.message
                : "Target switch failed.";
              const nextTargetManagerState = await syncTargetManagerState();
              await broadcastTargetSwitchComplete(
                false,
                errorMessage,
                nextTargetManagerState,
              );
            }
            break;
          }
          case "target:create_request": {
            if (activeInstruction !== null || deployInFlight) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser action before creating a target.",
                ),
              );
              break;
            }

            try {
              const createdTarget = await createTargetTool({
                name: message.name,
                description: message.description,
                targetsDir: sessionState.targetsDirectory,
                scaffoldType: message.scaffoldType,
              });
              const nextState = await switchTarget(
                sessionState,
                createdTarget.path,
              );
              const nextTargetManagerState = await applySwitchedSessionState(
                nextState,
                `browser:create:${createdTarget.path}`,
                IDLE_TARGET_ENRICHMENT_STATE,
              );
              await broadcastTargetSwitchComplete(
                true,
                `Created and selected ${nextTargetManagerState.currentTarget.name}.`,
                nextTargetManagerState,
              );
              await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
              await broadcastSessionState();
              await maybeAutoEnrichBrowserTarget({
                creationDescription: message.description,
                reason: `browser:create:${createdTarget.path}`,
              });
            } catch (error) {
              const errorMessage = error instanceof Error
                ? error.message
                : "Target creation failed.";
              const nextTargetManagerState = await syncTargetManagerState();
              await broadcastTargetSwitchComplete(
                false,
                errorMessage,
                nextTargetManagerState,
              );
            }
            break;
          }
          case "target:enrich_request": {
            if (activeInstruction !== null || deployInFlight) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser action before enriching a target.",
                ),
              );
              break;
            }

            if (sessionState.activePhase !== "code") {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Select or create a target before running enrichment.",
                ),
              );
              break;
            }

            try {
              await logTargetEnrichment({
                targetPath: sessionState.targetDirectory,
                trigger: "manual",
                status: "queued",
                message: "Manual target analysis requested.",
                reason: "browser:manual-request",
              });
              void runBrowserTargetEnrichment({
                targetPath: sessionState.targetDirectory,
                trigger: "manual",
                userDescription: message.userDescription,
                reason: "browser:manual-request",
              });
            } catch (error) {
              const errorMessage = error instanceof Error
                ? error.message
                : "Target enrichment failed.";
              await broadcastTargetState({
                status: "error",
                message: errorMessage,
              });
              await broadcastSessionState();
            }
            break;
          }
          case "deploy:request": {
            if (activeInstruction !== null || deployInFlight) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  deployInFlight
                    ? "A deploy is already in progress for this session."
                    : "Finish the current browser instruction before starting a deploy.",
                ),
              );
              break;
            }

            if (sessionState.activePhase !== "code") {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Select or create a target before deploying.",
                ),
              );
              break;
            }

            const deployUnavailableReason = getDeployUnavailableReason(sessionState);

            if (deployUnavailableReason) {
              sessionState.workbenchState.latestDeploy = synchronizeDeploySummary(
                sessionState.workbenchState.latestDeploy,
                sessionState,
                {
                  deploying: false,
                },
              );
              await broadcastDeployState(sessionState.workbenchState.latestDeploy);
              await sendToSocket(socket, createErrorMessage(deployUnavailableReason));
              break;
            }

            const deployController = new AbortController();
            activeDeployController = deployController;
            deployInFlight = true;
            activeDeploy = runBrowserDeploy(
              {
                platform: message.platform,
              },
              deployController.signal,
            );

            try {
              await activeDeploy;
            } finally {
              activeDeploy = null;
              activeDeployController = null;
              deployInFlight = false;
              syncLatestDeploy();
              await saveSessionState(sessionState);
              await broadcastSessionState();
            }
            break;
          }
          case "instruction":
            if (activeInstruction !== null || deployInFlight) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  deployInFlight
                    ? "A deploy is already in progress for this session."
                    : "A browser instruction is already in progress for this session.",
                ),
              );
              break;
            }

            const uploadInjectedContext = createUploadInjectedContext(
              sessionState.workbenchState.pendingUploads,
            );
            const combinedInjectedContext = [
              ...(message.injectedContext ?? []),
              ...uploadInjectedContext,
            ];
            sessionState.workbenchState = queueInstructionTurn(
              clearPendingUploads(sessionState.workbenchState),
              message.text,
              combinedInjectedContext,
            );
            await saveSessionState(sessionState);
            const turnController = new AbortController();
            activeInstructionController = turnController;
            activeInstruction = runBrowserInstruction(
              message.text,
              combinedInjectedContext.length > 0
                ? combinedInjectedContext
                : undefined,
              turnController.signal,
            );

            try {
              await activeInstruction;
            } finally {
              activeInstruction = null;
              activeInstructionController = null;
            }
            break;
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
      activeEnrichmentRun = null;

      if (activeInstructionController !== null) {
        abortTurn(activeInstructionController);
      }

      await previewSupervisor.stop();

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
