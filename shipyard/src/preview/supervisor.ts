import {
  spawn,
  type ChildProcessByStdio,
} from "node:child_process";
import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import type { Readable } from "node:stream";

import type {
  PreviewCapabilityReport,
  PreviewState,
} from "../artifacts/types.js";
import {
  PREVIEW_HOST,
  STARTER_CANVAS_RUNNING_SUMMARY,
  createStarterCanvasIdleState,
  createPreviewStateFromCapability,
  getPreviewRefreshSummary,
} from "./contracts.js";

export interface CreatePreviewSupervisorOptions {
  targetDirectory: string;
  capability: PreviewCapabilityReport;
  onState?: (state: PreviewState) => Promise<void> | void;
  host?: string;
  preferredPort?: number;
  startupTimeoutMs?: number;
  logTailLimit?: number;
  starterCanvasOnUnavailable?: boolean;
  starterCanvasOnStartupFailure?: boolean;
}

export interface PreviewSupervisor {
  getState(): PreviewState;
  isStarterCanvasActive(): boolean;
  start(): Promise<void>;
  refresh(reason: string): Promise<void>;
  stop(options?: { silent?: boolean }): Promise<void>;
}

interface SpawnPlan {
  command: string;
  args: string[];
}

const DEFAULT_PREVIEW_PORT = 4173;

/**
 * Resolves the full path to a package manager binary (npm, yarn, pnpm, bun).
 * Uses the current Node.js binary's directory to find the runner, ensuring
 * the spawn works even when PATH doesn't include the nvm/node bin directory.
 */
function resolveRunnerPath(runner: string): string {
  // Get the directory containing the current node binary
  const nodeBinDir = path.dirname(process.execPath);

  // Construct the full path to the runner
  // On Windows, binaries have .cmd extension for package managers
  const extension = process.platform === "win32" ? ".cmd" : "";
  const fullPath = path.join(nodeBinDir, `${runner}${extension}`);

  return fullPath;
}
const DEFAULT_LOG_TAIL_LIMIT = 20;
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const MAX_PREVIEW_START_ATTEMPTS = 3;
const STARTER_CANVAS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shipyard Starter Canvas</title>
    <style>
      html,
      body {
        height: 100%;
        margin: 0;
        background: #f8fafc;
      }
    </style>
  </head>
  <body data-shipyard-starter-canvas="true"></body>
</html>
`;

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
}

function clipLogTail(logTail: string[], limit: number): string[] {
  return logTail.slice(-limit);
}

function appendLogLine(
  state: PreviewState,
  line: string,
  limit: number,
): PreviewState {
  const trimmed = line.trim();

  if (!trimmed) {
    return state;
  }

  return {
    ...state,
    logTail: clipLogTail([...state.logTail, trimmed], limit),
  };
}

function createPreviewSpawnPlan(
  capability: PreviewCapabilityReport,
  host: string,
  port: number,
): SpawnPlan {
  if (
    capability.status !== "available" ||
    capability.runner === null ||
    capability.scriptName === null
  ) {
    throw new Error("Preview is not available for this target.");
  }

  const previewArgs = [
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ];

  // Resolve the full path to the runner to avoid PATH issues
  const runnerPath = resolveRunnerPath(capability.runner);

  switch (capability.runner) {
    case "yarn":
      return {
        command: runnerPath,
        args: [capability.scriptName, ...previewArgs],
      };
    case "bun":
      return {
        command: runnerPath,
        args: ["run", capability.scriptName, "--", ...previewArgs],
      };
    case "pnpm":
    case "npm":
      return {
        command: runnerPath,
        args: ["run", capability.scriptName, "--", ...previewArgs],
      };
  }
}

function normalizePreviewUrl(url: string, host: string): string {
  return url.replace("http://localhost:", `http://${host}:`);
}

function extractPreviewUrl(line: string, host: string): string | null {
  const match = line.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/?/i);

  if (!match) {
    return null;
  }

  return normalizePreviewUrl(match[0], host);
}

function isReadyLine(line: string): boolean {
  return /\bready in\b/i.test(line) || /\blocal:\s*https?:\/\//i.test(line);
}

function waitForProcessClose(
  child: ChildProcessByStdio<null, Readable, Readable>,
): Promise<void> {
  return new Promise((resolve) => {
    child.once("close", () => {
      resolve();
    });
  });
}

