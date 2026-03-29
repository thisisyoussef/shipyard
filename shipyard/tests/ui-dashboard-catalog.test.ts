import { describe, expect, it } from "vitest";

import {
  buildDashboardCatalog,
} from "../ui/src/dashboard-catalog.js";
import {
  createInitialDashboardPreferences,
  markDashboardProductOpened,
  readDashboardPreferences,
  setDashboardActiveTab,
  toggleDashboardProductStar,
  writeDashboardPreferences,
  type DashboardPreferences,
} from "../ui/src/dashboard-preferences.js";
import type {
  ProjectBoardViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
} from "../ui/src/view-models.js";

const targetManager: TargetManagerViewModel = {
  currentTarget: {
    path: "/tmp/alpha-app",
    name: "alpha-app",
    description: "Alpha product",
    language: "typescript",
    framework: "React",
    hasProfile: true,
  },
  availableTargets: [
    {
      path: "/tmp/alpha-app",
      name: "alpha-app",
      description: "Alpha product",
      language: "typescript",
      framework: "React",
      hasProfile: true,
    },
    {
      path: "/tmp/beta-app",
      name: "beta-app",
      description: null,
      language: "typescript",
      framework: null,
      hasProfile: false,
    },
    {
      path: "/tmp/gamma-app",
      name: "gamma-app",
      description: "Gamma staging product",
      language: null,
      framework: null,
      hasProfile: false,
    },
  ],
  enrichmentStatus: {
    status: "idle",
    message: null,
  },
};

const projectBoard: ProjectBoardViewModel = {
  activeProjectId: "project-alpha",
  openProjects: [
    {
      projectId: "project-alpha",
      targetPath: "/tmp/alpha-app",
      targetName: "alpha-app",
      description: "Alpha product",
      activePhase: "code",
      status: "ready",
      agentStatus: "Ready",
      hasProfile: true,
      lastActiveAt: "2026-03-28T12:10:00.000Z",
      turnCount: 3,
      privatePreviewUrl: "http://127.0.0.1:4173",
      publicDeploymentUrl: "https://alpha-app.vercel.app",
    },
    {
      projectId: "project-delta",
      targetPath: "/tmp/delta-app",
      targetName: "delta-app",
      description: null,
      activePhase: "code",
      status: "error",
      agentStatus: "Build failed",
      hasProfile: false,
      lastActiveAt: "2026-03-28T12:07:00.000Z",
      turnCount: 8,
      privatePreviewUrl: null,
      publicDeploymentUrl: "https://delta-app.vercel.app",
    },
  ],
};

const sessionState: SessionStateViewModel = {
  sessionId: "session-1",
  targetLabel: "alpha-app",
  targetDirectory: "/tmp/alpha-app",
  activePhase: "code",
  workspaceDirectory: "/tmp",
  turnCount: 3,
  startedAt: "2026-03-28T12:00:00.000Z",
  lastActiveAt: "2026-03-28T12:10:00.000Z",
  discoverySummary: "React target",
  discovery: {
    isGreenfield: false,
    language: "typescript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {},
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: [],
    topLevelDirectories: [],
    projectName: "alpha-app",
    previewCapability: {
      status: "available",
      kind: "dev-server",
      runner: "pnpm",
      scriptName: "dev",
      command: "pnpm dev",
      reason: "Ready",
      autoRefresh: "native-hmr",
    },
  },
  projectRulesLoaded: true,
  tracePath: "/tmp/.shipyard/traces/session-1.ndjson",
};

