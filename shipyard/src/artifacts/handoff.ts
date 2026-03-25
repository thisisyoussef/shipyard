import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  getArtifactDirectory,
  getShipyardDirectory,
} from "../engine/state.js";
import type {
  ExecutionHandoff,
  ExecutionHandoffEvaluation,
  ExecutionHandoffResetKind,
  ExecutionHandoffResetThresholds,
  LoadedExecutionHandoff,
  TaskPlan,
  VerificationReport,
} from "./types.js";

const taskPlanSchema = z.object({
  instruction: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  targetFilePaths: z.array(z.string().trim().min(1)),
  plannedSteps: z.array(z.string().trim().min(1)),
});

const executionHandoffEvaluationSchema = z.object({
  command: z.string().trim().min(1),
  exitCode: z.number().int().nullable(),
  passed: z.boolean(),
  summary: z.string().trim().min(1),
});

const executionHandoffResetThresholdsSchema = z.object({
  actingIterations: z.number().int().positive(),
  recoveryAttempts: z.number().int().nonnegative(),
});

const executionHandoffResetMetricsSchema = z.object({
  actingIterations: z.number().int().nonnegative(),
  recoveryAttempts: z.number().int().nonnegative(),
  blockedFileCount: z.number().int().nonnegative(),
});

const executionHandoffSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().trim().min(1),
  turnCount: z.number().int().positive(),
  createdAt: z.string().trim().min(1),
  instruction: z.string().trim().min(1),
  phaseName: z.string().trim().min(1),
  runtimeMode: z.union([z.literal("graph"), z.literal("fallback")]),
  status: z.union([
    z.literal("success"),
    z.literal("error"),
    z.literal("cancelled"),
  ]),
  summary: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  completedWork: z.array(z.string().trim().min(1)),
  remainingWork: z.array(z.string().trim().min(1)),
  touchedFiles: z.array(z.string().trim().min(1)),
  blockedFiles: z.array(z.string().trim().min(1)),
  latestEvaluation: executionHandoffEvaluationSchema.nullable(),
  nextRecommendedAction: z.string().trim().min(1),
  resetReason: z.object({
    kind: z.union([
      z.literal("iteration-threshold"),
      z.literal("recovery-threshold"),
      z.literal("blocked-file"),
    ]),
    summary: z.string().trim().min(1),
    thresholds: executionHandoffResetThresholdsSchema,
    metrics: executionHandoffResetMetricsSchema,
  }),
  taskPlan: taskPlanSchema,
});

export interface ExecutionHandoffThresholds {
  actingIterations: number;
  recoveryAttempts: number;
}

export interface ExecutionHandoffDecision {
  shouldPersist: boolean;
  kind: ExecutionHandoffResetKind | null;
  summary: string | null;
  thresholds: ExecutionHandoffResetThresholds;
  metrics: {
    actingIterations: number;
    recoveryAttempts: number;
    blockedFileCount: number;
  };
}

export interface CreateExecutionHandoffOptions {
  sessionId: string;
  turnCount: number;
  instruction: string;
  phaseName: string;
  runtimeMode: "graph" | "fallback";
  status: "success" | "error" | "cancelled";
  summary: string;
  taskPlan: TaskPlan;
  actingIterations: number;
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  lastEditedFile: string | null;
  verificationReport: VerificationReport | null;
  decision: ExecutionHandoffDecision;
  createdAt?: string;
}

export interface LoadExecutionHandoffResult {
  handoff: LoadedExecutionHandoff | null;
  error: string | null;
}

export const DEFAULT_EXECUTION_HANDOFF_THRESHOLDS = {
  actingIterations: 4,
  recoveryAttempts: 1,
} satisfies ExecutionHandoffThresholds;

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter((value) => value.trim().length > 0);
}

function toForwardSlashPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function createHandoffFileStem(createdAt: string, turnCount: number): string {
  return `${createdAt.replace(/[-:.]/g, "").replace(/Z$/u, "Z")}--turn-${String(turnCount).padStart(4, "0")}`;
}

function normalizeThresholds(
  thresholds?: Partial<ExecutionHandoffThresholds>,
): ExecutionHandoffThresholds {
  return {
    actingIterations:
      thresholds?.actingIterations
      ?? DEFAULT_EXECUTION_HANDOFF_THRESHOLDS.actingIterations,
    recoveryAttempts:
      thresholds?.recoveryAttempts
      ?? DEFAULT_EXECUTION_HANDOFF_THRESHOLDS.recoveryAttempts,
  };
}

