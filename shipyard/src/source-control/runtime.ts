import { nanoid } from "nanoid";

import type { AgentRoleId } from "../agents/profiles.js";
import type { SessionState } from "../engine/state.js";
import { executeProcess } from "../tools/run-command.js";
import {
  createDefaultSourceControlState,
  createSourceControlWorkbenchState,
  SOURCE_CONTROL_PR_OPS_ROLE_ID,
  type ConflictResolutionTicket,
  type MergeDecision,
  type PersistedSourceControlState,
  type PullRequestArtifact,
  type PullRequestValidationStatus,
  type RepositoryBinding,
  type SourceControlAuditEntry,
  type SourceControlAuditKind,
  type SourceControlCapability,
  type StoryBranch,
  type StoryBranchKind,
} from "./contracts.js";
import {
  loadSourceControlState,
  saveSourceControlState,
} from "./store.js";

const GITHUB_REMOTE_HOST = "github.com";
const GITHUB_REBIND_HINT =
  "Authenticate GitHub with gh or a hosted-safe token, then create or attach a canonical GitHub repository binding.";
const DEFAULT_BRANCH_NAME = "main";
const AUDIT_TRAIL_LIMIT = 32;

export interface GitHubCliAuthStatus {
  authenticated: boolean;
  actor: string | null;
  reason: string | null;
}

export interface GitRepositoryInspection {
  isGitRepository: boolean;
  currentBranch: string | null;
  remoteName: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
}

export interface RequestedRepositoryBinding {
  owner?: string | null;
  repo?: string | null;
  remoteName?: string | null;
  remoteUrl?: string | null;
  defaultBranch?: string | null;
}

export interface SourceControlRuntimeDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  idFactory?: () => string;
  inspectGitHubCliAuth?: (
    signal?: AbortSignal,
  ) => Promise<GitHubCliAuthStatus>;
  inspectGitRepository?: (
    targetDirectory: string,
    signal?: AbortSignal,
  ) => Promise<GitRepositoryInspection>;
}

export interface SyncSourceControlStateOptions extends SourceControlRuntimeDependencies {
  signal?: AbortSignal;
  requestedBinding?: RequestedRepositoryBinding;
}

export interface ProvisionStoryBranchOptions extends SourceControlRuntimeDependencies {
  storyId: string;
  title: string;
  kind?: StoryBranchKind;
  syncFromDefaultBranch?: boolean;
  signal?: AbortSignal;
}

export interface OpenPullRequestOptions extends SourceControlRuntimeDependencies {
  storyId: string;
  title: string;
  reviewGuidance?: string;
  number?: number | null;
  url?: string | null;
  draft?: boolean;
  validationStatus?: PullRequestValidationStatus;
  kind?: StoryBranchKind;
  signal?: AbortSignal;
}

export interface MergePullRequestOptions extends SourceControlRuntimeDependencies {
  pullRequestId?: string;
  pullRequestNumber?: number;
  validationPassed?: boolean;
  mergedBy?: string | null;
  cleanupBranch?: boolean;
  signal?: AbortSignal;
}

export interface SyncSourceControlStateResult {
  state: PersistedSourceControlState;
}

export interface ProvisionStoryBranchResult {
  state: PersistedSourceControlState;
  branch: StoryBranch;
  ownerProfileId: AgentRoleId;
}

export interface OpenPullRequestResult {
  state: PersistedSourceControlState;
  pullRequest: PullRequestArtifact;
  ownerProfileId: AgentRoleId;
}

export interface MergePullRequestResult {
  state: PersistedSourceControlState;
  pullRequest: PullRequestArtifact;
  decision: MergeDecision;
  conflictTicket: ConflictResolutionTicket | null;
  ownerProfileId: AgentRoleId;
}

export type SourceControlActionKind =
  | "provision-story-branch"
  | "open-pull-request"
  | "merge-pull-request"
  | "rebind-repository";

function resolveNow(
  override?: () => string,
): string {
  return override ? override() : new Date().toISOString();
}

