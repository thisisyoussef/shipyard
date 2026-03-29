import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DiscoveryReport } from "../src/artifacts/types.js";
import {
  createSessionState,
  saveSessionState,
} from "../src/engine/state.js";
import {
  loadHostedRuntimeState,
} from "../src/hosting/store.js";
import {
  syncHostedRuntimeState,
  syncSessionHostedRuntimeState,
  type HostedRuntimeGitRepositoryInspection,
  type HostedRuntimeGitHubCliAuthStatus,
} from "../src/hosting/runtime.js";
import { createSessionStateMessage } from "../src/ui/events.js";
import { createInitialDeploySummary } from "../src/ui/workbench-state.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery(): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json", "README.md"],
    topLevelDirectories: ["src", "tests"],
    projectName: "shipyard-hosted-runtime",
    previewCapability: {
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      command: null,
      reason: "No preview configured.",
      autoRefresh: "none",
    },
  };
}

function createGitInspection(
  overrides: Partial<HostedRuntimeGitRepositoryInspection> = {},
): HostedRuntimeGitRepositoryInspection {
  return {
    isGitRepository: true,
    currentBranch: "main",
    remoteName: "origin",
    remoteUrl: "https://github.com/acme/shipyard-target.git",
    defaultBranch: "main",
    ...overrides,
  };
}

