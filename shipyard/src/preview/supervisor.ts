import {
  spawn,
  type ChildProcessByStdio,
} from "node:child_process";
import { createServer } from "node:net";
import type { Readable } from "node:stream";

import type {
  PreviewCapabilityReport,
  PreviewState,
} from "../artifacts/types.js";
import {
  PREVIEW_HOST,
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
}

export interface PreviewSupervisor {
  getState(): PreviewState;
  start(): Promise<void>;
  refresh(reason: string): Promise<void>;
  stop(): Promise<void>;
}

interface SpawnPlan {
  command: string;
  args: string[];
}

const DEFAULT_PREVIEW_PORT = 4173;
const DEFAULT_LOG_TAIL_LIMIT = 20;
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;

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

  switch (capability.runner) {
    case "yarn":
      return {
        command: "yarn",
        args: [capability.scriptName, ...previewArgs],
      };
    case "bun":
      return {
        command: "bun",
        args: ["run", capability.scriptName, "--", ...previewArgs],
      };
    case "pnpm":
    case "npm":
      return {
        command: capability.runner,
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
        const server = createServer();

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

export function createPreviewSupervisor(
  options: CreatePreviewSupervisorOptions,
): PreviewSupervisor {
  const host = options.host ?? PREVIEW_HOST;
  const preferredPort = options.preferredPort ?? DEFAULT_PREVIEW_PORT;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const logTailLimit = options.logTailLimit ?? DEFAULT_LOG_TAIL_LIMIT;

  let state = createPreviewStateFromCapability(options.capability);
  let childProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
  let startPromise: Promise<void> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let publishChain = Promise.resolve();
  let intentionalStop = false;
  let hasHealthyStart = false;
  let previewUrl: string | null = state.url;
  let currentPort: number | null = null;

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

  const markRunning = async (
    summary: string,
    lastRestartReason: string | null,
  ): Promise<void> => {
    hasHealthyStart = true;

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
    const port = await findAvailablePort(host, preferredPort);
    const spawnPlan = createPreviewSpawnPlan(options.capability, host, port);

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
      clearTimers();
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
      clearTimers();
      childProcess = null;

      if (intentionalStop) {
        settleStart();
        return;
      }

      const reason = signal
        ? `Preview exited with signal ${signal}.`
        : `Preview exited with code ${String(exitCode ?? 0)}.`;

      void updateExitedState(reason);
      settleStart();
    });

    startupTimer = setTimeout(() => {
      if (state.status !== "starting" && state.status !== "refreshing") {
        return;
      }

      const reason = `Preview did not become ready within ${String(startupTimeoutMs)} ms.`;

      void publishState({
        status: "error",
        summary: "Local preview failed to start.",
        url: previewUrl,
        logTail: state.logTail,
        lastRestartReason: reason,
      });
      settleStart();

      if (childProcess) {
        intentionalStop = true;
        void terminateProcess(childProcess).finally(() => {
          intentionalStop = false;
        });
      }
    }, startupTimeoutMs);
  };

  return {
    getState(): PreviewState {
      return state;
    },

    async start(): Promise<void> {
      if (options.capability.status === "unavailable") {
        return;
      }

      if (startPromise) {
        return startPromise;
      }

      if (childProcess && state.status !== "exited" && state.status !== "error") {
        return;
      }

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

    async stop(): Promise<void> {
      clearTimers();

      if (!childProcess) {
        if (options.capability.status === "unavailable") {
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