function createIdentifier(
  prefix: string,
  override?: () => string,
): string {
  return override ? override() : `${prefix}-${nanoid(10)}`;
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createAuditEntry(
  kind: SourceControlAuditKind,
  message: string,
  options: {
    now: string;
    idFactory?: () => string;
  },
): SourceControlAuditEntry {
  return {
    id: createIdentifier("source-control-audit", options.idFactory),
    at: options.now,
    kind,
    message,
  };
}

function appendAuditEntries(
  state: PersistedSourceControlState,
  entries: SourceControlAuditEntry[],
): PersistedSourceControlState {
  if (entries.length === 0) {
    return state;
  }

  return {
    ...state,
    auditTrail: [...entries, ...state.auditTrail].slice(0, AUDIT_TRAIL_LIMIT),
  };
}

function parseGitHubRemote(
  remoteUrl: string | null,
): {
  owner: string;
  repo: string;
  slug: string;
} | null {
  const trimmedRemoteUrl = trimToNull(remoteUrl);

  if (!trimmedRemoteUrl) {
    return null;
  }

  const gitSshMatch = trimmedRemoteUrl.match(
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u,
  );

  if (gitSshMatch?.[1] && gitSshMatch[2]) {
    const owner = gitSshMatch[1];
    const repo = gitSshMatch[2];
    return {
      owner,
      repo,
      slug: `${owner}/${repo}`,
    };
  }

  try {
    const parsed = new URL(trimmedRemoteUrl);

    if (parsed.hostname !== GITHUB_REMOTE_HOST) {
      return null;
    }

    const segments = parsed.pathname.replace(/^\/+/u, "").split("/").filter(Boolean);

    if (segments.length < 2) {
      return null;
    }

    const owner = segments[0];
    const repo = segments[1]?.replace(/\.git$/u, "");

    if (!owner || !repo) {
      return null;
    }

    return {
      owner,
      repo,
      slug: `${owner}/${repo}`,
    };
  } catch {
    return null;
  }
}

function normalizeBindingInput(
  input: RequestedRepositoryBinding | undefined,
): {
  owner: string | null;
  repo: string | null;
  remoteName: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
} {
  return {
    owner: trimToNull(input?.owner),
    repo: trimToNull(input?.repo),
    remoteName: trimToNull(input?.remoteName),
    remoteUrl: trimToNull(input?.remoteUrl),
    defaultBranch: trimToNull(input?.defaultBranch),
  };
}

function createRepositoryBinding(
  existing: RepositoryBinding,
  options: {
    capability: SourceControlCapability;
    inspection: GitRepositoryInspection;
    requestedBinding?: RequestedRepositoryBinding;
    now: string;
  },
): RepositoryBinding {
  const requestedBinding = normalizeBindingInput(options.requestedBinding);
  const requestedSlug =
    requestedBinding.owner && requestedBinding.repo
      ? `${requestedBinding.owner}/${requestedBinding.repo}`
      : null;
  const remoteBinding = parseGitHubRemote(
    requestedBinding.remoteUrl ?? options.inspection.remoteUrl,
  );
  const boundOwner = requestedBinding.owner ?? remoteBinding?.owner ?? null;
  const boundRepo = requestedBinding.repo ?? remoteBinding?.repo ?? null;
  const boundSlug = requestedSlug ?? remoteBinding?.slug ?? null;
  const defaultBranch =
    requestedBinding.defaultBranch ??
    trimToNull(options.inspection.defaultBranch) ??
    trimToNull(existing.defaultBranch) ??
    trimToNull(options.inspection.currentBranch) ??
    DEFAULT_BRANCH_NAME;
  const currentBranch =
    trimToNull(options.inspection.currentBranch) ??
    trimToNull(existing.currentBranch) ??
    defaultBranch;
  const inferredRemoteName =
    requestedBinding.remoteName ??
    trimToNull(options.inspection.remoteName) ??
    trimToNull(existing.remoteName);
  const nextRemoteUrl =
    requestedBinding.remoteUrl ??
    trimToNull(options.inspection.remoteUrl) ??
    trimToNull(existing.remoteUrl);
  const bindingChanged = Boolean(boundSlug && boundSlug !== existing.slug);
  const nextRevision = bindingChanged ? 0 : existing.defaultBranchRevision;

  if (boundSlug && boundOwner && boundRepo) {
    return {
      provider: "github",
      status: "bound",
      owner: boundOwner,
      repo: boundRepo,
      slug: boundSlug,
      remoteName: inferredRemoteName ?? "origin",
      remoteUrl: nextRemoteUrl,
      defaultBranch,
      defaultBranchRevision: nextRevision,
      currentBranch,
      attachedAt: bindingChanged ? options.now : existing.attachedAt ?? options.now,
      lastSyncedAt: options.now,
      rebindHint: null,
    };
  }

  if (options.capability.available) {
    return {
      provider: "github",
      status: "pending_bind",
      owner: null,
      repo: null,
      slug: null,
      remoteName: inferredRemoteName,
      remoteUrl: nextRemoteUrl,
      defaultBranch,
      defaultBranchRevision: existing.defaultBranchRevision,
      currentBranch,
      attachedAt: existing.attachedAt,
      lastSyncedAt: options.now,
      rebindHint:
        "Create or attach a canonical GitHub repository so Shipyard can open PRs and merge safely.",
    };
  }

  return {
    provider: null,
    status: "local_only",
      owner: null,
      repo: null,
      slug: null,
      remoteName: inferredRemoteName,
      remoteUrl: nextRemoteUrl,
    defaultBranch,
    defaultBranchRevision: existing.defaultBranchRevision,
    currentBranch,
    attachedAt: existing.attachedAt,
    lastSyncedAt: options.now,
    rebindHint: GITHUB_REBIND_HINT,
  };
}

function createDegradedState(
  capability: SourceControlCapability,
  repository: RepositoryBinding,
  previous: PersistedSourceControlState["degraded"],
  now: string,
): PersistedSourceControlState["degraded"] {
  if (!capability.available && repository.status === "bound") {
    return {
      active: true,
      reason: "GitHub repository is bound, but auth is unavailable.",
      summary:
        `GitHub repo ${repository.slug ?? "binding"} is known, but automation is degraded until auth returns.`,
      enteredAt: previous.active ? previous.enteredAt : now,
      rebindHint: GITHUB_REBIND_HINT,
    };
  }

  if (!capability.available) {
    return {
      active: true,
      reason: capability.reason ?? "GitHub auth unavailable.",
      summary:
        "Managed local git mode is active because GitHub auth or binding is unavailable.",
      enteredAt: previous.active ? previous.enteredAt : now,
      rebindHint: GITHUB_REBIND_HINT,
    };
  }

  if (repository.status !== "bound") {
    return {
      active: true,
      reason:
        "GitHub auth is available, but no canonical GitHub repository is bound yet.",
      summary:
        "GitHub auth is ready, but repository create/attach is still pending. Shipyard will preserve a managed local repo until rebind succeeds.",
      enteredAt: previous.active ? previous.enteredAt : now,
      rebindHint:
        repository.rebindHint ??
        "Attach or create a canonical GitHub repository to exit degraded local mode.",
    };
  }

  return {
    active: false,
    reason: null,
    summary:
      `GitHub automation is ready for ${repository.slug ?? "the bound repository"}.`,
    enteredAt: null,
    rebindHint: null,
  };
}

function slugifyBranchSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "")
    .replace(/-{2,}/gu, "-")
    .slice(0, 48);
}

