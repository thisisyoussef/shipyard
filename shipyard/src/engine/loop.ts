import readline from "node:readline";
import process from "node:process";

import type { SessionState } from "./state.js";
import { createSessionSnapshot, saveSessionState } from "./state.js";
import { loadProjectRules } from "../context/envelope.js";
import {
  getCodePhaseToolDefinitions,
} from "../phases/code/index.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
} from "./turn.js";
import {
  ToolError,
  gitDiffTool,
  listFilesTool,
  readFileTool,
  runCommandTool,
  searchFilesTool,
} from "../tools/index.js";
import type { RunCommandResult } from "../tools/run-command.js";
import type { SearchMatch } from "../tools/search-files.js";
import { createLocalTraceLogger } from "../tracing/local-log.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";

export interface RunShipyardLoopOptions {
  sessionState: SessionState;
  injectedContext?: string[];
}

function printDivider(): void {
  console.log("");
}

function printHelp(): void {
  console.log("Available commands:");
  console.log("  help                  Show this menu");
  console.log("  status                Show the current session snapshot");
  console.log("  discover              Refresh project rules and discovery");
  console.log("  tools                 List registered tools");
  console.log("  read <path>           Read a file relative to the target");
  console.log("  list [glob]           List files in the target");
  console.log("  search <query>        Search the target with ripgrep");
  console.log("  run <command>         Run a shell command in the target");
  console.log("  diff [args]           Run git diff inside the target");
  console.log("  exit | quit           Save the session and quit");
  printDivider();
  console.log("Any other input is treated as a Shipyard instruction.");
}

function printStatus(state: SessionState): void {
  console.log(JSON.stringify(createSessionSnapshot(state), null, 2));
}

function rememberRecent(
  values: string[],
  nextValue: string,
  limit = 5,
): void {
  values.push(nextValue);

  while (values.length > limit) {
    values.shift();
  }
}

function updateRollingSummary(
  currentSummary: string,
  turnCount: number,
  instruction: string,
): string {
  const nextLine = `Turn ${turnCount}: ${instruction}`;
  const nextSummary = currentSummary
    ? `${currentSummary}\n${nextLine}`
    : nextLine;

  return nextSummary
    .split("\n")
    .slice(-8)
    .join("\n");
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

  if (result.stdout.trim()) {
    printDivider();
    console.log(result.stdout.trimEnd());
  }

  if (result.stderr.trim()) {
    printDivider();
    console.log(result.stderr.trimEnd());
  }
}

async function captureCurrentGitDiff(
  targetDirectory: string,
): Promise<string | null> {
  try {
    const result = await gitDiffTool({
      targetDirectory,
    });

    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trimEnd();
    }
  } catch {
    return null;
  }

  return null;
}

