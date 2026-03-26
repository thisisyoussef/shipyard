import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import type { HarnessRouteSummary } from "../../src/artifacts/types.js";
import {
  resolveAnthropicConfig,
  resolveAnthropicRuntimeConfig,
} from "../../src/engine/anthropic.js";
import { createTranscriptCollector } from "../../src/engine/live-verification.js";
import { createSessionState, getSessionFilePath } from "../../src/engine/state.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
  type InstructionTurnReporter,
} from "../../src/engine/turn.js";
import { clearTrackedReadHashes } from "../../src/tools/index.js";

interface TurnArtifacts {
  rawTranscriptPath: string;
  eventTranscriptPath: string;
}

interface TurnResultSummary {
  name: string;
  status: "success" | "error" | "cancelled";
  finalText: string;
  toolCalls: string[];
  harnessRoute: HarnessRouteSummary;
  rawTranscriptPath: string;
  eventTranscriptPath: string;
  traceUrl: string | null;
}

interface ScenarioResult {
  targetDirectory: string;
  sessionFilePath: string;
  runtimeConfig: ReturnType<typeof resolveAnthropicRuntimeConfig>;
  turns: TurnResultSummary[];
  recentTouchedFiles: string[];
  summaryPath: string;
}

const BOOTSTRAP_AND_LARGE_WRITE_INSTRUCTION = [
  "Bootstrap this target with the shared workspace scaffold.",
  "Then create apps/web/src/lib/seed-data.ts exporting at least 120 issue-like records.",
  "Each record must include id, title, status, assignee, estimate, dueDate, and tags.",
  "After that, update apps/web/src/App.tsx so the app renders a compact summary of that seed data on first load.",
  "Keep the large data payload in the dedicated seed-data file instead of inlining it into the component.",
].join("\n");

const FOLLOW_UP_CONTINUATION_INSTRUCTION = [
  "Continue the same scaffolded app.",
  "Group the seed data by status, render totals for each status, and list the next three due items.",
  "Keep the change scoped to the files you just created or touched unless a re-read shows another file is necessary.",
].join("\n");

async function ensureAnthropicKey(): Promise<void> {
  resolveAnthropicConfig();
}

async function createScenarioDirectory(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `shipyard-${name}-`));
}

async function writeTextFile(
  directory: string,
  fileName: string,
  lines: string[],
): Promise<string> {
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return filePath;
}