export function createStoryBranchName(options: {
  storyId: string;
  title: string;
  kind?: StoryBranchKind;
}): string {
  const prefix = options.kind === "fix"
    ? "fix"
    : options.kind === "chore"
      ? "chore"
      : "feat";
  const storySegment = slugifyBranchSegment(options.storyId) || "story";
  const titleSegment = slugifyBranchSegment(options.title);

  return `${prefix}/${storySegment}${titleSegment ? `-${titleSegment}` : ""}`;
}

export function getSourceControlActionOwnerProfileId(
  _action: SourceControlActionKind,
): AgentRoleId {
  return SOURCE_CONTROL_PR_OPS_ROLE_ID;
}

function createCapabilitySummary(
  capability: SourceControlCapability,
): string {
  if (!capability.available) {
    return capability.summary;
  }

  return capability.actor
    ? `${capability.summary} Actor: ${capability.actor}.`
    : capability.summary;
}

function createRepositorySummary(repository: RepositoryBinding): string {
  if (repository.status === "bound") {
    return `GitHub repo ${repository.slug ?? "binding"} is bound on ${repository.defaultBranch ?? DEFAULT_BRANCH_NAME}.`;
  }

  if (repository.status === "pending_bind") {
    return "GitHub auth is available, but repository binding is still pending.";
  }

  return "No canonical GitHub repo is bound yet; Shipyard is preserving managed local repo state.";
}

function synchronizeAuditTrail(
  existing: PersistedSourceControlState,
  next: PersistedSourceControlState,
  options: {
    now: string;
    idFactory?: () => string;
  },
): PersistedSourceControlState {
  const entries: SourceControlAuditEntry[] = [];

  if (
    existing.auditTrail.length === 0 ||
    existing.capability.authMode !== next.capability.authMode ||
    existing.capability.available !== next.capability.available
  ) {
    entries.push(
      createAuditEntry(
        "capability-resolved",
        createCapabilitySummary(next.capability),
        options,
      ),
    );
  }

  if (
    existing.repository.status !== next.repository.status ||
    existing.repository.slug !== next.repository.slug ||
    existing.repository.defaultBranch !== next.repository.defaultBranch
  ) {
    entries.push(
      createAuditEntry(
        existing.repository.status !== "bound" && next.repository.status === "bound"
          ? "repository-rebound"
          : next.repository.status === "bound"
            ? "repository-bound"
            : "repository-degraded",
        createRepositorySummary(next.repository),
        options,
      ),
    );
  }

  if (
    existing.degraded.active !== next.degraded.active ||
    existing.degraded.reason !== next.degraded.reason
  ) {
    entries.push(
      createAuditEntry(
        "repository-degraded",
        next.degraded.summary,
        options,
      ),
    );
  }

  return appendAuditEntries(next, entries);
}

