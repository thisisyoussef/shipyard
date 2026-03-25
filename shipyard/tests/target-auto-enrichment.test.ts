import readline from "node:readline";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DiscoveryReport, TargetProfile } from "../src/artifacts/types.js";
import { handleTargetCommand } from "../src/engine/target-command.js";
import { createSessionState, ensureShipyardDirectories } from "../src/engine/state.js";
import type { InstructionRuntimeState } from "../src/engine/turn.js";
import { planAutomaticEnrichment } from "../src/engine/target-enrichment.js";
import { loadTargetProfile } from "../src/tools/target-manager/profile-io.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery(
  overrides: Partial<DiscoveryReport> = {},
): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "typescript",
    framework: "React",
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
      reason: "No preview available.",
      autoRefresh: "none",
    },
    ...overrides,
  };
}

function createRuntimeState(
  description = "Automatic enrichment summary.",
): InstructionRuntimeState {
  return {
    projectRules: "",
    baseInjectedContext: [],
    recentToolOutputs: [],
    recentErrors: [],
    retryCountsByFile: {},
    blockedFiles: [],
    pendingTargetSelectionPath: null,
    runtimeMode: "graph",
    targetEnrichmentInvoker: async () => ({
      text: JSON.stringify({
        name: "auto-target",
        description,
        purpose: "Exercise automatic enrichment in tests.",
        stack: ["TypeScript"],
        architecture: "Single-package workspace",
        keyPatterns: ["target manager"],
        complexity: "small",
        suggestedAgentsRules: "# AGENTS.md\nKeep changes small.",
        suggestedScripts: {
          test: "vitest run",
        },
        taskSuggestions: ["Add a README"],
      }),
      model: "test-model",
    }),
  };
}

function createProfile(
  overrides: Partial<TargetProfile> = {},
): TargetProfile {
  return {
    name: "demo-target",
    description: "Saved profile summary.",
    purpose: "Exercise planner behavior.",
    stack: ["TypeScript"],
    architecture: "Single-package workspace",
    keyPatterns: ["target manager"],
    complexity: "small",
    suggestedAgentsRules: "# AGENTS.md\nKeep changes focused.",
    suggestedScripts: {
      test: "vitest run",
    },
    taskSuggestions: ["Keep building"],
    enrichedAt: "2026-03-25T00:00:00.000Z",
    enrichmentModel: "test-model",
    discoverySnapshot: createDiscovery(),
    ...overrides,
  };
}

function createReadlineWithAnswers(
  answers: string[],
): readline.Interface {
  const queuedAnswers = [...answers];

  return {
    question(_question: string, callback: (answer: string) => void) {
      callback(queuedAnswers.shift() ?? "");
    },
  } as unknown as readline.Interface;
}

afterEach(async () => {
  const directories = createdDirectories.splice(0, createdDirectories.length);
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("target auto-enrichment planner", () => {
  it("runs immediately when the target already has enough project context", () => {
    expect(
      planAutomaticEnrichment({
        discovery: createDiscovery(),
        targetProfile: undefined,
      }),
    ).toMatchObject({
      kind: "run-now",
      queuedMessage: expect.stringContaining("Analyzing"),
      userDescription: undefined,
    });
  });

  it("reuses a provided description for empty greenfield targets", () => {
    expect(
      planAutomaticEnrichment({
        discovery: createDiscovery({
          isGreenfield: true,
          hasReadme: false,
          topLevelFiles: [],
          topLevelDirectories: [],
          projectName: null,
        }),
        targetProfile: undefined,
        creationDescription: "A brand-new scratch project.",
      }),
    ).toMatchObject({
      kind: "run-now",
      userDescription: "A brand-new scratch project.",
    });
  });

  it("requests more context for empty greenfield targets without a description", () => {
    expect(
      planAutomaticEnrichment({
        discovery: createDiscovery({
          isGreenfield: true,
          hasReadme: false,
          topLevelFiles: [],
          topLevelDirectories: [],
          projectName: null,
        }),
        targetProfile: undefined,
      }),
    ).toMatchObject({
      kind: "needs-description",
      message: expect.stringContaining("Not enough context"),
    });
  });

  it("skips automatic enrichment when a saved profile already exists", () => {
    expect(
      planAutomaticEnrichment({
        discovery: createDiscovery(),
        targetProfile: createProfile(),
      }),
    ).toEqual({
      kind: "skip-existing-profile",
    });
  });
});

describe("target auto-enrichment CLI flow", () => {
  it("auto-enriches immediately after target create", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-auto-create-");
    const state = createSessionState({
      sessionId: "auto-create-session",
      targetDirectory: targetsDirectory,
      targetsDirectory,
      activePhase: "target-manager",
      discovery: createDiscovery({
        isGreenfield: true,
        hasReadme: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: path.basename(targetsDirectory),
      }),
    });
    const output: string[] = [];

    const result = await handleTargetCommand("create", {
      rl: createReadlineWithAnswers([
        "alpha app",
        "Created from the CLI test.",
        "empty",
      ]),
      state,
      runtimeState: createRuntimeState("Auto-enriched alpha target."),
      writeLine(line) {
        output.push(line);
      },
    });

    const nextState = result.nextState;

    expect(nextState?.targetProfile?.description).toBe(
      "Auto-enriched alpha target.",
    );
    expect(output).toContain("Created and selected alpha app.");
    expect(output).toContain("Collecting target context.");
    expect(output).toContain("Target profile saved.");
    expect(output).toContain("Enriched target: Auto-enriched alpha target.");
    await expect(
      loadTargetProfile(nextState!.targetDirectory),
    ).resolves.toMatchObject({
      description: "Auto-enriched alpha target.",
    });
  });

  it("auto-enriches immediately after switching to an unprofiled target", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-auto-switch-");
    const currentTargetDirectory = path.join(targetsDirectory, "alpha-current");
    const nextTargetDirectory = path.join(targetsDirectory, "beta-target");
    const output: string[] = [];

    await mkdir(currentTargetDirectory, { recursive: true });
    await mkdir(nextTargetDirectory, { recursive: true });
    await writeFile(
      path.join(currentTargetDirectory, "package.json"),
      JSON.stringify({ name: "alpha-current" }, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(nextTargetDirectory, "package.json"),
      JSON.stringify({ name: "beta-target" }, null, 2),
      "utf8",
    );
    await ensureShipyardDirectories(currentTargetDirectory);
    await ensureShipyardDirectories(nextTargetDirectory);

    const state = createSessionState({
      sessionId: "auto-switch-session",
      targetDirectory: currentTargetDirectory,
      targetsDirectory,
      activePhase: "code",
      discovery: await createDiscovery({
        projectName: "alpha-current",
      }),
    });

    const result = await handleTargetCommand("switch", {
      rl: createReadlineWithAnswers(["2"]),
      state,
      runtimeState: createRuntimeState("Auto-enriched beta target."),
      writeLine(line) {
        output.push(line);
      },
    });

    const nextState = result.nextState;

    expect(nextState?.targetDirectory).toBe(nextTargetDirectory);
    expect(nextState?.targetProfile?.description).toBe(
      "Auto-enriched beta target.",
    );
    expect(output).toContain("Switched to beta-target.");
    expect(output).toContain("Collecting target context.");
    expect(output).toContain("Target profile saved.");
    await expect(
      loadTargetProfile(nextTargetDirectory),
    ).resolves.toMatchObject({
      description: "Auto-enriched beta target.",
    });
  });
});
