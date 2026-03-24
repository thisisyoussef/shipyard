import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { nanoid } from "nanoid";

import { discoverTarget } from "../../src/context/discovery.js";
import { loadProjectRules } from "../../src/context/envelope.js";
import { resolveAnthropicConfig } from "../../src/engine/anthropic.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
  type InstructionRuntimeMode,
  type InstructionTurnReporter,
  type ToolCallEvent,
  type ToolResultEvent,
} from "../../src/engine/turn.js";
import {
  createSessionState,
  ensureShipyardDirectories,
  type SessionState,
} from "../../src/engine/state.js";
import { clearTrackedReadHashes } from "../../src/tools/index.js";
import {
  ensureLangSmithTracingEnabled,
  type LangSmithTraceReference,
} from "../../src/tracing/langsmith.js";

interface ScenarioOutcome {
  name: string;
  runtimeMode: InstructionRuntimeMode;
  resultStatus: "success" | "error";
  finalText: string;
  trace: LangSmithTraceReference;
  toolCalls: ToolCallEvent[];
  toolResults: ToolResultEvent[];
  targetDirectory: string;
}

function createReporter() {
  const toolCalls: ToolCallEvent[] = [];
  const toolResults: ToolResultEvent[] = [];
  const reporter: InstructionTurnReporter = {
    async onToolCall(event) {
      toolCalls.push(event);
    },
    async onToolResult(event) {
      toolResults.push(event);
    },
  };

  return {
    reporter,
    toolCalls,
    toolResults,
  };
}

async function createSession(targetDirectory: string): Promise<SessionState> {
  await ensureShipyardDirectories(targetDirectory);

  return createSessionState({
    sessionId: nanoid(),
    targetDirectory,
    discovery: await discoverTarget(targetDirectory),
  });
}

function assertTraceReference(
  trace: LangSmithTraceReference | null,
  scenarioName: string,
): LangSmithTraceReference {
  assert(trace, `${scenarioName} did not return LangSmith trace metadata.`);
  assert(trace.traceUrl, `${scenarioName} did not return a LangSmith trace URL.`);
  assert.match(
    trace.traceUrl,
    /^https:\/\/.*smith\.langchain\.com\//,
    `${scenarioName} returned a non-LangSmith trace URL.`,
  );

  return trace;
}

async function runScenario(options: {
  name: string;
  runtimeMode: InstructionRuntimeMode;
  targetDirectory: string;
  instruction: string;
}): Promise<ScenarioOutcome> {
  clearTrackedReadHashes();

  const sessionState = await createSession(options.targetDirectory);
  const runtimeState = createInstructionRuntimeState({
    projectRules: await loadProjectRules(options.targetDirectory),
    runtimeMode: options.runtimeMode,
  });
  const collected = createReporter();
  const result = await executeInstructionTurn({
    sessionState,
    runtimeState,
    instruction: options.instruction,
    reporter: collected.reporter,
  });

  return {
    name: options.name,
    runtimeMode: options.runtimeMode,
    resultStatus: result.status,
    finalText: result.finalText,
    trace: assertTraceReference(result.langSmithTrace, options.name),
    toolCalls: collected.toolCalls,
    toolResults: collected.toolResults,
    targetDirectory: options.targetDirectory,
  };
}

function printScenario(outcome: ScenarioOutcome): void {
  console.log(`[phase4-mvp] ${outcome.name}`);
  console.log(`  runtime: ${outcome.runtimeMode}`);
  console.log(`  status: ${outcome.resultStatus}`);
  console.log(`  trace: ${outcome.trace.traceUrl}`);
  console.log(`  tools: ${outcome.toolCalls.map((event) => event.toolName).join(", ")}`);
  console.log(`  final: ${outcome.finalText}`);
}

async function runSuccessScenario(): Promise<ScenarioOutcome> {
  const targetDirectory = await mkdtemp(
    path.join(tmpdir(), "shipyard-phase4-success-"),
  );
  const relativePath = "src/greeting.ts";
  const outcome = await runScenario({
    name: "graph-success-create",
    runtimeMode: "graph",
    targetDirectory,
    instruction: [
      "The target directory is empty.",
      "Create src/greeting.ts exporting a function named greet.",
      'The function must return the exact string "hello from traced shipyard".',
    ].join("\n"),
  });

  await access(path.join(targetDirectory, relativePath));
  const contents = await readFile(path.join(targetDirectory, relativePath), "utf8");

  assert.match(contents, /export function greet/i);
  assert.match(contents, /hello from traced shipyard/i);
  assert(
    outcome.toolCalls.some((event) => event.toolName === "write_file"),
    "Success scenario did not use write_file.",
  );

  return outcome;
}

async function runFailureScenario(): Promise<ScenarioOutcome> {
  const targetDirectory = await mkdtemp(
    path.join(tmpdir(), "shipyard-phase4-failure-"),
  );
  const outcome = await runScenario({
    name: "fallback-failure-missing-file",
    runtimeMode: "fallback",
    targetDirectory,
    instruction: [
      "Read src/missing.ts and summarize what it does.",
      "Use the available tools to inspect the file.",
      "Do not create any new files.",
    ].join("\n"),
  });

  assert(
    outcome.toolCalls.some((event) => event.toolName === "read_file"),
    "Failure scenario did not attempt read_file.",
  );
  assert(
    outcome.toolResults.some((event) => event.success === false),
    "Failure scenario did not surface a failing tool result.",
  );
  assert.match(outcome.finalText, /missing|not found|does not exist/i);

  return outcome;
}

async function main(): Promise<void> {
  resolveAnthropicConfig();
  ensureLangSmithTracingEnabled();

  const outcomes: ScenarioOutcome[] = [];

  try {
    outcomes.push(await runSuccessScenario());
    outcomes.push(await runFailureScenario());
  } finally {
    // Keep fixture directories for manual inspection after the smoke run.
  }

  for (const outcome of outcomes) {
    printScenario(outcome);
  }

  console.log("[phase4-mvp] LangSmith MVP verification passed.");
}

void main().catch(async (error) => {
  console.error(
    `[phase4-mvp] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
