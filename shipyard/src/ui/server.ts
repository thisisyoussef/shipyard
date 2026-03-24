import { access, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WebSocketServer,
  type RawData,
  type WebSocket,
} from "ws";

import { formatDiscoverySummary } from "../context/discovery.js";
import {
  createSessionSnapshot,
  type SessionState,
  type SessionSnapshot,
} from "../engine/state.js";
import type { BackendToFrontendMessage } from "./contracts.js";
import {
  parseFrontendMessage,
  serializeBackendMessage,
} from "./contracts.js";

export interface StartUiRuntimeServerOptions {
  sessionState: SessionState;
  host?: string;
  port?: number;
  projectRulesLoaded: boolean;
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

function createTargetLabel(targetDirectory: string): string {
  const targetLabel = path.basename(targetDirectory);
  return targetLabel || targetDirectory;
}

function createSessionStateMessage(
  sessionState: SessionState,
  projectRulesLoaded: boolean,
): BackendToFrontendMessage {
  const snapshot = createSessionSnapshot(sessionState);

  return {
    type: "session:state",
    runtimeMode: "ui",
    connectionState: "ready",
    sessionId: snapshot.sessionId,
    targetLabel: createTargetLabel(snapshot.targetDirectory),
    turnCount: snapshot.turnCount,
    startedAt: snapshot.startedAt,
    lastActiveAt: snapshot.lastActiveAt,
    discoverySummary: formatDiscoverySummary(snapshot.discovery),
    projectRulesLoaded,
  };
}

function createHealthResponse(
  sessionState: SessionSnapshot,
): Record<string, unknown> {
  return {
    ok: true,
    runtimeMode: "ui",
    sessionId: sessionState.sessionId,
    targetLabel: createTargetLabel(sessionState.targetDirectory),
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
  const sessionMessage = createSessionStateMessage(sessionState, false);

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
  const httpServer = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const requestUrl = request.url ?? "/";

      if (requestUrl === "/api/health") {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify(
            createHealthResponse(createSessionSnapshot(options.sessionState)),
          ),
        );
        return;
      }

      await serveBuiltUi(requestUrl, response, fallbackHtml);
    },
  );
  const socketServer = new WebSocketServer({ noServer: true });
  const closed = new Promise<void>((resolve) => {
    httpServer.once("close", () => {
      resolve();
    });
  });

  socketServer.on("connection", (socket) => {
    sendMessage(
      socket,
      createSessionStateMessage(
        options.sessionState,
        options.projectRulesLoaded,
      ),
    );

    socket.on("message", (rawData: RawData) => {
      const rawMessage = rawData.toString();

      try {
        const message = parseFrontendMessage(rawMessage);

        switch (message.type) {
          case "status":
            sendMessage(
              socket,
              createSessionStateMessage(
                options.sessionState,
                options.projectRulesLoaded,
              ),
            );
            break;
          case "cancel":
            sendMessage(
              socket,
              createErrorMessage(
                "No active browser-driven instruction is running yet.",
              ),
            );
            break;
          case "instruction":
            sendMessage(socket, {
              type: "agent:thinking",
              message:
                "UI mode accepted the instruction contract. Live engine streaming lands in PRE2-S02.",
            });
            sendMessage(socket, {
              type: "agent:done",
              status: "error",
              summary:
                "Instruction execution is not wired to the browser yet in PRE2-S01.",
            });
            break;
        }
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Invalid client message.";
        sendMessage(socket, createErrorMessage(message));
      }
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