function createCliAuthStatus(
  overrides: Partial<HostedRuntimeGitHubCliAuthStatus> = {},
): HostedRuntimeGitHubCliAuthStatus {
  return {
    authenticated: false,
    actor: null,
    reason: "gh auth unavailable",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("hosting runtime", () => {
  it("boots a railway-hosted profile without assuming local gh auth", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-runtime-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    await mkdir(targetDirectory, { recursive: true });

    const result = await syncHostedRuntimeState(targetDirectory, {
      targetsDirectory,
      env: {
        SHIPYARD_TARGETS_DIR: targetsDirectory,
        SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE: "1",
        RAILWAY_VOLUME_MOUNT_PATH: targetsDirectory,
        RAILWAY_PUBLIC_DOMAIN: "shipyard-production.up.railway.app",
        SHIPYARD_ACCESS_TOKEN: "shared-secret",
        SHIPYARD_MODEL_PROVIDER: "anthropic",
        SHIPYARD_ANTHROPIC_MODEL: "claude-opus-4-6",
        GITHUB_TOKEN: "github-token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    });

    expect(result.state.profile).toMatchObject({
      provider: "railway",
      active: true,
      mode: "persistent",
      workspaceRoot: targetsDirectory,
      volumeMountPath: targetsDirectory,
      serviceUrl: "https://shipyard-production.up.railway.app",
      accessProtected: true,
    });
    expect(result.state.sourceControlAdapter).toMatchObject({
      authMode: "github-token",
      hostedSafe: true,
      available: true,
    });
  });

  it("falls back to explicit degraded hosted mode when github auth is missing", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-degraded-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    await mkdir(targetDirectory, { recursive: true });

    const result = await syncHostedRuntimeState(targetDirectory, {
      targetsDirectory,
      env: {
        SHIPYARD_TARGETS_DIR: targetsDirectory,
        SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE: "1",
        RAILWAY_VOLUME_MOUNT_PATH: targetsDirectory,
        RAILWAY_PUBLIC_DOMAIN: "shipyard-production.up.railway.app",
      },
      inspectGitHubCliAuth: async () =>
        createCliAuthStatus({
          authenticated: true,
          actor: "local-gh-user",
          reason: null,
        }),
      inspectGitRepository: async () =>
        createGitInspection({
          remoteUrl: null,
          remoteName: null,
        }),
    });

    expect(result.state.sourceControlAdapter).toMatchObject({
      authMode: "github-cli",
      hostedSafe: false,
      available: false,
    });
    expect(result.state.degraded).toMatchObject({
      active: true,
      blockedActions: [
        "attach_repository",
        "open_pull_request",
        "merge_pull_request",
      ],
    });
    expect(result.state.degraded.summary).toContain(
      "Planning, TDD, and standard code turns remain available",
    );
  });

  it("keeps non-merge phases usable in degraded hosted mode", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-usable-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    await mkdir(targetDirectory, { recursive: true });

    const result = await syncHostedRuntimeState(targetDirectory, {
      targetsDirectory,
      env: {
        SHIPYARD_TARGETS_DIR: targetsDirectory,
        SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE: "1",
        RAILWAY_VOLUME_MOUNT_PATH: targetsDirectory,
        RAILWAY_PUBLIC_DOMAIN: "shipyard-production.up.railway.app",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () =>
        createGitInspection({
          remoteUrl: null,
          remoteName: null,
        }),
    });

    expect(result.state.degraded.active).toBe(true);
    expect(result.state.degraded.blockedActions).toEqual([
      "attach_repository",
      "open_pull_request",
      "merge_pull_request",
    ]);
    expect(result.state.degraded.summary).not.toContain("planning is blocked");
    expect(result.state.degraded.summary).not.toContain("TDD is blocked");
  });

  it("persists hosted runtime profile and workspace binding across restart", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-persist-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    await mkdir(targetDirectory, { recursive: true });

    await syncHostedRuntimeState(targetDirectory, {
      targetsDirectory,
      env: {
        SHIPYARD_TARGETS_DIR: targetsDirectory,
        SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE: "1",
        RAILWAY_VOLUME_MOUNT_PATH: targetsDirectory,
        RAILWAY_PUBLIC_DOMAIN: "shipyard-production.up.railway.app",
        GITHUB_TOKEN: "github-token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    });

    const reloaded = await loadHostedRuntimeState(targetDirectory);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.profile).toMatchObject({
      provider: "railway",
      active: true,
      mode: "persistent",
    });
    expect(reloaded?.workspaceBinding).toMatchObject({
      targetDirectory,
      workspaceRoot: targetsDirectory,
      relativeTargetPath: "demo-app",
      repositorySlug: "acme/shipyard-target",
    });
  });

  it("restores a github-bound project inside the persistent railway workspace", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-restore-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    await mkdir(targetDirectory, { recursive: true });

    const sessionState = createSessionState({
      sessionId: "restored-session",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });
    sessionState.lastActiveAt = "2026-03-28T20:00:00.000Z";
    await saveSessionState(sessionState);

    const result = await syncHostedRuntimeState(targetDirectory, {
      targetsDirectory,
      env: {
        SHIPYARD_TARGETS_DIR: targetsDirectory,
        SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE: "1",
        RAILWAY_VOLUME_MOUNT_PATH: targetsDirectory,
        RAILWAY_PUBLIC_DOMAIN: "shipyard-production.up.railway.app",
        GITHUB_TOKEN: "github-token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    });

    expect(result.state.workspaceBinding).toMatchObject({
      restoreStatus: "restored",
      lastResumedSessionId: "restored-session",
      lastResumedAt: "2026-03-28T20:00:00.000Z",
      repositorySlug: "acme/shipyard-target",
    });
  });

  it("publishes hosted availability metadata for downstream board or coordinator consumers", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-session-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    await mkdir(targetDirectory, { recursive: true });

    const sessionState = createSessionState({
      sessionId: "hosted-session",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });
    sessionState.workbenchState.previewState = {
      status: "running",
      summary: "Private loopback preview is running.",
      url: "http://127.0.0.1:4173",
      logTail: [],
      lastRestartReason: null,
    };
    sessionState.workbenchState.latestDeploy = createInitialDeploySummary({
      status: "success",
      available: true,
      unavailableReason: null,
      productionUrl: "https://shipyard-demo.vercel.app",
      summary: "Deploy completed. Public URL: https://shipyard-demo.vercel.app",
      requestedAt: "2026-03-28T20:05:00.000Z",
      completedAt: "2026-03-28T20:06:00.000Z",
    });

    await syncSessionHostedRuntimeState(sessionState, {
      targetsDirectory,
      env: {
        SHIPYARD_TARGETS_DIR: targetsDirectory,
        SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE: "1",
        RAILWAY_VOLUME_MOUNT_PATH: targetsDirectory,
        RAILWAY_PUBLIC_DOMAIN: "shipyard-production.up.railway.app",
        GITHUB_TOKEN: "github-token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    });

    const message = createSessionStateMessage({
      sessionState,
      connectionState: "ready",
      projectRulesLoaded: true,
      sessionHistory: [],
      workspaceDirectory: path.dirname(targetDirectory),
    });

    expect(message.type).toBe("session:state");
    if (message.type !== "session:state") {
      throw new Error(`Expected session:state message, received ${message.type}`);
    }

    expect(message.workbenchState.hosting).toMatchObject({
      active: true,
      provider: "railway",
      authMode: "github-token",
      repositorySlug: "acme/shipyard-target",
      serviceUrl: "https://shipyard-production.up.railway.app",
      privatePreviewUrl: "http://127.0.0.1:4173",
      publicDeploymentUrl: "https://shipyard-demo.vercel.app",
      previewVisibility: "private",
      degraded: false,
    });
    expect(message.workbenchState.hosting.summary).toContain(
      "https://shipyard-production.up.railway.app",
    );
    expect(message.workbenchState.hosting.summary).toContain(
      "https://shipyard-demo.vercel.app",
    );
  });
});
