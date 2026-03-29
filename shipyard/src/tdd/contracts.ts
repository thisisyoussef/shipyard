import { z } from "zod";

import type {
  ArtifactLocator,
  TddLaneStatus,
  TddOptionalCheckKind,
  TddOptionalCheckRecord,
  TddOptionalCheckStatus,
  TddQualityReportArtifact,
  TddStage,
  TddValidationExpectedOutcome,
  TddValidationObservedOutcome,
  TddValidationRecord,
} from "../artifacts/types.js";

export const TDD_LANE_VERSION = 1;

export const tddStageSchema = z.enum([
  "test-author",
  "implementer",
  "reviewer",
]);

export const tddLaneStatusSchema = z.enum([
  "running",
  "blocked",
  "completed",
  "failed",
  "cancelled",
]);

export const tddValidationExpectedOutcomeSchema = z.enum([
  "red",
  "green",
]);

export const tddValidationObservedOutcomeSchema = z.enum([
  "red",
  "green",
  "already-green",
  "blocked",
]);

export const tddOptionalCheckKindSchema = z.enum(["property", "mutation"]);

export const tddOptionalCheckStatusSchema = z.enum([
  "passed",
  "skipped",
  "blocked",
]);

export const artifactLocatorSchema = z.object({
  type: z.string().trim().min(1),
  id: z.string().trim().min(1),
  version: z.number().int().positive(),
});

export const tddValidationRecordSchema = z.object({
  command: z.string().trim().min(1),
  expectedOutcome: tddValidationExpectedOutcomeSchema,
  observedOutcome: tddValidationObservedOutcomeSchema,
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
  signal: z.string().nullable(),
  summary: z.string().trim().min(1),
});

export const tddOptionalCheckRecordSchema = z.object({
  kind: tddOptionalCheckKindSchema,
  command: z.string().trim().min(1).nullable(),
  status: tddOptionalCheckStatusSchema,
  exitCode: z.number().int().nullable(),
  summary: z.string().trim().min(1),
});

export const tddStageAttemptsSchema = z.object({
  testAuthor: z.number().int().nonnegative(),
  implementer: z.number().int().nonnegative(),
  reviewer: z.number().int().nonnegative(),
});

export const tddSelectionSchema = z.object({
  artifact: artifactLocatorSchema,
  storyId: z.string().trim().min(1).nullable(),
  specId: z.string().trim().min(1).nullable(),
});

export const tddAuditKindSchema = z.enum([
  "lane-started",
  "stage-started",
  "handoff-recorded",
  "validation-recorded",
  "optional-check-recorded",
  "escalation-recorded",
  "quality-recorded",
  "lane-completed",
  "lane-blocked",
]);

export const tddAuditEntrySchema = z.object({
  id: z.string().trim().min(1),
  at: z.string().trim().min(1),
  kind: tddAuditKindSchema,
  stage: tddStageSchema.nullable(),
  message: z.string().trim().min(1),
  artifact: artifactLocatorSchema.nullable(),
});

export const persistedTddLaneSchema = z.object({
  version: z.literal(TDD_LANE_VERSION),
  laneId: z.string().trim().min(1),
  status: tddLaneStatusSchema,
  currentStage: tddStageSchema,
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  startedBy: z.string().trim().min(1),
  focusedValidationCommand: z.string().trim().min(1),
  selection: tddSelectionSchema,
  requestPropertyCheck: z.boolean(),
  requestMutationCheck: z.boolean(),
  immutableTestPaths: z.array(z.string().trim().min(1)),
  implementationPaths: z.array(z.string().trim().min(1)),
  stageAttempts: tddStageAttemptsSchema,
  focusedValidation: tddValidationRecordSchema.nullable(),
  optionalChecks: z.array(tddOptionalCheckRecordSchema),
  latestHandoffArtifact: artifactLocatorSchema.nullable(),
  latestEscalationArtifact: artifactLocatorSchema.nullable(),
  latestQualityArtifact: artifactLocatorSchema.nullable(),
  lastSummary: z.string(),
  auditTrail: z.array(tddAuditEntrySchema),
});

export const tddWorkbenchStateSchema = z.object({
  activeLaneId: z.string().trim().min(1).nullable(),
  status: z.union([tddLaneStatusSchema, z.literal("idle")]),
  currentStage: tddStageSchema.nullable(),
  summary: z.string(),
  updatedAt: z.string().trim().min(1).nullable(),
  latestHandoff: z.string().trim().min(1).nullable(),
  latestEscalation: z.string().trim().min(1).nullable(),
  latestQuality: z.string().trim().min(1).nullable(),
  requestPropertyCheck: z.boolean(),
  requestMutationCheck: z.boolean(),
  stageAttempts: tddStageAttemptsSchema,
  optionalChecks: z.array(tddOptionalCheckRecordSchema),
});

