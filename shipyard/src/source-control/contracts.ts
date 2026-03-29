import { z } from "zod";

import { AGENT_ROLE_IDS } from "../agents/profiles.js";

export const SOURCE_CONTROL_STATE_VERSION = 1;
export const SOURCE_CONTROL_PR_OPS_ROLE_ID = "pr-ops";

export const sourceControlAuthModeSchema = z.enum([
  "github-app",
  "github-token",
  "oauth-token",
  "github-cli",
  "degraded-local",
]);

export const sourceControlCapabilitySourceSchema = z.enum([
  "github-app-env",
  "github-token-env",
  "oauth-token-env",
  "github-cli",
  "degraded-local",
]);

export const repositoryBindingStatusSchema = z.enum([
  "bound",
  "pending_bind",
  "local_only",
]);

export const storyBranchKindSchema = z.enum(["feature", "fix", "chore"]);

export const storyBranchStatusSchema = z.enum([
  "ready",
  "stale",
  "merged",
  "closed",
]);

export const pullRequestStatusSchema = z.enum([
  "draft",
  "open",
  "merged",
  "closed",
  "stale",
  "blocked",
]);

export const pullRequestValidationStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
]);

export const mergeDecisionStatusSchema = z.enum(["merged", "blocked"]);

export const conflictResolutionTicketStatusSchema = z.enum([
  "open",
  "resolved",
]);

export const sourceControlAuditKindSchema = z.enum([
  "capability-resolved",
  "repository-bound",
  "repository-degraded",
  "repository-rebound",
  "story-branch-provisioned",
  "story-branch-synced",
  "story-branch-marked-stale",
  "pull-request-opened",
  "pull-request-updated",
  "pull-request-marked-stale",
  "merge-blocked",
  "merge-completed",
  "conflict-ticket-created",
]);

export const sourceControlCapabilitySchema = z.object({
  provider: z.literal("github"),
  authMode: sourceControlAuthModeSchema,
  source: sourceControlCapabilitySourceSchema,
  hostedSafe: z.boolean(),
  available: z.boolean(),
  actor: z.string().nullable(),
  summary: z.string().trim().min(1),
  reason: z.string().nullable(),
});

export const repositoryBindingSchema = z.object({
  provider: z.enum(["github"]).nullable(),
  status: repositoryBindingStatusSchema,
  owner: z.string().nullable(),
  repo: z.string().nullable(),
  slug: z.string().nullable(),
  remoteName: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  defaultBranchRevision: z.number().int().nonnegative(),
  currentBranch: z.string().nullable(),
  attachedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  rebindHint: z.string().nullable(),
});

export const sourceControlDegradedStateSchema = z.object({
  active: z.boolean(),
  reason: z.string().nullable(),
  summary: z.string().trim().min(1),
  enteredAt: z.string().nullable(),
  rebindHint: z.string().nullable(),
});

export const sourceControlMergePolicySchema = z.object({
  kind: z.literal("first-merge-wins"),
  summary: z.string().trim().min(1),
});

