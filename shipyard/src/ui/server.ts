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
import { abortTurn } from "../engine/cancellation.js";
import type { AgentRuntimeDependencies } from "../engine/graph.js";
import {
  listSessionRunSummaries,
  loadSessionState,
  saveSessionState,
  switchTarget,
  type SessionState,
} from "../engine/state.js";
import { applySessionSwitchToRuntime } from "../engine/runtime-context.js";
import { createPreviewSupervisor } from "../preview/supervisor.js";
import type {
  BackendToFrontendMessage,
  TargetEnrichmentState,
  TargetManagerState,
} from "./contracts.js";
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
  queueInstructionTurn,
} from "./workbench-state.js";
import { createLocalTraceLogger } from "../tracing/local-log.js";
import { buildTargetManagerState, IDLE_TARGET_ENRICHMENT_STATE } from "./target-manager.js";
import { createTargetTool } from "../tools/target-manager/create-target.js";
import { enrichTargetTool } from "../tools/target-manager/enrich-target.js";

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
  sessionId: string;
  targetLabel: string;
  targetDirectory: string;
  workspaceDirectory: string;
  turnCount: number;
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
): UiHealthResponse {
  return {
    ok: true,
    runtimeMode: "ui",
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
  "target:create_request": { "name": "string", "description": "string", "scaffoldType": "empty|react-ts|express-ts|python|go?" },
  "target:enrich_request": { "userDescription": "string?" }
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

function resolveUiPort(portOverride: number | undefined): number {
  if (portOverride !== undefined) {
    return portOverride;
  }

  const envPort = process.env.SHIPYARD_UI_PORT;

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
  const host = options.host ?? "127.0.0.1";
  const sessionState = options.sessionState;
  const fallbackHtml = createFallbackUiHtml(sessionState);
  const runtimeState = createInstructionRuntimeState({
    projectRules: options.projectRules,
    baseInjectedContext: options.baseInjectedContext,
    targetEnrichmentInvoker: options.targetEnrichmentInvoker,
    runtimeMode: options.runtimeMode,
    runtimeDependencies: options.runtimeDependencies,
  });
  let projectRulesLoaded = options.projectRulesLoaded;
  let traceLogger = await createLocalTraceLogger(
    sessionState.targetDirectory,
    sessionState.sessionId,
  );
  let targetManagerState = await buildTargetManagerState(sessionState);
  sessionState.workbenchState.targetManager = targetManagerState;
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
      const requestUrl = request.url ?? "/";

      if (requestUrl === "/api/health") {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify(
            createHealthResponse(sessionState),
          ),
        );
        return;
      }

      await serveBuiltUi(requestUrl, response, fallbackHtml);
    },
  );
  const socketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  let activeInstruction: Promise<void> | null = null;
  let activeInstructionController: AbortController | null = null;
  let previewStarted = false;
  const closed = new Promise<void>((resolve) => {
    httpServer.once("close", () => {
      resolve();
    });
  });

  const connectionState = (): "ready" | "agent-busy" =>
    activeInstruction === null ? "ready" : "agent-busy";

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

  const createPreviewBridge = () =>
    createPreviewSupervisor({
      targetDirectory: sessionState.targetDirectory,
      capability: sessionState.discovery.previewCapability,
      async onState(previewState) {
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
      },
    });

  let previewSupervisor = createPreviewBridge();

  const sendSessionState = async (socket: WebSocket): Promise<void> => {
    await syncTargetManagerState();
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
    status: "started" | "in-progress" | "complete" | "error",
    message: string,
  ): Promise<void> => {
    await broadcastBrowserMessage({
      type: "target:enrichment_progress",
      status,
      message,
    });
    await saveSessionState(sessionState);
  };

  const refreshPreviewSupervisor = async (): Promise<void> => {
    await previewSupervisor.stop();
    previewStarted = false;
    previewSupervisor = createPreviewBridge();

    if (sockets.size > 0) {
      previewStarted = true;
      void previewSupervisor.start();
    }
  };

  const applySwitchedSessionState = async (
    nextState: SessionState,
    reason: string,
  ): Promise<TargetManagerState> => {
    Object.assign(sessionState, nextState);
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
    await refreshPreviewSupervisor();
    return syncTargetManagerState();
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
      contextEnvelope: turnResult.contextEnvelope,
      taskPlan: turnResult.taskPlan,
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
      );
      await broadcastTargetSwitchComplete(
        true,
        `Switched to ${nextTargetManagerState.currentTarget.name}.`,
        nextTargetManagerState,
      );
      await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
    }

    if (pendingTurnState) {
      await baseReporter.onTurnState?.(pendingTurnState);
    }
  };

  socketServer.on("connection", (socket) => {
    sockets.add(socket);
    void (async () => {
      await sendSessionState(socket);
      await sendTargetState(socket);
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
            if (activeInstructionController === null) {
              sessionState.workbenchState = {
                ...sessionState.workbenchState,
                latestError: null,
                agentStatus: "No active browser-driven turn is running.",
              };
              await broadcastSessionState();
              break;
            }

            if (activeInstructionController.signal.aborted) {
              sessionState.workbenchState = {
                ...sessionState.workbenchState,
                latestError: null,
                agentStatus:
                  "Cancellation already requested. Waiting for the active turn to stop.",
              };
              await broadcastSessionState();
              break;
            }

            sessionState.workbenchState = {
              ...sessionState.workbenchState,
              latestError: null,
              agentStatus:
                "Cancellation requested. Waiting for the active turn to stop.",
            };
            await broadcastSessionState();
            abortTurn(activeInstructionController);
            break;
          case "session:resume_request": {
            if (activeInstruction !== null) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser instruction before opening another saved run.",
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
            break;
          }
          case "target:switch_request": {
            if (activeInstruction !== null) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser instruction before switching targets.",
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
              );
              await broadcastTargetSwitchComplete(
                true,
                `Switched to ${nextTargetManagerState.currentTarget.name}.`,
                nextTargetManagerState,
              );
              await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
              await broadcastSessionState();
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
            if (activeInstruction !== null) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser instruction before creating a target.",
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
              );
              await broadcastTargetSwitchComplete(
                true,
                `Created and selected ${nextTargetManagerState.currentTarget.name}.`,
                nextTargetManagerState,
              );
              await broadcastTargetState(nextTargetManagerState.enrichmentStatus);
              await broadcastSessionState();
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
            if (activeInstruction !== null) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "Finish the current browser instruction before enriching a target.",
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
              const profile = await enrichTargetTool(
                {
                  targetPath: sessionState.targetDirectory,
                  userDescription: message.userDescription,
                },
                {
                  invokeModel: runtimeState.targetEnrichmentInvoker,
                  async onProgress(event) {
                    await broadcastEnrichmentProgress(
                      event.status,
                      event.message,
                    );
                  },
                },
              );
              sessionState.targetProfile = profile;
              await broadcastTargetState({
                status: "complete",
                message: "Target profile saved.",
              });
              await broadcastSessionState();
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
          case "instruction":
            if (activeInstruction !== null) {
              await sendToSocket(
                socket,
                createErrorMessage(
                  "A browser instruction is already in progress for this session.",
                ),
              );
              break;
            }

            sessionState.workbenchState = queueInstructionTurn(
              sessionState.workbenchState,
              message.text,
              message.injectedContext ?? [],
            );
            await saveSessionState(sessionState);
            const turnController = new AbortController();
            activeInstructionController = turnController;
            activeInstruction = runBrowserInstruction(
              message.text,
              message.injectedContext,
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
    if (request.url !== "/ws") {
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
