import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HUMAN_SIMULATOR_TOOL_NAMES,
  buildHumanSimulatorPrompt,
  parseHumanSimulatorDecision,
  runHumanSimulator,
} from "../src/agents/human-simulator.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import "../src/tools/index.js";
import {
  createFakeModelAdapter,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
  getToolNamesFromCall,
} from "./support/fake-model-adapter.js";

const createdDirectories: string[] = [];

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-human-sim-"));
  createdDirectories.push(directory);
  return directory;
}

function createDiscoveryReport() {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json"],
    topLevelDirectories: ["src"],
    projectName: "shipyard",
    previewCapability: createUnavailablePreviewCapability(
      "No preview is configured for this test target.",
    ),
  };
}

function createLatestTurnReview(instruction: string) {
  return {
    instruction,
    status: "success" as const,
    summary: "The last Shipyard turn paused at a continuation handoff.",
    finalText: "Automatic continuation paused after 1 resume attempt(s); continue from the persisted handoff.",
    taskPlan: {
      instruction,
      goal: instruction,
      targetFilePaths: ["src/ui/server.ts"],
      plannedSteps: ["Read the affected runtime files."],
    },
    executionSpec: null,
    harnessRoute: {
      selectedPath: "lightweight" as const,
      actingMode: "raw-loop" as const,
      taskComplexity: "direct" as const,
      usedExplorer: false,
      usedPlanner: false,
      usedVerifier: false,
      verificationMode: "none" as const,
      verificationCheckCount: 0,
      usedBrowserEvaluator: false,
      browserEvaluationStatus: "not_run" as const,
      browserEvaluationFailureKind: null,
      commandReadinessStatus: "none" as const,
      commandReadyUrl: null,
      handoffLoaded: true,
      handoffEmitted: true,
      handoffReason: "iteration-threshold" as const,
      checkpointRequested: true,
      continuationCount: 1,
      actingLoopBudget: 45,
      actingLoopBudgetReason: "broad-continuation" as const,
      firstHardFailure: null,
    },
    verificationReport: null,
    selectedTargetPath: null,
  };
}

describe("human simulator", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("extracts the structured next-instruction decision from JSON-like output", () => {
    expect(
      parseHumanSimulatorDecision(
        [
          "Decision follows.",
          JSON.stringify({
            summary: "The first pass landed, so push on the spacing cleanup next.",
            instruction: "Tighten the dashboard spacing and align the headers.",
            focusAreas: ["spacing", "hierarchy"],
          }),
        ].join("\n"),
      ),
    ).toEqual({
      summary: "The first pass landed, so push on the spacing cleanup next.",
      instruction: "Tighten the dashboard spacing and align the headers.",
      focusAreas: ["spacing", "hierarchy"],
    });
  });

  it("includes the original brief, attached human context, and queued feedback in the prompt", () => {
    const prompt = buildHumanSimulatorPrompt({
      originalBrief: "Build the onboarding flow.",
      initialHumanContext: ["Use the uploaded wireframe as the visual anchor."],
      iteration: 2,
      discovery: createDiscoveryReport(),
      previewState: {
        status: "running",
        summary: "Preview ready.",
        url: "http://127.0.0.1:3000",
        logTail: [],
        lastRestartReason: null,
      },
      pendingHumanFeedback: [
        {
          text: "Make the primary CTA more obvious.",
          submittedAt: "2026-03-26T15:00:00.000Z",
        },
      ],
      history: [],
      latestTurn: null,
    });

    expect(prompt).toContain("Build the onboarding flow.");
    expect(prompt).toContain("Use the uploaded wireframe as the visual anchor.");
    expect(prompt).toContain("Make the primary CTA more obvious.");
  });

  it("fails closed when the human simulator requests a write-capable tool", async () => {
    const directory = await createTempProject();
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_write",
          name: "write_file",
          input: {
            path: "notes.md",
            contents: "Shipyard should not let the simulator write.",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        summary: "Keep going.",
        instruction: "Adjust the layout.",
        focusAreas: [],
      })),
    ]);

    await expect(
      runHumanSimulator(
        {
          originalBrief: "Build the dashboard.",
          iteration: 1,
          discovery: createDiscoveryReport(),
          previewState: {
            status: "idle",
            summary: "No preview yet.",
            url: null,
            logTail: [],
            lastRestartReason: null,
          },
          history: [],
        },
        directory,
        {
          modelAdapter,
          logger: {
            log() {},
          },
        },
      ),
    ).rejects.toThrow(/write_file|unauthorized/i);

    expect(getToolNamesFromCall(modelAdapter.calls[0]!)).toEqual([
      ...HUMAN_SIMULATOR_TOOL_NAMES,
    ]);
  });

  it("falls back to the latest scoped instruction when the review loop hits its iteration budget", async () => {
    const directory = await createTempProject();
    const modelAdapter = createFakeModelAdapter((_input, { turnNumber }) =>
      createFakeToolCallTurnResult([
        {
          id: `toolu_list_${String(turnNumber)}`,
          name: "list_files",
          input: {
            path: ".",
          },
        },
      ]),
    );

    const decision = await runHumanSimulator(
      {
        originalBrief: "Keep improving the Ship workbench.",
        iteration: 3,
        discovery: createDiscoveryReport(),
        previewState: {
          status: "running",
          summary: "Preview ready.",
          url: "http://127.0.0.1:3000",
          logTail: [],
          lastRestartReason: null,
        },
        pendingHumanFeedback: [
          {
            text: "Treat the current team-profile direction as approved and keep going.",
            submittedAt: "2026-03-28T22:15:00.000Z",
          },
        ],
        history: [
          {
            iteration: 2,
            simulatorSummary: "The person profile route is still the biggest gap.",
            simulatorInstruction:
              "Replace the placeholder /team/:id page with a real person detail experience.",
            appliedHumanFeedback: [],
            turn: createLatestTurnReview(
              "Replace the placeholder /team/:id page with a real person detail experience.",
            ),
          },
        ],
        latestTurn: createLatestTurnReview(
          "Replace the placeholder /team/:id page with a real person detail experience.",
        ),
      },
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
        maxIterations: 2,
      },
    );

    expect(decision.summary).toMatch(/bounded read-only review budget/i);
    expect(decision.instruction).toContain(
      "Replace the placeholder /team/:id page with a real person detail experience.",
    );
    expect(decision.instruction).toContain(
      "Treat the current team-profile direction as approved and keep going.",
    );
    expect(decision.instruction).toMatch(/without reopening another read-only review loop/i);
    expect(decision.focusAreas).toEqual([
      "queued-human-feedback",
      "continuation-recovery",
    ]);
    expect(modelAdapter.calls).toHaveLength(2);
  });
});