function countRecoveryAttempts(retryCountsByFile: Record<string, number>): number {
  return Object.values(retryCountsByFile).reduce(
    (total, current) => total + current,
    0,
  );
}

function createBlockedFileSummary(blockedFiles: string[]): string {
  const label = blockedFiles.length === 1 ? "file" : "files";
  return `Shipyard blocked ${blockedFiles.join(", ")} after repeated recoveries, so the next turn should resume from a persisted handoff instead of continuing the same loop on the blocked ${label}.`;
}

export function createExecutionHandoffDecision(options: {
  actingIterations: number;
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  thresholds?: Partial<ExecutionHandoffThresholds>;
}): ExecutionHandoffDecision {
  const thresholds = normalizeThresholds(options.thresholds);
  const recoveryAttempts = countRecoveryAttempts(options.retryCountsByFile);
  const metrics = {
    actingIterations: options.actingIterations,
    recoveryAttempts,
    blockedFileCount: options.blockedFiles.length,
  };

  if (options.blockedFiles.length > 0) {
    return {
      shouldPersist: true,
      kind: "blocked-file",
      summary: createBlockedFileSummary(options.blockedFiles),
      thresholds,
      metrics,
    };
  }

  if (recoveryAttempts >= thresholds.recoveryAttempts) {
    const label = recoveryAttempts === 1 ? "attempt" : "attempts";

    return {
      shouldPersist: true,
      kind: "recovery-threshold",
      summary:
        `Shipyard hit ${String(recoveryAttempts)} recovery ${label}, so the next turn should resume from a persisted handoff instead of stretching the current loop further.`,
      thresholds,
      metrics,
    };
  }

  if (options.actingIterations >= thresholds.actingIterations) {
    const label = options.actingIterations === 1 ? "iteration" : "iterations";

    return {
      shouldPersist: true,
      kind: "iteration-threshold",
      summary:
        `Shipyard used ${String(options.actingIterations)} acting ${label}, so the next turn should resume from a persisted handoff instead of continuing the same long-running loop.`,
      thresholds,
      metrics,
    };
  }

  return {
    shouldPersist: false,
    kind: null,
    summary: null,
    thresholds,
    metrics,
  };
}

export function toExecutionHandoffEvaluation(
  report: VerificationReport | null,
): ExecutionHandoffEvaluation | null {
  if (!report) {
    return null;
  }

  return {
    command: report.command,
    exitCode: report.exitCode,
    passed: report.passed,
    summary: report.summary,
  };
}

function createRemainingWork(options: {
  blockedFiles: string[];
  decision: ExecutionHandoffDecision;
  verificationReport: VerificationReport | null;
}): string[] {
  if (options.blockedFiles.length > 0) {
    return [
      `Resume by inspecting ${options.blockedFiles.join(", ")} and the latest checkpoint-backed state before attempting another edit.`,
    ];
  }

  if (options.verificationReport && !options.verificationReport.passed) {
    return [
      `Resume by addressing the failing verification path: ${options.verificationReport.summary}`,
    ];
  }

  if (options.decision.kind === "recovery-threshold") {
    return [
      "Resume carefully from the persisted handoff and validate before making more edits.",
    ];
  }

  return [
    "Resume in a fresh turn to finish the remaining task plan safely.",
  ];
}

function createCompletedWork(options: {
  taskPlan: TaskPlan;
  touchedFiles: string[];
  verificationReport: VerificationReport | null;
}): string[] {
  const completed = [`Captured the implementation goal: ${options.taskPlan.goal}`];

  if (options.touchedFiles.length > 0) {
    completed.push(`Touched files: ${options.touchedFiles.join(", ")}`);
  }

  if (options.verificationReport) {
    completed.push(
      options.verificationReport.passed
        ? `Latest verification passed: ${options.verificationReport.summary}`
        : `Latest verification failed: ${options.verificationReport.summary}`,
    );
  }

  return completed;
}