export type TddStageAttempts = z.infer<typeof tddStageAttemptsSchema>;
export type TddAuditKind = z.infer<typeof tddAuditKindSchema>;
export type TddAuditEntry = z.infer<typeof tddAuditEntrySchema> & {
  artifact: ArtifactLocator | null;
  stage: TddStage | null;
};
export type TddSelection = z.infer<typeof tddSelectionSchema> & {
  artifact: ArtifactLocator;
};
export type PersistedTddLane = z.infer<typeof persistedTddLaneSchema> & {
  status: TddLaneStatus;
  currentStage: TddStage;
  selection: TddSelection;
  focusedValidation: TddValidationRecord | null;
  optionalChecks: TddOptionalCheckRecord[];
  latestHandoffArtifact: ArtifactLocator | null;
  latestEscalationArtifact: ArtifactLocator | null;
  latestQualityArtifact: ArtifactLocator | null;
  auditTrail: TddAuditEntry[];
};
export type TddWorkbenchState = z.infer<typeof tddWorkbenchStateSchema>;

export function createEmptyTddStageAttempts(): TddStageAttempts {
  return {
    testAuthor: 0,
    implementer: 0,
    reviewer: 0,
  };
}

export function formatArtifactLocator(locator: ArtifactLocator | null): string | null {
  if (!locator) {
    return null;
  }

  return `${locator.type}/${locator.id}@${String(locator.version)}`;
}

export function createIdleTddWorkbenchState(): TddWorkbenchState {
  return {
    activeLaneId: null,
    status: "idle",
    currentStage: null,
    summary: "No active TDD lane.",
    updatedAt: null,
    latestHandoff: null,
    latestEscalation: null,
    latestQuality: null,
    requestPropertyCheck: false,
    requestMutationCheck: false,
    stageAttempts: createEmptyTddStageAttempts(),
    optionalChecks: [],
  };
}

export function createTddWorkbenchState(
  lane: PersistedTddLane | null,
): TddWorkbenchState {
  if (!lane) {
    return createIdleTddWorkbenchState();
  }

  return {
    activeLaneId: lane.laneId,
    status: lane.status,
    currentStage: lane.currentStage,
    summary: lane.lastSummary,
    updatedAt: lane.updatedAt,
    latestHandoff: formatArtifactLocator(lane.latestHandoffArtifact),
    latestEscalation: formatArtifactLocator(lane.latestEscalationArtifact),
    latestQuality: formatArtifactLocator(lane.latestQualityArtifact),
    requestPropertyCheck: lane.requestPropertyCheck,
    requestMutationCheck: lane.requestMutationCheck,
    stageAttempts: lane.stageAttempts,
    optionalChecks: lane.optionalChecks,
  };
}

export function summarizeOptionalChecks(
  checks: TddOptionalCheckRecord[],
): string[] {
  return checks.map((check) => `${check.kind}: ${check.status}`);
}

export function buildQualitySummary(
  report: TddQualityReportArtifact,
): string {
  const optionalCheckSummary = summarizeOptionalChecks(report.optionalChecks).join(", ");

  return [
    report.summary,
    ...(optionalCheckSummary ? [`Optional checks: ${optionalCheckSummary}`] : []),
  ].join(" ");
}

export function createTddValidationRecord(options: {
  command: string;
  expectedOutcome: TddValidationExpectedOutcome;
  observedOutcome: TddValidationObservedOutcome;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: string | null;
  summary: string;
}): TddValidationRecord {
  return {
    command: options.command,
    expectedOutcome: options.expectedOutcome,
    observedOutcome: options.observedOutcome,
    exitCode: options.exitCode,
    stdout: options.stdout,
    stderr: options.stderr,
    timedOut: options.timedOut,
    signal: options.signal,
    summary: options.summary,
  };
}

export function createOptionalCheckRecord(options: {
  kind: TddOptionalCheckKind;
  command: string | null;
  status: TddOptionalCheckStatus;
  exitCode: number | null;
  summary: string;
}): TddOptionalCheckRecord {
  return {
    kind: options.kind,
    command: options.command,
    status: options.status,
    exitCode: options.exitCode,
    summary: options.summary,
  };
}
