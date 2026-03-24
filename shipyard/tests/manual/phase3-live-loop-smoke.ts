import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { resolveAnthropicConfig } from "../../src/engine/anthropic.js";
import {
  createTranscriptCollector,
  extractToolCallsFromTranscript,
  verifySurgicalEdit,
} from "../../src/engine/live-verification.js";
import { runRawToolLoop } from "../../src/engine/raw-loop.js";
import {
  CODE_PHASE_TOOL_NAMES,
  createCodePhase,
} from "../../src/phases/code/index.js";
import { clearTrackedReadHashes } from "../../src/tools/index.js";

interface ScenarioResult {
  name: string;
  finalText: string;
  toolCalls: string[];
  transcriptPath: string;
}

async function ensureAnthropicKey(): Promise<void> {
  resolveAnthropicConfig();
}

async function createScenarioDirectory(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `shipyard-${name}-`));
}

async function writeTranscriptFile(
  directory: string,
  fileName: string,
  lines: string[],
): Promise<string> {
  const transcriptPath = path.join(directory, fileName);
  await writeFile(transcriptPath, `${lines.join("\n")}\n`, "utf8");
  return transcriptPath;
}

function printScenarioResult(result: ScenarioResult): void {
  console.log(`[live-smoke] ${result.name}`);
  console.log(`  tools: ${result.toolCalls.join(", ")}`);
  console.log(`  transcript: ${result.transcriptPath}`);
  console.log(`  final: ${result.finalText}`);
}

async function runReadScenario(systemPrompt: string): Promise<ScenarioResult> {
  clearTrackedReadHashes();
  const directory = await createScenarioDirectory("phase3-read-");
  const relativePath = "src/demo.ts";
  const source = [
    "export function alpha() {",
    '  return "alpha";',
    "}",
    "",
    "export function beta() {",
    '  return "beta";',
    "}",
    "",
    "export function gamma() {",
    '  return "gamma";',
    "}",
    "",
  ].join("\n");

  await mkdir(path.join(directory, "src"), { recursive: true });
  await writeFile(path.join(directory, relativePath), source, "utf8");

  const transcript = createTranscriptCollector();
  const finalText = await runRawToolLoop(
    systemPrompt,
    [
      "Read src/demo.ts and tell me which exported functions are defined.",
      "Use the available tools to inspect the file before answering.",
    ].join("\n"),
    CODE_PHASE_TOOL_NAMES,
    directory,
    {
      logger: transcript.logger,
    },
  );
  const toolCalls = extractToolCallsFromTranscript(transcript.lines);
  const transcriptPath = await writeTranscriptFile(
    directory,
    "read-transcript.log",
    transcript.lines,
  );

  assert(toolCalls.includes("read_file"), "Read scenario did not use read_file.");
  assert.match(finalText, /alpha/i);
  assert.match(finalText, /beta/i);
  assert.match(finalText, /gamma/i);

  return {
    name: "read",
    finalText,
    toolCalls,
    transcriptPath,
  };
}

async function runSurgicalEditScenario(systemPrompt: string): Promise<ScenarioResult> {
  clearTrackedReadHashes();
  const directory = await createScenarioDirectory("phase3-surgical-");
  const relativePath = "src/math.ts";
  const beforeContents = [
    "export function add(a: number, b: number) {",
    "  return a + b;",
    "}",
    "",
    "export function multiply(a: number, b: number) {",
    "  return a * b;",
    "}",
    "",
    "export function label() {",
    '  return "stable";',
    "}",
    "",
  ].join("\n");
  const oldBlock = [
    "export function multiply(a: number, b: number) {",
    "  return a * b;",
    "}",
  ].join("\n");
  const newBlock = [
    "export function multiply(a: number, b: number) {",
    "  return a * b * 2;",
    "}",
  ].join("\n");

  await mkdir(path.join(directory, "src"), { recursive: true });
  await writeFile(path.join(directory, relativePath), beforeContents, "utf8");

  const transcript = createTranscriptCollector();
  const finalText = await runRawToolLoop(
    systemPrompt,
    [
      "Update src/math.ts so only the existing multiply function changes.",
      "Change it to return a * b * 2.",
      "Do not rewrite the file or recreate it. Read the file first, then make a surgical edit to the existing file.",
    ].join("\n"),
    CODE_PHASE_TOOL_NAMES,
    directory,
    {
      logger: transcript.logger,
    },
  );
  const toolCalls = extractToolCallsFromTranscript(transcript.lines);
  const afterContents = await readFile(path.join(directory, relativePath), "utf8");
  const verification = verifySurgicalEdit(
    beforeContents,
    afterContents,
    oldBlock,
    newBlock,
  );
  const transcriptPath = await writeTranscriptFile(
    directory,
    "surgical-edit-transcript.log",
    transcript.lines,
  );

  assert(toolCalls.includes("read_file"), "Surgical edit scenario did not read the file first.");
  assert(toolCalls.includes("edit_block"), "Surgical edit scenario did not use edit_block.");
  assert(!toolCalls.includes("write_file"), "Surgical edit scenario incorrectly used write_file.");
  assert.equal(
    verification.changedOnlyTarget,
    true,
    `Surgical edit changed bytes outside the target block. Verification: ${JSON.stringify(verification)}`,
  );
  assert.match(afterContents, /return a \* b \* 2;/);

  return {
    name: "surgical-edit",
    finalText,
    toolCalls,
    transcriptPath,
  };
}

async function runGreenfieldScenario(systemPrompt: string): Promise<ScenarioResult> {
  clearTrackedReadHashes();
  const directory = await createScenarioDirectory("phase3-greenfield-");
  const relativePath = "src/greeting.ts";

  const transcript = createTranscriptCollector();
  const finalText = await runRawToolLoop(
    systemPrompt,
    [
      "This target directory is empty.",
      "Create src/greeting.ts exporting a function named greet that returns the string \"hello from shipyard\".",
    ].join("\n"),
    CODE_PHASE_TOOL_NAMES,
    directory,
    {
      logger: transcript.logger,
    },
  );
  const toolCalls = extractToolCallsFromTranscript(transcript.lines);
  const createdFilePath = path.join(directory, relativePath);
  const transcriptPath = await writeTranscriptFile(
    directory,
    "greenfield-transcript.log",
    transcript.lines,
  );

  await access(createdFilePath);
  const createdContents = await readFile(createdFilePath, "utf8");

  assert(toolCalls.includes("write_file"), "Greenfield scenario did not use write_file.");
  assert.match(createdContents, /export function greet/i);
  assert.match(createdContents, /hello from shipyard/i);

  return {
    name: "greenfield",
    finalText,
    toolCalls,
    transcriptPath,
  };
}

async function main(): Promise<void> {
  await ensureAnthropicKey();

  const systemPrompt = createCodePhase().systemPrompt;
  const results: ScenarioResult[] = [];

  try {
    results.push(await runReadScenario(systemPrompt));
    results.push(await runSurgicalEditScenario(systemPrompt));
    results.push(await runGreenfieldScenario(systemPrompt));
  } finally {
    // Keep fixture directories for local inspection when the script succeeds or fails.
  }

  console.log("[live-smoke] Phase 3 live loop verification passed.");

  for (const result of results) {
    printScenarioResult(result);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[live-smoke] Phase 3 live loop verification failed.\n${message}`);
  process.exitCode = 1;
});
