#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { nanoid } from "nanoid";

import { discoverTarget, formatDiscoverySummary } from "../context/discovery.js";
import { loadProjectRules } from "../context/envelope.js";
import { runShipyardLoop } from "../engine/loop.js";
import type { InstructionRuntimeMode } from "../engine/turn.js";
import {
  createSessionState,
  ensureShipyardDirectories,
  loadSessionState,
  saveSessionState,
} from "../engine/state.js";
import type { ExistingUiRuntimeInfo } from "../ui/server.js";
import { startUiRuntimeServer } from "../ui/server.js";

export interface CliOptions {
  targetPath: string;
  sessionId?: string;
  ui: boolean;
}

export function formatUiStartupLines(options: {
  url: string;
  socketUrl: string;
  sessionId: string;
  connectionState: "ready" | "agent-busy" | "connecting" | "disconnected" | "error";
  workspaceDirectory: string;
  targetDirectory: string;
  requestedPort: number;
  actualPort: number;
  existingRuntime: ExistingUiRuntimeInfo | null;
}): string[] {
  const portNotice =
    options.requestedPort === 0 || options.requestedPort === options.actualPort
      ? null
      : options.existingRuntime
        ? chalk.yellow(
            `Requested port ${String(options.requestedPort)} was already serving Shipyard session ${options.existingRuntime.sessionId} for ${options.existingRuntime.targetDirectory ?? options.existingRuntime.targetLabel}. This runtime moved to ${String(options.actualPort)}.`,
          )
        : chalk.yellow(
            `Requested port ${String(options.requestedPort)} was busy. This runtime moved to ${String(options.actualPort)}.`,
          );

  return [
    chalk.green(`UI mode ready for session ${options.sessionId}`),
    `Workspace: ${options.workspaceDirectory}`,
    `Target: ${options.targetDirectory}`,
    ...(portNotice ? [portNotice] : []),
    `Browser: ${options.url}`,
    `WebSocket: ${options.socketUrl}`,
    `Initial browser state: ${options.connectionState}`,
    "Press Ctrl+C to stop Shipyard UI.",
  ];
}

export function parseArgs(argv: string[]): CliOptions {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();

  program
    .name("shipyard")
    .description("Persistent coding-agent CLI")
    .requiredOption("--target <path>", "Path to the target repository")
    .option("--session <id>", "Resume a saved session by ID")
    .option("--ui", "Start the browser-based developer UI runtime")
    .parse(normalizedArgv, { from: "user" });

  const options = program.opts<{
    target: string;
    session?: string;
    ui?: boolean;
  }>();

  return {
    targetPath: options.target,
    sessionId: options.session,
    ui: options.ui ?? false,
  };
}

function printDiscovery(report: Awaited<ReturnType<typeof discoverTarget>>): void {
  console.log(
    `Detected ${report.isGreenfield ? "greenfield" : "existing"} target.`,
  );
  console.log(`Language: ${report.language ?? "unknown"}`);
  console.log(`Framework: ${report.framework ?? "unknown"}`);
  console.log(`Package manager: ${report.packageManager ?? "unknown"}`);
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];

  if (!entryPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPath).href;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  const resolvedTargetPath = path.resolve(process.cwd(), options.targetPath);
  await mkdir(resolvedTargetPath, { recursive: true });
  await ensureShipyardDirectories(resolvedTargetPath);

  const resumedSession =
    options.sessionId === undefined
      ? null
      : await loadSessionState(resolvedTargetPath, options.sessionId);
  const discovery = await discoverTarget(resolvedTargetPath);
  const sessionState =
    resumedSession ??
    createSessionState({
      sessionId: nanoid(),
      targetDirectory: resolvedTargetPath,
      discovery,
    });

  sessionState.discovery = discovery;
  await saveSessionState(sessionState);

  if (options.sessionId && resumedSession === null) {
    console.log(
      chalk.yellow(
        `No saved session found for ${options.sessionId}; starting a new session.`,
      ),
    );
  }

  if (resumedSession !== null) {
    console.log(
      chalk.green(
        `Resumed session ${sessionState.sessionId} (${sessionState.turnCount} turn${sessionState.turnCount === 1 ? "" : "s"})`,
      ),
    );
  } else {
    console.log(chalk.green(`Started new session ${sessionState.sessionId}`));
  }

  console.log(`Target: ${resolvedTargetPath}`);
  console.log(`Discovery: ${formatDiscoverySummary(discovery)}`);
  printDiscovery(discovery);

  const projectRules = await loadProjectRules(resolvedTargetPath);
  const runtimeMode: InstructionRuntimeMode = "graph";
  const injectedContext = projectRules
    ? ["Loaded AGENTS.md rules into the stable context layer."]
    : [];

  if (options.ui) {
    const uiRuntime = await startUiRuntimeServer({
      sessionState,
      projectRules,
      projectRulesLoaded: Boolean(projectRules),
      baseInjectedContext: injectedContext,
      runtimeMode,
    });
    const shutdown = () => {
      void uiRuntime.close();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    for (const line of formatUiStartupLines({
      url: uiRuntime.url,
      socketUrl: uiRuntime.socketUrl,
      sessionId: sessionState.sessionId,
      connectionState: "ready",
      workspaceDirectory: uiRuntime.workspaceDirectory,
      targetDirectory: uiRuntime.targetDirectory,
      requestedPort: uiRuntime.requestedPort,
      actualPort: uiRuntime.port,
      existingRuntime: uiRuntime.portResolution.existingRuntime,
    })) {
      console.log(line);
    }

    await uiRuntime.closed;
    return;
  }

  await runShipyardLoop({
    sessionState,
    injectedContext,
    runtimeMode,
  });
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(chalk.red(`shipyard failed to start: ${message}`));
    process.exitCode = 1;
  });
}
