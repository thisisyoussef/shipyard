import { describe, expect, it } from "vitest";

import {
  createBoardViewModel,
} from "../ui/src/board-view-model.js";
import type {
  TaskBoardViewModel,
} from "../ui/src/view-models.js";

function createSourceControlSummary() {
  return {
    provider: "github",
    mode: "bound" as const,
    repositorySlug: "thisisyoussef/shipyard",
    defaultBranch: "main",
    defaultBranchRevision: 12,
    branchName: "codex/uii-s06-resilience-polish",
    branchStatus: "ready" as const,
    reviewRequestId: null,
    reviewRequestNumber: null,
    reviewStatus: null,
    degraded: false,
    degradedReason: null,
    summary: "Branch is ready for the next change.",
    freshnessAt: "2026-03-29T00:12:00.000Z",
  };
}

function createHostedWorkspaceSummary() {
  return {
    provider: "local",
    mode: "local" as const,
    workspaceRoot: "/tmp",
    relativeTargetPath: "alpha-app",
    repositoryStatus: "bound" as const,
    restoreStatus: "local" as const,
    privatePreviewUrl: "http://127.0.0.1:4173",
    publicDeploymentUrl: null,
    degraded: false,
    summary: "Local workspace is current.",
    freshnessAt: "2026-03-29T00:12:00.000Z",
  };
}

function createTddSummary() {
  return {
    laneId: null,
    stage: null,
    status: null,
    latestHandoffArtifact: null,
    latestEscalationArtifact: null,
    latestQualityArtifact: null,
    updatedAt: null,
    summary: "No active TDD lane.",
  };
}

const taskBoard: TaskBoardViewModel = {
  updatedAt: "2026-03-29T00:12:00.000Z",
  summary: "1 task ready, 1 blocked, and no review work pending.",
  storyCount: 2,
  taskCount: 2,
  blockedCount: 1,
  readyCount: 1,
  inProgressCount: 0,
  reviewCount: 0,
  doneCount: 0,
  columns: [
    {
      id: "ready",
      label: "Ready",
      count: 1,
      cards: [
        {
          cardId: "card-ready-1",
          nodeType: "task",
          storyId: "STORY-UI-001",
          taskId: "TASK-READY-1",
          title: "Add reconnect notice",
          storyTitle: "Dashboard resilience",
          status: "ready",
          phase: "green",
          columnId: "ready",
          ownerRoleId: "coordinator",
          blockedByIds: [],
          activeLeaseCount: 1,
          openThreadCount: 0,
          sourceControl: createSourceControlSummary(),
          hostedWorkspace: createHostedWorkspaceSummary(),
          tdd: createTddSummary(),
          updatedAt: "2026-03-29T00:12:00.000Z",
          summary: "Ready to implement.",
        },
      ],
    },
    {
      id: "blocked",
      label: "Blocked",
      count: 1,
      cards: [
        {
          cardId: "card-blocked-1",
          nodeType: "task",
          storyId: "STORY-UI-002",
          taskId: "TASK-BLOCKED-1",
          title: "Verify preview harness",
          storyTitle: "Release gate",
          status: "blocked",
          phase: "blocked",
          columnId: "blocked",
          ownerRoleId: null,
          blockedByIds: ["TASK-READY-1"],
          activeLeaseCount: 0,
          openThreadCount: 0,
          sourceControl: createSourceControlSummary(),
          hostedWorkspace: createHostedWorkspaceSummary(),
          tdd: createTddSummary(),
          updatedAt: "2026-03-29T00:11:00.000Z",
          summary: "Waiting for the reconnect pass to land.",
        },
      ],
    },
    {
      id: "in_progress",
      label: "In progress",
      count: 0,
      cards: [],
    },
    {
      id: "review",
      label: "Review",
      count: 0,
      cards: [],
    },
    {
      id: "done",
      label: "Done",
      count: 0,
      cards: [],
    },
  ],
};

describe("board view model", () => {
  it("returns a missing-target state when the board route has no project scope", () => {
    expect(
      createBoardViewModel({
        taskBoard: null,
        connectionState: "ready",
        scopeKey: null,
        selectedStoryId: "all",
      }),
    ).toMatchObject({
      status: "missing-target",
      scopeKey: null,
      emptyState: {
        title: "Select a product first",
      },
      storyOptions: [],
    });
  });

  it("keeps the last board snapshot visible and marks it stale while reconnecting", () => {
    expect(
      createBoardViewModel({
        taskBoard,
        connectionState: "disconnected",
        scopeKey: "/tmp/alpha-app",
        selectedStoryId: "STORY-UI-001",
      }),
    ).toMatchObject({
      status: "ready",
      scopeKey: "/tmp/alpha-app",
      selectedStoryId: "STORY-UI-001",
      storyOptions: expect.arrayContaining([
        expect.objectContaining({
          id: "all",
          taskCount: 2,
        }),
        expect.objectContaining({
          id: "STORY-UI-001",
          taskCount: 1,
        }),
      ]),
      notice: {
        tone: "warning",
        title: "Showing the last synced board snapshot",
      },
      columns: expect.arrayContaining([
        expect.objectContaining({
          id: "ready",
          count: 1,
        }),
      ]),
      tasks: expect.arrayContaining([
        expect.objectContaining({
          id: "card-ready-1",
          title: "Add reconnect notice",
          storyId: "STORY-UI-001",
          blocked: false,
        }),
      ]),
    });
  });

  it("falls back to the full board when the stored story filter is stale", () => {
    expect(
      createBoardViewModel({
        taskBoard,
        connectionState: "ready",
        scopeKey: "/tmp/alpha-app",
        selectedStoryId: "STORY-UNKNOWN",
      }),
    ).toMatchObject({
      status: "ready",
      selectedStoryId: "all",
      tasks: [
        expect.objectContaining({
          id: "card-ready-1",
        }),
        expect.objectContaining({
          id: "card-blocked-1",
          blocked: true,
        }),
      ],
    });
  });
});
