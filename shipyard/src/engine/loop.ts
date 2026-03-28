import readline from "node:readline";
import process from "node:process";

import type { AgentRuntimeDependencies } from "./graph.js";
import type { SessionState } from "./state.js";
import {
  createSessionSnapshot,
  saveSessionState,
  switchTarget,
} from "./state.js";
import {
  applySessionSwitchToRuntime,
} from "./runtime-context.js";
import {
  handleTargetCommand,
  maybeAutoEnrichTarget,
} from "./target-command.js";
import { loadProjectRules } from "../context/envelope.js";
import {
  getCodePhaseToolDefinitions,
} from "../phases/code/index.js";
import { getTargetManagerToolDefinitions } from "../phases/target-manager/index.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
  type ExecuteInstructionTurnOptions,
  type InstructionRuntimeMode,
  type InstructionTurnResult,
  type InstructionTurnReporter,
} from "./turn.js";
import { formatTurnExecutionFingerprint } from "./turn-fingerprint.js";
import {
  createUltimateModeController,
  executeUltimateMode,
  formatUltimateModeStatus,
  parseUltimateModeCommand,
  type ExecuteUltimateModeOptions,
  type UltimateModeController,
} from "./ultimate-mode.js";
import {
  executePlanningTurn,
  isPlanModeInstruction,
  type ExecutePlanningTurnOptions,
  type PlanningTurnResult,
} from "../plans/turn.js";
import {
  executePipelineTurn,
  isPipelineInstruction,
  type ExecutePipelineTurnOptions,
  type PipelineTurnResult,
} from "../pipeline/turn.js";
import {
  executeTaskRunnerTurn,
  isTaskRunnerInstruction,
  type ExecuteTaskRunnerTurnOptions,
  type TaskRunnerTurnResult,
} from "../plans/task-runner.js";
import { abortTurn } from "./cancellation.js";
import {
  ToolError,
  gitDiffTool,
  listFilesTool,
  readFileTool,
  runCommandTool,
  searchFilesTool,
} from "../tools/index.js";
import type { RunCommandResult } from "../tools/run-command.js";
import type { SearchFilesResult } from "../tools/search-files.js";
import { createLocalTraceLogger } from "../tracing/local-log.js";
import { getLangSmithConfig } from "../tracing/langsmith.js";

export interface RunShipyardLoopOptions {
  sessionState: SessionState;
  injectedContext?: string[];
  runtimeMode?: InstructionRuntimeMode;
  runtimeDependencies?: AgentRuntimeDependencies;
  executeTurn?: (
    options: ExecuteInstructionTurnOptions,
  ) => Promise<InstructionTurnResult>;
  executePlanTurn?: (
    options: ExecutePlanningTurnOptions,
  ) => Promise<PlanningTurnResult>;
  executePipelineTurn?: (
    options: ExecutePipelineTurnOptions,
  ) => Promise<PipelineTurnResult>;
  executeTaskTurn?: (
    options: ExecuteTaskRunnerTurnOptions,
  ) => Promise<TaskRunnerTurnResult>;
  executeUltimateMode?: (
    options: ExecuteUltimateModeOptions,
  ) => Promise<Awaited<ReturnType<typeof executeUltimateMode>>>;
  createReadlineInterface?: () => ReturnType<typeof readline.createInterface>;
}

function printDivider(): void {
  console.log("");
}

function printExecutionFingerprint(
  fingerprint?: InstructionTurnResult["executionFingerprint"] | TaskRunnerTurnResult["executionFingerprint"],
): void {
  if (!fingerprint) {
    return;
  }

  console.log(`Execution fingerprint: ${formatTurnExecutionFingerprint(fingerprint)}`);
}

