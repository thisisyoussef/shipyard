import { z } from "zod";

import {
  repositoryBindingStatusSchema,
  sourceControlAuthModeSchema,
} from "../source-control/contracts.js";

export const HOSTED_RUNTIME_STATE_VERSION = 1;

export const hostedRuntimeProviderSchema = z.enum(["local", "railway"]);
export const hostedRuntimeModeSchema = z.enum(["local", "hosted", "persistent"]);
export const hostedRestoreStatusSchema = z.enum([
  "local",
  "restored",
  "synced",
  "degraded",
]);
export const hostedPreviewVisibilitySchema = z.enum([
  "private",
  "not_available",
]);
export const hostedBlockedActionSchema = z.enum([
  "attach_repository",
  "open_pull_request",
  "merge_pull_request",
]);

export const hostedFactoryRuntimeProfileSchema = z.object({
  provider: hostedRuntimeProviderSchema,
  active: z.boolean(),
  mode: hostedRuntimeModeSchema,
  workspaceRoot: z.string().trim().min(1),
  volumeMountPath: z.string().nullable(),
  persistentRequired: z.boolean(),
  mountHealthy: z.boolean(),
  serviceUrl: z.string().nullable(),
  serviceHealthUrl: z.string().nullable(),
  accessProtected: z.boolean(),
  modelProvider: z.string().nullable(),
  modelName: z.string().nullable(),
});

export const hostedSourceControlAdapterSchema = z.object({
  provider: z.literal("github"),
  authMode: sourceControlAuthModeSchema.nullable(),
  available: z.boolean(),
  hostedSafe: z.boolean(),
  summary: z.string().trim().min(1),
  reason: z.string().nullable(),
});

export const remoteWorkspaceBindingSchema = z.object({
  targetDirectory: z.string().trim().min(1),
  workspaceRoot: z.string().trim().min(1),
  relativeTargetPath: z.string().nullable(),
  repositorySlug: z.string().nullable(),
  repositoryStatus: repositoryBindingStatusSchema,
  restoreStatus: hostedRestoreStatusSchema,
  lastResumedSessionId: z.string().nullable(),
  lastResumedAt: z.string().nullable(),
  summary: z.string().trim().min(1),
});

export const hostedDegradedStateSchema = z.object({
  active: z.boolean(),
  reason: z.string().nullable(),
  blockedActions: z.array(hostedBlockedActionSchema),
  summary: z.string().trim().min(1),
});

export const hostedAvailabilityStateSchema = z.object({
  serviceUrl: z.string().nullable(),
  serviceHealthUrl: z.string().nullable(),
  privatePreviewUrl: z.string().nullable(),
  previewVisibility: hostedPreviewVisibilitySchema,
  publicDeploymentUrl: z.string().nullable(),
  summary: z.string().trim().min(1),
});

export const persistedHostedRuntimeStateSchema = z.object({
  version: z.literal(HOSTED_RUNTIME_STATE_VERSION),
  updatedAt: z.string().trim().min(1),
  profile: hostedFactoryRuntimeProfileSchema,
  sourceControlAdapter: hostedSourceControlAdapterSchema,
  workspaceBinding: remoteWorkspaceBindingSchema,
  degraded: hostedDegradedStateSchema,
  availability: hostedAvailabilityStateSchema,
});

export const hostingWorkbenchStateSchema = z.object({
  active: z.boolean(),
  provider: hostedRuntimeProviderSchema,
  mode: hostedRuntimeModeSchema,
  workspaceRoot: z.string().nullable(),
  relativeTargetPath: z.string().nullable(),
  repositorySlug: z.string().nullable(),
  authMode: sourceControlAuthModeSchema.nullable(),
  hostedSafeGitHubAuth: z.boolean(),
  accessProtected: z.boolean(),
  serviceUrl: z.string().nullable(),
  serviceHealthUrl: z.string().nullable(),
  privatePreviewUrl: z.string().nullable(),
  previewVisibility: hostedPreviewVisibilitySchema,
  publicDeploymentUrl: z.string().nullable(),
  degraded: z.boolean(),
  blockedActions: z.array(hostedBlockedActionSchema),
  summary: z.string().trim().min(1),
  updatedAt: z.string().nullable(),
});

export type HostedRuntimeProvider = z.infer<typeof hostedRuntimeProviderSchema>;
export type HostedRuntimeMode = z.infer<typeof hostedRuntimeModeSchema>;
export type HostedRestoreStatus = z.infer<typeof hostedRestoreStatusSchema>;
export type HostedPreviewVisibility = z.infer<typeof hostedPreviewVisibilitySchema>;
export type HostedBlockedAction = z.infer<typeof hostedBlockedActionSchema>;
export type HostedFactoryRuntimeProfile = z.infer<
  typeof hostedFactoryRuntimeProfileSchema
>;
export type HostedSourceControlAdapter = z.infer<
  typeof hostedSourceControlAdapterSchema
>;
export type RemoteWorkspaceBinding = z.infer<typeof remoteWorkspaceBindingSchema>;
export type HostedDegradedState = z.infer<typeof hostedDegradedStateSchema>;
export type HostedAvailabilityState = z.infer<
  typeof hostedAvailabilityStateSchema
>;
export type PersistedHostedRuntimeState = z.infer<
  typeof persistedHostedRuntimeStateSchema
>;
export type HostingWorkbenchState = z.infer<typeof hostingWorkbenchStateSchema>;

