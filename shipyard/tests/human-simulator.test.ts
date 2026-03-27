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
});
