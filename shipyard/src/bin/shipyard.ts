#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import { nanoid } from "nanoid";

import { discoverTarget, formatDiscoverySummary } from "../context/discovery.js";
import { loadProjectRules } from "../context/envelope.js";
import { runShipyardLoop } from "../engine/loop.js";
import {
  createSessionState,
  ensureShipyardDirectories,
  loadSessionState,
  saveSessionState,
} from "../engine/state.js";

interface CliOptions {
  targetPath: string;
  sessionId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();

  program
    .name("shipyard")
    .description("Persistent coding-agent CLI")
    .requiredOption("--target <path>", "Path to the target repository")
    .option("--session <id>", "Resume a saved session by ID")
    .parse(normalizedArgv, { from: "user" });

  const options = program.opts<{ target: string; session?: string }>();

  return {
    targetPath: options.target,
    sessionId: options.session,
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
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

  await runShipyardLoop({
    sessionState,
    injectedContext: (await loadProjectRules(resolvedTargetPath))
      ? ["Loaded AGENTS.md rules into the stable context layer."]
      : [],
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(chalk.red(`shipyard failed to start: ${message}`));
  process.exitCode = 1;
});
