import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, openSync } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "commander";
import WebSocket from "ws";

import {
  createMissionPaths,
  loadMissionConfig,
  resolveMaybeRelative,
  type MissionConfig,
  type MissionPaths,
  type MissionSidecarConfig,
} from "../src/mission-control/config.js";
import { loadEnvironmentFiles } from "../src/mission-control/env.js";
import {
  DEFAULT_MISSION_THRESHOLDS,
  decideMissionAction,
  type MissionThresholds,
} from "../src/mission-control/policy.js";
import { repairMissionSessionArtifacts } from "../src/mission-control/recovery.js";
import {
  collectRecoveredRuntimeEnv,
  summarizeRecoveredRuntimeEnv,
} from "../src/mission-control/runtime-env.js";
import {
  hasUiHealthRuntimeDetails,
  isUiHealthResponse,
  type UiHealthResponse,
} from "../src/ui/health.js";

const HEALTH_ACK_TIMEOUT_MS = 30_000;
const CHILD_SHUTDOWN_TIMEOUT_MS = 10_000;

interface MissionControlConfig extends Omit<MissionConfig, "supervision"> {
  supervision: MissionThresholds & {
    pollIntervalMs: number;
    backupIntervalMs: number;
    retainSessionBackups: number;
    retainHandoffBackups: number;
    sidecarMissingHealthGraceMs: number;
  };
}

interface ManagedProcessState {
  pid: number | null;
  lastHealthyAt: string | null;
  lastRestartAt: string | null;
  lastRestartReason: string | null;
  restartCount: number;
}

interface MissionStateFile {
  version: 1;
  missionId: string;
  updatedAt: string;
  heartbeatAt: string;
  passiveSocketConnected: boolean;
  lastSocketMessageAt: string | null;
  lastObservedRuntimeLastActiveAt: string | null;
  lastEnsureUltimateAt: string | null;
  ui: ManagedProcessState & {
    health: UiHealthResponse | null;
  };
  sidecars: Record<string, ManagedProcessState>;
  backups: {
    lastBackupAt: string | null;
    sessionCopies: number;
    handoffCopies: number;
  };
}

interface SidecarPaths {
  logPath: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, payload, { mode: 0o600 });
}

function createLogger(logPath: string) {
  return {
    log(message: string) {
      const line = `[${new Date().toISOString()}] ${message}\n`;
      appendFileSync(logPath, line);
      process.stdout.write(line);
    },
  };
}

function parseArgs(argv: string[]) {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();
  program
    .name("ultimate-mission-control")
    .requiredOption("--config <path>", "Path to the mission config JSON")
    .parse(normalizedArgv, { from: "user" });

  return program.opts<{ config: string }>();
}

function applyMissionDefaults(config: MissionConfig): MissionControlConfig {
  return {
    ...config,
    supervision: {
      ...DEFAULT_MISSION_THRESHOLDS,
      pollIntervalMs: config.supervision.pollIntervalMs ?? 15_000,
      backupIntervalMs: config.supervision.backupIntervalMs ?? 60_000,
      missingHealthGraceMs:
        config.supervision.missingHealthGraceMs ??
        DEFAULT_MISSION_THRESHOLDS.missingHealthGraceMs,
      minimumRestartGapMs:
        config.supervision.minimumRestartGapMs ??
        DEFAULT_MISSION_THRESHOLDS.minimumRestartGapMs,
      busyStallMs:
        config.supervision.busyStallMs ??
        DEFAULT_MISSION_THRESHOLDS.busyStallMs,
      softMemoryLimitMb:
        config.supervision.softMemoryLimitMb ??
        DEFAULT_MISSION_THRESHOLDS.softMemoryLimitMb,
      hardMemoryLimitMb:
        config.supervision.hardMemoryLimitMb ??
        DEFAULT_MISSION_THRESHOLDS.hardMemoryLimitMb,
      retainSessionBackups: config.supervision.retainSessionBackups ?? 72,
      retainHandoffBackups: config.supervision.retainHandoffBackups ?? 36,
      sidecarMissingHealthGraceMs:
        config.supervision.sidecarMissingHealthGraceMs ?? 45_000,
    },
  };
}

