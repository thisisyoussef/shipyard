import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "commander";

import {
  createMissionPaths,
  loadMissionConfig,
} from "../src/mission-control/config.js";
import { loadEnvironmentFiles } from "../src/mission-control/env.js";

function parseArgs(argv: string[]) {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();
  program
    .name("ultimate-mission-watchdog")
    .requiredOption("--config <path>", "Path to the mission config JSON")
    .option(
      "--heartbeat-timeout-ms <ms>",
      "Maximum mission-control heartbeat age before restart",
      (value) => Number(value),
      90_000,
    )
    .parse(normalizedArgv, { from: "user" });

  return program.opts<{ config: string; heartbeatTimeoutMs: number }>();
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

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const configPath = path.resolve(process.cwd(), args.config);
  const config = await loadMissionConfig(configPath);
  const paths = createMissionPaths(configPath);
  const loadedEnvironment = await loadEnvironmentFiles(config.environment.envFiles);

  await mkdir(paths.logsDirectory, { recursive: true });
  const logger = createLogger(path.join(paths.logsDirectory, "mission-watchdog.log"));
  if (loadedEnvironment.loadedFiles.length > 0) {
    logger.log(
      `Loaded ${String(loadedEnvironment.loadedFiles.length)} bootstrap env file(s) for watchdog launches.`,
    );
  }
  if (loadedEnvironment.missingFiles.length > 0) {
    logger.log(
      `Bootstrap env files missing for watchdog launches: ${loadedEnvironment.missingFiles.join(", ")}.`,
    );
  }

  let child: ChildProcess | null = null;
  let restartCount = 0;

  const spawnMissionControl = (): ChildProcess => {
    const nextChild = spawn(
      process.execPath,
      [
        "--env-file-if-exists=.env",
        "--import",
        "tsx",
        "./scripts/ultimate-mission-control.ts",
        "--",
        "--config",
        configPath,
      ],
      {
        cwd: config.shipyardDirectory,
        env: {
          ...process.env,
          ...loadedEnvironment.env,
        },
        stdio: "ignore",
      },
    );
    restartCount += 1;
    logger.log(
      `Spawned mission-control pid ${String(nextChild.pid ?? "unknown")} (restart ${String(restartCount)}).`,
    );
    return nextChild;
  };

  child = spawnMissionControl();

  while (true) {
    await sleep(10_000);

    const activeChild = child;
    if (activeChild === null || activeChild.exitCode !== null) {
      logger.log("Mission-control exited. Restarting.");
      child = spawnMissionControl();
      continue;
    }

    try {
      const state = JSON.parse(await readFile(paths.statePath, "utf8")) as {
        heartbeatAt?: string | null;
      };
      const heartbeatAtMs = state.heartbeatAt
        ? Date.parse(state.heartbeatAt)
        : Number.NaN;

      if (
        Number.isFinite(heartbeatAtMs) &&
        Date.now() - heartbeatAtMs > args.heartbeatTimeoutMs
      ) {
        logger.log("Mission-control heartbeat is stale. Restarting.");
        activeChild.kill("SIGKILL");
        child = null;
      }
    } catch {
      logger.log("Mission-control state file is unavailable. Waiting for the next heartbeat.");
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