async function terminateProcess(
  child: ChildProcessByStdio<null, Readable, Readable>,
): Promise<void> {
  const closed = waitForProcessClose(child);

  try {
    if (child.pid && process.platform !== "win32") {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // Ignore missing-process errors during shutdown.
  }

  const timeoutHandle = setTimeout(() => {
    try {
      if (child.pid && process.platform !== "win32") {
        process.kill(-child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // Ignore follow-up kill failures.
    }
  }, 1_000);

  try {
    await closed;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function findAvailablePort(
  host: string,
  preferredPort: number,
): Promise<number> {
  for (let attempts = 0; attempts < 25; attempts += 1) {
    const candidatePort = preferredPort + attempts;

    try {
      const port = await new Promise<number>((resolve, reject) => {
        const server = createNetServer();

        server.once("error", (error) => {
          server.close();
          reject(error);
        });
        server.listen(candidatePort, host, () => {
          const address = server.address();

          if (!address || typeof address === "string") {
            reject(new Error("Preview port probe failed to resolve a port."));
            return;
          }

          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(address.port);
          });
        });
      });

      return port;
    } catch (error) {
      if (!isPortInUseError(error)) {
        throw error;
      }
    }
  }

  throw new Error(
    `Unable to reserve a preview port starting at ${String(preferredPort)}.`,
  );
}

function createInitialRunningSummary(): string {
  return "Preview is running on loopback.";
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createPreviewSupervisor(
  options: CreatePreviewSupervisorOptions,
): PreviewSupervisor {
  const host = options.host ?? PREVIEW_HOST;
  const preferredPort = options.preferredPort ?? DEFAULT_PREVIEW_PORT;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const logTailLimit = options.logTailLimit ?? DEFAULT_LOG_TAIL_LIMIT;

  let state = options.starterCanvasOnUnavailable
    ? createStarterCanvasIdleState()
    : createPreviewStateFromCapability(options.capability);
  let childProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
  let startPromise: Promise<void> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let publishChain = Promise.resolve();
  let intentionalStop = false;
  let hasHealthyStart = false;
  let hasEverStartedRealPreview = false;
  let startupAttemptCount = 0;
  let previewUrl: string | null = state.url;
  let currentPort: number | null = null;
  let starterCanvasServer: HttpServer | null = null;
  let starterCanvasActive = false;

  const publishState = async (nextState: PreviewState): Promise<void> => {
    state = nextState;
    publishChain = publishChain
      .catch(() => {})
      .then(async () => {
        await options.onState?.(nextState);
      });
    await publishChain;
  };

  const clearTimers = (): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
  };

  const settleStart = (): void => {
    startPromise = null;
  };

  const shouldFallbackToStarterCanvas = (): boolean =>
    options.starterCanvasOnStartupFailure === true && !hasEverStartedRealPreview;

  const canRetryPreviewStartup = (): boolean =>
    options.capability.status === "available" &&
    !intentionalStop &&
    !hasHealthyStart &&
    startupAttemptCount < MAX_PREVIEW_START_ATTEMPTS;

  const retryPreviewStartup = (): void => {
    void spawnPreviewProcess().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);

      void publishState({
        status: "error",
        summary: "Local preview failed to start.",
        url: previewUrl,
        logTail: clipLogTail([...state.logTail, message], logTailLimit),
        lastRestartReason: message,
      }).finally(() => {
        settleStart();
      });
    });
  };

  const stopStarterCanvasServer = async (): Promise<void> => {
    if (!starterCanvasServer) {
      starterCanvasActive = false;
      return;
    }

    const server = starterCanvasServer;
    starterCanvasServer = null;
    starterCanvasActive = false;

    try {
      await closeHttpServer(server);
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "ERR_SERVER_NOT_RUNNING"
        )
      ) {
        throw error;
      }
    }
  };

  const startStarterCanvasServer = async (): Promise<void> => {
    await stopStarterCanvasServer();

    const server = createHttpServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(STARTER_CANVAS_HTML);
    });

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error) => {
        server.off("listening", handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.off("error", handleError);
        resolve();
      };

      server.once("error", handleError);
      server.once("listening", handleListening);
      server.listen(0, host);
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      await closeHttpServer(server);
      throw new Error("Starter canvas failed to resolve a loopback port.");
    }

    currentPort = address.port;
    previewUrl = `http://${host}:${String(address.port)}/`;
    hasHealthyStart = false;

    starterCanvasServer = server;
    starterCanvasActive = true;

    await publishState({
      status: "running",
      summary: STARTER_CANVAS_RUNNING_SUMMARY,
      url: previewUrl,
      logTail: [],
      lastRestartReason: null,
    });
  };

  const markRunning = async (
    summary: string,
    lastRestartReason: string | null,
    source: "preview" | "starter-canvas" = "preview",
  ): Promise<void> => {
    hasHealthyStart = source === "preview";
    starterCanvasActive = source === "starter-canvas";

    if (source === "preview") {
      hasEverStartedRealPreview = true;
      startupAttemptCount = 0;
    }

    await publishState({
      status: "running",
      summary,
      url: previewUrl,
      logTail: state.logTail,
      lastRestartReason,
    });
  };

  const handleOutputLine = (line: string): void => {
    const nextUrl = extractPreviewUrl(line, host);

    if (nextUrl) {
      previewUrl = nextUrl;
    }

    state = appendLogLine(state, line, logTailLimit);

    void publishState(state);

    if (
      (state.status === "starting" || state.status === "refreshing") &&
      (previewUrl !== null || isReadyLine(line))
    ) {
      if (previewUrl === null) {
        previewUrl = `http://${host}:${String(currentPort ?? preferredPort)}/`;
      }

      clearTimers();
      void markRunning(createInitialRunningSummary(), state.lastRestartReason);
      settleStart();
    }
  };

  const attachStream = (
    stream: NodeJS.ReadableStream,
  ): void => {
    let buffer = "";

    stream.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/g);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        handleOutputLine(line);
      }
    });

    stream.on("end", () => {
      if (buffer.trim()) {
        handleOutputLine(buffer);
      }
    });
  };

  const updateExitedState = async (reason: string): Promise<void> => {
    await publishState({
      status: hasHealthyStart ? "exited" : "error",
      summary: hasHealthyStart
        ? "Local preview exited unexpectedly."
        : "Local preview failed to start.",
      url: previewUrl,
      logTail: state.logTail,
      lastRestartReason: reason,
    });
  };

  const spawnPreviewProcess = async (): Promise<void> => {
    await stopStarterCanvasServer();

    const port = await findAvailablePort(host, preferredPort);
    const spawnPlan = createPreviewSpawnPlan(options.capability, host, port);
    startupAttemptCount += 1;

    previewUrl = null;
    currentPort = port;
    hasHealthyStart = false;
    intentionalStop = false;

    await publishState({
      status: "starting",
      summary: "Starting local preview on loopback.",
      url: null,
      logTail: [],
      lastRestartReason: null,
    });

    const spawnedProcess = spawn(spawnPlan.command, spawnPlan.args, {
      cwd: options.targetDirectory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    childProcess = spawnedProcess;

    attachStream(spawnedProcess.stdout);
    attachStream(spawnedProcess.stderr);

    spawnedProcess.once("error", (error) => {
      if (childProcess !== spawnedProcess) {
        return;
      }

      clearTimers();
      childProcess = null;

      if (canRetryPreviewStartup()) {
        retryPreviewStartup();
        return;
      }

      if (shouldFallbackToStarterCanvas()) {
        void startStarterCanvasServer().finally(() => {
          settleStart();
        });
        return;
      }

      void publishState({
        status: "error",
        summary: "Local preview failed to start.",
        url: previewUrl,
        logTail: clipLogTail(
          [...state.logTail, error.message],
          logTailLimit,
        ),
        lastRestartReason: error.message,
      });
      settleStart();
    });

    spawnedProcess.once("close", (exitCode, signal) => {
      if (childProcess !== spawnedProcess) {
        return;
      }

      clearTimers();
      childProcess = null;

      if (intentionalStop) {
        settleStart();
        return;
      }

      const reason = signal
        ? `Preview exited with signal ${signal}.`
        : `Preview exited with code ${String(exitCode ?? 0)}.`;

      if (canRetryPreviewStartup()) {
        retryPreviewStartup();
        return;
      }

      if (!hasHealthyStart && shouldFallbackToStarterCanvas()) {
        void startStarterCanvasServer().finally(() => {
          settleStart();
        });
        return;
      }

      void updateExitedState(reason);
      settleStart();
    });

    startupTimer = setTimeout(() => {
      if (state.status !== "starting" && state.status !== "refreshing") {
        return;
      }

      const reason = `Preview did not become ready within ${String(startupTimeoutMs)} ms.`;

      const stopRunningProcess = async (): Promise<void> => {
        if (!childProcess) {
          return;
        }

        intentionalStop = true;
        const processToStop = childProcess;
        childProcess = null;

        try {
          await terminateProcess(processToStop);
        } finally {
          intentionalStop = false;
        }
      };

      if (canRetryPreviewStartup()) {
        void stopRunningProcess().finally(() => {
          retryPreviewStartup();
        });
        return;
      }

      if (shouldFallbackToStarterCanvas()) {
        void stopRunningProcess()
          .then(() => startStarterCanvasServer())
          .finally(() => {
            settleStart();
          });
        return;
      }

      void stopRunningProcess()
        .then(() =>
          publishState({
            status: "error",
            summary: "Local preview failed to start.",
            url: previewUrl,
            logTail: state.logTail,
            lastRestartReason: reason,
          }),
        )
        .finally(() => {
          settleStart();
        });
    }, startupTimeoutMs);
  };

  return {
    getState(): PreviewState {
      return state;
    },

    isStarterCanvasActive(): boolean {
      return starterCanvasActive;
    },

    async start(): Promise<void> {
      if (options.capability.status === "unavailable") {
        if (starterCanvasServer && state.status === "running") {
          return;
        }

        if (options.starterCanvasOnUnavailable) {
          await startStarterCanvasServer();
        }
        return;
      }

      if (startPromise) {
        return startPromise;
      }

      if (
        (childProcess || starterCanvasServer) &&
        state.status !== "exited" &&
        state.status !== "error"
      ) {
        return;
      }

      startupAttemptCount = 0;
      startPromise = (async () => {
        await spawnPreviewProcess();

        while (
          state.status === "starting" ||
          state.status === "refreshing"
        ) {
          await new Promise((resolve) => {
            setTimeout(resolve, 25);
          });
        }
      })().finally(() => {
        settleStart();
      });

      await startPromise;
    },

    async refresh(reason: string): Promise<void> {
      if (
        starterCanvasActive ||
        options.capability.status !== "available" ||
        state.status !== "running"
      ) {
        return;
      }

      const refreshSummary = getPreviewRefreshSummary(
        options.capability.autoRefresh,
        reason,
      );

      if (options.capability.autoRefresh === "restart") {
        await this.stop();
        await publishState({
          status: "refreshing",
          summary: "Restarting local preview after the latest edit.",
          url: previewUrl,
          logTail: state.logTail,
          lastRestartReason: refreshSummary,
        });
        await this.start();
        await publishState({
          ...state,
          lastRestartReason: refreshSummary,
        });
        return;
      }

      await publishState({
        status: "refreshing",
        summary: "Waiting for target-native HMR to refresh the preview.",
        url: previewUrl,
        logTail: state.logTail,
        lastRestartReason: refreshSummary,
      });

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      await new Promise<void>((resolve) => {
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          void markRunning(createInitialRunningSummary(), refreshSummary).then(() => {
            resolve();
          });
        }, 150);
      });
    },

    async stop(stopOptions?: { silent?: boolean }): Promise<void> {
      clearTimers();

      if (starterCanvasServer) {
        await stopStarterCanvasServer();

        if (stopOptions?.silent) {
          return;
        }

        await publishState({
          status: "exited",
          summary: "Local preview stopped with the session.",
          url: previewUrl,
          logTail: state.logTail,
          lastRestartReason: state.lastRestartReason,
        });
        return;
      }

      if (!childProcess) {
        if (options.capability.status === "unavailable" && !state.url) {
          return;
        }

        if (stopOptions?.silent) {
          return;
        }

        await publishState({
          status: "exited",
          summary: "Local preview stopped with the session.",
          url: previewUrl,
          logTail: state.logTail,
          lastRestartReason: state.lastRestartReason,
        });
        return;
      }

      intentionalStop = true;
      const processToStop = childProcess;
      childProcess = null;

      try {
        await terminateProcess(processToStop);
      } finally {
        intentionalStop = false;
        startupAttemptCount = 0;
      }

      if (stopOptions?.silent) {
        return;
      }

      await publishState({
        status: "exited",
        summary: "Local preview stopped with the session.",
        url: previewUrl,
        logTail: state.logTail,
        lastRestartReason: state.lastRestartReason,
      });
    },
  };
}
