import { describe, expect, it } from "vitest";

import {
  getPreferredEditorRoute,
  resolveAppRoute,
  selectEditorRouteState,
} from "../ui/src/app-route.js";
import type {
  ProjectBoardViewModel,
  TargetManagerViewModel,
} from "../ui/src/view-models.js";

const targetManager: TargetManagerViewModel = {
  currentTarget: {
    path: "/tmp/alpha-app",
    name: "alpha-app",
    description: "Alpha target",
    language: "typescript",
    framework: "React",
    hasProfile: true,
  },
  availableTargets: [
    {
      path: "/tmp/alpha-app",
      name: "alpha-app",
      description: "Alpha target",
      language: "typescript",
      framework: "React",
      hasProfile: true,
    },
    {
      path: "/tmp/beta-app",
      name: "beta-app",
      description: "Beta target",
      language: "typescript",
      framework: "React",
      hasProfile: false,
    },
  ],
  enrichmentStatus: {
    status: "complete",
    message: "Target profile saved.",
  },
};

const projectBoard: ProjectBoardViewModel = {
  activeProjectId: "project-alpha",
  openProjects: [
    {
      projectId: "project-alpha",
      targetPath: "/tmp/alpha-app",
      targetName: "alpha-app",
      description: "Alpha target",
      activePhase: "code",
      status: "ready",
      agentStatus: "Ready for the next instruction.",
      hasProfile: true,
      lastActiveAt: "2026-03-28T12:00:00.000Z",
      turnCount: 2,
    },
    {
      projectId: "project-beta",
      targetPath: "/tmp/beta-app",
      targetName: "beta-app",
      description: "Beta target",
      activePhase: "code",
      status: "agent-busy",
      agentStatus: "Running a background turn.",
      hasProfile: false,
      lastActiveAt: "2026-03-28T12:05:00.000Z",
      turnCount: 5,
    },
  ],
};

describe("resolveAppRoute", () => {
  it("uses pathname routing for the human-feedback surface", () => {
    expect(resolveAppRoute("/human-feedback", "#/board")).toEqual({
      view: "human-feedback",
    });
  });

  it("uses hash routing for the main application shell", () => {
    expect(resolveAppRoute("/", "#/editor/my-app")).toEqual({
      view: "editor",
      productId: "my-app",
    });
  });
});

describe("selectEditorRouteState", () => {
  it("treats the active project target as ready", () => {
    expect(
      selectEditorRouteState({
        productId: "/tmp/alpha-app",
        projectBoard,
        targetManager,
      }),
    ).toEqual({
      status: "active",
      productId: "/tmp/alpha-app",
      productName: "alpha-app",
      intent: { kind: "none" },
    });
  });

  it("activates an already-open background project when the route matches it", () => {
    expect(
      selectEditorRouteState({
        productId: "/tmp/beta-app",
        projectBoard,
        targetManager,
      }),
    ).toEqual({
      status: "opening",
      productId: "/tmp/beta-app",
      productName: "beta-app",
      intent: {
        kind: "activate-project",
        projectId: "project-beta",
      },
    });
  });

  it("switches to a known target that is not already open", () => {
    const closedProjectBoard: ProjectBoardViewModel = {
      activeProjectId: null,
      openProjects: [],
    };

    expect(
      selectEditorRouteState({
        productId: "/tmp/beta-app",
        projectBoard: closedProjectBoard,
        targetManager,
      }),
    ).toEqual({
      status: "opening",
      productId: "/tmp/beta-app",
      productName: "beta-app",
      intent: {
        kind: "switch-target",
        targetPath: "/tmp/beta-app",
      },
    });
  });

  it("returns a missing state for unknown products", () => {
    expect(
      selectEditorRouteState({
        productId: "/tmp/ghost-app",
        projectBoard,
        targetManager,
      }),
    ).toEqual({
      status: "missing",
      productId: "/tmp/ghost-app",
      productName: null,
      intent: { kind: "none" },
    });
  });
});

describe("getPreferredEditorRoute", () => {
  it("prefers the active open project target path", () => {
    expect(getPreferredEditorRoute(projectBoard, targetManager)).toEqual({
      view: "editor",
      productId: "/tmp/alpha-app",
    });
  });

  it("falls back to the current target when no project is open", () => {
    expect(
      getPreferredEditorRoute(
        {
          activeProjectId: null,
          openProjects: [],
        },
        targetManager,
      ),
    ).toEqual({
      view: "editor",
      productId: "/tmp/alpha-app",
    });
  });
});
