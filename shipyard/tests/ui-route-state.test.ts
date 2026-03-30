import { describe, expect, it } from "vitest";

import {
  getPreferredBoardRoute,
  getPreferredEditorRoute,
  resolveAppRoute,
  selectBoardRouteState,
  selectEditorRouteState,
} from "../ui/src/app-route.js";
import type {
  ProjectBoardViewModel,
  SessionStateViewModel,
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

const alphaSessionState: SessionStateViewModel = {
  sessionId: "session-alpha",
  targetLabel: "alpha-app",
  targetDirectory: "/tmp/alpha-app",
  activePhase: "code",
  workspaceDirectory: "/tmp/workspace",
  turnCount: 2,
  startedAt: "2026-03-28T12:00:00.000Z",
  lastActiveAt: "2026-03-28T12:05:00.000Z",
  discoverySummary: "typescript (React) via pnpm",
  discovery: {
    isGreenfield: false,
    language: "typescript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      build: "vite build",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json"],
    topLevelDirectories: ["src"],
    projectName: "alpha-app",
    previewCapability: {
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      command: null,
      reason: "No preview signal.",
      autoRefresh: "none",
    },
  },
  projectRulesLoaded: true,
  tracePath: "/tmp/alpha-app/.shipyard/traces/session-alpha.jsonl",
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

  it("resolves project-scoped board hashes", () => {
    expect(resolveAppRoute("/", "#/board/my-app")).toEqual({
      view: "board",
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
        sessionState: alphaSessionState,
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
        sessionState: alphaSessionState,
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
        sessionState: alphaSessionState,
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
        sessionState: alphaSessionState,
      }),
    ).toEqual({
      status: "missing",
      productId: "/tmp/ghost-app",
      productName: null,
      intent: { kind: "none" },
    });
  });

  it("waits for the detailed session snapshot before treating the requested project as active", () => {
    expect(
      selectEditorRouteState({
        productId: "/tmp/beta-app",
        projectBoard: {
          ...projectBoard,
          activeProjectId: "project-beta",
        },
        targetManager: {
          ...targetManager,
          currentTarget: targetManager.availableTargets[1]!,
        },
        sessionState: alphaSessionState,
      }),
    ).toEqual({
      status: "opening",
      productId: "/tmp/beta-app",
      productName: "beta-app",
      intent: { kind: "none" },
    });
  });
});

describe("selectBoardRouteState", () => {
  it("treats the active project target as ready", () => {
    expect(
      selectBoardRouteState({
        productId: "/tmp/alpha-app",
        projectBoard,
        targetManager,
        sessionState: alphaSessionState,
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
      selectBoardRouteState({
        productId: "/tmp/beta-app",
        projectBoard,
        targetManager,
        sessionState: alphaSessionState,
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

  it("keeps the board route opening while the active session still belongs to the previous target", () => {
    expect(
      selectBoardRouteState({
        productId: "/tmp/beta-app",
        projectBoard: {
          ...projectBoard,
          activeProjectId: "project-beta",
        },
        targetManager: {
          ...targetManager,
          currentTarget: targetManager.availableTargets[1]!,
        },
        sessionState: alphaSessionState,
      }),
    ).toEqual({
      status: "opening",
      productId: "/tmp/beta-app",
      productName: "beta-app",
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

  it("does not expose an editor route when no target is selected yet", () => {
    expect(
      getPreferredEditorRoute(
        {
          activeProjectId: null,
          openProjects: [],
        },
        {
          ...targetManager,
          currentTarget: {
            path: "/tmp/targets",
            name: "No target selected",
            description:
              "Select an existing target or create a new scaffold to begin.",
            language: null,
            framework: null,
            hasProfile: false,
          },
        },
      ),
    ).toBeNull();
  });
});

describe("getPreferredBoardRoute", () => {
  it("prefers the active open project target path", () => {
    expect(getPreferredBoardRoute(projectBoard, targetManager)).toEqual({
      view: "board",
      productId: "/tmp/alpha-app",
    });
  });

  it("falls back to the current target when no project is open", () => {
    expect(
      getPreferredBoardRoute(
        {
          activeProjectId: null,
          openProjects: [],
        },
        targetManager,
      ),
    ).toEqual({
      view: "board",
      productId: "/tmp/alpha-app",
    });
  });
});
