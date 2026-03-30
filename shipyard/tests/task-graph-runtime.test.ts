import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ArtifactContent, ArtifactRecord } from "../src/artifacts/types.js";
import { saveArtifact } from "../src/artifacts/registry/index.js";
import {
  createDefaultHostedRuntimeState,
} from "../src/hosting/contracts.js";
import { saveHostedRuntimeState } from "../src/hosting/store.js";
import { buildBacklogArtifact } from "../src/pipeline/planning-artifacts.js";
import {
  createDefaultSourceControlState,
} from "../src/source-control/contracts.js";
import { saveSourceControlState } from "../src/source-control/store.js";
import { saveTddLane } from "../src/tdd/store.js";
import {
  assignTaskNode,
  syncTaskGraphState,
} from "../src/tasks/runtime.js";
import { loadTaskGraphState } from "../src/tasks/store.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function seedApprovedPlanningArtifacts(
  targetDirectory: string,
  options: {
    now: string;
    stories: Array<{
      id: string;
      epicId: string | null;
      title: string;
      dependencies?: string[];
      priority?: number;
    }>;
  },
): Promise<{
  backlogArtifact: ArtifactRecord<ArtifactContent>;
  storyArtifact: ArtifactRecord<ArtifactContent>;
  specArtifact: ArtifactRecord<ArtifactContent>;
}> {
  const storyArtifact = await saveArtifact(targetDirectory, {
    type: "user-story-artifact",
    id: "phase11-stories",
    status: "approved",
    producedBy: "pm",
    producedAt: options.now,
    approvedAt: options.now,
    approvedBy: "user",
    contentKind: "json",
    content: {
      title: "User stories",
      summary: "Approved runtime stories.",
      stories: options.stories.map((story, index) => ({
        id: story.id,
        epicId: story.epicId,
        title: story.title,
        userStory: `As an operator, I want ${story.title.toLowerCase()}, so that the factory can progress.`,
        acceptanceCriteria: [`Ship ${story.title}.`],
        edgeCases: [],
        dependencies: story.dependencies ?? [],
        estimatedComplexity: "Medium",
        priority: story.priority ?? (index + 1),
      })),
    },
  });

  const specArtifact = await saveArtifact(targetDirectory, {
    type: "technical-spec-artifact",
    id: "phase11-specs",
    status: "approved",
    producedBy: "pm",
    producedAt: options.now,
    approvedAt: options.now,
    approvedBy: "user",
    contentKind: "json",
    content: {
      title: "Technical specs",
      summary: "Approved runtime specs.",
      specs: options.stories.map((story, index) => ({
        id: `SPEC-${String(index + 1).padStart(3, "0")}`,
        storyId: story.id,
        title: `${story.title} spec`,
        overview: `Implement ${story.title.toLowerCase()}.`,
        dataModel: [],
        apiContract: [],
        componentStructure: [],
        stateManagement: "Store runtime state in Shipyard.",
        errorHandling: [],
        testExpectations: ["Add focused runtime coverage."],
        implementationOrder: ["contracts", "store", "runtime"],
        designReferences: [],
      })),
    },
  });

  const backlogArtifact = await saveArtifact(targetDirectory, {
    type: "backlog-artifact",
    id: "phase11-backlog",
    status: "approved",
    producedBy: "pm",
    producedAt: options.now,
    approvedAt: options.now,
    approvedBy: "user",
    contentKind: "json",
    content: buildBacklogArtifact([
      storyArtifact as ArtifactRecord<ArtifactContent>,
      specArtifact as ArtifactRecord<ArtifactContent>,
    ]) as unknown as ArtifactContent,
  });

  return {
    backlogArtifact: backlogArtifact as ArtifactRecord<ArtifactContent>,
    storyArtifact: storyArtifact as ArtifactRecord<ArtifactContent>,
    specArtifact: specArtifact as ArtifactRecord<ArtifactContent>,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("task graph runtime", () => {
  it("projects backlog artifacts into a story and task graph and computes deterministic board columns", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-graph-seed-");
    const now = "2026-03-28T17:10:00.000Z";

    await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-001",
          epicId: "EPIC-001",
          title: "Foundational story",
          priority: 1,
        },
        {
          id: "STORY-002",
          epicId: "EPIC-001",
          title: "Dependent story",
          dependencies: ["STORY-001"],
          priority: 2,
        },
      ],
    });

    const result = await syncTaskGraphState(targetDirectory, {
      now: () => now,
    });

    expect(result.state.storyNodes.map((story) => story.id)).toEqual([
      "STORY-001",
      "STORY-002",
    ]);
    expect(result.state.taskNodes.map((task) => task.storyId)).toEqual([
      "STORY-001",
      "STORY-002",
    ]);
    expect(result.state.dependencies).toHaveLength(1);

    const readyTask = result.state.taskNodes.find((task) => task.storyId === "STORY-001");
    const blockedTask = result.state.taskNodes.find((task) => task.storyId === "STORY-002");

    expect(readyTask).toMatchObject({
      status: "ready",
      phase: "spec-ready",
      blockedByTaskIds: [],
    });
    expect(blockedTask).toMatchObject({
      status: "blocked",
      blockedByTaskIds: [readyTask?.id],
    });

    expect(result.state.boardProjection.columns.map((column) => column.id)).toEqual([
      "ready",
      "blocked",
      "in_progress",
      "review",
      "done",
    ]);
    expect(result.state.boardProjection.columns.find((column) => column.id === "ready"))
      .toMatchObject({
        count: 1,
      });
    expect(result.state.boardProjection.columns.find((column) => column.id === "blocked"))
      .toMatchObject({
        count: 1,
      });
  });

  it("persists task graph state across restart", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-graph-persist-");
    const now = "2026-03-28T17:20:00.000Z";

    await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-010",
          epicId: "EPIC-010",
          title: "Persisted story",
        },
      ],
    });

    const synced = await syncTaskGraphState(targetDirectory, {
      now: () => now,
    });
    const reloaded = await loadTaskGraphState(targetDirectory);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.storyNodes).toEqual(synced.state.storyNodes);
    expect(reloaded?.boardProjection.summary).toContain("1 story");
  });

  it("surfaces source-control, hosted-runtime, TDD, and assignment metadata on nodes and board cards", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-graph-runtime-refs-");
    const now = "2026-03-28T17:30:00.000Z";

    const artifacts = await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-020",
          epicId: "EPIC-020",
          title: "Integrated runtime story",
        },
      ],
    });

    const sourceControlState = createDefaultSourceControlState(now);
    sourceControlState.updatedAt = now;
    sourceControlState.capability = {
      provider: "github",
      authMode: "github-token",
      source: "github-token-env",
      hostedSafe: true,
      available: true,
      actor: "shipyard-bot",
      summary: "Hosted-safe GitHub auth is ready.",
      reason: null,
    };
    sourceControlState.repository = {
      provider: "github",
      status: "bound",
      owner: "acme",
      repo: "factory-target",
      slug: "acme/factory-target",
      remoteName: "origin",
      remoteUrl: "https://github.com/acme/factory-target.git",
      defaultBranch: "main",
      defaultBranchRevision: 12,
      currentBranch: "feat/story-020",
      attachedAt: now,
      lastSyncedAt: now,
      rebindHint: null,
    };
    sourceControlState.degraded = {
      active: false,
      reason: null,
      summary: "GitHub source of truth is ready.",
      enteredAt: null,
      rebindHint: null,
    };
    sourceControlState.storyBranches = [
      {
        storyId: "STORY-020",
        title: "Integrated runtime story",
        kind: "feature",
        branchName: "feat/story-020",
        baseBranch: "main",
        createdFromRevision: 12,
        status: "ready",
        staleReason: null,
        latestPullRequestId: "pr-story-020",
        lastValidationAt: now,
        lastSyncAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
    sourceControlState.pullRequests = [
      {
        id: "pr-story-020",
        storyId: "STORY-020",
        title: "Integrate runtime story",
        headBranch: "feat/story-020",
        baseBranch: "main",
        status: "open",
        number: 42,
        url: "https://github.com/acme/factory-target/pull/42",
        reviewGuidance: null,
        ownerProfileId: "pr-ops",
        createdFromRevision: 12,
        validationStatus: "passed",
        createdAt: now,
        updatedAt: now,
        mergedAt: null,
        mergedBy: null,
      },
    ];
    await saveSourceControlState(targetDirectory, sourceControlState);

    const hostedState = createDefaultHostedRuntimeState(now, {
      targetDirectory,
      workspaceRoot: targetDirectory,
    });
    hostedState.updatedAt = now;
    hostedState.profile = {
      provider: "railway",
      active: true,
      mode: "persistent",
      workspaceRoot: targetDirectory,
      volumeMountPath: "/workspace",
      persistentRequired: true,
      mountHealthy: true,
      serviceUrl: "https://shipyard.example.com",
      serviceHealthUrl: "https://shipyard.example.com/api/health",
      accessProtected: true,
      modelProvider: "openai",
      modelName: "gpt-5.4",
    };
    hostedState.sourceControlAdapter = {
      provider: "github",
      authMode: "github-token",
      available: true,
      hostedSafe: true,
      summary: "Hosted-safe GitHub auth is ready.",
      reason: null,
    };
    hostedState.workspaceBinding = {
      targetDirectory,
      workspaceRoot: targetDirectory,
      relativeTargetPath: null,
      repositorySlug: "acme/factory-target",
      repositoryStatus: "bound",
      restoreStatus: "restored",
      lastResumedSessionId: "session-1",
      lastResumedAt: now,
      summary: "Restored from the persistent Railway workspace.",
    };
    hostedState.degraded = {
      active: false,
      reason: null,
      blockedActions: [],
      summary: "Hosted runtime is ready.",
    };
    hostedState.availability = {
      serviceUrl: "https://shipyard.example.com",
      serviceHealthUrl: "https://shipyard.example.com/api/health",
      privatePreviewUrl: "https://preview.example.com",
      previewVisibility: "private",
      publicDeploymentUrl: "https://factory-target.example.com",
      summary: "Hosted runtime and preview are available.",
    };
    await saveHostedRuntimeState(targetDirectory, hostedState);

    await saveTddLane(targetDirectory, {
      version: 1,
      laneId: "lane-story-020",
      status: "running",
      currentStage: "implementer",
      createdAt: now,
      updatedAt: now,
      startedBy: "operator",
      focusedValidationCommand: "pnpm vitest run tests/story-020.test.ts",
      selection: {
        artifact: {
          type: artifacts.specArtifact.metadata.type,
          id: artifacts.specArtifact.metadata.id,
          version: artifacts.specArtifact.metadata.version,
        },
        storyId: "STORY-020",
        specId: "SPEC-001",
      },
      requestPropertyCheck: false,
      requestMutationCheck: false,
      immutableTestPaths: ["tests/story-020.test.ts"],
      implementationPaths: ["src/story-020.ts"],
      stageAttempts: {
        testAuthor: 1,
        implementer: 1,
        reviewer: 0,
      },
      focusedValidation: null,
      optionalChecks: [],
      latestHandoffArtifact: null,
      latestEscalationArtifact: null,
      latestQualityArtifact: {
        type: "tdd-quality-report",
        id: "quality-story-020",
        version: 1,
      },
      lastSummary: "Implementer is working on STORY-020.",
      auditTrail: [],
    });

    let synced = await syncTaskGraphState(targetDirectory, {
      now: () => now,
    });

    const taskId = synced.state.taskNodes[0]?.id;
    expect(taskId).toBeTruthy();

    await assignTaskNode(targetDirectory, {
      nodeId: taskId ?? "",
      ownerRoleId: "implementer",
      assignedByRoleId: "coordinator",
      summary: "Implementer owns the story delivery task.",
      now: () => now,
    });

    synced = await syncTaskGraphState(targetDirectory, {
      now: () => now,
    });

    expect(synced.state.storyNodes[0]).toMatchObject({
      id: "STORY-020",
      specId: "SPEC-001",
    });

    expect(synced.state.taskNodes[0]).toMatchObject({
      storyId: "STORY-020",
      status: "in_progress",
      phase: "green",
      sourceControl: {
        repositorySlug: "acme/factory-target",
        branchName: "feat/story-020",
        reviewRequestNumber: 42,
        degraded: false,
        freshnessAt: now,
      },
      hostedWorkspace: {
        provider: "railway",
        mode: "persistent",
        privatePreviewUrl: "https://preview.example.com",
        publicDeploymentUrl: "https://factory-target.example.com",
        freshnessAt: now,
      },
      tdd: {
        laneId: "lane-story-020",
        stage: "implementer",
        status: "running",
      },
    });

    expect(synced.state.assignments[0]).toMatchObject({
      nodeId: taskId,
      ownerRoleId: "implementer",
      assignedByRoleId: "coordinator",
    });

    expect(synced.state.boardProjection.columns.find((column) => column.id === "in_progress"))
      .toMatchObject({
        count: 1,
        cards: [
          expect.objectContaining({
            storyId: "STORY-020",
            ownerRoleId: "implementer",
            phase: "green",
            sourceControl: expect.objectContaining({
              branchName: "feat/story-020",
              reviewRequestNumber: 42,
              degraded: false,
            }),
          }),
        ],
      });
  });
});