export function createDefaultHostedRuntimeProfile(
  workspaceRoot: string,
): HostedFactoryRuntimeProfile {
  return {
    provider: "local",
    active: false,
    mode: "local",
    workspaceRoot,
    volumeMountPath: null,
    persistentRequired: false,
    mountHealthy: true,
    serviceUrl: null,
    serviceHealthUrl: null,
    accessProtected: false,
    modelProvider: null,
    modelName: null,
  };
}

export function createDefaultHostedSourceControlAdapter(): HostedSourceControlAdapter {
  return {
    provider: "github",
    authMode: null,
    available: false,
    hostedSafe: false,
    summary: "Hosted GitHub auth has not been evaluated yet.",
    reason: "Hosted GitHub auth has not been evaluated yet.",
  };
}

export function createDefaultRemoteWorkspaceBinding(
  targetDirectory: string,
  workspaceRoot: string,
): RemoteWorkspaceBinding {
  return {
    targetDirectory,
    workspaceRoot,
    relativeTargetPath: null,
    repositorySlug: null,
    repositoryStatus: "local_only",
    restoreStatus: "local",
    lastResumedSessionId: null,
    lastResumedAt: null,
    summary: "Hosted workspace binding has not been evaluated yet.",
  };
}

export function createDefaultHostedDegradedState(): HostedDegradedState {
  return {
    active: false,
    reason: null,
    blockedActions: [],
    summary: "Hosted runtime is inactive.",
  };
}

export function createDefaultHostedAvailabilityState(): HostedAvailabilityState {
  return {
    serviceUrl: null,
    serviceHealthUrl: null,
    privatePreviewUrl: null,
    previewVisibility: "not_available",
    publicDeploymentUrl: null,
    summary: "Hosted runtime is inactive.",
  };
}

export function createDefaultHostedRuntimeState(
  now: string,
  options: {
    targetDirectory: string;
    workspaceRoot: string;
  },
): PersistedHostedRuntimeState {
  return {
    version: HOSTED_RUNTIME_STATE_VERSION,
    updatedAt: now,
    profile: createDefaultHostedRuntimeProfile(options.workspaceRoot),
    sourceControlAdapter: createDefaultHostedSourceControlAdapter(),
    workspaceBinding: createDefaultRemoteWorkspaceBinding(
      options.targetDirectory,
      options.workspaceRoot,
    ),
    degraded: createDefaultHostedDegradedState(),
    availability: createDefaultHostedAvailabilityState(),
  };
}

function createHostedAvailabilitySummary(
  serviceUrl: string | null,
  privatePreviewUrl: string | null,
  publicDeploymentUrl: string | null,
): string {
  const servicePart = serviceUrl
    ? `Shipyard service: ${serviceUrl}.`
    : "Shipyard service URL is not published yet.";
  const previewPart = privatePreviewUrl
    ? `Private preview: ${privatePreviewUrl}.`
    : "Private preview is not currently running.";
  const deployPart = publicDeploymentUrl
    ? `Public target URL: ${publicDeploymentUrl}.`
    : "No public target deploy URL is available yet.";

  return [servicePart, previewPart, deployPart].join(" ");
}

export function createHostedWorkbenchState(
  state: PersistedHostedRuntimeState,
  options?: {
    privatePreviewUrl?: string | null;
    publicDeploymentUrl?: string | null;
  },
): HostingWorkbenchState {
  const privatePreviewUrl =
    options?.privatePreviewUrl ?? state.availability.privatePreviewUrl;
  const publicDeploymentUrl =
    options?.publicDeploymentUrl ?? state.availability.publicDeploymentUrl;
  const summary = state.degraded.active
    ? `${state.degraded.summary} ${createHostedAvailabilitySummary(
        state.profile.serviceUrl,
        privatePreviewUrl,
        publicDeploymentUrl,
      )}`
    : createHostedAvailabilitySummary(
        state.profile.serviceUrl,
        privatePreviewUrl,
        publicDeploymentUrl,
      );

  return {
    active: state.profile.active,
    provider: state.profile.provider,
    mode: state.profile.mode,
    workspaceRoot: state.profile.workspaceRoot,
    relativeTargetPath: state.workspaceBinding.relativeTargetPath,
    repositorySlug: state.workspaceBinding.repositorySlug,
    authMode: state.sourceControlAdapter.authMode,
    hostedSafeGitHubAuth: state.sourceControlAdapter.hostedSafe,
    accessProtected: state.profile.accessProtected,
    serviceUrl: state.profile.serviceUrl,
    serviceHealthUrl: state.profile.serviceHealthUrl,
    privatePreviewUrl,
    previewVisibility: privatePreviewUrl ? "private" : "not_available",
    publicDeploymentUrl,
    degraded: state.degraded.active,
    blockedActions: [...state.degraded.blockedActions],
    summary,
    updatedAt: state.updatedAt,
  };
}

export function createDefaultHostingWorkbenchState(): HostingWorkbenchState {
  return {
    active: false,
    provider: "local",
    mode: "local",
    workspaceRoot: null,
    relativeTargetPath: null,
    repositorySlug: null,
    authMode: null,
    hostedSafeGitHubAuth: false,
    accessProtected: false,
    serviceUrl: null,
    serviceHealthUrl: null,
    privatePreviewUrl: null,
    previewVisibility: "not_available",
    publicDeploymentUrl: null,
    degraded: false,
    blockedActions: [],
    summary: "Hosted runtime state has not been synced yet.",
    updatedAt: null,
  };
}