export const storyBranchSchema = z.object({
  storyId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  kind: storyBranchKindSchema,
  branchName: z.string().trim().min(1),
  baseBranch: z.string().trim().min(1),
  createdFromRevision: z.number().int().nonnegative(),
  status: storyBranchStatusSchema,
  staleReason: z.string().nullable(),
  latestPullRequestId: z.string().nullable(),
  lastValidationAt: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const pullRequestArtifactSchema = z.object({
  id: z.string().trim().min(1),
  storyId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  headBranch: z.string().trim().min(1),
  baseBranch: z.string().trim().min(1),
  status: pullRequestStatusSchema,
  number: z.number().int().positive().nullable(),
  url: z.string().nullable(),
  reviewGuidance: z.string().nullable(),
  ownerProfileId: z.enum(AGENT_ROLE_IDS),
  createdFromRevision: z.number().int().nonnegative(),
  validationStatus: pullRequestValidationStatusSchema,
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  mergedAt: z.string().nullable(),
  mergedBy: z.string().nullable(),
});

export const mergeDecisionSchema = z.object({
  id: z.string().trim().min(1),
  pullRequestId: z.string().trim().min(1),
  branchName: z.string().trim().min(1),
  baseBranch: z.string().trim().min(1),
  status: mergeDecisionStatusSchema,
  ownerProfileId: z.enum(AGENT_ROLE_IDS),
  validationPassed: z.boolean(),
  summary: z.string().trim().min(1),
  mergedAt: z.string().nullable(),
  cleanupPerformed: z.boolean(),
  winningPullRequestId: z.string().nullable(),
  winningBranchName: z.string().nullable(),
  conflictTicketId: z.string().nullable(),
});

export const conflictResolutionTicketSchema = z.object({
  id: z.string().trim().min(1),
  storyId: z.string().trim().min(1),
  branchName: z.string().trim().min(1),
  blockingPullRequestId: z.string().nullable(),
  blockingBranchName: z.string().nullable(),
  createdFromRevision: z.number().int().nonnegative(),
  currentDefaultBranchRevision: z.number().int().nonnegative(),
  status: conflictResolutionTicketStatusSchema,
  summary: z.string().trim().min(1),
  recoveryHint: z.string().trim().min(1),
  ownerProfileId: z.enum(AGENT_ROLE_IDS),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const sourceControlAuditEntrySchema = z.object({
  id: z.string().trim().min(1),
  at: z.string().trim().min(1),
  kind: sourceControlAuditKindSchema,
  message: z.string().trim().min(1),
});

export const persistedSourceControlStateSchema = z.object({
  version: z.literal(SOURCE_CONTROL_STATE_VERSION),
  updatedAt: z.string().trim().min(1),
  capability: sourceControlCapabilitySchema,
  repository: repositoryBindingSchema,
  degraded: sourceControlDegradedStateSchema,
  mergePolicy: sourceControlMergePolicySchema,
  storyBranches: z.array(storyBranchSchema),
  pullRequests: z.array(pullRequestArtifactSchema),
  conflictTickets: z.array(conflictResolutionTicketSchema),
  lastMergeDecision: mergeDecisionSchema.nullable(),
  auditTrail: z.array(sourceControlAuditEntrySchema),
});

export const sourceControlWorkbenchStateSchema = z.object({
  provider: z.literal("github"),
  available: z.boolean(),
  authMode: sourceControlAuthModeSchema.nullable(),
  summary: z.string().trim().min(1),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
  repositorySlug: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  defaultBranchRevision: z.number().int().nonnegative(),
  currentBranch: z.string().nullable(),
  pendingRebind: z.boolean(),
  activeStoryBranch: z.string().nullable(),
  openPullRequest: z.string().nullable(),
  openPullRequestNumber: z.number().int().positive().nullable(),
  lastMergeStatus: mergeDecisionStatusSchema.nullable(),
  lastMergeSummary: z.string().nullable(),
  pendingConflictTicket: z.string().nullable(),
  ownerProfileId: z.enum(AGENT_ROLE_IDS).nullable(),
  updatedAt: z.string().nullable(),
});

export type SourceControlAuthMode = z.infer<typeof sourceControlAuthModeSchema>;
export type SourceControlCapabilitySource = z.infer<
  typeof sourceControlCapabilitySourceSchema
>;
export type RepositoryBindingStatus = z.infer<
  typeof repositoryBindingStatusSchema
>;
export type StoryBranchKind = z.infer<typeof storyBranchKindSchema>;
export type StoryBranchStatus = z.infer<typeof storyBranchStatusSchema>;
export type PullRequestStatus = z.infer<typeof pullRequestStatusSchema>;
export type PullRequestValidationStatus = z.infer<
  typeof pullRequestValidationStatusSchema
>;
export type MergeDecisionStatus = z.infer<typeof mergeDecisionStatusSchema>;
export type ConflictResolutionTicketStatus = z.infer<
  typeof conflictResolutionTicketStatusSchema
>;
export type SourceControlAuditKind = z.infer<typeof sourceControlAuditKindSchema>;
export type SourceControlCapability = z.infer<
  typeof sourceControlCapabilitySchema
>;
export type RepositoryBinding = z.infer<typeof repositoryBindingSchema>;
export type SourceControlDegradedState = z.infer<
  typeof sourceControlDegradedStateSchema
>;
export type SourceControlMergePolicy = z.infer<
  typeof sourceControlMergePolicySchema
>;
export type StoryBranch = z.infer<typeof storyBranchSchema>;
export type PullRequestArtifact = z.infer<typeof pullRequestArtifactSchema>;
export type MergeDecision = z.infer<typeof mergeDecisionSchema>;
export type ConflictResolutionTicket = z.infer<
  typeof conflictResolutionTicketSchema
>;
export type SourceControlAuditEntry = z.infer<
  typeof sourceControlAuditEntrySchema
>;
export type PersistedSourceControlState = z.infer<
  typeof persistedSourceControlStateSchema
>;
export type SourceControlWorkbenchState = z.infer<
  typeof sourceControlWorkbenchStateSchema
>;

export function createDefaultSourceControlCapability(): SourceControlCapability {
  return {
    provider: "github",
    authMode: "degraded-local",
    source: "degraded-local",
    hostedSafe: false,
    available: false,
    actor: null,
    summary: "GitHub auth unavailable; Shipyard is in explicit degraded local mode.",
    reason: "No GitHub auth adapter is available.",
  };
}

export function createDefaultRepositoryBinding(): RepositoryBinding {
  return {
    provider: null,
    status: "local_only",
    owner: null,
    repo: null,
    slug: null,
    remoteName: null,
    remoteUrl: null,
    defaultBranch: null,
    defaultBranchRevision: 0,
    currentBranch: null,
    attachedAt: null,
    lastSyncedAt: null,
    rebindHint:
      "Authenticate GitHub or attach a canonical GitHub remote to exit degraded local mode.",
  };
}

export function createDefaultDegradedState(): SourceControlDegradedState {
  return {
    active: true,
    reason: "GitHub auth unavailable.",
    summary:
      "Managed local git mode is active because GitHub auth or binding is unavailable.",
    enteredAt: null,
    rebindHint:
      "Authenticate GitHub or attach a canonical GitHub remote to exit degraded local mode.",
  };
}

export function createDefaultSourceControlWorkbenchState(): SourceControlWorkbenchState {
  return {
    provider: "github",
    available: false,
    authMode: null,
    summary: "Source control state has not been synced yet.",
    degraded: true,
    degradedReason: "Source control state has not been synced yet.",
    repositorySlug: null,
    defaultBranch: null,
    defaultBranchRevision: 0,
    currentBranch: null,
    pendingRebind: true,
    activeStoryBranch: null,
    openPullRequest: null,
    openPullRequestNumber: null,
    lastMergeStatus: null,
    lastMergeSummary: null,
    pendingConflictTicket: null,
    ownerProfileId: null,
    updatedAt: null,
  };
}

export function createDefaultSourceControlState(
  now: string,
): PersistedSourceControlState {
  return {
    version: SOURCE_CONTROL_STATE_VERSION,
    updatedAt: now,
    capability: createDefaultSourceControlCapability(),
    repository: createDefaultRepositoryBinding(),
    degraded: {
      ...createDefaultDegradedState(),
      enteredAt: now,
    },
    mergePolicy: {
      kind: "first-merge-wins",
      summary:
        "The first merge to the canonical default branch wins. Later branches created from older default-branch revisions become stale and must recover before merging.",
    },
    storyBranches: [],
    pullRequests: [],
    conflictTickets: [],
    lastMergeDecision: null,
    auditTrail: [],
  };
}

export function formatPullRequestLabel(
  pullRequest: Pick<PullRequestArtifact, "number" | "title"> | null | undefined,
): string | null {
  if (!pullRequest) {
    return null;
  }

  if (pullRequest.number) {
    return `#${String(pullRequest.number)} ${pullRequest.title}`;
  }

  return pullRequest.title;
}

export function createSourceControlWorkbenchState(
  state: PersistedSourceControlState,
): SourceControlWorkbenchState {
  const openPullRequest = state.pullRequests.find((pullRequest) =>
    pullRequest.status === "open" || pullRequest.status === "draft"
  ) ?? null;
  const activeStoryBranch = state.storyBranches.find((branch) =>
    branch.status === "ready" || branch.status === "stale"
  ) ?? null;
  const pendingConflictTicket = state.conflictTickets.find((ticket) =>
    ticket.status === "open"
  ) ?? null;
  const repositorySlug = state.repository.slug ?? null;
  const defaultBranch = state.repository.defaultBranch ?? null;
  const authMode = state.capability.authMode ?? null;
  const pendingRebind =
    state.degraded.active || state.repository.status !== "bound";
  const ownerProfileId =
    pendingConflictTicket?.ownerProfileId ??
    openPullRequest?.ownerProfileId ??
    state.lastMergeDecision?.ownerProfileId ??
    null;
  const summary = pendingConflictTicket
    ? pendingConflictTicket.summary
    : openPullRequest
      ? `${formatPullRequestLabel(openPullRequest) ?? "Pull request"} is ${openPullRequest.status} against ${defaultBranch ?? "the default branch"}.`
      : activeStoryBranch
        ? `Active story branch ${activeStoryBranch.branchName} is tracking ${defaultBranch ?? "the default branch"}.`
        : state.degraded.summary;

  return {
    provider: "github",
    available: state.capability.available,
    authMode,
    summary,
    degraded: state.degraded.active,
    degradedReason: state.degraded.reason,
    repositorySlug,
    defaultBranch,
    defaultBranchRevision: state.repository.defaultBranchRevision,
    currentBranch: state.repository.currentBranch,
    pendingRebind,
    activeStoryBranch: activeStoryBranch?.branchName ?? null,
    openPullRequest: formatPullRequestLabel(openPullRequest),
    openPullRequestNumber: openPullRequest?.number ?? null,
    lastMergeStatus: state.lastMergeDecision?.status ?? null,
    lastMergeSummary: state.lastMergeDecision?.summary ?? null,
    pendingConflictTicket: pendingConflictTicket?.id ?? null,
    ownerProfileId,
    updatedAt: state.updatedAt,
  };
}