function printHelp(): void {
  console.log("Available commands:");
  console.log("  help                  Show this menu");
  console.log("  status                Show the current session snapshot");
  console.log("  discover              Refresh project rules and discovery");
  console.log("  tools                 List registered tools");
  console.log("  target                Show current target info");
  console.log("  target switch         List targets and switch");
  console.log("  target create         Create a new target");
  console.log("  target enrich         Re-run AI enrichment");
  console.log("  target profile        Print full TargetProfile JSON");
  console.log("  read <path>           Read a file relative to the target");
  console.log("  list [path]           List visible files in the target");
  console.log("  search <pattern>      Search the target with ripgrep");
  console.log("  run <command>         Run a shell command in the target");
  console.log("  diff [staged] [path]  Run git diff inside the target");
  console.log("  ultimate <brief>      Start ultimate mode with the given brief");
  console.log("  ultimate status       Show whether ultimate mode is active");
  console.log("  ultimate feedback ... Queue human feedback for the next ultimate mode cycle");
  console.log("  ultimate stop         Stop the active ultimate mode run");
  console.log("  plan: <request>       Save a reviewable task queue without editing code");
  console.log("  pipeline start <brief>  Start the explicit multi-phase pipeline");
  console.log("  pipeline status         Show the active pipeline summary");
  console.log("  pipeline continue       Resume a non-blocked active pipeline");
  console.log("  pipeline approve        Approve the waiting pipeline artifact");
  console.log("  pipeline reject ...     Reject the waiting pipeline artifact and rerun the phase");
  console.log("  pipeline edit ...       Approve the waiting artifact with edited content");
  console.log("  pipeline skip [phase]   Skip the current or named phase");
  console.log("  pipeline rerun [phase]  Re-run the current or named phase");
  console.log("  pipeline back [phase]   Move back to an earlier phase and continue");
  console.log("  next                  Run the next pending task from the active plan");
  console.log("  continue              Resume the in-progress task or fall back to the next pending task");
  console.log("  exit | quit           Save the session and quit");
  printDivider();
  console.log("Press Ctrl+C during an active turn to cancel it and keep the session alive.");
  printDivider();
  console.log("Any other input is treated as a Shipyard instruction.");
}

function printStatus(state: SessionState): void {
  console.log(JSON.stringify(createSessionSnapshot(state), null, 2));
}

function createCliUltimateModeReporter(): InstructionTurnReporter {
  return {
    onThinking(message) {
      printDivider();
      console.log(message);
    },
    onText(text) {
      printDivider();
      console.log(text);
    },
    onError(message) {
      console.error(`shipyard error: ${message}`);
    },
  };
}

