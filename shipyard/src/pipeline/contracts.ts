import { z } from "zod";

import {
  AGENT_ROLE_IDS,
  type AgentRoleId,
} from "../agents/agent-role-ids.js";
import {
  MODEL_ROUTE_IDS,
  type ModelRouteId,
} from "../engine/model-route-ids.js";
import type {
  ArtifactContentKind,
  ArtifactJsonValue,
  ArtifactLocator,
} from "../artifacts/types.js";

export const PIPELINE_RUN_VERSION = 1;

export const approvalGateModeSchema = z.enum([
  "required",
  "advisory",
  "disabled",
]);

export const pipelinePhaseStatusSchema = z.enum([
  "pending",
  "running",
  "awaiting_approval",
  "completed",
  "skipped",
]);

export const pipelineRunStatusSchema = z.enum([
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

export const pipelineAuditKindSchema = z.enum([
  "run-started",
  "phase-started",
  "artifact-produced",
  "awaiting-approval",
  "artifact-approved",
  "artifact-edited",
  "artifact-rejected",
  "phase-skipped",
  "phase-rerun",
  "phase-backtracked",
  "phase-completed",
  "run-completed",
  "run-failed",
]);

export const artifactContentKindSchema = z.enum(["markdown", "json"]);

export const artifactLocatorSchema = z.object({
  type: z.string().trim().min(1),
  id: z.string().trim().min(1),
  version: z.number().int().positive(),
});

export const pipelineArtifactOutputSchema = z.object({
  type: z.string().trim().min(1),
  contentKind: artifactContentKindSchema,
});

export const pipelinePhaseDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  modelRoute: z.enum(MODEL_ROUTE_IDS).optional(),
  agentProfileId: z.enum(AGENT_ROLE_IDS).optional(),
  defaultSkills: z.array(z.string().trim().min(1)).default([]),
  approvalGate: approvalGateModeSchema,
  consumesArtifacts: z.array(z.string().trim().min(1)),
  producesArtifacts: z.array(z.string().trim().min(1)).min(1),
  output: pipelineArtifactOutputSchema,
}).superRefine((phase, context) => {
  if (!phase.producesArtifacts.includes(phase.output.type)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        `Phase "${phase.id}" must list "${phase.output.type}" in producesArtifacts.`,
      path: ["producesArtifacts"],
    });
  }
});

export const phasePipelineDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  phases: z.array(pipelinePhaseDefinitionSchema).min(1),
});

export const pipelinePhaseRunStateSchema = z.object({
  phaseId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: pipelinePhaseStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  latestArtifact: artifactLocatorSchema.nullable(),
  approvedArtifact: artifactLocatorSchema.nullable(),
  consumedArtifacts: z.array(artifactLocatorSchema),
  lastSummary: z.string().trim().min(1).nullable(),
  lastUpdatedAt: z.string().trim().min(1),
  pendingFeedback: z.array(z.string().trim().min(1)),
  completedAt: z.string().trim().min(1).nullable(),
});

export const pipelinePendingApprovalSchema = z.object({
  phaseId: z.string().trim().min(1),
  phaseIndex: z.number().int().nonnegative(),
  mode: approvalGateModeSchema,
  artifact: artifactLocatorSchema,
  requestedAt: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export const pipelineAuditEntrySchema = z.object({
  id: z.string().trim().min(1),
  at: z.string().trim().min(1),
  kind: pipelineAuditKindSchema,
  phaseId: z.string().trim().min(1).nullable(),
  message: z.string().trim().min(1),
  artifact: artifactLocatorSchema.nullable(),
});

export const persistedPipelineRunSchema = z.object({
  version: z.literal(PIPELINE_RUN_VERSION),
  runId: z.string().trim().min(1),
  pipeline: phasePipelineDefinitionSchema,
  status: pipelineRunStatusSchema,
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  startedBy: z.string().trim().min(1),
  initialBrief: z.string().trim().min(1),
  briefArtifact: artifactLocatorSchema,
  currentPhaseIndex: z.number().int().nonnegative(),
  phases: z.array(pipelinePhaseRunStateSchema),
  pendingApproval: pipelinePendingApprovalSchema.nullable(),
  auditTrail: z.array(pipelineAuditEntrySchema),
  lastSummary: z.string(),
}).superRefine((run, context) => {
  if (run.phases.length !== run.pipeline.phases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Persisted pipeline phases must align with the pipeline definition.",
      path: ["phases"],
    });
  }

  if (run.currentPhaseIndex > run.pipeline.phases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "currentPhaseIndex cannot exceed the phase count.",
      path: ["currentPhaseIndex"],
    });
  }
});