function createSidecarPaths(paths: MissionPaths, sidecar: MissionSidecarConfig): SidecarPaths {
  return {
    logPath: path.join(paths.logsDirectory, `${sidecar.name}.log`),
  };
}

function extractCookieHeader(setCookie: string | null): string | null {
  return setCookie?.split(";", 1)[0] ?? null;
}

async function fetchAccessCookie(config: MissionConfig): Promise<string | null> {
  if (!config.ui.accessToken) {
    return null;
  }

  const response = await fetch(
    `http://${config.ui.host}:${String(config.ui.port)}/api/access`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: config.ui.accessToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`UI access gate returned HTTP ${String(response.status)}.`);
  }

  return extractCookieHeader(response.headers.get("set-cookie"));
}

async function fetchUiHealth(config: MissionConfig): Promise<UiHealthResponse | null> {
  try {
    const cookie = await fetchAccessCookie(config);
    const response = await fetch(
      `http://${config.ui.host}:${String(config.ui.port)}/api/health`,
      {
        headers: cookie
          ? {
              cookie,
            }
          : undefined,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return isUiHealthResponse(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function fetchSidecarHealth(sidecar: MissionSidecarConfig): Promise<boolean> {
  try {
    const response = await fetch(sidecar.healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

function createTimestampFileStem(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function safeExecFile(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function getListeningPid(port: number): number | null {
  const output = safeExecFile("lsof", [
    "-nP",
    `-iTCP:${String(port)}`,
    "-sTCP:LISTEN",
    "-t",
  ]);

  if (!output) {
    return null;
  }

  const pid = Number(output.split(/\s+/u)[0]);
  return Number.isFinite(pid) ? pid : null;
}

function isPidAlive(pid: number | null): boolean {
  if (pid === null) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminatePid(pid: number, logger: ReturnType<typeof createLogger>, label: string): Promise<void> {
  logger.log(`Stopping ${label} pid ${String(pid)}.`);

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + CHILD_SHUTDOWN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return;
    }

    await sleep(250);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }
}

async function killPortOwner(
  port: number,
  logger: ReturnType<typeof createLogger>,
  label: string,
): Promise<void> {
  const pid = getListeningPid(port);

  if (pid === null) {
    return;
  }

  await terminatePid(pid, logger, `${label} port ${String(port)} owner`);
}

function spawnDetachedProcess(options: {
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  logPath: string;
  logger: ReturnType<typeof createLogger>;
  label: string;
}): number | null {
  const output = openSync(options.logPath, "a");
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    detached: true,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["ignore", output, output],
  });

  closeSync(output);
  child.unref();
  options.logger.log(
    `Started ${options.label} pid ${String(child.pid ?? "unknown")}.`,
  );

  return child.pid ?? null;
}

async function readMissionBrief(config: MissionConfig): Promise<string> {
  return (await readFile(config.ultimate.briefPath, "utf8")).trim();
}

async function readStickyFeedback(config: MissionConfig): Promise<string[]> {
  if (!(await fileExists(config.ultimate.stickyFeedbackPath))) {
    return [];
  }

  const payload = JSON.parse(
    await readFile(config.ultimate.stickyFeedbackPath, "utf8"),
  );

  if (!Array.isArray(payload) || payload.some((item) => typeof item !== "string")) {
    throw new Error("Sticky feedback file must contain a JSON array of strings.");
  }

  return payload.map((item) => item.trim()).filter(Boolean);
}

async function sendInstructionAndWaitForAck(options: {
  config: MissionConfig;
  instruction: string;
  logger: ReturnType<typeof createLogger>;
  ackMatcher: (message: string) => boolean;
}): Promise<string> {
  const cookie = await fetchAccessCookie(options.config);

  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://${options.config.ui.host}:${String(options.config.ui.port)}/ws`,
      {
        headers: cookie
          ? {
              Cookie: cookie,
            }
          : undefined,
      },
    );

    let sentInstruction = false;
    const timeoutHandle = setTimeout(() => {
      socket.close();
      reject(
        new Error(
          `Timed out waiting for mission-control ack for "${options.instruction}".`,
        ),
      );
    }, HEALTH_ACK_TIMEOUT_MS);

    const finish = (result: string, isError = false) => {
      clearTimeout(timeoutHandle);
      socket.close();
      if (isError) {
        reject(new Error(result));
        return;
      }

      resolve(result);
    };

    socket.on("message", (rawData) => {
      const payload = JSON.parse(rawData.toString()) as {
        type?: string;
        message?: string;
      };

      if (!sentInstruction && payload.type === "session:state") {
        sentInstruction = true;
        socket.send(
          JSON.stringify({
            type: "instruction",
            text: options.instruction,
          }),
        );
        return;
      }

      const message = String(payload.message ?? "");

      if (
        (payload.type === "agent:thinking" || payload.type === "text") &&
        options.ackMatcher(message)
      ) {
        finish(message);
        return;
      }

      if (payload.type === "agent:error") {
        finish(message || "Instruction failed.", true);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}

class PassiveSocketMonitor {
  private socket: WebSocket | null = null;
  private connecting = false;
  private readonly config: MissionConfig;
  private readonly logger: ReturnType<typeof createLogger>;
  lastMessageAtMs: number | null = null;

  constructor(
    config: MissionConfig,
    logger: ReturnType<typeof createLogger>,
  ) {
    this.config = config;
    this.logger = logger;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async ensureConnected(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      const cookie = await fetchAccessCookie(this.config);
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(
          `ws://${this.config.ui.host}:${String(this.config.ui.port)}/ws`,
          {
            headers: cookie
              ? {
                  Cookie: cookie,
                }
              : undefined,
          },
        );
        const timeoutHandle = setTimeout(() => {
          socket.close();
          reject(new Error("Timed out connecting mission passive socket."));
        }, HEALTH_ACK_TIMEOUT_MS);

        socket.once("open", () => {
          clearTimeout(timeoutHandle);
          this.socket = socket;
          this.lastMessageAtMs = Date.now();
          this.logger.log("Passive mission socket connected.");
          resolve();
        });

        socket.on("message", () => {
          this.lastMessageAtMs = Date.now();
        });

        socket.on("close", () => {
          if (this.socket === socket) {
            this.socket = null;
          }
        });

        socket.once("error", (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
      });
    } finally {
      this.connecting = false;
    }
  }
}

async function pruneDirectory(directory: string, retainCount: number): Promise<number> {
  if (!(await fileExists(directory))) {
    return 0;
  }

  const entries = (await readdir(directory)).sort();
  const removable = entries.slice(0, Math.max(0, entries.length - retainCount));

  await Promise.all(
    removable.map((entry) => rm(path.join(directory, entry), { force: true })),
  );

  return Math.max(0, entries.length - removable.length);
}

async function backupSessionArtifacts(
  config: MissionControlConfig,
  paths: MissionPaths,
  logger: ReturnType<typeof createLogger>,
): Promise<{ sessionCopies: number; handoffCopies: number }> {
  const sessionFile = path.join(
    config.targetDirectory,
    ".shipyard",
    "sessions",
    `${config.sessionId}.json`,
  );

  if (!(await fileExists(sessionFile))) {
    logger.log(`Mission session file is missing at ${sessionFile}.`);
    return {
      sessionCopies: await pruneDirectory(
        paths.sessionBackupsDirectory,
        config.supervision.retainSessionBackups,
      ),
      handoffCopies: await pruneDirectory(
        paths.handoffBackupsDirectory,
        config.supervision.retainHandoffBackups,
      ),
    };
  }

  const timestamp = createTimestampFileStem();
  await copyFile(
    sessionFile,
    path.join(paths.sessionBackupsDirectory, `${timestamp}.json`),
  );

  const sessionPayload = JSON.parse(await readFile(sessionFile, "utf8")) as {
    activeHandoffPath?: string | null;
  };
  const rawHandoffPath =
    typeof sessionPayload.activeHandoffPath === "string"
      ? sessionPayload.activeHandoffPath
      : null;
  const handoffPath =
    rawHandoffPath === null
      ? null
      : resolveMaybeRelative(config.targetDirectory, rawHandoffPath);

  if (handoffPath && (await fileExists(handoffPath))) {
    const handoffFileName = `${timestamp}-${path.basename(handoffPath)}`;
    await copyFile(
      handoffPath,
      path.join(paths.handoffBackupsDirectory, handoffFileName),
    );
  }

  return {
    sessionCopies: await pruneDirectory(
      paths.sessionBackupsDirectory,
      config.supervision.retainSessionBackups,
    ),
    handoffCopies: await pruneDirectory(
      paths.handoffBackupsDirectory,
      config.supervision.retainHandoffBackups,
    ),
  };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const { config: configPathInput } = parseArgs(argv);
  const configPath = path.resolve(process.cwd(), configPathInput);
  const config = applyMissionDefaults(await loadMissionConfig(configPath));
  const paths = createMissionPaths(configPath);

  await mkdir(paths.logsDirectory, { recursive: true });
  await mkdir(paths.sessionBackupsDirectory, { recursive: true });
  await mkdir(paths.handoffBackupsDirectory, { recursive: true });
  await mkdir(paths.quarantineDirectory, { recursive: true });

  const logger = createLogger(paths.controlLogPath);
  const passiveSocket = new PassiveSocketMonitor(config, logger);
  const loadedEnvironment = await loadEnvironmentFiles(config.environment.envFiles);
  const launchEnvironment = {
    ...loadedEnvironment.env,
    ...collectRecoveredRuntimeEnv(loadedEnvironment.env),
  };

  let lastHealthyAtMs: number | null = null;
  let lastRuntimeRestartAtMs: number | null = null;
  let lastRuntimeLastActiveAt: string | null = null;
  let lastEnsureUltimateAtMs: number | null = null;
  let lastBackupAtMs: number | null = null;
  let latestHealth: UiHealthResponse | null = null;
  let runtimeRestartCount = 0;
  let lastRuntimeRestartReason: string | null = null;

  const sidecarStates: Record<string, ManagedProcessState> = Object.fromEntries(
    config.sidecars.map((sidecar) => [
      sidecar.name,
      {
        pid: null,
        lastHealthyAt: null,
        lastRestartAt: null,
        lastRestartReason: null,
        restartCount: 0,
      } satisfies ManagedProcessState,
    ]),
  );

  async function persistState(): Promise<void> {
    await writeJsonFile(paths.statePath, {
      version: 1,
      missionId: config.missionId,
      updatedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      passiveSocketConnected: passiveSocket.connected,
      lastSocketMessageAt:
        passiveSocket.lastMessageAtMs === null
          ? null
          : new Date(passiveSocket.lastMessageAtMs).toISOString(),
      lastObservedRuntimeLastActiveAt: lastRuntimeLastActiveAt,
      lastEnsureUltimateAt:
        lastEnsureUltimateAtMs === null
          ? null
          : new Date(lastEnsureUltimateAtMs).toISOString(),
      ui: {
        pid:
          latestHealth && hasUiHealthRuntimeDetails(latestHealth)
            ? latestHealth.runtime.pid
            : null,
        lastHealthyAt:
          lastHealthyAtMs === null
            ? null
            : new Date(lastHealthyAtMs).toISOString(),
        lastRestartAt:
          lastRuntimeRestartAtMs === null
            ? null
            : new Date(lastRuntimeRestartAtMs).toISOString(),
        lastRestartReason: lastRuntimeRestartReason,
        restartCount: runtimeRestartCount,
        health: latestHealth,
      },
      sidecars: sidecarStates,
      backups: {
        lastBackupAt:
          lastBackupAtMs === null
            ? null
            : new Date(lastBackupAtMs).toISOString(),
        sessionCopies: await pruneDirectory(
          paths.sessionBackupsDirectory,
          config.supervision.retainSessionBackups,
        ),
        handoffCopies: await pruneDirectory(
          paths.handoffBackupsDirectory,
          config.supervision.retainHandoffBackups,
        ),
      },
    } satisfies MissionStateFile);
  }

  async function restartUiRuntime(reason: string): Promise<void> {
    logger.log(`Restarting Shipyard UI runtime: ${reason}`);

    const recovery = await repairMissionSessionArtifacts({
      targetDirectory: config.targetDirectory,
      sessionId: config.sessionId,
      paths,
    });
    if (recovery.restoredSession && recovery.sessionBackupFile) {
      logger.log(
        `Restored mission session from backup ${recovery.sessionBackupFile} before runtime launch.`,
      );
    } else if (recovery.sessionStatus !== "valid") {
      logger.log(
        `Mission session artifact is ${recovery.sessionStatus}; no backup restore was available before runtime launch.`,
      );
    }
    if (recovery.restoredHandoff && recovery.handoffBackupFile) {
      logger.log(
        `Restored active handoff from backup ${recovery.handoffBackupFile} before runtime launch.`,
      );
    }

    if (config.ui.takePortOwnership) {
      await killPortOwner(config.ui.port, logger, "Shipyard UI");
    }

    spawnDetachedProcess({
      cwd: config.shipyardDirectory,
      command: process.execPath,
      args: [
        "--env-file-if-exists=.env",
        "--import",
        "tsx",
        "./src/bin/shipyard.ts",
        "--",
        "--target",
        config.targetDirectory,
        "--session",
        config.sessionId,
        "--ui",
      ],
      env: {
        ...launchEnvironment,
        ...config.ui.env,
        SHIPYARD_UI_HOST: config.ui.host,
        SHIPYARD_UI_PORT: String(config.ui.port),
        SHIPYARD_ACCESS_TOKEN: config.ui.accessToken,
      },
      logPath: paths.uiLogPath,
      logger,
      label: "Shipyard UI runtime",
    });

    lastRuntimeRestartAtMs = Date.now();
    runtimeRestartCount += 1;
    lastRuntimeRestartReason = reason;
  }

  async function ensureSidecarHealthy(
    sidecar: MissionSidecarConfig,
  ): Promise<void> {
    const sidecarState = sidecarStates[sidecar.name];
    if (!sidecarState) {
      throw new Error(`Mission sidecar "${sidecar.name}" is not initialized.`);
    }
    const healthy = await fetchSidecarHealth(sidecar);

    if (healthy) {
      sidecarState.lastHealthyAt = new Date().toISOString();
      return;
    }

    const now = Date.now();
    const lastHealthyAtMs = sidecarState.lastHealthyAt
      ? Date.parse(sidecarState.lastHealthyAt)
      : null;
    const withinGrace =
      lastHealthyAtMs !== null &&
      now - lastHealthyAtMs < config.supervision.sidecarMissingHealthGraceMs;

    if (withinGrace) {
      return;
    }

    if (sidecar.takePortOwnership && sidecar.port) {
      await killPortOwner(sidecar.port, logger, sidecar.name);
    }

    const sidecarPaths = createSidecarPaths(paths, sidecar);
    sidecarState.pid = spawnDetachedProcess({
      cwd: sidecar.cwd,
      command: sidecar.command,
      args: sidecar.args,
      env: {
        ...launchEnvironment,
        ...sidecar.env,
      },
      logPath: sidecarPaths.logPath,
      logger,
      label: sidecar.name,
    });
    sidecarState.lastRestartAt = new Date().toISOString();
    sidecarState.lastRestartReason = "Health endpoint was unavailable.";
    sidecarState.restartCount += 1;
  }

  async function maybeEnsureUltimate(health: UiHealthResponse): Promise<void> {
    if (!hasUiHealthRuntimeDetails(health)) {
      return;
    }

    const now = Date.now();
    if (
      lastEnsureUltimateAtMs !== null &&
      now - lastEnsureUltimateAtMs < config.ultimate.ensureCooldownMs
    ) {
      return;
    }

    const brief = await readMissionBrief(config);
    await sendInstructionAndWaitForAck({
      config,
      instruction: `ultimate start ${brief}`,
      logger,
      ackMatcher: (message) => message.includes("Ultimate mode activated"),
    });

    const stickyFeedback = await readStickyFeedback(config);
    for (const feedback of stickyFeedback) {
      await sendInstructionAndWaitForAck({
        config,
        instruction: `ultimate feedback ${feedback}`,
        logger,
        ackMatcher: (message) =>
          message.includes("Queued human feedback for ultimate mode"),
      });
    }

    lastEnsureUltimateAtMs = now;
    logger.log(
      `Ultimate mode was re-armed with ${String(stickyFeedback.length)} sticky feedback item(s).`,
    );
  }

  logger.log(
    `Mission control booted for session ${config.sessionId} targeting ${config.targetDirectory}.`,
  );
  if (loadedEnvironment.loadedFiles.length > 0) {
    logger.log(
      `Loaded ${String(loadedEnvironment.loadedFiles.length)} bootstrap env file(s).`,
    );
  }
  if (loadedEnvironment.missingFiles.length > 0) {
    logger.log(
      `Bootstrap env files missing: ${loadedEnvironment.missingFiles.join(", ")}.`,
    );
  }
  logger.log(
    `Recovered launch secrets: ${summarizeRecoveredRuntimeEnv(launchEnvironment)}.`,
  );

  while (true) {
    latestHealth = await fetchUiHealth(config);
    const now = Date.now();
    const previousRuntimeLastActiveAt = lastRuntimeLastActiveAt;

    if (
      latestHealth !== null &&
      hasUiHealthRuntimeDetails(latestHealth) &&
      latestHealth.sessionId === config.sessionId &&
      latestHealth.targetDirectory === config.targetDirectory
    ) {
      lastHealthyAtMs = now;
      await passiveSocket.ensureConnected();
    } else if (latestHealth !== null) {
      logger.log(
        "Health endpoint responded, but the active session or target did not match this mission.",
      );
      latestHealth = null;
    }

    if (latestHealth === null && lastHealthyAtMs === null) {
      const shouldRetryBootstrap =
        lastRuntimeRestartAtMs === null ||
        now - lastRuntimeRestartAtMs >= config.supervision.missingHealthGraceMs;

      if (shouldRetryBootstrap) {
        await restartUiRuntime("Mission bootstrap: no UI runtime was detected.");
        await persistState();
        await sleep(2_000);
        continue;
      }

      await persistState();
      await sleep(config.supervision.pollIntervalMs);
      continue;
    }

    const decision = decideMissionAction({
      nowMs: now,
      lastHealthyAtMs,
      lastRuntimeRestartAtMs,
      previousRuntimeLastActiveAt: previousRuntimeLastActiveAt,
      health: latestHealth,
      thresholds: config.supervision,
    });

    if (decision.restartRuntime && decision.restartReason) {
      await restartUiRuntime(decision.restartReason);
      latestHealth = null;
      await sleep(2_000);
    }

    if (latestHealth !== null && decision.ensureUltimate) {
      await maybeEnsureUltimate(latestHealth);
      latestHealth = await fetchUiHealth(config);
    }

    if (latestHealth !== null && hasUiHealthRuntimeDetails(latestHealth)) {
      lastRuntimeLastActiveAt = latestHealth.runtime.lastActiveAt;
    }

    if (
      lastBackupAtMs === null ||
      now - lastBackupAtMs >= config.supervision.backupIntervalMs
    ) {
      const backupSummary = await backupSessionArtifacts(config, paths, logger);
      lastBackupAtMs = now;
      logger.log(
        `Captured mission backup snapshot (${String(backupSummary.sessionCopies)} session copies, ${String(backupSummary.handoffCopies)} handoff copies retained).`,
      );
    }

    if (latestHealth !== null && hasUiHealthRuntimeDetails(latestHealth)) {
      for (const sidecar of config.sidecars) {
        await ensureSidecarHealthy(sidecar);
      }
    }

    await persistState();
    await sleep(config.supervision.pollIntervalMs);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
