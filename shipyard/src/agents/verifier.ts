import { z } from "zod";

import type {
  EvaluationCheck,
  EvaluationPlan,
  VerificationCommandReadiness,
  VerificationCheckResult,
  VerificationHardFailure,
  VerificationReport,
} from "../artifacts/types.js";
import {
  runRawToolLoopDetailed,
  type RawLoopLogger,
  type RawToolExecution,
  type RawToolLoopOptions,
} from "../engine/raw-loop.js";
import { createTurnCancelledError } from "../engine/cancellation.js";
import type { RunCommandResult } from "../tools/run-command.js";
import { findReadyServerEvidence } from "../preview/readiness.js";

export const VERIFIER_TOOL_NAMES = ["run_command"] as const;
const MAX_EVALUATION_CHECKS = 5;

const verificationReportSchema = z.object({
  command: z.string().trim().min(1),
  exitCode: z.number().int().nullable(),
  passed: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  summary: z.string().trim().min(1),
});

const evaluationCheckSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.literal("command"),
  command: z.string().trim().min(1),
  required: z.boolean(),
});

const evaluationPlanSchema = z.object({
  summary: z.string().trim().min(1),
  checks: z.array(evaluationCheckSchema).min(1).max(MAX_EVALUATION_CHECKS),
}).superRefine((plan, context) => {
  if (!plan.checks.some((check) => check.required)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Evaluation plan must include at least one required check.",
    });
  }

  const seenIds = new Set<string>();

  for (const check of plan.checks) {
    if (seenIds.has(check.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Evaluation check ids must be unique. Duplicate id: ${check.id}`,
      });
      continue;
    }

    seenIds.add(check.id);
  }
});

const runCommandResultSchema = z.object({
  command: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  signal: z.custom<NodeJS.Signals | null>(
    (value): value is NodeJS.Signals | null =>
      value === null || typeof value === "string",
  ),
  timeoutMs: z.number().int().positive(),
  combinedOutput: z.string(),
  truncated: z.boolean(),
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
  extends RawToolLoopOptions {}

function ensureNonBlankCommand(command: string): string {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new Error("Verifier command must not be blank.");
  }

  return trimmed;
}

export function createSingleCommandEvaluationPlan(
  command: string,
): EvaluationPlan {
  const normalizedCommand = ensureNonBlankCommand(command);

  return {
    summary: "Run the verification command.",
    checks: [
      {
        id: "check-1",
        label: `Run ${normalizedCommand}`,
        kind: "command",
        command: normalizedCommand,
        required: true,
      },
    ],
  };
}

export function normalizeEvaluationPlan(
  input: string | EvaluationPlan,
): EvaluationPlan {
  if (typeof input === "string") {
    return createSingleCommandEvaluationPlan(input);
  }

  const validated = evaluationPlanSchema.safeParse(input);

  if (!validated.success) {
    throw new Error("Verifier evaluation plan is invalid.");
  }

  return {
    summary: validated.data.summary,
    checks: validated.data.checks.map((check) => ({ ...check })),
  };
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
  input: string | EvaluationPlan,
  targetDirectory: string,
  options: VerifierRunOptions = {},
): Promise<VerificationReport> {
  const evaluationPlan = normalizeEvaluationPlan(input);
  const checks: VerificationCheckResult[] = [];
  const reportsByCheckId = new Map<string, VerificationReport>();
  let firstHardFailure: VerificationHardFailure | null = null;

  for (const check of evaluationPlan.checks) {
    if (firstHardFailure) {
      checks.push(createSkippedCheckResult(check, firstHardFailure.label));
      continue;
    }

    const report = await runSingleVerificationCommand(
      check.command,
      targetDirectory,
      options,
    );
    reportsByCheckId.set(check.id, report);
    const result = toEvaluationCheckResult(check, report);

    checks.push(result);

    if (check.required && result.status === "failed") {
      firstHardFailure = {
        checkId: result.checkId,
        label: result.label,
        command: result.command,
      };
    }
  }

  const anchorResult = selectPrimaryCheckResult(checks, firstHardFailure);
  const anchorReport = anchorResult
    ? (reportsByCheckId.get(anchorResult.checkId) ?? null)
    : null;

  return {
    command: anchorResult?.command ?? evaluationPlan.checks[0]?.command ?? "",
    exitCode: anchorResult?.exitCode ?? null,
    passed: firstHardFailure === null,
    stdout: anchorResult?.stdout ?? "",
    stderr: anchorResult?.stderr ?? "",
    summary: createEvaluationSummary(evaluationPlan, checks, firstHardFailure),
    evaluationPlan,
    checks,
    firstHardFailure,
    ...(anchorReport?.commandReadiness
      ? { commandReadiness: anchorReport.commandReadiness }
      : {}),
  };
}

async function runSingleVerificationCommand(
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
    { ...options },
  );

  if (result.status === "cancelled") {
    throw createTurnCancelledError(result.finalText);
  }

  throwIfUnauthorizedToolWasRequested(result.toolExecutions);
  const parsedReport = parseVerificationReport(result.finalText, normalizedCommand);

  return reconcileVerificationReport(parsedReport, result.toolExecutions);
}

function looksLikePreviewCommand(command: string): boolean {
  return /\b(dev|start|preview|serve|watch)\b/i.test(command);
}

function getRunCommandResult(
  executions: RawToolExecution[],
): RunCommandResult | null {
  const latestExecution = [...executions]
    .reverse()
    .find((execution) => execution.toolName === "run_command");

  if (!latestExecution?.data) {
    return null;
  }

  const parsed = runCommandResultSchema.safeParse(latestExecution.data);

  return parsed.success ? parsed.data : null;
}

function createReadyBeforeTimeoutReadiness(
  runCommandResult: RunCommandResult,
): VerificationCommandReadiness | null {
  if (!runCommandResult.timedOut) {
    return null;
  }

  const readiness = findReadyServerEvidence(runCommandResult.combinedOutput);

  if (!readiness) {
    return null;
  }

  if (!readiness.readyUrl && !looksLikePreviewCommand(runCommandResult.command)) {
    return null;
  }

  return {
    status: "ready-before-timeout",
    readyUrl: readiness.readyUrl,
    readyLine: readiness.readyLine,
  };
}

function createReadyBeforeTimeoutSummary(
  readiness: VerificationCommandReadiness,
): string {
  if (readiness.readyUrl) {
    return `Command reached ready state at ${readiness.readyUrl} before timing out.`;
  }

  if (readiness.readyLine) {
    return `Command reached ready state before timing out: ${readiness.readyLine}`;
  }

  return "Command reached ready state before timing out.";
}

function reconcileVerificationReport(
  report: VerificationReport,
  executions: RawToolExecution[],
): VerificationReport {
  const runCommandResult = getRunCommandResult(executions);

  if (!runCommandResult) {
    return report;
  }

  const readiness = createReadyBeforeTimeoutReadiness(runCommandResult);
  const nextReport: VerificationReport = {
    ...report,
    command: runCommandResult.command,
    exitCode: runCommandResult.exitCode,
    stdout: report.stdout || runCommandResult.stdout,
    stderr: report.stderr || runCommandResult.stderr,
    ...(readiness ? { commandReadiness: readiness } : {}),
  };

  if (!readiness || report.passed) {
    return nextReport;
  }

  return {
    ...nextReport,
    passed: true,
    summary: createReadyBeforeTimeoutSummary(readiness),
  };
}

function toEvaluationCheckResult(
  check: EvaluationCheck,
  report: VerificationReport,
): VerificationCheckResult {
  return {
    checkId: check.id,
    label: check.label,
    kind: check.kind,
    command: check.command,
    required: check.required,
    status: report.passed ? "passed" : "failed",
    exitCode: report.exitCode,
    stdout: report.stdout,
    stderr: report.stderr,
    summary: report.summary,
  };
}

function createSkippedCheckResult(
  check: EvaluationCheck,
  blockingLabel: string,
): VerificationCheckResult {
  return {
    checkId: check.id,
    label: check.label,
    kind: check.kind,
    command: check.command,
    required: check.required,
    status: "skipped",
    exitCode: null,
    stdout: "",
    stderr: "",
    summary: `Skipped after required check "${blockingLabel}" failed.`,
  };
}

function selectPrimaryCheckResult(
  checks: VerificationCheckResult[],
  firstHardFailure: VerificationHardFailure | null,
): VerificationCheckResult | null {
  if (firstHardFailure) {
    return checks.find((check) => check.checkId === firstHardFailure.checkId)
      ?? null;
  }

  const passedRequiredChecks = checks.filter((check) =>
    check.required && check.status === "passed"
  );

  if (passedRequiredChecks.length > 0) {
    return passedRequiredChecks.at(-1) ?? null;
  }

  return checks.find((check) => check.status !== "skipped") ?? null;
}

function createEvaluationSummary(
  evaluationPlan: EvaluationPlan,
  checks: VerificationCheckResult[],
  firstHardFailure: VerificationHardFailure | null,
): string {
  if (checks.length === 1 && checks[0]?.status !== "skipped") {
    return checks[0]?.summary ?? "Verification completed.";
  }

  if (firstHardFailure) {
    const failedCheck = checks.find((check) =>
      check.checkId === firstHardFailure.checkId
    );

    return failedCheck
      ? `Required check "${firstHardFailure.label}" failed: ${failedCheck.summary}`
      : `Required check "${firstHardFailure.label}" failed.`;
  }

  const failedOptionalChecks = checks.filter((check) =>
    !check.required && check.status === "failed"
  );

  if (failedOptionalChecks.length > 0) {
    const labels = failedOptionalChecks.map((check) => check.label).join(", ");
    return `Required checks passed; optional checks failed: ${labels}.`;
  }

  return `All ${String(evaluationPlan.checks.length)} evaluation checks passed.`;
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