async function defaultInspectGitHubCliAuth(
  signal?: AbortSignal,
): Promise<GitHubCliAuthStatus> {
  try {
    const result = await executeProcess({
      cwd: process.cwd(),
      command: "gh",
      args: ["auth", "status", "--hostname", GITHUB_REMOTE_HOST],
      timeoutMs: 10_000,
      signal,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    const actorMatch = combined.match(/account\s+([A-Za-z0-9-]+)/iu);

    return {
      authenticated: result.exitCode === 0,
      actor: actorMatch?.[1] ?? null,
      reason:
        result.exitCode === 0
          ? null
          : trimToNull(result.stderr || result.stdout || "gh auth status failed."),
    };
  } catch (error) {
    return {
      authenticated: false,
      actor: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runGitCommand(
  targetDirectory: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const result = await executeProcess({
      cwd: targetDirectory,
      command: "git",
      args,
      timeoutMs: 10_000,
      signal,
    });

    if (result.exitCode !== 0) {
      return null;
    }

    return trimToNull(result.stdout);
  } catch {
    return null;
  }
}

async function defaultInspectGitRepository(
  targetDirectory: string,
  signal?: AbortSignal,
): Promise<GitRepositoryInspection> {
  const isGitRepository = await runGitCommand(
    targetDirectory,
    ["rev-parse", "--is-inside-work-tree"],
    signal,
  );

  if (isGitRepository !== "true") {
    return {
      isGitRepository: false,
      currentBranch: null,
      remoteName: null,
      remoteUrl: null,
      defaultBranch: null,
    };
  }

  const currentBranch = await runGitCommand(
    targetDirectory,
    ["branch", "--show-current"],
    signal,
  );
  const remoteUrl = await runGitCommand(
    targetDirectory,
    ["remote", "get-url", "origin"],
    signal,
  );
  const remoteHead = await runGitCommand(
    targetDirectory,
    ["symbolic-ref", "refs/remotes/origin/HEAD"],
    signal,
  );
  const defaultBranch = trimToNull(
    remoteHead?.split("/").pop() ??
    currentBranch ??
    DEFAULT_BRANCH_NAME,
  );

  return {
    isGitRepository: true,
    currentBranch,
    remoteName: remoteUrl ? "origin" : null,
    remoteUrl,
    defaultBranch,
  };
}

export async function resolveSourceControlCapability(
  options: SourceControlRuntimeDependencies & {
    signal?: AbortSignal;
  } = {},
): Promise<SourceControlCapability> {
  const env = options.env ?? process.env;
  const githubAppId = trimToNull(env.GITHUB_APP_ID);
  const githubAppInstallationId = trimToNull(env.GITHUB_APP_INSTALLATION_ID);
  const githubToken = trimToNull(env.GITHUB_TOKEN) ?? trimToNull(env.GH_TOKEN);
  const githubOAuthToken = trimToNull(env.GITHUB_OAUTH_TOKEN);
  const githubActor = trimToNull(env.GITHUB_ACTOR);

  if (githubAppId && githubAppInstallationId) {
    return {
      provider: "github",
      authMode: "github-app",
      source: "github-app-env",
      hostedSafe: true,
      available: true,
      actor: githubActor ?? `app:${githubAppId}`,
      summary:
        "Using hosted-safe GitHub App credentials for canonical repo operations.",
      reason: null,
    };
  }

  if (githubToken) {
    return {
      provider: "github",
      authMode: "github-token",
      source: "github-token-env",
      hostedSafe: true,
      available: true,
      actor: githubActor,
      summary:
        "Using hosted-safe GitHub token credentials for canonical repo operations.",
      reason: null,
    };
  }

  if (githubOAuthToken) {
    return {
      provider: "github",
      authMode: "oauth-token",
      source: "oauth-token-env",
      hostedSafe: true,
      available: true,
      actor: githubActor,
      summary:
        "Using hosted-safe GitHub OAuth credentials for canonical repo operations.",
      reason: null,
    };
  }

  const inspectGitHubCliAuth =
    options.inspectGitHubCliAuth ?? defaultInspectGitHubCliAuth;
  const cliAuthStatus = await inspectGitHubCliAuth(options.signal);

  if (cliAuthStatus.authenticated) {
    return {
      provider: "github",
      authMode: "github-cli",
      source: "github-cli",
      hostedSafe: false,
      available: true,
      actor: cliAuthStatus.actor,
      summary:
        "Using local gh CLI auth for canonical GitHub repo operations.",
      reason: null,
    };
  }

  return {
    provider: "github",
    authMode: "degraded-local",
    source: "degraded-local",
    hostedSafe: false,
    available: false,
    actor: null,
    summary: "GitHub auth unavailable; Shipyard is in explicit degraded local mode.",
    reason: cliAuthStatus.reason ?? "No GitHub auth adapter is available.",
  };
}

export async function syncSourceControlState(
  targetDirectory: string,
  options: SyncSourceControlStateOptions = {},
): Promise<SyncSourceControlStateResult> {
  const now = resolveNow(options.now);
  const existing =
    await loadSourceControlState(targetDirectory) ?? createDefaultSourceControlState(now);
  const capability = await resolveSourceControlCapability(options);
  const inspectGitRepository =
    options.inspectGitRepository ?? defaultInspectGitRepository;
  const inspection = await inspectGitRepository(targetDirectory, options.signal);
  const repository = createRepositoryBinding(existing.repository, {
    capability,
    inspection,
    requestedBinding: options.requestedBinding,
    now,
  });
  const degraded = createDegradedState(
    capability,
    repository,
    existing.degraded,
    now,
  );

  const nextState = synchronizeAuditTrail(
    existing,
    {
      ...existing,
      version: existing.version,
      updatedAt: now,
      capability,
      repository,
      degraded,
    },
    {
      now,
      idFactory: options.idFactory,
    },
  );

  const persisted = await saveSourceControlState(targetDirectory, nextState);
  return {
    state: persisted,
  };
}

export async function attachRepositoryBinding(
  targetDirectory: string,
  binding: RequestedRepositoryBinding,
  options: SourceControlRuntimeDependencies & {
    signal?: AbortSignal;
  } = {},
): Promise<SyncSourceControlStateResult> {
  return syncSourceControlState(targetDirectory, {
    ...options,
    signal: options.signal,
    requestedBinding: binding,
  });
}

function upsertStoryBranch(
  state: PersistedSourceControlState,
  branch: StoryBranch,
): PersistedSourceControlState {
  return {
    ...state,
    storyBranches: [
      branch,
      ...state.storyBranches.filter((entry) => entry.storyId !== branch.storyId),
    ],
  };
}

function upsertPullRequest(
  state: PersistedSourceControlState,
  pullRequest: PullRequestArtifact,
): PersistedSourceControlState {
  return {
    ...state,
    pullRequests: [
      pullRequest,
      ...state.pullRequests.filter((entry) => entry.id !== pullRequest.id),
    ],
  };
}

function upsertConflictTicket(
  state: PersistedSourceControlState,
  ticket: ConflictResolutionTicket,
): PersistedSourceControlState {
  return {
    ...state,
    conflictTickets: [
      ticket,
      ...state.conflictTickets.filter((entry) => entry.id !== ticket.id),
    ],
  };
}

export async function provisionStoryBranch(
  targetDirectory: string,
  options: ProvisionStoryBranchOptions,
): Promise<ProvisionStoryBranchResult> {
  const ownerProfileId = getSourceControlActionOwnerProfileId(
    "provision-story-branch",
  );
  const now = resolveNow(options.now);
  const syncResult = await syncSourceControlState(targetDirectory, options);
  let state = syncResult.state;
  const branchName = createStoryBranchName({
    storyId: options.storyId,
    title: options.title,
    kind: options.kind,
  });
  const existingBranch = state.storyBranches.find((branch) =>
    branch.storyId === options.storyId
  );
  const shouldSyncExistingBranch = Boolean(
    existingBranch &&
      (
        options.syncFromDefaultBranch ||
        existingBranch.createdFromRevision < state.repository.defaultBranchRevision ||
        existingBranch.status === "stale"
      ),
  );

  const branch: StoryBranch = existingBranch
    ? {
        ...existingBranch,
        title: options.title,
        kind: options.kind ?? existingBranch.kind,
        branchName,
        baseBranch: state.repository.defaultBranch ?? DEFAULT_BRANCH_NAME,
        createdFromRevision: shouldSyncExistingBranch
          ? state.repository.defaultBranchRevision
          : existingBranch.createdFromRevision,
        status:
          shouldSyncExistingBranch || existingBranch.status === "merged" || existingBranch.status === "closed"
            ? "ready"
            : existingBranch.status,
        staleReason: shouldSyncExistingBranch ? null : existingBranch.staleReason,
        lastSyncAt: shouldSyncExistingBranch ? now : existingBranch.lastSyncAt,
        updatedAt: now,
      }
    : {
        storyId: options.storyId,
        title: options.title,
        kind: options.kind ?? "feature",
        branchName,
        baseBranch: state.repository.defaultBranch ?? DEFAULT_BRANCH_NAME,
        createdFromRevision: state.repository.defaultBranchRevision,
        status: "ready",
        staleReason: null,
        latestPullRequestId: null,
        lastValidationAt: null,
        lastSyncAt: now,
        createdAt: now,
        updatedAt: now,
      };

  state = upsertStoryBranch(
    {
      ...state,
      updatedAt: now,
      repository: {
        ...state.repository,
        currentBranch: branch.branchName,
        lastSyncedAt: now,
      },
    },
    branch,
  );
  state = appendAuditEntries(state, [
    createAuditEntry(
      shouldSyncExistingBranch ? "story-branch-synced" : "story-branch-provisioned",
      shouldSyncExistingBranch
        ? `Synced ${branch.branchName} from ${branch.baseBranch} at default-branch revision ${String(branch.createdFromRevision)}.`
        : `Provisioned ${branch.branchName} from ${branch.baseBranch} for ${branch.storyId}.`,
      {
        now,
        idFactory: options.idFactory,
      },
    ),
  ]);
  state = await saveSourceControlState(targetDirectory, state);

  return {
    state,
    branch,
    ownerProfileId,
  };
}

export async function openPullRequest(
  targetDirectory: string,
  options: OpenPullRequestOptions,
): Promise<OpenPullRequestResult> {
  const ownerProfileId = getSourceControlActionOwnerProfileId("open-pull-request");
  const now = resolveNow(options.now);
  const branchResult = await provisionStoryBranch(targetDirectory, {
    ...options,
    syncFromDefaultBranch: false,
  });
  let state = branchResult.state;
  const branch = branchResult.branch;
  const existingPullRequest = state.pullRequests.find((pullRequest) =>
    pullRequest.storyId === options.storyId &&
    pullRequest.headBranch === branch.branchName &&
    (
      pullRequest.status === "draft" ||
      pullRequest.status === "open" ||
      pullRequest.status === "blocked" ||
      pullRequest.status === "stale"
    )
  );
  const pullRequest: PullRequestArtifact = existingPullRequest
    ? {
        ...existingPullRequest,
        title: options.title,
        status:
          branch.status === "stale"
            ? "stale"
            : options.draft
              ? "draft"
              : "open",
        number: options.number ?? existingPullRequest.number,
        url: options.url ?? existingPullRequest.url,
        reviewGuidance: options.reviewGuidance ?? existingPullRequest.reviewGuidance,
        ownerProfileId,
        createdFromRevision: branch.createdFromRevision,
        validationStatus:
          options.validationStatus ?? existingPullRequest.validationStatus,
        updatedAt: now,
      }
    : {
        id: createIdentifier("pull-request", options.idFactory),
        storyId: options.storyId,
        title: options.title,
        headBranch: branch.branchName,
        baseBranch: branch.baseBranch,
        status: branch.status === "stale"
          ? "stale"
          : options.draft
            ? "draft"
            : "open",
        number: options.number ?? null,
        url: options.url ?? null,
        reviewGuidance: trimToNull(options.reviewGuidance),
        ownerProfileId,
        createdFromRevision: branch.createdFromRevision,
        validationStatus: options.validationStatus ?? "pending",
        createdAt: now,
        updatedAt: now,
        mergedAt: null,
        mergedBy: null,
      };

  state = upsertPullRequest(
    {
      ...state,
      updatedAt: now,
    },
    pullRequest,
  );
  state = upsertStoryBranch(state, {
    ...branch,
    latestPullRequestId: pullRequest.id,
    updatedAt: now,
  });
  state = appendAuditEntries(state, [
    createAuditEntry(
      existingPullRequest ? "pull-request-updated" : "pull-request-opened",
      existingPullRequest
        ? `Updated ${pullRequest.number ? `#${String(pullRequest.number)}` : pullRequest.id} for ${pullRequest.storyId}.`
        : `Opened ${pullRequest.number ? `#${String(pullRequest.number)}` : pullRequest.id} for ${pullRequest.storyId}.`,
      {
        now,
        idFactory: options.idFactory,
      },
    ),
  ]);
  state = await saveSourceControlState(targetDirectory, state);

  return {
    state,
    pullRequest,
    ownerProfileId,
  };
}

function createConflictTicket(
  state: PersistedSourceControlState,
  branch: StoryBranch,
  options: {
    now: string;
    idFactory?: () => string;
    blockingPullRequestId: string | null;
    blockingBranchName: string | null;
  },
): ConflictResolutionTicket {
  const existingTicket = state.conflictTickets.find((ticket) =>
    ticket.branchName === branch.branchName &&
    ticket.status === "open"
  );

  if (existingTicket) {
    return {
      ...existingTicket,
      blockingPullRequestId:
        options.blockingPullRequestId ?? existingTicket.blockingPullRequestId,
      blockingBranchName:
        options.blockingBranchName ?? existingTicket.blockingBranchName,
      currentDefaultBranchRevision: state.repository.defaultBranchRevision,
      summary:
        `Branch ${branch.branchName} is stale because ${options.blockingBranchName ?? "another branch"} merged first.`,
      updatedAt: options.now,
    };
  }

  return {
    id: createIdentifier("conflict-ticket", options.idFactory),
    storyId: branch.storyId,
    branchName: branch.branchName,
    blockingPullRequestId: options.blockingPullRequestId,
    blockingBranchName: options.blockingBranchName,
    createdFromRevision: branch.createdFromRevision,
    currentDefaultBranchRevision: state.repository.defaultBranchRevision,
    status: "open",
    summary:
      `Branch ${branch.branchName} is stale because ${options.blockingBranchName ?? "another branch"} merged first.`,
    recoveryHint:
      `Sync ${branch.branchName} from ${state.repository.defaultBranch ?? DEFAULT_BRANCH_NAME}, reconcile conflicts with the coordinator, and reopen the PR once validation is green again.`,
    ownerProfileId: SOURCE_CONTROL_PR_OPS_ROLE_ID,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

function createBlockedMergeDecision(
  pullRequest: PullRequestArtifact,
  branch: StoryBranch,
  options: {
    now: string;
    idFactory?: () => string;
    summary: string;
    validationPassed: boolean;
    conflictTicketId?: string | null;
    winningPullRequestId?: string | null;
    winningBranchName?: string | null;
  },
): MergeDecision {
  return {
    id: createIdentifier("merge-decision", options.idFactory),
    pullRequestId: pullRequest.id,
    branchName: branch.branchName,
    baseBranch: branch.baseBranch,
    status: "blocked",
    ownerProfileId: SOURCE_CONTROL_PR_OPS_ROLE_ID,
    validationPassed: options.validationPassed,
    summary: options.summary,
    mergedAt: null,
    cleanupPerformed: false,
    winningPullRequestId: options.winningPullRequestId ?? null,
    winningBranchName: options.winningBranchName ?? null,
    conflictTicketId: options.conflictTicketId ?? null,
  };
}

function markOtherBranchesStaleAfterMerge(
  state: PersistedSourceControlState,
  options: {
    now: string;
    idFactory?: () => string;
    winningPullRequestId: string;
    winningBranchName: string;
  },
): PersistedSourceControlState {
  let nextState = state;
  const auditEntries: SourceControlAuditEntry[] = [];

  for (const branch of state.storyBranches) {
    if (
      branch.branchName === options.winningBranchName ||
      branch.status === "merged" ||
      branch.status === "closed"
    ) {
      continue;
    }

    if (branch.createdFromRevision >= state.repository.defaultBranchRevision) {
      continue;
    }

    const staleBranch: StoryBranch = {
      ...branch,
      status: "stale",
      staleReason:
        `Default branch advanced to revision ${String(state.repository.defaultBranchRevision)} after ${options.winningBranchName} merged first.`,
      updatedAt: options.now,
    };
    nextState = upsertStoryBranch(nextState, staleBranch);

    const matchingPullRequest = nextState.pullRequests.find((pullRequest) =>
      pullRequest.headBranch === staleBranch.branchName &&
      (
        pullRequest.status === "draft" ||
        pullRequest.status === "open" ||
        pullRequest.status === "blocked"
      )
    );

    if (matchingPullRequest) {
      nextState = upsertPullRequest(nextState, {
        ...matchingPullRequest,
        status: "stale",
        updatedAt: options.now,
      });
    }

    const ticket = createConflictTicket(nextState, staleBranch, {
      now: options.now,
      idFactory: options.idFactory,
      blockingPullRequestId: options.winningPullRequestId,
      blockingBranchName: options.winningBranchName,
    });
    nextState = upsertConflictTicket(nextState, ticket);
    auditEntries.push(
      createAuditEntry(
        "story-branch-marked-stale",
        `Marked ${staleBranch.branchName} stale because ${options.winningBranchName} merged first.`,
        {
          now: options.now,
          idFactory: options.idFactory,
        },
      ),
      createAuditEntry(
        "conflict-ticket-created",
        `Opened ${ticket.id} for ${staleBranch.branchName}.`,
        {
          now: options.now,
          idFactory: options.idFactory,
        },
      ),
    );
  }

  return appendAuditEntries(nextState, auditEntries);
}

export async function mergePullRequest(
  targetDirectory: string,
  options: MergePullRequestOptions,
): Promise<MergePullRequestResult> {
  const ownerProfileId = getSourceControlActionOwnerProfileId("merge-pull-request");
  const now = resolveNow(options.now);
  let state = (await syncSourceControlState(targetDirectory, options)).state;

  const pullRequest = state.pullRequests.find((entry) =>
    (options.pullRequestId && entry.id === options.pullRequestId) ||
    (typeof options.pullRequestNumber === "number" && entry.number === options.pullRequestNumber)
  );

  if (!pullRequest) {
    throw new Error("Could not find the requested pull request.");
  }

  const branch = state.storyBranches.find((entry) =>
    entry.branchName === pullRequest.headBranch
  );

  if (!branch) {
    throw new Error(`Missing story branch ${pullRequest.headBranch}.`);
  }

  const validationPassed =
    options.validationPassed ?? pullRequest.validationStatus === "passed";

  if (!state.capability.available || state.repository.status !== "bound") {
    const blockedDecision = createBlockedMergeDecision(pullRequest, branch, {
      now,
      idFactory: options.idFactory,
      summary:
        "Merge is blocked because GitHub auth or canonical repository binding is unavailable.",
      validationPassed,
    });
    state = appendAuditEntries(
      {
        ...state,
        updatedAt: now,
        lastMergeDecision: blockedDecision,
      },
      [
        createAuditEntry("merge-blocked", blockedDecision.summary, {
          now,
          idFactory: options.idFactory,
        }),
      ],
    );
    state = await saveSourceControlState(targetDirectory, state);

    return {
      state,
      pullRequest,
      decision: blockedDecision,
      conflictTicket: null,
      ownerProfileId,
    };
  }

  if (!validationPassed) {
    const blockedDecision = createBlockedMergeDecision(pullRequest, branch, {
      now,
      idFactory: options.idFactory,
      summary:
        "Merge is blocked until validation is green for the pull request branch.",
      validationPassed,
    });
    state = appendAuditEntries(
      {
        ...state,
        updatedAt: now,
        lastMergeDecision: blockedDecision,
      },
      [
        createAuditEntry("merge-blocked", blockedDecision.summary, {
          now,
          idFactory: options.idFactory,
        }),
      ],
    );
    state = await saveSourceControlState(targetDirectory, state);

    return {
      state,
      pullRequest,
      decision: blockedDecision,
      conflictTicket: null,
      ownerProfileId,
    };
  }

  if (branch.createdFromRevision < state.repository.defaultBranchRevision) {
    const staleBranch: StoryBranch = {
      ...branch,
      status: "stale",
      staleReason:
        `Default branch advanced to revision ${String(state.repository.defaultBranchRevision)} before merge could complete.`,
      updatedAt: now,
    };
    const stalePullRequest: PullRequestArtifact = {
      ...pullRequest,
      status: "stale",
      updatedAt: now,
    };
    const ticket = createConflictTicket(state, staleBranch, {
      now,
      idFactory: options.idFactory,
      blockingPullRequestId: state.lastMergeDecision?.status === "merged"
        ? state.lastMergeDecision.pullRequestId
        : null,
      blockingBranchName: state.lastMergeDecision?.winningBranchName ?? null,
    });
    const blockedDecision = createBlockedMergeDecision(stalePullRequest, staleBranch, {
      now,
      idFactory: options.idFactory,
      summary:
        `Merge blocked: ${staleBranch.branchName} is stale because first merge wins on ${state.repository.defaultBranch ?? DEFAULT_BRANCH_NAME}.`,
      validationPassed,
      conflictTicketId: ticket.id,
      winningPullRequestId: state.lastMergeDecision?.pullRequestId ?? null,
      winningBranchName: state.lastMergeDecision?.winningBranchName ?? null,
    });
    state = upsertStoryBranch(state, staleBranch);
    state = upsertPullRequest(state, stalePullRequest);
    state = upsertConflictTicket(state, ticket);
    state = appendAuditEntries(
      {
        ...state,
        updatedAt: now,
        lastMergeDecision: blockedDecision,
      },
      [
        createAuditEntry("merge-blocked", blockedDecision.summary, {
          now,
          idFactory: options.idFactory,
        }),
        createAuditEntry("conflict-ticket-created", `Opened ${ticket.id} for ${ticket.branchName}.`, {
          now,
          idFactory: options.idFactory,
        }),
      ],
    );
    state = await saveSourceControlState(targetDirectory, state);

    return {
      state,
      pullRequest: stalePullRequest,
      decision: blockedDecision,
      conflictTicket: ticket,
      ownerProfileId,
    };
  }

  const mergedPullRequest: PullRequestArtifact = {
    ...pullRequest,
    status: "merged",
    validationStatus: "passed",
    updatedAt: now,
    mergedAt: now,
    mergedBy: trimToNull(options.mergedBy) ?? state.capability.actor,
  };
  const mergedBranch: StoryBranch = {
    ...branch,
    status: "merged",
    staleReason: null,
    lastValidationAt: now,
    updatedAt: now,
  };
  const mergeDecision: MergeDecision = {
    id: createIdentifier("merge-decision", options.idFactory),
    pullRequestId: mergedPullRequest.id,
    branchName: mergedBranch.branchName,
    baseBranch: mergedBranch.baseBranch,
    status: "merged",
    ownerProfileId,
    validationPassed: true,
    summary:
      `${mergedBranch.branchName} merged into ${state.repository.defaultBranch ?? DEFAULT_BRANCH_NAME}; cleanup ${options.cleanupBranch === false ? "deferred" : "completed"}.`,
    mergedAt: now,
    cleanupPerformed: options.cleanupBranch !== false,
    winningPullRequestId: mergedPullRequest.id,
    winningBranchName: mergedBranch.branchName,
    conflictTicketId: null,
  };

  state = upsertPullRequest(state, mergedPullRequest);
  state = upsertStoryBranch(state, mergedBranch);
  state = {
    ...state,
    updatedAt: now,
    repository: {
      ...state.repository,
      currentBranch: state.repository.defaultBranch,
      defaultBranchRevision: state.repository.defaultBranchRevision + 1,
      lastSyncedAt: now,
    },
    lastMergeDecision: mergeDecision,
  };
  state = markOtherBranchesStaleAfterMerge(state, {
    now,
    idFactory: options.idFactory,
    winningPullRequestId: mergedPullRequest.id,
    winningBranchName: mergedBranch.branchName,
  });
  state = appendAuditEntries(state, [
    createAuditEntry(
      "merge-completed",
      `Merged ${mergedPullRequest.number ? `#${String(mergedPullRequest.number)}` : mergedPullRequest.id} from ${mergedBranch.branchName}.`,
      {
        now,
        idFactory: options.idFactory,
      },
    ),
  ]);
  state = await saveSourceControlState(targetDirectory, state);

  return {
    state,
    pullRequest: mergedPullRequest,
    decision: mergeDecision,
    conflictTicket: null,
    ownerProfileId,
  };
}

export async function syncSessionSourceControlState(
  sessionState: SessionState,
  options: SyncSourceControlStateOptions = {},
): Promise<PersistedSourceControlState> {
  const result = await syncSourceControlState(
    sessionState.targetDirectory,
    options,
  );

  sessionState.workbenchState = {
    ...sessionState.workbenchState,
    sourceControl: createSourceControlWorkbenchState(result.state),
  };

  return result.state;
}
