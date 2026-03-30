import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DiscoveryReport } from "../src/artifacts/types.js";
import { createSessionState } from "../src/engine/state.js";
import { SOURCE_CONTROL_PR_OPS_ROLE_ID } from "../src/source-control/contracts.js";
import {
  attachRepositoryBinding,
  getSourceControlActionOwnerProfileId,
  mergePullRequest,
  openPullRequest,
  provisionStoryBranch,
  resolveSourceControlCapability,
  syncSessionSourceControlState,
  syncSourceControlState,
  type GitRepositoryInspection,
  type GitHubCliAuthStatus,
} from "../src/source-control/runtime.js";
import { loadSourceControlState } from "../src/source-control/store.js";
import { createSessionStateMessage } from "../src/ui/events.js";

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
    projectName: "shipyard-source-control-runtime",
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
  overrides: Partial<GitRepositoryInspection> = {},
): GitRepositoryInspection {
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
  overrides: Partial<GitHubCliAuthStatus> = {},
): GitHubCliAuthStatus {
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

describe("source-control runtime", () => {
  it("prefers a hosted-safe auth adapter when local gh is unavailable", async () => {
    const capability = await resolveSourceControlCapability({
      env: {
        GITHUB_TOKEN: "token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
    });

    expect(capability).toMatchObject({
      authMode: "github-token",
      hostedSafe: true,
      available: true,
    });
  });

  it("falls back to explicit degraded local mode when github auth is absent", async () => {
    const targetDirectory = await createTempDirectory("shipyard-source-control-degraded-");

    const result = await syncSourceControlState(targetDirectory, {
      env: {},
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () =>
        createGitInspection({
          remoteUrl: null,
          remoteName: null,
        }),
    });

    expect(result.state.capability.authMode).toBe("degraded-local");
    expect(result.state.degraded.active).toBe(true);
    expect(result.state.repository.status).toBe("local_only");
    expect(result.state.degraded.summary).toContain("Managed local git mode");
  });

  it("persists repo binding and degraded-source state across restart", async () => {
    const targetDirectory = await createTempDirectory("shipyard-source-control-persist-");

    const initialSync = await syncSourceControlState(targetDirectory, {
      env: {},
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    });

    expect(initialSync.state.repository.status).toBe("bound");
    expect(initialSync.state.degraded.active).toBe(true);

    const rebound = await attachRepositoryBinding(
      targetDirectory,
      {
        owner: "acme",
        repo: "shipyard-target",
        defaultBranch: "main",
      },
      {
        env: {
          GITHUB_TOKEN: "token",
        },
        inspectGitHubCliAuth: async () => createCliAuthStatus(),
        inspectGitRepository: async () => createGitInspection(),
      },
    );

    expect(rebound.state.repository.slug).toBe("acme/shipyard-target");
    expect(rebound.state.degraded.active).toBe(false);

    const reloaded = await loadSourceControlState(targetDirectory);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.repository.slug).toBe("acme/shipyard-target");
    expect(reloaded?.degraded.active).toBe(false);
  });

  it("marks later conflicting work stale after first merge wins", async () => {
    const targetDirectory = await createTempDirectory("shipyard-source-control-stale-");
    const runtimeOptions = {
      env: {
        GITHUB_TOKEN: "token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    };

    const prOne = await openPullRequest(targetDirectory, {
      ...runtimeOptions,
      storyId: "STORY-001",
      title: "Add canonical repo binding",
      validationStatus: "passed",
    });
    const prTwo = await openPullRequest(targetDirectory, {
      ...runtimeOptions,
      storyId: "STORY-002",
      title: "Add merge recovery flow",
      validationStatus: "passed",
    });

    const mergeOne = await mergePullRequest(targetDirectory, {
      ...runtimeOptions,
      pullRequestId: prOne.pullRequest.id,
      validationPassed: true,
    });

    expect(mergeOne.decision.status).toBe("merged");

    const stalePullRequest = mergeOne.state.pullRequests.find((pullRequest) =>
      pullRequest.id === prTwo.pullRequest.id
    );
    const staleBranch = mergeOne.state.storyBranches.find((branch) =>
      branch.storyId === "STORY-002"
    );

    expect(stalePullRequest?.status).toBe("stale");
    expect(staleBranch?.status).toBe("stale");
    expect(mergeOne.state.conflictTickets).toHaveLength(1);
    expect(mergeOne.state.conflictTickets[0]?.ownerProfileId).toBe(
      SOURCE_CONTROL_PR_OPS_ROLE_ID,
    );
  });

  it("routes merge work through a dedicated pr-ops role and creates a conflict-resolution ticket instead of silently force merging", async () => {
    const targetDirectory = await createTempDirectory("shipyard-source-control-merge-");
    const runtimeOptions = {
      env: {
        GITHUB_TOKEN: "token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
    };

    const firstBranch = await provisionStoryBranch(targetDirectory, {
      ...runtimeOptions,
      storyId: "STORY-101",
      title: "Winning branch",
    });
    const secondBranch = await provisionStoryBranch(targetDirectory, {
      ...runtimeOptions,
      storyId: "STORY-102",
      title: "Later conflicting branch",
    });

    const firstPr = await openPullRequest(targetDirectory, {
      ...runtimeOptions,
      storyId: firstBranch.branch.storyId,
      title: firstBranch.branch.title,
      validationStatus: "passed",
    });
    const secondPr = await openPullRequest(targetDirectory, {
      ...runtimeOptions,
      storyId: secondBranch.branch.storyId,
      title: secondBranch.branch.title,
      validationStatus: "passed",
    });

    await mergePullRequest(targetDirectory, {
      ...runtimeOptions,
      pullRequestId: firstPr.pullRequest.id,
      validationPassed: true,
    });

    const blockedMerge = await mergePullRequest(targetDirectory, {
      ...runtimeOptions,
      pullRequestId: secondPr.pullRequest.id,
      validationPassed: true,
    });

    expect(getSourceControlActionOwnerProfileId("merge-pull-request")).toBe(
      SOURCE_CONTROL_PR_OPS_ROLE_ID,
    );
    expect(blockedMerge.ownerProfileId).toBe(SOURCE_CONTROL_PR_OPS_ROLE_ID);
    expect(blockedMerge.decision.status).toBe("blocked");
    expect(blockedMerge.conflictTicket).not.toBeNull();
    expect(blockedMerge.conflictTicket?.branchName).toBe(
      secondPr.pullRequest.headBranch,
    );
  });

  it("publishes source-control metadata for downstream board or coordinator consumers", async () => {
    const targetDirectory = await createTempDirectory("shipyard-source-control-session-");
    const sessionState = createSessionState({
      sessionId: "source-control-session",
      targetDirectory,
      discovery: createDiscovery(),
    });

    await openPullRequest(targetDirectory, {
      env: {
        GITHUB_TOKEN: "token",
      },
      inspectGitHubCliAuth: async () => createCliAuthStatus(),
      inspectGitRepository: async () => createGitInspection(),
      storyId: "STORY-201",
      title: "Publish source-control state",
      validationStatus: "passed",
      number: 42,
      url: "https://github.com/acme/shipyard-target/pull/42",
    });
    await syncSessionSourceControlState(sessionState, {
      env: {
        GITHUB_TOKEN: "token",
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
      throw new Error("Expected session:state message.");
    }

    expect(message.workbenchState.sourceControl).toMatchObject({
      repositorySlug: "acme/shipyard-target",
      authMode: "github-token",
      openPullRequestNumber: 42,
      ownerProfileId: SOURCE_CONTROL_PR_OPS_ROLE_ID,
    });
    expect(message.workbenchState.sourceControl.summary).toContain("#42");
  });
});
