import readline from "node:readline/promises";
import process from "node:process";

import { createContextEnvelope } from "../context/envelope.js";
import { discoverTarget } from "../context/discovery.js";
import { createDefaultToolRegistry } from "../tools/registry.js";
import type { SearchMatch } from "../tools/search-files.js";
import type { RunCommandResult } from "../tools/run-command.js";
import { ToolError } from "../tools/read-file.js";
import { createSessionSnapshot, createSessionState } from "./state.js";
import type { ShipyardSessionState } from "./state.js";
import { createLocalTraceLogger } from "../tracing/local-log.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";

export interface RunShipyardLoopOptions {
  targetPath: string;
  workspaceRoot?: string;
}

function printDivider(): void {
  console.log("");
}

function printHelp(): void {
  console.log("Available commands:");
  console.log("  help                  Show this menu");
  console.log("  status                Show the current session snapshot");
  console.log("  discover              Re-run target discovery");
  console.log("  tools                 List registered tools");
  console.log("  read <path>           Read a file relative to the target");
  console.log("  list [glob]           List files in the target");
  console.log("  search <query>        Search the target with ripgrep");
  console.log("  run <command>         Run a shell command in the target");
  console.log("  diff [args]           Run git diff inside the target");
  console.log("  exit | quit           Close the Shipyard session");
  printDivider();
  console.log("Any other input is stored as a session instruction.");
}

function printStatus(state: ShipyardSessionState): void {
  const snapshot = createSessionSnapshot(state);
  console.log(JSON.stringify(snapshot, null, 2));
}

async function refreshContextEnvelope(
  state: ShipyardSessionState,
): Promise<void> {
  state.contextEnvelope = createContextEnvelope({
    targetPath: state.targetPath,
    discovery: state.discovery,
    recentInstructions: state.instructions.slice(-5),
    availableTools: state.toolNames,
  });
}

async function printSearchMatches(matches: SearchMatch[]): Promise<void> {
  if (matches.length === 0) {
    console.log("No matches found.");
    return;
  }

  for (const match of matches) {
    console.log(`${match.path}:${match.lineNumber}: ${match.lineText}`);
  }
}

async function printCommandResult(result: RunCommandResult): Promise<void> {
  console.log(`exitCode: ${String(result.exitCode)}`);
  console.log(`timedOut: ${String(result.timedOut)}`);

  if (result.stdout.trim()) {
    printDivider();
    console.log(result.stdout.trimEnd());
  }

  if (result.stderr.trim()) {
    printDivider();
    console.log(result.stderr.trimEnd());
  }
}

export async function runShipyardLoop(
  options: RunShipyardLoopOptions,
): Promise<void> {
  const registry = createDefaultToolRegistry();
  const toolNames = registry.list().map((tool) => tool.name);
  const discovery = await discoverTarget(options.targetPath);
  const state = createSessionState(
    options.targetPath,
    discovery,
    createContextEnvelope({
      targetPath: options.targetPath,
      discovery,
      recentInstructions: [],
      availableTools: toolNames,
    }),
    toolNames,
  );
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const traceLogger = await createLocalTraceLogger(workspaceRoot);
  const langSmith = getLangSmithConfig();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log("Shipyard booted.");
  console.log(`Target: ${state.targetPath}`);
  console.log(`Discovery: ${state.discovery.summary}`);
  console.log(`Local trace log: ${traceLogger.filePath}`);
  console.log(
    `LangSmith: ${langSmith.enabled ? "configured" : "not configured"}`,
  );
  console.log('Type "help" for commands.');

  await traceLogger.log("session.start", {
    targetPath: state.targetPath,
    discovery: state.discovery,
    toolNames,
  });

  try {
    while (true) {
      const line = (await rl.question("shipyard> ")).trim();

      if (!line) {
        continue;
      }

      try {
        if (line === "help") {
          printHelp();
          continue;
        }

        if (line === "status") {
          printStatus(state);
          continue;
        }

        if (line === "tools") {
          for (const tool of registry.list()) {
            console.log(`${tool.name}: ${tool.description}`);
          }
          continue;
        }

        if (line === "discover") {
          state.discovery = await discoverTarget(state.targetPath);
          await refreshContextEnvelope(state);
          console.log(JSON.stringify(state.discovery, null, 2));
          await traceLogger.log("discovery.refresh", state.discovery);
          continue;
        }

        if (line === "exit" || line === "quit") {
          console.log("Shipyard session closed.");
          await traceLogger.log("session.end", {
            instructionCount: state.instructions.length,
          });
          break;
        }

        if (line.startsWith("read ")) {
          const result = await registry.execute<
            { targetDirectory: string; path: string },
            { hash: string; contents: string }
          >("read-file", {
            targetDirectory: state.targetPath,
            path: line.slice(5).trim(),
          });

          console.log(`Hash: ${result.hash}`);
          printDivider();
          console.log(result.contents);
          continue;
        }

        if (line === "list" || line.startsWith("list ")) {
          const glob = line === "list" ? undefined : line.slice(5).trim();
          const files = await registry.execute<
            { targetDirectory: string; glob?: string },
            string[]
          >("list-files", {
            targetDirectory: state.targetPath,
            glob: glob || undefined,
          });

          if (files.length === 0) {
            console.log("No files matched.");
            continue;
          }

          for (const file of files) {
            console.log(file);
          }
          continue;
        }

        if (line.startsWith("search ")) {
          const matches = await registry.execute<
            { targetDirectory: string; query: string },
            SearchMatch[]
          >("search-files", {
            targetDirectory: state.targetPath,
            query: line.slice(7).trim(),
          });

          await printSearchMatches(matches);
          continue;
        }

        if (line.startsWith("run ")) {
          const result = await registry.execute<
            { targetDirectory: string; command: string },
            RunCommandResult
          >("run-command", {
            targetDirectory: state.targetPath,
            command: line.slice(4).trim(),
          });

          await printCommandResult(result);
          continue;
        }

        if (line === "diff" || line.startsWith("diff ")) {
          const args = line === "diff" ? undefined : line.slice(5).trim();
          const result = await registry.execute<
            { targetDirectory: string; args?: string },
            RunCommandResult
          >("git-diff", {
            targetDirectory: state.targetPath,
            args: args || undefined,
          });

          await printCommandResult(result);
          continue;
        }

        state.instructions.push(line);
        await refreshContextEnvelope(state);
        console.log(
          `Captured instruction #${state.instructions.length}: ${line}`,
        );
        await traceLogger.log("instruction.capture", {
          instruction: line,
          contextEnvelope: state.contextEnvelope,
        });
      } catch (error) {
        const message =
          error instanceof ToolError || error instanceof Error
            ? error.message
            : "Unknown error";
        console.error(`shipyard error: ${message}`);
        await traceLogger.log("error", { message });
      }
    }
  } finally {
    rl.close();
  }
}