function createStorageStub(initialValue?: DashboardPreferences) {
  const store = new Map<string, string>();

  if (initialValue) {
    store.set(
      "shipyard:dashboard-preferences",
      JSON.stringify(initialValue),
    );
  }

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("dashboard catalog", () => {
  it("maps live target and project state into truthful cards", () => {
    let preferences = createInitialDashboardPreferences();
    preferences = toggleDashboardProductStar(preferences, "/tmp/gamma-app");
    preferences = markDashboardProductOpened(
      preferences,
      "/tmp/gamma-app",
      "2026-03-28T11:40:00.000Z",
    );

    const catalog = buildDashboardCatalog({
      targetManager,
      projectBoard,
      sessionState,
      preferences,
    });

    expect(catalog.cards.map((card) => card.path)).toEqual([
      "/tmp/alpha-app",
      "/tmp/delta-app",
      "/tmp/gamma-app",
      "/tmp/beta-app",
    ]);

    expect(
      catalog.cards.find((card) => card.path === "/tmp/alpha-app"),
    ).toMatchObject({
      name: "alpha-app",
      status: "ready",
      statusLabel: "Active",
      active: true,
      open: true,
      stackLabel: "React",
      lastActivity: "2026-03-28T12:10:00.000Z",
      previewUrl: "http://127.0.0.1:4173",
    });

    expect(
      catalog.cards.find((card) => card.path === "/tmp/delta-app"),
    ).toMatchObject({
      name: "delta-app",
      status: "error",
      statusLabel: "Needs attention",
      active: false,
      open: true,
      previewUrl: "https://delta-app.vercel.app",
      previewDetail: "Open this product to inspect the runtime and recover it.",
    });

    expect(
      catalog.cards.find((card) => card.path === "/tmp/gamma-app"),
    ).toMatchObject({
      status: "available",
      statusLabel: "Needs profile",
      starred: true,
      lastActivity: "2026-03-28T11:40:00.000Z",
      previewDetail: "Gamma staging product",
    });

    expect(
      catalog.cards.find((card) => card.path === "/tmp/beta-app"),
    ).toMatchObject({
      status: "available",
      statusLabel: "Needs profile",
      stackLabel: "typescript",
      previewDetail:
        "Shipyard will add richer target metadata after the next activation.",
    });
  });

  it("filters recent and starred tabs with truthful empty states", () => {
    let preferences = createInitialDashboardPreferences();
    preferences = markDashboardProductOpened(
      preferences,
      "/tmp/gamma-app",
      "2026-03-28T11:40:00.000Z",
    );
    preferences = toggleDashboardProductStar(preferences, "/tmp/gamma-app");

    const recentCatalog = buildDashboardCatalog({
      targetManager,
      projectBoard,
      sessionState,
      preferences: setDashboardActiveTab(preferences, "recent"),
    });

    expect(recentCatalog.visibleCards.map((card) => card.path)).toEqual([
      "/tmp/alpha-app",
      "/tmp/delta-app",
      "/tmp/gamma-app",
    ]);
    expect(recentCatalog.emptyState).toBeNull();

    const starredCatalog = buildDashboardCatalog({
      targetManager,
      projectBoard,
      sessionState,
      preferences: setDashboardActiveTab(preferences, "starred"),
    });

    expect(starredCatalog.visibleCards.map((card) => card.path)).toEqual([
      "/tmp/gamma-app",
    ]);

    const emptyStarredCatalog = buildDashboardCatalog({
      targetManager,
      projectBoard,
      sessionState,
      preferences: setDashboardActiveTab(
        createInitialDashboardPreferences(),
        "starred",
      ),
    });

    expect(emptyStarredCatalog.visibleCards).toEqual([]);
    expect(emptyStarredCatalog.emptyState).toEqual({
      title: "No starred products yet",
      detail:
        "Star the products you revisit often to keep a quick shortlist on hand.",
    });
  });
});

describe("dashboard preferences", () => {
  it("hydrates and persists preferences through a storage adapter", () => {
    const storage = createStorageStub();

    let preferences = readDashboardPreferences(storage);
    expect(preferences).toEqual(createInitialDashboardPreferences());

    preferences = toggleDashboardProductStar(preferences, "/tmp/gamma-app");
    preferences = markDashboardProductOpened(
      preferences,
      "/tmp/gamma-app",
      "2026-03-28T11:40:00.000Z",
    );
    preferences = setDashboardActiveTab(preferences, "recent");
    writeDashboardPreferences(preferences, storage);

    expect(readDashboardPreferences(storage)).toEqual(preferences);
  });
});
