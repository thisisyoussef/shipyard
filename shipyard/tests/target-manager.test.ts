import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseArgs } from "../src/bin/shipyard.js";
import type { DiscoveryReport, TargetProfile } from "../src/artifacts/types.js";
import {
  createSessionState,
  ensureShipyardDirectories,
  loadSessionState,
  switchTarget,
} from "../src/engine/state.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery(overrides: Partial<DiscoveryReport> = {}): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "typescript",
    framework: "vite",
    packageManager: "pnpm",
    scripts: {},
    hasReadme: true,
    hasAgentsMd: false,
    topLevelFiles: ["package.json", "README.md"],
    topLevelDirectories: ["src"],
    projectName: "demo-target",
    previewCapability: {
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      command: null,
      reason: "No preview",
      autoRefresh: "none",
    },
    ...overrides,
  };
}

function createProfile(
  overrides: Partial<TargetProfile> = {},
): TargetProfile {
  return {
    name: "demo-target",
    description: "A demo target used for tests.",
    purpose: "Exercise target-manager flows.",
    stack: ["TypeScript", "Vitest"],
    architecture: "Single-package workspace",
    keyPatterns: ["barrel exports", "session persistence"],
    complexity: "small",
    suggestedAgentsRules: "# AGENTS.md\nPrefer small changes.",
    suggestedScripts: {
      test: "vitest",
    },
    taskSuggestions: ["Add a README", "Wire preview support"],
    enrichedAt: "2026-03-24T00:00:00.000Z",
    enrichmentModel: "claude-sonnet-4-5",
    discoverySnapshot: createDiscovery(),
    ...overrides,
  };
}

