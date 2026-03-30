import path from "node:path";

import type { SessionState } from "../engine/state.js";
import { loadLatestSessionState } from "../engine/state.js";
import {
  syncSourceControlState,
  type GitHubCliAuthStatus as HostedRuntimeGitHubCliAuthStatus,
  type GitRepositoryInspection as HostedRuntimeGitRepositoryInspection,
  type SourceControlRuntimeDependencies,
} from "../source-control/runtime.js";
import {
  createDefaultHostedAvailabilityState,
  createDefaultHostedRuntimeProfile,
  createDefaultHostedRuntimeState,
  createHostedWorkbenchState,
  type HostedAvailabilityState,
  type HostedBlockedAction,
  type HostedDegradedState,
  type HostedFactoryRuntimeProfile,
  type HostedSourceControlAdapter,
  type HostingWorkbenchState,
  type PersistedHostedRuntimeState,
  type RemoteWorkspaceBinding,
} from "./contracts.js";
import { loadHostedRuntimeState, saveHostedRuntimeState } from "./store.js";
import {
  hasHostedWorkspaceContract,
  prepareHostedWorkspace,
  type HostedWorkspaceInfo,
} from "./workspace.js";

export type {
  HostedRuntimeGitHubCliAuthStatus,
  HostedRuntimeGitRepositoryInspection,
};

export interface HostedRuntimeDependencies
  extends SourceControlRuntimeDependencies {
  targetsDirectory?: string;
  signal?: AbortSignal;
}

