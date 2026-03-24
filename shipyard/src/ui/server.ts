import { access, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WebSocketServer,
  type WebSocket,
} from "ws";

import {
  createInstructionRuntimeState,
  executeInstructionTurn,
  type InstructionRuntimeState,
  type InstructionTurnReporter,
  type TurnStateEvent,
} from "../engine/turn.js";
import { saveSessionState, type SessionState } from "../engine/state.js";
import type { BackendToFrontendMessage } from "./contracts.js";
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

export interface StartUiRuntimeServerOptions {
  sessionState: SessionState;
  host?: string;
  port?: number;
  projectRules: string;
  projectRulesLoaded: boolean;
  baseInjectedContext?: string[];
}

export interface UiRuntimeServer {
  host: string;
  port: number;
  url: string;
  socketUrl: string;
  close: () => Promise<void>;
  closed: Promise<void>;
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const builtUiDirectory = path.join(packageRoot, "dist", "ui");
const builtUiIndexPath = path.join(builtUiDirectory, "index.html");

function createHealthResponse(
  sessionState: SessionState,
): Record<string, unknown> {
  return {
    ok: true,
    runtimeMode: "ui",
    sessionId: sessionState.sessionId,
    targetLabel: path.basename(sessionState.targetDirectory) || sessionState.targetDirectory,
    turnCount: sessionState.turnCount,
  };
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
  "status": {}
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

export async function startUiRuntimeServer(
  options: StartUiRuntimeServerOptions,
): Promise<UiRuntimeServer> {
  const host = options.host ?? "127.0.0.1";
  const fallbackHtml = createFallbackUiHtml(options.sessionState);
  const runtimeState = createInstructionRuntimeState({
    projectRules: options.projectRules,
    baseInjectedContext: options.baseInjectedContext,
  });
  const traceLogger = await createLocalTraceLogger(
    options.sessionState.targetDirectory,
    options.sessionState.sessionId,
  );
  await traceLogger.log("session.start", {
    sessionId: options.sessionState.sessionId,
    targetDirectory: options.sessionState.targetDirectory,
    discovery: options.sessionState.discovery,
    phase: "code",
    runtimeMode: "ui",
  });
  const httpServer = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const requestUrl = request.url ?? "/";

      if (requestUrl === "/api/health") {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify(
            createHealthResponse(options.sessionState),
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

  const sendSessionState = async (socket: WebSocket): Promise<void> => {
    await sendToSocket(
      socket,
      createSessionStateMessage({
        sessionState: options.sessionState,
        connectionState: connectionState(),
        projectRulesLoaded: options.projectRulesLoaded,
      }),
    );
  };
  const broadcastBrowserMessage = async (
    message: BackendToFrontendMessage,
  ): Promise<void> => {
    options.sessionState.workbenchState =
      message.type === "session:state"
        ? message.workbenchState
        : applyBackendMessage(options.sessionState.workbenchState, message);

    await broadcast(message);
  };

  const runBrowserInstruction = async (
    instruction: string,
    injectedContext: string[] | undefined,
  ): Promise<void> => {
    const baseReporter = createUiInstructionReporter({
      send: broadcastBrowserMessage,
      projectRulesLoaded: options.projectRulesLoaded,
    });
    let pendingTurnState: TurnStateEvent | null = null;
    const reporter: InstructionTurnReporter = {
      ...baseReporter,
      async onTurnState(event) {
        if (event.connectionState === "agent-busy") {
          await baseReporter.onTurnState?.(event);
          return;
        }

        pendingTurnState = event;
      },
    };

    const turnResult = await executeInstructionTurn({
      sessionState: options.sessionState,
      runtimeState,
      instruction,
      injectedContext,
      reporter,
    });
    await traceLogger.log("instruction.plan", {
      instruction,
      phase: turnResult.phaseName,
      contextEnvelope: turnResult.contextEnvelope,
      taskPlan: turnResult.taskPlan,
      status: turnResult.status,
      summary: turnResult.summary,
      runtimeMode: "ui",
    });

    if (pendingTurnState) {
      await baseReporter.onTurnState?.(pendingTurnState);
    }
  };

  socketServer.on("connection", (socket) => {
    sockets.add(socket);
    void sendSessionState(socket);

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
            break;
          case "cancel":
            await sendToSocket(
              socket,
              createErrorMessage(
                activeInstruction === null
                  ? "No active browser-driven instruction is running yet."
                  : "Cancellation is not implemented yet for browser turns.",
              ),
            );
            break;
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

            options.sessionState.workbenchState = queueInstructionTurn(
              options.sessionState.workbenchState,
              message.text,
              message.injectedContext ?? [],
            );
            await saveSessionState(options.sessionState);
            activeInstruction = runBrowserInstruction(
              message.text,
              message.injectedContext,
            );

            try {
              await activeInstruction;
            } finally {
              activeInstruction = null;
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

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("error", onError);
      reject(error);
    };

    httpServer.on("error", onError);
    httpServer.listen(resolveUiPort(options.port), host, () => {
      httpServer.off("error", onError);
      resolve();
    });
  });

  const address = httpServer.address();

  if (!address || typeof address === "string") {
    throw new Error("UI runtime failed to resolve a listening address.");
  }

  const url = `http://${host}:${String(address.port)}`;
  const socketUrl = `ws://${host}:${String(address.port)}/ws`;

  return {
    host,
    port: address.port,
    url,
    socketUrl,
    async close(): Promise<void> {
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