function getPhaseToolDefinitions(state: SessionState) {
  return state.activePhase === "target-manager"
    ? getTargetManagerToolDefinitions()
    : getCodePhaseToolDefinitions();
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

async function printSearchMatches(result: SearchFilesResult): Promise<void> {
  if (result.matches.length === 0) {
    console.log("No matches found.");
    return;
  }

  for (const match of result.matches) {
    console.log(`${match.path}:${match.lineNumber}: ${match.lineText}`);
  }

  if (result.truncated) {
    printDivider();
    console.log(`Results truncated to ${String(result.limit)} matches.`);
  }
}

async function printCommandResult(result: RunCommandResult): Promise<void> {
  console.log(`exitCode: ${String(result.exitCode)}`);
  console.log(`timedOut: ${result.timedOut ? "yes" : "no"}`);

  if (result.truncated) {
    console.log("output truncated: yes");
  }

  if (result.combinedOutput.trim()) {
    printDivider();
    console.log(result.combinedOutput.trimEnd());
  }
}

function parseDiffArguments(
  rawArgs: string | undefined,
): { staged?: boolean; path?: string } {
  if (!rawArgs?.trim()) {
    return {};
  }

  const trimmedArgs = rawArgs.trim();

  if (trimmedArgs === "staged" || trimmedArgs === "--staged") {
    return {
      staged: true,
    };
  }

  if (trimmedArgs.startsWith("staged ")) {
    return {
      staged: true,
      path: trimmedArgs.slice("staged ".length).trim() || undefined,
    };
  }

  if (trimmedArgs.startsWith("--staged ")) {
    return {
      staged: true,
      path: trimmedArgs.slice("--staged ".length).trim() || undefined,
    };
  }

  return {
    path: trimmedArgs,
  };
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
  const executeTurn = options.executeTurn ?? executeInstructionTurn;
  const executePlanTurn = options.executePlanTurn ?? executePlanningTurn;
  const executePipelineTurnImpl =
    options.executePipelineTurn ?? executePipelineTurn;
  const executeTaskTurn = options.executeTaskTurn ?? executeTaskRunnerTurn;
  const executeUltimateModeTurn = options.executeUltimateMode ?? executeUltimateMode;
  const runtimeState = createInstructionRuntimeState({
    projectRules: await loadProjectRules(state.targetDirectory),
    baseInjectedContext: options.injectedContext ?? [],
    runtimeMode: options.runtimeMode,
    runtimeDependencies: options.runtimeDependencies,
  });
  let traceLogger = await createLocalTraceLogger(
    state.targetDirectory,
    state.sessionId,
  );
  const langSmith = getLangSmithConfig();
  const rl = options.createReadlineInterface?.() ?? readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY && process.stdout.isTTY,
  });
  let activeTurnController: AbortController | null = null;
  let activeUltimateController: UltimateModeController | null = null;
  rl.setPrompt("shipyard > ");

  console.log("Shipyard booted.");
  console.log(`Session: ${state.sessionId}`);
  console.log(`Target: ${state.targetDirectory}`);
  console.log(`Phase: ${state.activePhase}`);
  console.log(`Local trace log: ${traceLogger.filePath}`);
  console.log(
    `LangSmith: ${langSmith.enabled ? "configured" : "not configured"}`,
  );
  console.log('Type "help" for commands.');

  await traceLogger.log("session.start", {
    sessionId: state.sessionId,
    targetDirectory: state.targetDirectory,
    discovery: state.discovery,
    phase: state.activePhase,
  });

  const applySwitchedSessionState = async (
    nextState: SessionState,
    reason: string,
  ): Promise<void> => {
    Object.assign(state, nextState);
    await applySessionSwitchToRuntime(state, runtimeState);
    traceLogger = await createLocalTraceLogger(
      state.targetDirectory,
      state.sessionId,
    );
    await traceLogger.log("session.switch", {
      sessionId: state.sessionId,
      targetDirectory: state.targetDirectory,
      phase: state.activePhase,
      reason,
    });
  };

  const handleSigint = (): void => {
    if (activeTurnController === null) {
      console.log("No active Shipyard turn or ultimate mode run is running.");
      rl.prompt();
      return;
    }

    if (activeTurnController.signal.aborted) {
      console.log(
        activeUltimateController
          ? "Cancellation already requested. Waiting for Shipyard to stop ultimate mode..."
          : "Cancellation already requested. Waiting for Shipyard to stop the current turn...",
      );
      return;
    }

    console.log(
      activeUltimateController
        ? "Interrupt requested. Waiting for Shipyard to stop ultimate mode..."
        : "Interrupt requested. Waiting for Shipyard to stop the current turn...",
    );
    abortTurn(activeTurnController);
  };

  rl.on("SIGINT", handleSigint);

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
          for (const tool of getPhaseToolDefinitions(state)) {
            console.log(`${tool.name}: ${tool.description}`);
          }
        } else if (line === "discover") {
          if (state.activePhase === "target-manager") {
            console.log(
              "Target manager mode does not use project discovery. Select or create a target first.",
            );
          } else {
            const { discoverTarget, formatDiscoverySummary } = await import(
              "../context/discovery.js"
            );
            state.discovery = await discoverTarget(state.targetDirectory);
            runtimeState.projectRules = await loadProjectRules(state.targetDirectory);
            console.log(`Discovery refreshed: ${formatDiscoverySummary(state.discovery)}`);
            await traceLogger.log("discovery.refresh", state.discovery);
          }
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
          const targetPath = line === "list" ? "." : line.slice(5).trim() || ".";
          const files = await listFilesTool({
            targetDirectory: state.targetDirectory,
            path: targetPath,
          });

          rememberRecent(
            runtimeState.recentToolOutputs,
            `list_files ${targetPath} -> ${String(files.entries.length)} entry(ies)`,
          );

          console.log(files.tree);
        } else if (line.startsWith("search ")) {
          const pattern = line.slice(7).trim();
          const matches = await searchFilesTool({
            targetDirectory: state.targetDirectory,
            pattern,
          });

          rememberRecent(
            runtimeState.recentToolOutputs,
            `search_files ${pattern} -> ${String(matches.matches.length)} match(es)`,
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
          const diffOptions = parseDiffArguments(
            line === "diff" ? undefined : line.slice(5).trim(),
          );
          const result = await gitDiffTool({
            targetDirectory: state.targetDirectory,
            ...diffOptions,
          });

          rememberRecent(runtimeState.recentToolOutputs, "git_diff");
          await printCommandResult(result);
        } else if (line === "target" || line.startsWith("target ")) {
          const subcommand = line === "target" ? "" : line.slice(7).trim();
          const result = await handleTargetCommand(subcommand, {
            rl,
            state,
            runtimeState,
          });

          if (result.nextState) {
            await applySwitchedSessionState(
              result.nextState,
              `repl:${subcommand || "status"}`,
            );
            printDivider();
            console.log(
              `Switched to ${state.targetDirectory} and entered phase "${state.activePhase}".`,
            );
          }
        } else {
          if (isPipelineInstruction(line)) {
            const turnController = new AbortController();
            activeTurnController = turnController;
            const pipelineResult = await executePipelineTurnImpl({
              sessionState: state,
              runtimeState,
              instruction: line,
              reporter: createCliUltimateModeReporter(),
              signal: turnController.signal,
            });
            activeTurnController = null;

            printDivider();
            console.log(pipelineResult.finalText);
            if (pipelineResult.langSmithTrace?.traceUrl) {
              printDivider();
              console.log(`LangSmith trace: ${pipelineResult.langSmithTrace.traceUrl}`);
            }
            await traceLogger.log("instruction.pipeline", {
              instruction: line,
              command: pipelineResult.command,
              status: pipelineResult.status,
              summary: pipelineResult.summary,
              run: pipelineResult.run
                ? {
                    runId: pipelineResult.run.runId,
                    pipelineId: pipelineResult.run.pipeline.id,
                    pipelineStatus: pipelineResult.run.status,
                    currentPhaseIndex: pipelineResult.run.currentPhaseIndex,
                    pendingApproval: pipelineResult.run.pendingApproval,
                  }
                : null,
              langSmithTrace: pipelineResult.langSmithTrace,
            });
            continue;
          }

          const ultimateCommand = parseUltimateModeCommand(line);

          if (ultimateCommand) {
            if (ultimateCommand.type === "status") {
              console.log(formatUltimateModeStatus(activeUltimateController));
              continue;
            }

            if (ultimateCommand.type === "feedback") {
              console.log(
                "Ultimate mode feedback is accepted from the browser UI while the loop is running.",
              );
              continue;
            }

            if (ultimateCommand.type === "stop") {
              console.log(
                "Use Ctrl+C to interrupt the active ultimate mode run from the CLI.",
              );
              continue;
            }

            const turnController = new AbortController();
            const cliReporter = createCliUltimateModeReporter();
            const controller = createUltimateModeController(ultimateCommand.brief);
            activeTurnController = turnController;
            activeUltimateController = controller;

            const ultimateResult = await executeUltimateModeTurn({
              sessionState: state,
              runtimeState,
              brief: ultimateCommand.brief,
              controller,
              reporter: cliReporter,
              signal: turnController.signal,
              runtimeSurface: "cli",
            });

            activeTurnController = null;
            activeUltimateController = null;

            printExecutionFingerprint(
              ultimateResult.lastTurn?.executionFingerprint ?? null,
            );
            if (ultimateResult.lastTurn?.langSmithTrace?.traceUrl) {
              printDivider();
              console.log(
                `LangSmith trace: ${ultimateResult.lastTurn.langSmithTrace.traceUrl}`,
              );
            }
            await traceLogger.log("instruction.ultimate", {
              instruction: line,
              brief: ultimateCommand.brief,
              status: ultimateResult.status,
              summary: ultimateResult.summary,
              iterations: ultimateResult.iterations,
              lastTurn: ultimateResult.lastTurn
                ? {
                    status: ultimateResult.lastTurn.status,
                    summary: ultimateResult.lastTurn.summary,
                    taskPlan: ultimateResult.lastTurn.taskPlan,
                    executionSpec: ultimateResult.lastTurn.executionSpec,
                    harnessRoute: ultimateResult.lastTurn.harnessRoute,
                    executionFingerprint: ultimateResult.lastTurn.executionFingerprint ?? null,
                    langSmithTrace: ultimateResult.lastTurn.langSmithTrace,
                    selectedTargetPath: ultimateResult.lastTurn.selectedTargetPath,
                  }
                : null,
              recentHistory: ultimateResult.history,
            });
            continue;
          }

          const turnController = new AbortController();
          activeTurnController = turnController;
          if (isTaskRunnerInstruction(line)) {
            const taskTurnResult = await executeTaskTurn({
              sessionState: state,
              runtimeState,
              instruction: line,
              signal: turnController.signal,
              runtimeSurface: "cli",
            });
            activeTurnController = null;
            const turnStatusLabel = taskTurnResult.status === "success"
              ? "finished"
              : taskTurnResult.status === "cancelled"
                ? "cancelled"
                : "stopped";

            console.log(
              `Turn ${state.turnCount} ${turnStatusLabel} in phase "${taskTurnResult.phaseName}" via ${taskTurnResult.runtimeMode} runtime.`,
            );
            printExecutionFingerprint(taskTurnResult.executionFingerprint);
            if (taskTurnResult.taskPlan) {
              console.log(JSON.stringify(taskTurnResult.taskPlan, null, 2));
            }
            printDivider();
            console.log(taskTurnResult.finalText);
            if (taskTurnResult.langSmithTrace?.traceUrl) {
              printDivider();
              console.log(`LangSmith trace: ${taskTurnResult.langSmithTrace.traceUrl}`);
            }
            await traceLogger.log("instruction.plan", {
              instruction: line,
              phase: taskTurnResult.phaseName,
              runtimeMode: taskTurnResult.runtimeMode,
              planningMode: taskTurnResult.planningMode,
              route: taskTurnResult.route,
              command: taskTurnResult.command,
              contextEnvelope: taskTurnResult.contextEnvelope,
              taskPlan: taskTurnResult.taskPlan,
              executionSpec: taskTurnResult.executionSpec,
              executionFingerprint: taskTurnResult.executionFingerprint,
              executionFingerprintLabel: taskTurnResult.executionFingerprint
                ? formatTurnExecutionFingerprint(taskTurnResult.executionFingerprint)
                : null,
              taskQueue: taskTurnResult.plan,
              planId: taskTurnResult.planId,
              taskId: taskTurnResult.taskId,
              loadedSpecRefs: taskTurnResult.loadedSpecRefs,
              taskTransition: taskTurnResult.taskTransition,
              status: taskTurnResult.status,
              summary: taskTurnResult.summary,
              langSmithTrace: taskTurnResult.langSmithTrace,
            });
          } else if (isPlanModeInstruction(line)) {
            const planResult = await executePlanTurn({
              sessionState: state,
              runtimeState,
              instruction: line,
              signal: turnController.signal,
            });
            activeTurnController = null;
            const turnStatusLabel = planResult.status === "success"
              ? "planned"
              : planResult.status === "cancelled"
                ? "cancelled"
                : "stopped";

            console.log(
              `Turn ${state.turnCount} ${turnStatusLabel} in phase "${planResult.phaseName}" via ${planResult.runtimeMode} runtime.`,
            );
            printDivider();
            console.log(planResult.finalText);
            if (planResult.langSmithTrace?.traceUrl) {
              printDivider();
              console.log(`LangSmith trace: ${planResult.langSmithTrace.traceUrl}`);
            }
            await traceLogger.log("instruction.plan", {
              instruction: line,
              phase: planResult.phaseName,
              runtimeMode: planResult.runtimeMode,
              planningMode: planResult.planningMode,
              route: "planning-only",
              contextEnvelope: planResult.contextEnvelope,
              executionSpec: planResult.executionSpec,
              taskQueue: planResult.plan,
              loadedSpecRefs: planResult.loadedSpecRefs,
              status: planResult.status,
              summary: planResult.summary,
              langSmithTrace: planResult.langSmithTrace,
            });
          } else {
            const turnResult = await executeTurn({
              sessionState: state,
              runtimeState,
              instruction: line,
              signal: turnController.signal,
              runtimeSurface: "cli",
            });
            activeTurnController = null;
            const turnStatusLabel = turnResult.status === "success"
              ? "finished"
              : turnResult.status === "cancelled"
                ? "cancelled"
                : "stopped";

            console.log(
              `Turn ${state.turnCount} ${turnStatusLabel} in phase "${turnResult.phaseName}" via ${turnResult.runtimeMode} runtime.`,
            );
            printExecutionFingerprint(turnResult.executionFingerprint);
            console.log(JSON.stringify(turnResult.taskPlan, null, 2));
            printDivider();
            console.log(turnResult.finalText);
            if (turnResult.langSmithTrace?.traceUrl) {
              printDivider();
              console.log(`LangSmith trace: ${turnResult.langSmithTrace.traceUrl}`);
            }
            await traceLogger.log("instruction.plan", {
              instruction: line,
              phase: turnResult.phaseName,
              runtimeMode: turnResult.runtimeMode,
              planningMode: turnResult.planningMode,
              harnessRoute: turnResult.harnessRoute,
              executionFingerprint: turnResult.executionFingerprint,
              executionFingerprintLabel: turnResult.executionFingerprint
                ? formatTurnExecutionFingerprint(turnResult.executionFingerprint)
                : null,
              contextEnvelope: turnResult.contextEnvelope,
              taskPlan: turnResult.taskPlan,
              executionSpec: turnResult.executionSpec,
              status: turnResult.status,
              summary: turnResult.summary,
              langSmithTrace: turnResult.langSmithTrace,
              handoff: turnResult.handoff,
            });

            if (turnResult.selectedTargetPath) {
              const nextState = await switchTarget(state, turnResult.selectedTargetPath);
              await applySwitchedSessionState(nextState, "tool:select_target");
              await maybeAutoEnrichTarget(
                {
                  rl,
                  state,
                  runtimeState,
                },
                state,
              );
              printDivider();
              console.log(
                `Target selected. Shipyard switched to ${state.targetDirectory} and entered phase "${state.activePhase}".`,
              );
            }
          }
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
        activeTurnController = null;
        activeUltimateController = null;
        await saveSessionState(state);

        if (shouldPromptAgain) {
          rl.prompt();
        }
      }
    }
  } finally {
    rl.off("SIGINT", handleSigint);
    rl.close();
  }
}