export async function runShipyardLoop(
  options: RunShipyardLoopOptions,
): Promise<void> {
  const state = options.sessionState;
  const runtimeState = createInstructionRuntimeState({
    projectRules: await loadProjectRules(state.targetDirectory),
    baseInjectedContext: options.injectedContext ?? [],
  });
  const traceLogger = await createLocalTraceLogger(
    state.targetDirectory,
    state.sessionId,
  );
  const langSmith = getLangSmithConfig();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY && process.stdout.isTTY,
  });
  rl.setPrompt("shipyard > ");

  console.log("Shipyard booted.");
  console.log(`Session: ${state.sessionId}`);
  console.log(`Target: ${state.targetDirectory}`);
  console.log(`Local trace log: ${traceLogger.filePath}`);
  console.log(
    `LangSmith: ${langSmith.enabled ? "configured" : "not configured"}`,
  );
  console.log('Type "help" for commands.');

  await traceLogger.log("session.start", {
    sessionId: state.sessionId,
    targetDirectory: state.targetDirectory,
    discovery: state.discovery,
    phase: "code",
  });

  try {
    rl.prompt();

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      let shouldPromptAgain = true;

      if (!line) {
        rl.prompt();
        continue;
      }

      state.lastActiveAt = new Date().toISOString();

      try {
        if (line === "help") {
          printHelp();
        } else if (line === "status") {
          printStatus(state);
        } else if (line === "tools") {
          for (const tool of getCodePhaseToolDefinitions()) {
            console.log(`${tool.name}: ${tool.description}`);
          }
        } else if (line === "discover") {
          const { discoverTarget, formatDiscoverySummary } = await import(
            "../context/discovery.js"
          );
          state.discovery = await discoverTarget(state.targetDirectory);
          runtimeState.projectRules = await loadProjectRules(state.targetDirectory);
          console.log(`Discovery refreshed: ${formatDiscoverySummary(state.discovery)}`);
          await traceLogger.log("discovery.refresh", state.discovery);
        } else if (line === "exit" || line === "quit") {
          await saveSessionState(state);
          console.log("Shipyard session closed.");
          await traceLogger.log("session.end", {
            sessionId: state.sessionId,
            turnCount: state.turnCount,
          });
          shouldPromptAgain = false;
          break;
        } else if (line.startsWith("read ")) {
          const targetPath = line.slice(5).trim();
          const result = await readFileTool({
            targetDirectory: state.targetDirectory,
            path: targetPath,
          });

          rememberRecent(runtimeState.recentToolOutputs, `read_file ${targetPath}`);
          console.log(`Hash: ${result.hash}`);
          printDivider();
          console.log(result.contents);
        } else if (line === "list" || line.startsWith("list ")) {
          const glob = line === "list" ? undefined : line.slice(5).trim();
          const files = await listFilesTool({
            targetDirectory: state.targetDirectory,
            glob: glob || undefined,
          });

          rememberRecent(
            runtimeState.recentToolOutputs,
            `list_files ${glob ?? "(all)"} -> ${files.length} result(s)`,
          );

          if (files.length === 0) {
            console.log("No files matched.");
          } else {
            for (const file of files) {
              console.log(file);
            }
          }
        } else if (line.startsWith("search ")) {
          const query = line.slice(7).trim();
          const matches = await searchFilesTool({
            targetDirectory: state.targetDirectory,
            query,
          });

          rememberRecent(
            runtimeState.recentToolOutputs,
            `search_files ${query} -> ${matches.length} match(es)`,
          );
          await printSearchMatches(matches);
        } else if (line.startsWith("run ")) {
          const command = line.slice(4).trim();
          const result = await runCommandTool({
            targetDirectory: state.targetDirectory,
            command,
          });

          rememberRecent(
            runtimeState.recentToolOutputs,
            `run_command ${command} -> exit ${String(result.exitCode)}`,
          );
          await printCommandResult(result);
        } else if (line === "diff" || line.startsWith("diff ")) {
          const args = line === "diff" ? undefined : line.slice(5).trim();
          const result = await gitDiffTool({
            targetDirectory: state.targetDirectory,
            args: args || undefined,
          });

          rememberRecent(runtimeState.recentToolOutputs, "git_diff");
          await printCommandResult(result);
        } else {
          const turnResult = await executeInstructionTurn({
            sessionState: state,
            runtimeState,
            instruction: line,
          });

          console.log(
            `Turn ${state.turnCount} planned in phase "${turnResult.phaseName}".`,
          );
          console.log(JSON.stringify(turnResult.taskPlan, null, 2));
          printDivider();
          console.log(turnResult.finalText);
          await traceLogger.log("instruction.plan", {
            instruction: line,
            phase: turnResult.phaseName,
            contextEnvelope: turnResult.contextEnvelope,
            taskPlan: turnResult.taskPlan,
            status: turnResult.status,
            summary: turnResult.summary,
          });
        }
      } catch (error) {
        const message =
          error instanceof ToolError || error instanceof Error
            ? error.message
            : "Unknown error";
        rememberRecent(runtimeState.recentErrors, message);
        console.error(`shipyard error: ${message}`);
        await traceLogger.log("error", {
          sessionId: state.sessionId,
          message,
        });
      } finally {
        await saveSessionState(state);

        if (shouldPromptAgain) {
          rl.prompt();
        }
      }
    }
  } finally {
    rl.close();
  }
}