export interface SyncHostedRuntimeStateResult {
  state: PersistedHostedRuntimeState;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const HTTPS_URL_PATTERN = /https:\/\/[^\s"'`]+/gu;

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function resolveNow(override?: () => string): string {
  return override ? override() : new Date().toISOString();
}

function resolveWorkspaceRoot(
  targetDirectory: string,
  options: HostedRuntimeDependencies,
): string {
  const configuredTargetsDirectory =
    trimToNull(options.targetsDirectory) ??
    trimToNull(options.env?.SHIPYARD_TARGETS_DIR);

  return path.resolve(configuredTargetsDirectory ?? targetDirectory);
}

function normalizeHostedUrl(value: string | null): string | null {
  const trimmed = trimToNull(value);

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//u.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function sanitizePublicTargetUrlCandidate(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeHostedUrl(trimToNull(value));

  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
      return parsed.origin;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function createComparableOrigin(value: string | null | undefined): string | null {
  const candidate = sanitizePublicTargetUrlCandidate(value);

  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return candidate;
  }
}

function extractHttpsUrls(text: string): string[] {
  return [...text.matchAll(HTTPS_URL_PATTERN)]
    .map((match) => sanitizePublicTargetUrlCandidate(match[0]))
    .filter((candidate): candidate is string => candidate !== null);
}

function deriveShareableVercelAlias(candidateUrl: string): string | null {
  try {
    const parsed = new URL(candidateUrl);

    if (!parsed.hostname.endsWith(".vercel.app")) {
      return null;
    }

    const label = parsed.hostname.slice(0, -".vercel.app".length);
    const aliasMatch = label.match(
      /^(?<base>.+)-(?<suffix>(?=.*[a-z])(?=.*\d)[a-z0-9]{6,})$/u,
    );
    const baseLabel = aliasMatch?.groups?.base;

    if (!baseLabel) {
      return null;
    }

    return sanitizePublicTargetUrlCandidate(`https://${baseLabel}.vercel.app`);
  } catch {
    return null;
  }
}

function collectPublicUrlHints(sessionState: SessionState): string[] {
  return [
    sessionState.workbenchState.hosting.publicDeploymentUrl,
    sessionState.workbenchState.latestDeploy.summary,
    sessionState.workbenchState.latestDeploy.logExcerpt,
    sessionState.workbenchState.ultimateState.currentBrief,
    ...sessionState.workbenchState.turns.map((turn) => turn.instruction),
    ...sessionState.workbenchState.contextHistory.map((entry) => entry.text),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function resolveHostedPublicDeploymentUrl(
  sessionState: SessionState,
  options: {
    serviceUrl?: string | null;
    privatePreviewUrl?: string | null;
  } = {},
): string | null {
  const explicitDeployUrl = sanitizePublicTargetUrlCandidate(
    sessionState.workbenchState.latestDeploy.productionUrl,
  );
  const blockedOrigins = new Set(
    [
      options.serviceUrl ?? sessionState.workbenchState.hosting.serviceUrl,
      options.privatePreviewUrl ?? sessionState.workbenchState.previewState.url,
    ]
      .map((value) => createComparableOrigin(value))
      .filter((value): value is string => value !== null),
  );
  const isBlocked = (candidateUrl: string): boolean => {
    const candidateOrigin = createComparableOrigin(candidateUrl);
    return candidateOrigin ? blockedOrigins.has(candidateOrigin) : false;
  };

  if (explicitDeployUrl && !isBlocked(explicitDeployUrl)) {
    return explicitDeployUrl;
  }

  const orderedCandidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidateUrl: string | null) => {
    if (!candidateUrl || isBlocked(candidateUrl) || seen.has(candidateUrl)) {
      return;
    }

    seen.add(candidateUrl);
    orderedCandidates.push(candidateUrl);
  };

  for (const hint of collectPublicUrlHints(sessionState)) {
    for (const extractedCandidate of extractHttpsUrls(hint)) {
      pushCandidate(deriveShareableVercelAlias(extractedCandidate));
      pushCandidate(extractedCandidate);
    }
  }

  return orderedCandidates[0] ?? null;
}

function createHealthUrl(serviceUrl: string | null): string | null {
  if (!serviceUrl) {
    return null;
  }

  return new URL("/api/health", serviceUrl).toString();
}

export function isRailwayHostedEnvironment(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    trimToNull(env.RAILWAY_VOLUME_MOUNT_PATH) ??
      trimToNull(env.RAILWAY_PUBLIC_DOMAIN) ??
      trimToNull(env.SHIPYARD_HOSTED_URL) ??
      (parseBooleanEnv(env.SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE) ? "1" : null),
  );
}

async function resolveHostedWorkspaceInfo(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<HostedWorkspaceInfo | null> {
  if (!hasHostedWorkspaceContract(env)) {
    return null;
  }

  return prepareHostedWorkspace(workspaceRoot, env);
}

export async function resolveHostedFactoryRuntimeProfile(
  workspaceRoot: string,
  options: HostedRuntimeDependencies = {},
): Promise<HostedFactoryRuntimeProfile> {
  const env = options.env ?? process.env;
  const hostedWorkspace = await resolveHostedWorkspaceInfo(workspaceRoot, env);
  const railwayHosted = isRailwayHostedEnvironment(env);
  const serviceUrl = normalizeHostedUrl(
    trimToNull(env.SHIPYARD_HOSTED_URL) ?? trimToNull(env.RAILWAY_PUBLIC_DOMAIN),
  );

  if (!railwayHosted) {
    return {
      ...createDefaultHostedRuntimeProfile(path.resolve(workspaceRoot)),
      volumeMountPath: hostedWorkspace?.volumeMountPath ?? null,
      persistentRequired: hostedWorkspace?.persistentRequired ?? false,
      mountHealthy: true,
    };
  }

  return {
    provider: "railway",
    active: true,
    mode: hostedWorkspace?.mode === "persistent" ? "persistent" : "hosted",
    workspaceRoot: path.resolve(workspaceRoot),
    volumeMountPath: hostedWorkspace?.volumeMountPath ?? null,
    persistentRequired: hostedWorkspace?.persistentRequired ?? false,
    mountHealthy: true,
    serviceUrl,
    serviceHealthUrl: createHealthUrl(serviceUrl),
    accessProtected: Boolean(trimToNull(env.SHIPYARD_ACCESS_TOKEN)),
    modelProvider: trimToNull(env.SHIPYARD_MODEL_PROVIDER),
    modelName:
      trimToNull(env.SHIPYARD_ANTHROPIC_MODEL) ??
      trimToNull(env.SHIPYARD_OPENAI_MODEL),
  };
}

function createHostedSourceControlAdapter(
  profile: HostedFactoryRuntimeProfile,
  sourceControlState: Awaited<ReturnType<typeof syncSourceControlState>>["state"],
): HostedSourceControlAdapter {
  const capability = sourceControlState.capability;
  const hostedSafeAvailable = capability.available && capability.hostedSafe;
  const available = profile.active ? hostedSafeAvailable : capability.available;
  const reason =
    profile.active && capability.available && !capability.hostedSafe
      ? "Railway-hosted runtime requires a hosted-safe GitHub adapter; local gh auth is not sufficient."
      : capability.reason;
  const summary =
    available
      ? capability.summary
      : reason ?? "Hosted GitHub auth is unavailable for this runtime.";

  return {
    provider: "github",
    authMode: capability.authMode,
    available,
    hostedSafe: capability.hostedSafe,
    summary,
    reason,
  };
}

function createHostedDegradedState(
  profile: HostedFactoryRuntimeProfile,
  sourceControlAdapter: HostedSourceControlAdapter,
  sourceControlState: Awaited<ReturnType<typeof syncSourceControlState>>["state"],
): HostedDegradedState {
  if (!profile.active) {
    return {
      active: false,
      reason: null,
      blockedActions: [],
      summary: "Hosted runtime is inactive.",
    };
  }

  if (!sourceControlAdapter.available) {
    const blockedActions: HostedBlockedAction[] = [
      "attach_repository",
      "open_pull_request",
      "merge_pull_request",
    ];

    return {
      active: true,
      reason:
        sourceControlAdapter.reason ??
        "Hosted-safe GitHub auth is unavailable.",
      blockedActions,
      summary:
        "Railway hosted runtime is active, but hosted-safe GitHub auth is unavailable. Planning, TDD, and standard code turns remain available while GitHub binding and merge automation stay blocked.",
    };
  }

  if (sourceControlState.repository.status !== "bound") {
    return {
      active: true,
      reason: "Canonical GitHub repository binding is unavailable.",
      blockedActions: [
        "open_pull_request",
        "merge_pull_request",
      ],
      summary:
        "Railway hosted runtime is active, but no canonical GitHub repository is bound yet. Planning, TDD, and standard code turns remain available while PR and merge automation stay blocked.",
    };
  }

  return {
    active: false,
    reason: null,
    blockedActions: [],
    summary: "Railway hosted runtime is ready for GitHub-backed execution.",
  };
}

async function createRemoteWorkspaceBinding(
  targetDirectory: string,
  workspaceRoot: string,
  profile: HostedFactoryRuntimeProfile,
  sourceControlState: Awaited<ReturnType<typeof syncSourceControlState>>["state"],
  degraded: HostedDegradedState,
): Promise<RemoteWorkspaceBinding> {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const normalizedTargetDirectory = path.resolve(targetDirectory);
  const relativeTargetPath =
    normalizedWorkspaceRoot === normalizedTargetDirectory
      ? null
      : path.relative(normalizedWorkspaceRoot, normalizedTargetDirectory) || null;
  const latestSession = await loadLatestSessionState(normalizedTargetDirectory);
  const restoreStatus =
    !profile.active
      ? "local"
      : latestSession
        ? "restored"
        : degraded.active
          ? "degraded"
          : "synced";
  const bindingLabel = relativeTargetPath ?? "the workspace root";
  const summary =
    restoreStatus === "restored"
      ? `Restored ${bindingLabel} from the persistent Railway workspace and resumed session ${latestSession?.sessionId ?? "unknown"}.`
      : restoreStatus === "synced"
        ? `Hosted workspace binding is ready for ${bindingLabel}.`
        : restoreStatus === "degraded"
          ? `Hosted workspace binding is running in degraded mode for ${bindingLabel}.`
          : "Local workspace binding is active.";

  return {
    targetDirectory: normalizedTargetDirectory,
    workspaceRoot: normalizedWorkspaceRoot,
    relativeTargetPath,
    repositorySlug: sourceControlState.repository.slug,
    repositoryStatus: sourceControlState.repository.status,
    restoreStatus,
    lastResumedSessionId: latestSession?.sessionId ?? null,
    lastResumedAt: latestSession?.lastActiveAt ?? null,
    summary,
  };
}

function createHostedAvailabilityState(
  profile: HostedFactoryRuntimeProfile,
): HostedAvailabilityState {
  if (!profile.active) {
    return createDefaultHostedAvailabilityState();
  }

  const serviceUrl = profile.serviceUrl;
  const serviceHealthUrl = profile.serviceHealthUrl;
  const summary = [
    serviceUrl
      ? `Shipyard service: ${serviceUrl}.`
      : "Shipyard service URL is not published yet.",
    "Private preview is not currently running.",
    "No public target deploy URL is available yet.",
  ].join(" ");

  return {
    serviceUrl,
    serviceHealthUrl,
    privatePreviewUrl: null,
    previewVisibility: "not_available",
    publicDeploymentUrl: null,
    summary,
  };
}

export async function syncHostedRuntimeState(
  targetDirectory: string,
  options: HostedRuntimeDependencies = {},
): Promise<SyncHostedRuntimeStateResult> {
  const workspaceRoot = resolveWorkspaceRoot(targetDirectory, options);
  const now = resolveNow(options.now);
  const existingState =
    await loadHostedRuntimeState(targetDirectory) ??
    createDefaultHostedRuntimeState(now, {
      targetDirectory,
      workspaceRoot,
    });
  const profile = await resolveHostedFactoryRuntimeProfile(workspaceRoot, options);
  const sourceControl = await syncSourceControlState(targetDirectory, options);
  const sourceControlAdapter = createHostedSourceControlAdapter(
    profile,
    sourceControl.state,
  );
  const degraded = createHostedDegradedState(
    profile,
    sourceControlAdapter,
    sourceControl.state,
  );
  const workspaceBinding = await createRemoteWorkspaceBinding(
    targetDirectory,
    workspaceRoot,
    profile,
    sourceControl.state,
    degraded,
  );

  const nextState: PersistedHostedRuntimeState = {
    ...existingState,
    version: existingState.version,
    updatedAt: now,
    profile,
    sourceControlAdapter,
    workspaceBinding,
    degraded,
    availability: createHostedAvailabilityState(profile),
  };

  return {
    state: await saveHostedRuntimeState(targetDirectory, nextState),
  };
}

export async function syncSessionHostedRuntimeState(
  sessionState: SessionState,
  options: HostedRuntimeDependencies = {},
): Promise<HostingWorkbenchState> {
  const result = await syncHostedRuntimeState(sessionState.targetDirectory, {
    ...options,
    targetsDirectory: options.targetsDirectory ?? sessionState.targetsDirectory,
  });
  const publicDeploymentUrl = resolveHostedPublicDeploymentUrl(sessionState, {
    serviceUrl: result.state.profile.serviceUrl,
    privatePreviewUrl: sessionState.workbenchState.previewState.url,
  });
  const workbenchState = createHostedWorkbenchState(result.state, {
    privatePreviewUrl: sessionState.workbenchState.previewState.url,
    publicDeploymentUrl,
  });

  sessionState.workbenchState.hosting = workbenchState;

  return workbenchState;
}