afterEach(async () => {
  const directories = createdDirectories.splice(0, createdDirectories.length);
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("target manager backend", () => {
  it("defines the TargetProfile contract expected by enrichment", () => {
    const profile = createProfile();

    expect(profile.name).toBe("demo-target");
    expect(profile.complexity).toBe("small");
    expect(profile.discoverySnapshot.language).toBe("typescript");
  });

  it("round-trips a target profile through profile.json", async () => {
    const directory = await createTempDirectory("shipyard-target-profile-");
    await ensureShipyardDirectories(directory);
    const profile = createProfile();
    const { loadTargetProfile, saveTargetProfile } = await import(
      "../src/tools/target-manager/profile-io.js"
    );

    await saveTargetProfile(directory, profile);
    const loaded = await loadTargetProfile(directory);

    expect(loaded).toEqual(profile);
  });

  it("lists target directories with discovery and profile metadata", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-targets-");
    const repoDirectory = path.join(targetsDirectory, "demo-app");
    const hiddenDirectory = path.join(targetsDirectory, ".ignored");

    await mkdir(repoDirectory, { recursive: true });
    await mkdir(hiddenDirectory, { recursive: true });
    await writeFile(
      path.join(repoDirectory, "package.json"),
      `${JSON.stringify({ name: "demo-app" }, null, 2)}\n`,
      "utf8",
    );
    await ensureShipyardDirectories(repoDirectory);
    const { saveTargetProfile } = await import(
      "../src/tools/target-manager/profile-io.js"
    );
    await saveTargetProfile(
      repoDirectory,
      createProfile({
        name: "demo-app",
        description: "Listed repo.",
      }),
    );
    const { listTargetsTool } = await import(
      "../src/tools/target-manager/list-targets.js"
    );

    const targets = await listTargetsTool({
      targetsDir: targetsDirectory,
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: "demo-app",
      path: repoDirectory,
      hasProfile: true,
      language: "javascript",
    });
  });

  it("selects a target and loads the existing profile", async () => {
    const directory = await createTempDirectory("shipyard-select-target-");
    const profile = createProfile({
      name: "selected-target",
      description: "Selection test profile.",
    });
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "package.json"),
      `${JSON.stringify({ name: "selected-target" }, null, 2)}\n`,
      "utf8",
    );
    await ensureShipyardDirectories(directory);
    const { saveTargetProfile } = await import(
      "../src/tools/target-manager/profile-io.js"
    );
    await saveTargetProfile(directory, profile);
    const { selectTargetTool } = await import(
      "../src/tools/target-manager/select-target.js"
    );

    const result = await selectTargetTool({
      targetPath: directory,
    });

    expect(result.path).toBe(directory);
    expect(result.discovery.projectName).toBe("selected-target");
    expect(result.profile).toEqual(profile);
  });

  it("creates a target directory with scaffold files and git metadata", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-create-target-");
    const { createTargetTool } = await import(
      "../src/tools/target-manager/create-target.js"
    );

    const result = await createTargetTool({
      name: "new-target",
      description: "A fresh target for tests.",
      targetsDir: targetsDirectory,
      scaffoldType: "react-ts",
    });

    expect(result.path).toBe(path.join(targetsDirectory, "new-target"));
    await expect(readFile(path.join(result.path, "README.md"), "utf8")).resolves.toContain(
      "New Target",
    );
    await expect(
      readFile(path.join(result.path, "src", "App.tsx"), "utf8"),
    ).resolves.toContain("New Target");
    await expect(
      readFile(path.join(result.path, ".git", "HEAD"), "utf8"),
    ).resolves.toContain("ref: refs/heads/");
  });

  it("builds enrichment context from project files", async () => {
    const directory = await createTempDirectory("shipyard-enrich-context-");
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "README.md"), "# Demo\n\nA target.\n", "utf8");
    await writeFile(
      path.join(directory, "package.json"),
      `${JSON.stringify({ name: "context-target" }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(directory, "src", "main.ts"),
      'export const ready = true;\n',
      "utf8",
    );
    const { buildEnrichmentContext } = await import(
      "../src/tools/target-manager/enrich-target.js"
    );

    const context = await buildEnrichmentContext(directory);

    expect(context.discovery.projectName).toBe("context-target");
    expect(context.fileContents.map((file) => file.path)).toContain("README.md");
    expect(context.fileContents.map((file) => file.path)).toContain("package.json");
  });

  it("parses enrichment responses into a TargetProfile", async () => {
    const { parseEnrichmentResponse } = await import(
      "../src/tools/target-manager/enrich-target.js"
    );

    const profile = parseEnrichmentResponse(
      JSON.stringify({
        name: "parsed-target",
        description: "Parsed from model output.",
        purpose: "Validation",
        stack: ["TypeScript"],
        architecture: "Single package",
        keyPatterns: ["strict typing"],
        complexity: "small",
        suggestedAgentsRules: "# AGENTS.md\nStay focused.",
        suggestedScripts: { test: "vitest" },
        taskSuggestions: ["Write tests"],
      }),
      createDiscovery({
        projectName: "parsed-target",
      }),
      "claude-sonnet-4-5",
    );

    expect(profile).toMatchObject({
      name: "parsed-target",
      enrichmentModel: "claude-sonnet-4-5",
      discoverySnapshot: {
        projectName: "parsed-target",
      },
    });
  });

  it("registers target manager tools and phase definitions", async () => {
    const { getTool } = await import("../src/tools/registry.js");
    const { TARGET_MANAGER_TOOL_NAMES, createTargetManagerPhase } = await import(
      "../src/phases/target-manager/index.js"
    );

    expect(TARGET_MANAGER_TOOL_NAMES).toEqual([
      "list_targets",
      "select_target",
      "create_target",
      "enrich_target",
    ]);
    expect(createTargetManagerPhase().name).toBe("target-manager");
    expect(getTool("list_targets")).toBeDefined();
    expect(getTool("select_target")).toBeDefined();
    expect(getTool("create_target")).toBeDefined();
    expect(getTool("enrich_target")).toBeDefined();
  });

  it("switches targets by saving the current session and loading target state", async () => {
    const oldTarget = await createTempDirectory("shipyard-old-target-");
    const newTarget = await createTempDirectory("shipyard-new-target-");
    await writeFile(
      path.join(newTarget, "package.json"),
      `${JSON.stringify({ name: "new-target" }, null, 2)}\n`,
      "utf8",
    );
    await ensureShipyardDirectories(newTarget);
    const { saveTargetProfile } = await import(
      "../src/tools/target-manager/profile-io.js"
    );
    await saveTargetProfile(
      newTarget,
      createProfile({
        name: "new-target",
        description: "Loaded after switch.",
      }),
    );

    const currentState = createSessionState({
      sessionId: "old-session",
      targetDirectory: oldTarget,
      targetsDirectory: path.dirname(oldTarget),
      discovery: createDiscovery({
        projectName: "old-target",
        isGreenfield: true,
      }),
    });
    currentState.turnCount = 3;
    currentState.rollingSummary = "Previous work";

    const nextState = await switchTarget(currentState, newTarget);

    expect(nextState.targetDirectory).toBe(newTarget);
    expect(nextState.activePhase).toBe("code");
    expect(nextState.sessionId).not.toBe("old-session");
    expect(nextState.targetProfile?.name).toBe("new-target");

    const persistedOldState = await loadSessionState(oldTarget, "old-session");
    expect(persistedOldState?.turnCount).toBe(3);
  });
});

describe("target manager CLI integration", () => {
  it("treats --target as optional and adds --targets-dir", () => {
    expect(parseArgs([])).toEqual({
      targetPath: undefined,
      targetsDir: "./test-targets",
      sessionId: undefined,
      ui: false,
    });

    expect(parseArgs(["--target", "./demo", "--ui"])).toEqual({
      targetPath: "./demo",
      targetsDir: "./test-targets",
      sessionId: undefined,
      ui: true,
    });

    expect(parseArgs(["--targets-dir", "/tmp/targets", "--session", "abc123"])).toEqual({
      targetPath: undefined,
      targetsDir: "/tmp/targets",
      sessionId: "abc123",
      ui: false,
    });
  });
});
