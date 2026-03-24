#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { runShipyardLoop } from "../src/engine/loop.js";

interface CliOptions {
  targetPath: string;
}

function parseArgs(argv: string[]): CliOptions {
  const targetFlagIndex = argv.findIndex((arg) => arg === "--target");
  const targetPath = targetFlagIndex >= 0 ? argv[targetFlagIndex + 1] : undefined;

  if (!targetPath) {
    throw new Error("Missing required flag: --target <path>");
  }

  return {
    targetPath,
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
  console.error(`shipyard failed to start: ${message}`);
  process.exitCode = 1;
});
