import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ArtifactContent, ArtifactRecord, DiscoveryReport } from "../src/artifacts/types.js";
import { saveArtifact } from "../src/artifacts/registry/index.js";
import { createSessionState } from "../src/engine/state.js";
import {
  createDefaultHostedRuntimeState,
  type PersistedHostedRuntimeState,
} from "../src/hosting/contracts.js";
import { saveHostedRuntimeState } from "../src/hosting/store.js";
import {
  advanceCoordinatorRun,
  completeCoordinatorWorkerTurn,
  syncSessionOrchestrationState,
} from "../src/orchestration/runtime.js";
import { buildBacklogArtifact } from "../src/pipeline/planning-artifacts.js";
import {
  mergePullRequest,
  openPullRequest,
} from "../src/source-control/runtime.js";
import { loadOrchestrationState } from "../src/orchestration/store.js";

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
      build: "vite build",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json", "README.md"],
    topLevelDirectories: ["src", "tests"],
    projectName: "shipyard-orchestration-runtime",
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
      summary: "Approved orchestration stories.",
      stories: options.stories.map((story, index) => ({
        id: story.id,
        epicId: story.epicId,
        title: story.title,
        userStory: `As an operator, I want ${story.title.toLowerCase()}, so the coordinator can move work forward.`,
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
      summary: "Approved orchestration specs.",
      specs: options.stories.map((story, index) => ({
        id: `SPEC-${String(index + 1).padStart(3, "0")}`,
        storyId: story.id,
        title: `${story.title} spec`,
        overview: `Implement ${story.title.toLowerCase()}.`,
        dataModel: [],
        apiContract: [],
        componentStructure: [],
        stateManagement: "Persist orchestration state under .shipyard/orchestration.",
        errorHandling: [],
        testExpectations: ["Add runtime coverage."],
        implementationOrder: ["contracts", "runtime", "projection"],
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

async function savePersistentHostedRuntime(
  targetDirectory: string,
  targetsDirectory: string,
  now: string,
): Promise<PersistedHostedRuntimeState> {
  const state = createDefaultHostedRuntimeState(now, {
    targetDirectory,
    workspaceRoot: targetsDirectory,
  });
  state.updatedAt = now;
  state.profile = {
    ...state.profile,
    provider: "railway",
    active: true,
    mode: "persistent",
    volumeMountPath: targetsDirectory,
    persistentRequired: true,
    serviceUrl: "https://shipyard.up.railway.app",
    serviceHealthUrl: "https://shipyard.up.railway.app/health",
    accessProtected: true,
    modelProvider: "openai",
    modelName: "gpt-5.4",
  };
  state.workspaceBinding = {
    ...state.workspaceBinding,
    relativeTargetPath: path.basename(targetDirectory),
    repositorySlug: "acme/factory-target",
    repositoryStatus: "bound",
    restoreStatus: "restored",
    summary: "Persistent Railway workspace is restored and ready.",
  };
  state.degraded = {
    active: false,
    reason: null,
    blockedActions: [],
    summary: "Hosted runtime is healthy.",
  };

  return await saveHostedRuntimeState(targetDirectory, state);
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("orchestration runtime", () => {
  it("schedules only dependency-ready tasks, respects hosted capacity, and publishes compact projection state", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-orch-capacity-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    const now = "2026-03-28T23:15:00.000Z";

    await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-001",
          epicId: "EPIC-001",
          title: "Coordinator foundation",
          priority: 1,
        },
        {
          id: "STORY-002",
          epicId: "EPIC-001",
          title: "Dependent follow-up",
          dependencies: ["STORY-001"],
          priority: 2,
        },
        {
          id: "STORY-003",
          epicId: "EPIC-001",
          title: "Independent background task",
          priority: 3,
        },
      ],
    });
    const hostedRuntimeState = await savePersistentHostedRuntime(
      targetDirectory,
      targetsDirectory,
      now,
    );
    const sessionState = createSessionState({
      sessionId: "coord-capacity",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });

    const result = await advanceCoordinatorRun(sessionState, {
      brief: "Ship the approved runtime stories.",
      now: () => now,
      hostedRuntimeState,
    });

    expect(result.decision.kind).toBe("dispatch");
    expect(result.state.projection).toMatchObject({
      mode: "task-graph",
      maxWorkers: 2,
      activeWorkerCount: 2,
      readyTaskCount: 2,
      blockedTaskCount: 1,
    });
    expect(result.state.activeRun?.workers.map((worker) => worker.storyId)).toEqual([
      "STORY-003",
      "STORY-001",
    ]);
    expect(result.state.activeRun?.workers.every((worker) => worker.storyId !== "STORY-002"))
      .toBe(true);
    expect(result.state.projection.hostedCapacitySummary).toContain("two worker slots");
  });

  it("halts on approval wait states and honors human reprioritization once the gate clears", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-orch-approval-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    const now = "2026-03-28T23:20:00.000Z";

    await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-010",
          epicId: "EPIC-010",
          title: "Default first task",
          priority: 1,
        },
        {
          id: "STORY-011",
          epicId: "EPIC-010",
          title: "Second task",
          priority: 2,
        },
      ],
    });
    const sessionState = createSessionState({
      sessionId: "coord-approval",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });
    sessionState.workbenchState.pipelineState = {
      activeRunId: "pipeline-001",
      pipelineId: "default",
      pipelineTitle: "Default planning pipeline",
      status: "awaiting_approval",
      currentPhaseId: "technical-specs",
      currentPhaseTitle: "Technical Specs",
      currentPhaseIndex: 4,
      totalPhases: 6,
      waitingForApproval: true,
      approvalMode: "required",
      pendingArtifact: "technical-spec-artifact/phase11-specs@1",
      latestArtifact: "technical-spec-artifact/phase11-specs@1",
      summary: "Waiting for approval on the technical specs.",
      updatedAt: now,
      recentAudit: [],
    };

    const waiting = await advanceCoordinatorRun(sessionState, {
      brief: "Start the coordinator.",
      now: () => now,
    });

    expect(waiting.decision.kind).toBe("wait");
    expect(waiting.state.projection.waitingForApproval).toBe(true);

    sessionState.workbenchState.pipelineState = null;

    const reprioritized = await advanceCoordinatorRun(sessionState, {
      brief: "Start the coordinator.",
      now: () => "2026-03-28T23:21:00.000Z",
      pendingHumanFeedback: [
        {
          text: "reprioritize STORY-011",
          submittedAt: "2026-03-28T23:20:30.000Z",
        },
      ],
    });

    expect(reprioritized.decision.kind).toBe("dispatch");
    if (reprioritized.decision.kind !== "dispatch") {
      throw new Error("Expected a dispatch decision.");
    }
    expect(reprioritized.decision.worker.storyId).toBe("STORY-011");
    expect(reprioritized.state.activeRun?.priorityOverrides[0]).toBe("STORY-011");
  });

  it("routes first-merge-wins recovery through pr-ops and blocks merge-only work when GitHub is degraded", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-orch-recovery-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    const now = "2026-03-28T23:25:00.000Z";

    await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-100",
          epicId: "EPIC-100",
          title: "Winning branch",
          priority: 1,
        },
        {
          id: "STORY-101",
          epicId: "EPIC-100",
          title: "Later conflicting branch",
          priority: 2,
        },
      ],
    });
    const runtimeOptions = {
      env: {
        GITHUB_TOKEN: "token",
      },
      inspectGitHubCliAuth: async () => ({
        authenticated: false,
        actor: null,
        reason: "gh auth unavailable",
      }),
      inspectGitRepository: async () => ({
        isGitRepository: true,
        currentBranch: "main",
        remoteName: "origin",
        remoteUrl: "https://github.com/acme/factory-target.git",
        defaultBranch: "main",
      }),
    };

    const firstPr = await openPullRequest(targetDirectory, {
      ...runtimeOptions,
      storyId: "STORY-100",
      title: "Winning branch",
      validationStatus: "passed",
    });
    const secondPr = await openPullRequest(targetDirectory, {
      ...runtimeOptions,
      storyId: "STORY-101",
      title: "Later conflicting branch",
      validationStatus: "passed",
    });

    const merged = await mergePullRequest(targetDirectory, {
      ...runtimeOptions,
      pullRequestId: firstPr.pullRequest.id,
      validationPassed: true,
    });
    const sessionState = createSessionState({
      sessionId: "coord-recovery",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });

    const recovery = await advanceCoordinatorRun(sessionState, {
      brief: "Recover stale branches explicitly.",
      now: () => "2026-03-28T23:26:00.000Z",
    });

    expect(merged.state.conflictTickets).toHaveLength(1);
    expect(recovery.state.activeRun?.recoveryQueue).toMatchObject([
      {
        storyId: "STORY-101",
        ownerRoleId: "pr-ops",
      },
    ]);
    expect(recovery.decision.kind).toBe("dispatch");
    if (recovery.decision.kind !== "dispatch") {
      throw new Error("Expected a dispatch decision.");
    }
    expect(recovery.decision.worker.roleId).toBe("pr-ops");
    expect(recovery.decision.worker.conflictTicketId).toBe(
      secondPr.state.conflictTickets[0]?.id ?? merged.state.conflictTickets[0]?.id ?? null,
    );
  });

  it("persists coordinator worker results across restart and projects the saved state back into the session", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-orch-persist-");
    const targetDirectory = path.join(targetsDirectory, "demo-app");
    const now = "2026-03-28T23:30:00.000Z";

    await seedApprovedPlanningArtifacts(targetDirectory, {
      now,
      stories: [
        {
          id: "STORY-200",
          epicId: "EPIC-200",
          title: "Persisted coordinator task",
          priority: 1,
        },
      ],
    });
    const sessionState = createSessionState({
      sessionId: "coord-persist",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });

    const started = await advanceCoordinatorRun(sessionState, {
      brief: "Persist worker state.",
      now: () => now,
    });

    expect(started.decision.kind).toBe("dispatch");
    if (started.decision.kind !== "dispatch" || !started.state.activeRun) {
      throw new Error("Expected a dispatch decision with an active run.");
    }

    await completeCoordinatorWorkerTurn(sessionState, {
      runId: started.state.activeRun.runId,
      workerId: started.decision.worker.id,
      turnResult: {
        status: "success",
        summary: "Worker finished cleanly.",
        finalText: "Worker finished cleanly.",
      },
      now: () => "2026-03-28T23:31:00.000Z",
    });

    const reloaded = await loadOrchestrationState(targetDirectory);

    expect(reloaded?.activeRun?.workers[0]).toMatchObject({
      status: "completed",
      lastTurnStatus: "success",
      lastTurnSummary: "Worker finished cleanly.",
    });

    const resumedSession = createSessionState({
      sessionId: "coord-persist-resume",
      targetDirectory,
      targetsDirectory,
      discovery: createDiscovery(),
    });
    const projection = await syncSessionOrchestrationState(resumedSession, {
      now: () => "2026-03-28T23:32:00.000Z",
    });

    expect(projection.summary).toContain("Worker finished cleanly.");
    expect(resumedSession.workbenchState.orchestration.summary).toContain(
      "Worker finished cleanly.",
    );
  });
});
