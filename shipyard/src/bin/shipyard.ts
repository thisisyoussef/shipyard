#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import chalk from "chalk";
import { Command } from "commander";

import { runShipyardLoop } from "../engine/loop.js";

interface CliOptions {
  targetPath: string;
}

function parseArgs(argv: string[]): CliOptions {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();

  program
    .name("shipyard")
    .description("Persistent coding-agent CLI")
    .requiredOption("--target <path>", "Path to the target repository")
    .parse(normalizedArgv, { from: "user" });

  const options = program.opts<{ target: string }>();

  return {
    targetPath: options.target,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const resolvedTargetPath = path.resolve(process.cwd(), options.targetPath);

  if (!existsSync(resolvedTargetPath)) {
    throw new Error(`Target path does not exist: ${resolvedTargetPath}`);
  }

  await runShipyardLoop({
    targetPath: resolvedTargetPath,
    workspaceRoot: process.cwd(),
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(chalk.red(`shipyard failed to start: ${message}`));
  process.exitCode = 1;
});