async function writeJsonFile(
  directory: string,
  fileName: string,
  value: unknown,
): Promise<string> {
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function createTurnReporterCollector(): {
  eventLines: string[];
  toolCalls: string[];
  reporter: InstructionTurnReporter;
} {
  const eventLines: string[] = [];
  const toolCalls: string[] = [];

  return {
    eventLines,
    toolCalls,
    reporter: {
      onThinking(message) {
        eventLines.push(`[thinking] ${message}`);
      },
      onToolCall(event) {
        toolCalls.push(event.toolName);
        eventLines.push(`[tool_call] ${event.toolName} ${event.summary}`);
      },
      onToolResult(event) {
        eventLines.push(
          `[tool_result] ${event.toolName} ${event.success ? "success" : "failure"} ${event.summary}`,
        );
      },
      onEdit(event) {
        eventLines.push(`[edit] ${event.path} ${event.summary}`);
      },
      onText(text) {
        eventLines.push(`[text] ${text}`);
      },
      onError(message) {
        eventLines.push(`[error] ${message}`);
      },
      onDone(event) {
        eventLines.push(`[done] ${event.status} ${event.summary}`);
      },
    },
  };
}

function printTurnResult(result: TurnResultSummary): void {
  console.log(`[live-smoke] ${result.name}`);
  console.log(`  status: ${result.status}`);
  console.log(`  tools: ${result.toolCalls.join(", ")}`);
  console.log(`  route: ${result.harnessRoute.selectedPath}`);
  console.log(`  explorer/planner: ${String(result.harnessRoute.usedExplorer)}/${String(result.harnessRoute.usedPlanner)}`);
  console.log(`  raw transcript: ${result.rawTranscriptPath}`);
  console.log(`  event transcript: ${result.eventTranscriptPath}`);
  console.log(`  trace: ${result.traceUrl ?? "(none)"}`);
  console.log(`  final: ${result.finalText}`);
}

async function persistTurnArtifacts(options: {
  directory: string;
  prefix: string;
  rawLines: string[];
  eventLines: string[];
}): Promise<TurnArtifacts> {
  const rawTranscriptPath = await writeTextFile(
    options.directory,
    `${options.prefix}-raw.log`,
    options.rawLines,
  );
  const eventTranscriptPath = await writeTextFile(
    options.directory,
    `${options.prefix}-events.log`,
    options.eventLines,
  );

  return {
    rawTranscriptPath,
    eventTranscriptPath,
  };
}

async function runRuntimeHardeningScenario(): Promise<ScenarioResult> {
  clearTrackedReadHashes();
  const targetDirectory = await createScenarioDirectory("phase3-runtime-hardening-");
  await writeFile(
    path.join(targetDirectory, "AGENTS.md"),
    "Prefer the smallest possible changes and re-read files before editing them.\n",
    "utf8",
  );
  await writeFile(
    path.join(targetDirectory, "README.md"),
    "Seed docs for the runtime hardening live smoke.\n",
    "utf8",
  );

  const runtimeConfig = resolveAnthropicRuntimeConfig();
  const sessionState = createSessionState({
    sessionId: "phase3-runtime-hardening-smoke",
    targetDirectory,
    discovery: {
      isGreenfield: true,
      language: null,
      framework: null,
      packageManager: null,
      scripts: {},
      hasReadme: true,
      hasAgentsMd: true,
      topLevelFiles: ["AGENTS.md", "README.md"],
      topLevelDirectories: [],
      projectName: "phase3-runtime-hardening-smoke",
    },
  });

  let activeRawTranscript = createTranscriptCollector();
  const runtimeState = createInstructionRuntimeState({
    projectRules: "",
    runtimeDependencies: {
      createRawLoopOptions: () => ({
        logger: activeRawTranscript.logger,
      }),
    },
  });

  activeRawTranscript = createTranscriptCollector();
  const bootstrapCollector = createTurnReporterCollector();
  const bootstrapTurn = await executeInstructionTurn({
    sessionState,
    runtimeState,
    instruction: BOOTSTRAP_AND_LARGE_WRITE_INSTRUCTION,
    reporter: bootstrapCollector.reporter,
  });
  const bootstrapArtifacts = await persistTurnArtifacts({
    directory: targetDirectory,
    prefix: "turn-1-bootstrap-large-write",
    rawLines: activeRawTranscript.lines,
    eventLines: bootstrapCollector.eventLines,
  });
  const seedDataPath = path.join(
    targetDirectory,
    "apps",
    "web",
    "src",
    "lib",
    "seed-data.ts",
  );

  assert.equal(bootstrapTurn.status, "success");
  assert(
    bootstrapCollector.toolCalls.includes("bootstrap_target"),
    "Bootstrap turn did not use bootstrap_target.",
  );
  assert(
    bootstrapCollector.toolCalls.includes("write_file"),
    "Bootstrap turn did not create any new file with write_file.",
  );
  await access(seedDataPath);
  const seedDataContents = await readFile(seedDataPath, "utf8");
  assert(
    seedDataContents.split("\n").length >= 120,
    "Bootstrap turn did not leave behind a large enough seed-data file.",
  );

  activeRawTranscript = createTranscriptCollector();
  const followUpCollector = createTurnReporterCollector();
  const followUpTurn = await executeInstructionTurn({
    sessionState,
    runtimeState,
    instruction: FOLLOW_UP_CONTINUATION_INSTRUCTION,
    reporter: followUpCollector.reporter,
  });
  const followUpArtifacts = await persistTurnArtifacts({
    directory: targetDirectory,
    prefix: "turn-2-follow-up",
    rawLines: activeRawTranscript.lines,
    eventLines: followUpCollector.eventLines,
  });

  assert.equal(followUpTurn.status, "success");
  assert.equal(
    followUpTurn.harnessRoute.usedExplorer,
    false,
    "Follow-up turn escalated into explorer unexpectedly.",
  );
  assert.equal(
    followUpTurn.harnessRoute.usedPlanner,
    false,
    "Follow-up turn escalated into planner unexpectedly.",
  );
  assert(
    sessionState.recentTouchedFiles.includes("apps/web/src/lib/seed-data.ts"),
    "Recent touched files did not retain the large write target.",
  );

  const summaryPath = await writeJsonFile(
    targetDirectory,
    "phase3-live-loop-smoke-summary.json",
    {
      targetDirectory,
      sessionFilePath: getSessionFilePath(targetDirectory, sessionState.sessionId),
      runtimeConfig,
      recentTouchedFiles: sessionState.recentTouchedFiles,
      turns: [
        {
          name: "bootstrap-large-write",
          status: bootstrapTurn.status,
          finalText: bootstrapTurn.finalText,
          toolCalls: bootstrapCollector.toolCalls,
          harnessRoute: bootstrapTurn.harnessRoute,
          rawTranscriptPath: bootstrapArtifacts.rawTranscriptPath,
          eventTranscriptPath: bootstrapArtifacts.eventTranscriptPath,
          traceUrl: bootstrapTurn.langSmithTrace?.traceUrl ?? null,
        },
        {
          name: "follow-up",
          status: followUpTurn.status,
          finalText: followUpTurn.finalText,
          toolCalls: followUpCollector.toolCalls,
          harnessRoute: followUpTurn.harnessRoute,
          rawTranscriptPath: followUpArtifacts.rawTranscriptPath,
          eventTranscriptPath: followUpArtifacts.eventTranscriptPath,
          traceUrl: followUpTurn.langSmithTrace?.traceUrl ?? null,
        },
      ],
    },
  );

  return {
    targetDirectory,
    sessionFilePath: getSessionFilePath(targetDirectory, sessionState.sessionId),
    runtimeConfig,
    recentTouchedFiles: [...sessionState.recentTouchedFiles],
    summaryPath,
    turns: [
      {
        name: "bootstrap-large-write",
        status: bootstrapTurn.status,
        finalText: bootstrapTurn.finalText,
        toolCalls: bootstrapCollector.toolCalls,
        harnessRoute: bootstrapTurn.harnessRoute,
        rawTranscriptPath: bootstrapArtifacts.rawTranscriptPath,
        eventTranscriptPath: bootstrapArtifacts.eventTranscriptPath,
        traceUrl: bootstrapTurn.langSmithTrace?.traceUrl ?? null,
      },
      {
        name: "follow-up",
        status: followUpTurn.status,
        finalText: followUpTurn.finalText,
        toolCalls: followUpCollector.toolCalls,
        harnessRoute: followUpTurn.harnessRoute,
        rawTranscriptPath: followUpArtifacts.rawTranscriptPath,
        eventTranscriptPath: followUpArtifacts.eventTranscriptPath,
        traceUrl: followUpTurn.langSmithTrace?.traceUrl ?? null,
      },
    ],
  };
}

async function main(): Promise<void> {
  await ensureAnthropicKey();

  const result = await runRuntimeHardeningScenario();

  console.log("[live-smoke] Phase 3 runtime-hardening graph verification passed.");
  console.log(`  target: ${result.targetDirectory}`);
  console.log(`  session: ${result.sessionFilePath}`);
  console.log(
    `  budgets: model=${result.runtimeConfig.model} maxTokens=${String(result.runtimeConfig.maxTokens)} timeoutMs=${String(result.runtimeConfig.timeoutMs)}`,
  );
  console.log(`  summary: ${result.summaryPath}`);
  console.log(`  recent touched files: ${result.recentTouchedFiles.join(", ")}`);

  for (const turn of result.turns) {
    printTurnResult(turn);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[live-smoke] Phase 3 runtime-hardening graph verification failed.\n${message}`);
  process.exitCode = 1;
});
