import { z } from "zod";

import type { VerificationReport } from "../artifacts/types.js";
import {
  runRawToolLoopDetailed,
  type RawLoopLogger,
  type RawToolExecution,
  type RawToolLoopOptions,
} from "../engine/raw-loop.js";

export const VERIFIER_TOOL_NAMES = ["run_command"] as const;

const verificationReportSchema = z.object({
  command: z.string().trim().min(1),
  exitCode: z.number().int().nullable(),
  passed: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  summary: z.string().trim().min(1),
});

const verifierToolNameSet = new Set<string>(VERIFIER_TOOL_NAMES);

export const VERIFIER_SYSTEM_PROMPT = `
You are Shipyard's verifier subagent.

Your job is to run a single verification command and return structured evidence.
You must stay isolated from any coordinator history and reason only from:
- the current command request
- the command result you receive through tools

Allowed tools:
- run_command

Forbidden tools:
- read_file
- list_files
- search_files
- write_file
- edit_block
- git_diff

Rules:
- Never request a forbidden tool.
- Execute only the command needed to answer the verification request.
- Return only valid JSON that matches this shape:
  {
    "command": "the command that was run",
    "exitCode": 0,
    "passed": true,
    "stdout": "captured stdout",
    "stderr": "captured stderr",
    "summary": "short actionable summary"
  }
- Keep the summary concise and specific about pass/fail.
- If the command fails or times out, return a structured failure report instead of prose.
- Do not wrap the JSON in markdown fences or extra commentary.
`.trim();

export interface VerifierRunOptions
  extends Pick<RawToolLoopOptions, "client" | "logger" | "maxIterations"> {}

function ensureNonBlankCommand(command: string): string {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new Error("Verifier command must not be blank.");
  }

  return trimmed;
}

function isVerifierToolName(toolName: string): boolean {
  return verifierToolNameSet.has(toolName);
}

function getUnauthorizedToolExecution(
  executions: RawToolExecution[],
): RawToolExecution | null {
  return executions.find((execution) => !isVerifierToolName(execution.toolName))
    ?? null;
}

function toVerificationReport(
  report: z.infer<typeof verificationReportSchema>,
  expectedCommand?: string,
): VerificationReport {
  return {
    command: expectedCommand ?? report.command,
    exitCode: report.exitCode,
    passed: report.passed,
    stdout: report.stdout,
    stderr: report.stderr,
    summary: report.summary,
  };
}

function* extractJsonObjectCandidates(rawText: string): Generator<string> {
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];

    if (objectStart === -1) {
      if (character === "{") {
        objectStart = index;
        depth = 1;
        inString = false;
        isEscaped = false;
      }

      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character !== "}") {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      yield rawText.slice(objectStart, index + 1);
      objectStart = -1;
    }
  }
}

function parseStructuredJson(rawText: string): unknown {
  const candidates = [rawText.trim()];

  for (const candidate of extractJsonObjectCandidates(rawText)) {
    const trimmedCandidate = candidate.trim();

    if (!trimmedCandidate || candidates.includes(trimmedCandidate)) {
      continue;
    }

    candidates.push(trimmedCandidate);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Verifier must return valid JSON matching VerificationReport.");
}

export function parseVerificationReport(
  rawText: string,
  expectedCommand?: string,
): VerificationReport {
  const parsed = parseStructuredJson(rawText);

  const validated = verificationReportSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error("Verifier returned invalid VerificationReport JSON.");
  }

  return toVerificationReport(validated.data, expectedCommand?.trim() || undefined);
}

function throwIfUnauthorizedToolWasRequested(
  executions: RawToolExecution[],
): void {
  const unauthorizedToolExecution = getUnauthorizedToolExecution(executions);

  if (!unauthorizedToolExecution) {
    return;
  }

  throw new Error(
    `Verifier requested unauthorized tool "${unauthorizedToolExecution.toolName}".`,
  );
}

export async function runVerifierSubagent(
  command: string,
  targetDirectory: string,
  options: VerifierRunOptions = {},
): Promise<VerificationReport> {
  const normalizedCommand = ensureNonBlankCommand(command);
  const result = await runRawToolLoopDetailed(
    VERIFIER_SYSTEM_PROMPT,
    normalizedCommand,
    [...VERIFIER_TOOL_NAMES],
    targetDirectory,
    {
      client: options.client,
      logger: options.logger,
      maxIterations: options.maxIterations,
    },
  );

  throwIfUnauthorizedToolWasRequested(result.toolExecutions);

  return parseVerificationReport(result.finalText, normalizedCommand);
}

export const verifierAgent = {
  name: "verifier",
  canWrite: false,
  responsibilities: [
    "Run lint, tests, and targeted checks",
    "Return structured verification reports",
    "Flag regressions before the coordinator writes again",
  ],
  tools: [...VERIFIER_TOOL_NAMES],
};

export type VerifierLogger = RawLoopLogger;