export const pipelineWorkbenchAuditEntrySchema = z.object({
  id: z.string().trim().min(1),
  at: z.string().trim().min(1),
  kind: pipelineAuditKindSchema,
  phaseId: z.string().trim().min(1).nullable(),
  message: z.string().trim().min(1),
});

export const pipelineWorkbenchStateSchema = z.object({
  activeRunId: z.string().trim().min(1).nullable(),
  pipelineId: z.string().trim().min(1).nullable(),
  pipelineTitle: z.string().trim().min(1).nullable(),
  status: z.union([pipelineRunStatusSchema, z.literal("idle")]),
  currentPhaseId: z.string().trim().min(1).nullable(),
  currentPhaseTitle: z.string().trim().min(1).nullable(),
  currentPhaseIndex: z.number().int().nonnegative().nullable(),
  totalPhases: z.number().int().nonnegative(),
  waitingForApproval: z.boolean(),
  approvalMode: approvalGateModeSchema.nullable(),
  pendingArtifact: z.string().trim().min(1).nullable(),
  latestArtifact: z.string().trim().min(1).nullable(),
  summary: z.string(),
  updatedAt: z.string().trim().min(1).nullable(),
  recentAudit: z.array(pipelineWorkbenchAuditEntrySchema).max(8),
});

export type ApprovalGateMode = z.infer<typeof approvalGateModeSchema>;
export type PipelinePhaseStatus = z.infer<typeof pipelinePhaseStatusSchema>;
export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;
export type PipelineAuditKind = z.infer<typeof pipelineAuditKindSchema>;
export type PipelineArtifactOutput = z.infer<typeof pipelineArtifactOutputSchema>;
export type PipelinePhaseDefinition = Omit<
  z.input<typeof pipelinePhaseDefinitionSchema>,
  "output"
> & {
  modelRoute?: ModelRouteId;
  agentProfileId?: AgentRoleId;
  defaultSkills?: string[];
  output: {
    type: string;
    contentKind: ArtifactContentKind;
  };
};
export type PhasePipelineDefinition = Omit<
  z.input<typeof phasePipelineDefinitionSchema>,
  "phases"
> & {
  phases: PipelinePhaseDefinition[];
};
export type PipelinePhaseRunState = z.infer<typeof pipelinePhaseRunStateSchema> & {
  latestArtifact: ArtifactLocator | null;
  approvedArtifact: ArtifactLocator | null;
  consumedArtifacts: ArtifactLocator[];
};
export type PipelinePendingApproval = z.infer<typeof pipelinePendingApprovalSchema> & {
  artifact: ArtifactLocator;
};
export type PipelineAuditEntry = z.infer<typeof pipelineAuditEntrySchema> & {
  artifact: ArtifactLocator | null;
};
export type PersistedPipelineRun = z.infer<typeof persistedPipelineRunSchema> & {
  pipeline: PhasePipelineDefinition;
  briefArtifact: ArtifactLocator;
  phases: PipelinePhaseRunState[];
  pendingApproval: PipelinePendingApproval | null;
  auditTrail: PipelineAuditEntry[];
};
export type PipelineWorkbenchAuditEntry = z.infer<
  typeof pipelineWorkbenchAuditEntrySchema
>;
export type PipelineWorkbenchState = z.infer<
  typeof pipelineWorkbenchStateSchema
>;

export interface PipelineEditDecision {
  contentKind: ArtifactContentKind;
  content: string | ArtifactJsonValue;
}

export function formatArtifactLocator(locator: ArtifactLocator | null): string | null {
  if (!locator) {
    return null;
  }

  return `${locator.type}/${locator.id}@${String(locator.version)}`;
}