export function createExecutionHandoff(
  options: CreateExecutionHandoffOptions,
): ExecutionHandoff {
  if (!options.decision.shouldPersist || !options.decision.kind || !options.decision.summary) {
    throw new Error("Execution handoff requires a positive persistence decision.");
  }

  const touchedFiles = uniqueStrings([
    ...options.taskPlan.targetFilePaths,
    ...Object.keys(options.retryCountsByFile),
    ...options.blockedFiles,
    ...(options.lastEditedFile ? [options.lastEditedFile] : []),
  ]);
  const remainingWork = createRemainingWork({
    blockedFiles: options.blockedFiles,
    decision: options.decision,
    verificationReport: options.verificationReport,
  });

  return executionHandoffSchema.parse({
    version: 1,
    sessionId: options.sessionId,
    turnCount: options.turnCount,
    createdAt: options.createdAt ?? new Date().toISOString(),
    instruction: options.instruction,
    phaseName: options.phaseName,
    runtimeMode: options.runtimeMode,
    status: options.status,
    summary: options.summary,
    goal: options.taskPlan.goal,
    completedWork: createCompletedWork({
      taskPlan: options.taskPlan,
      touchedFiles,
      verificationReport: options.verificationReport,
    }),
    remainingWork,
    touchedFiles,
    blockedFiles: [...options.blockedFiles],
    latestEvaluation: toExecutionHandoffEvaluation(options.verificationReport),
    nextRecommendedAction: remainingWork[0] ?? "Review the persisted handoff before continuing.",
    resetReason: {
      kind: options.decision.kind,
      summary: options.decision.summary,
      thresholds: options.decision.thresholds,
      metrics: options.decision.metrics,
    },
    taskPlan: options.taskPlan,
  });
}

function getExecutionHandoffDirectory(
  targetDirectory: string,
  sessionId: string,
): string {
  return path.join(getArtifactDirectory(targetDirectory), sessionId);
}

function resolveArtifactAbsolutePath(
  targetDirectory: string,
  artifactPath: string,
): string | null {
  const absolutePath = path.resolve(targetDirectory, artifactPath);
  const shipyardDirectory = path.resolve(getShipyardDirectory(targetDirectory));

  if (
    absolutePath !== shipyardDirectory &&
    !absolutePath.startsWith(`${shipyardDirectory}${path.sep}`)
  ) {
    return null;
  }

  return absolutePath;
}

function createRelativeArtifactPath(
  targetDirectory: string,
  absolutePath: string,
): string {
  return toForwardSlashPath(path.relative(targetDirectory, absolutePath));
}

export async function saveExecutionHandoff(
  targetDirectory: string,
  handoff: ExecutionHandoff,
): Promise<LoadedExecutionHandoff> {
  const directory = getExecutionHandoffDirectory(targetDirectory, handoff.sessionId);
  const fileName = `${createHandoffFileStem(handoff.createdAt, handoff.turnCount)}.handoff.json`;
  const absolutePath = path.join(directory, fileName);
  const tempPath = path.join(
    directory,
    `${fileName}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
  await rename(tempPath, absolutePath);

  return {
    artifactPath: createRelativeArtifactPath(targetDirectory, absolutePath),
    handoff,
  };
}

export async function loadExecutionHandoff(
  targetDirectory: string,
  artifactPath: string,
): Promise<LoadExecutionHandoffResult> {
  const absolutePath = resolveArtifactAbsolutePath(targetDirectory, artifactPath);

  if (!absolutePath) {
    return {
      handoff: null,
      error: `Invalid execution handoff path: ${artifactPath}`,
    };
  }

  let contents: string;

  try {
    contents = await readFile(absolutePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        handoff: null,
        error: `Execution handoff not found: ${artifactPath}`,
      };
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    return {
      handoff: null,
      error: `Malformed execution handoff at ${artifactPath}.`,
    };
  }

  const validated = executionHandoffSchema.safeParse(parsed);

  if (!validated.success) {
    return {
      handoff: null,
      error: `Malformed execution handoff at ${artifactPath}.`,
    };
  }

  return {
    handoff: {
      artifactPath: createRelativeArtifactPath(targetDirectory, absolutePath),
      handoff: validated.data,
    },
    error: null,
  };
}

export async function loadLatestExecutionHandoff(
  targetDirectory: string,
  sessionId: string,
): Promise<LoadExecutionHandoffResult> {
  const directory = getExecutionHandoffDirectory(targetDirectory, sessionId);
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch {
    return {
      handoff: null,
      error: null,
    };
  }

  const latestEntry = entries
    .filter((entry) => entry.endsWith(".handoff.json"))
    .sort()
    .at(-1);

  if (!latestEntry) {
    return {
      handoff: null,
      error: null,
    };
  }

  return loadExecutionHandoff(
    targetDirectory,
    createRelativeArtifactPath(targetDirectory, path.join(directory, latestEntry)),
  );
}
