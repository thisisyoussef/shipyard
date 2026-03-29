import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  queryArtifacts,
  saveArtifact,
} from "../src/artifacts/registry/index.js";
import type {
  DiscoveryReport,
} from "../src/artifacts/types.js";
import {
  createSessionState,
  loadSessionState,
} from "../src/engine/state.js";
import {
  createInstructionRuntimeState,
  type InstructionTurnResult,
  type InstructionTurnHandoffState,
} from "../src/engine/turn.js";
import {
  executeTddTurn,
} from "../src/tdd/turn.js";
import {
  loadTddLane,
} from "../src/tdd/store.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery(
  scripts: Record<string, string> = {},
): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
      ...scripts,
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json", "README.md"],
    topLevelDirectories: ["src", "tests"],
    projectName: "shipyard-tdd-runtime",
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

async function seedApprovedPlanningArtifacts(targetDirectory: string): Promise<void> {
  await saveArtifact(targetDirectory, {
    type: "user-story-artifact",
    id: "phase-11-story-artifact",
    status: "approved",
    producedBy: "pm",
    approvedBy: "human",
    approvedAt: "2026-03-28T18:00:00.000Z",
    contentKind: "json",
    content: {
      title: "User Story Artifact",
      summary: "Focused runtime stories.",
      stories: [
        {
          id: "STORY-001",
          epicId: "EPIC-001",
          title: "TDD lane start",
          userStory:
            "As an operator, I want an explicit TDD lane so that implementation stays bounded.",
          acceptanceCriteria: [
            "RED is observed before implementation.",
          ],
          edgeCases: [
            "Already-green contracts are escalated.",
          ],
          dependencies: [],
          estimatedComplexity: "Medium",
          priority: 1,
        },
      ],
    },
  });

  await saveArtifact(targetDirectory, {
    type: "backlog-artifact",
    id: "phase-11-backlog",
    status: "approved",
    producedBy: "pm",
    approvedBy: "human",
    approvedAt: "2026-03-28T18:00:00.000Z",
    contentKind: "json",
    content: {
      title: "Backlog Artifact",
      summary: "Ordered backlog.",
      orderedStoryIds: ["STORY-001"],
      entries: [
        {
          storyId: "STORY-001",
          title: "TDD lane start",
          epicId: "EPIC-001",
          priority: 1,
          rank: 1,
          status: "ready",
          dependencies: [],
          specId: "SPEC-001",
        },
      ],
    },
  });

  await saveArtifact(targetDirectory, {
    type: "technical-spec-artifact",
    id: "phase-11-tech-spec",
    status: "approved",
    producedBy: "pm",
    approvedBy: "human",
    approvedAt: "2026-03-28T18:00:00.000Z",
    contentKind: "json",
    content: {
      title: "Technical Spec Artifact",
      summary: "Approved TDD runtime spec.",
      specs: [
        {
          id: "SPEC-001",
          storyId: "STORY-001",
          title: "TDD lane runtime",
          overview:
            "Implement a durable test-author, implementer, and reviewer runtime lane.",
          dataModel: [
            "TddLaneState(id, stage, attempts, immutableTestPaths)",
          ],
          apiContract: [
            "tdd start|status|continue",
          ],
          componentStructure: [
            "src/tdd/contracts.ts",
            "src/tdd/store.ts",
            "src/tdd/turn.ts",
          ],
          stateManagement:
            "Persist lane state under target-local .shipyard/tdd with workbench projections.",
          errorHandling: [
            "Block already-green starts with an escalation artifact.",
          ],
          testExpectations: [
            "RED before implementation.",
            "Immutable test-author artifacts.",
          ],
          implementationOrder: [
            "Contracts",
            "Store",
            "Turn orchestration",
          ],
          designReferences: [],
        },
      ],
    },
  });
}

function createInstructionTurnResult(options: {
  status: InstructionTurnResult["status"];
  finalText: string;
  summary?: string;
}): InstructionTurnResult {
  const handoff: InstructionTurnHandoffState = {
    loaded: null,
    loadError: null,
    emitted: null,
  };

  return {
    phaseName: "code",
    runtimeMode: "graph",
    taskPlan: {
      instruction: "TDD lane task",
      goal: "Keep the lane narrow.",
      targetFilePaths: [],
      plannedSteps: ["Inspect the relevant files before editing."],
    },
    executionSpec: null,
    planningMode: "lightweight",
    harnessRoute: {
      selectedPath: "lightweight",
      actingMode: "raw-loop",
      taskComplexity: "direct",
      usedExplorer: false,
      usedPlanner: false,
      usedVerifier: false,
      verificationMode: "none",
      verificationCheckCount: 0,
      usedBrowserEvaluator: false,
      browserEvaluationStatus: "not_run",
      browserEvaluationFailureKind: null,
      commandReadinessStatus: "none",
      commandReadyUrl: null,
      handoffLoaded: false,
      handoffEmitted: false,
      handoffReason: null,
      checkpointRequested: false,
      continuationCount: 0,
      actingLoopBudget: 25,
      actingLoopBudgetReason: "narrow-default",
      firstHardFailure: null,
    },
    contextEnvelope: {
      stable: {
        discovery: createDiscovery(),
        projectRules: "",
        availableScripts: {
          test: "vitest run",
        },
      },
      task: {
        currentInstruction: "TDD runtime task",
        injectedContext: [],
        targetFilePaths: [],
      },
      runtime: {
        recentToolOutputs: [],
        recentErrors: [],
        currentGitDiff: null,
      },
      session: {
        rollingSummary: "",
        retryCountsByFile: {},
        blockedFiles: [],
        latestHandoff: null,
        activeTask: null,
      },
    },
    status: options.status,
    summary: options.summary ?? options.finalText,
    finalText: options.finalText,
    selectedTargetPath: null,
    langSmithTrace: null,
    runtimeAssist: {
      activeProfileId: null,
      activeProfileName: null,
      activeProfileRoute: null,
      loadedSkills: [],
    },
    handoff,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("tdd runtime lane", () => {
  it("requires a red check before implementation begins", async () => {
    const targetDirectory = await createTempDirectory("shipyard-tdd-red-");
    await seedApprovedPlanningArtifacts(targetDirectory);

    const sessionState = createSessionState({
      sessionId: "tdd-red-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep TDD stages durable.",
    });

    const executeTurn = vi.fn(async (options) => {
      await options.reporter?.onEdit?.({
        path: "tests/tdd-runtime.red.test.ts",
        summary: "Authored the focused test contract.",
        diff: "@@ -0,0 +1 @@",
        addedLines: 1,
        removedLines: 0,
      });

      return createInstructionTurnResult({
        status: "success",
        finalText: "Authored focused tests.",
      });
    });
    const runValidationCommand = vi.fn(async () => ({
      command: "vitest run tests/tdd-runtime.red.test.ts",
      exitCode: 1,
      stdout: "Expected failure while RED is active.",
      stderr: "",
      timedOut: false,
      signal: null,
    }));

    const result = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd start vitest run tests/tdd-runtime.red.test.ts",
      executeTurn,
      runValidationCommand,
    });

    expect(result.status).toBe("success");
    expect(result.lane?.status).toBe("running");
    expect(result.lane?.currentStage).toBe("implementer");
    expect(result.lane?.stageAttempts.testAuthor).toBe(1);
    expect(sessionState.activeTddLaneId).toBe(result.lane?.laneId ?? null);
    expect(sessionState.workbenchState.tddState).toMatchObject({
      activeLaneId: result.lane?.laneId ?? null,
      status: "running",
      currentStage: "implementer",
    });

    const handoffs = await queryArtifacts(targetDirectory, {
      type: "tdd-handoff",
      includeContent: true,
      latestOnly: false,
    });
    expect(handoffs.records).toHaveLength(1);
    expect(handoffs.records[0]?.content).toMatchObject({
      stage: "test-author",
      validation: {
        expectedOutcome: "red",
        observedOutcome: "red",
      },
      immutableTestPaths: ["tests/tdd-runtime.red.test.ts"],
    });
  });

  it("surfaces already-green test contracts as an escalation", async () => {
    const targetDirectory = await createTempDirectory("shipyard-tdd-already-green-");
    await seedApprovedPlanningArtifacts(targetDirectory);

    const sessionState = createSessionState({
      sessionId: "tdd-already-green-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep TDD stages durable.",
    });

    const executeTurn = vi.fn(async (options) => {
      await options.reporter?.onEdit?.({
        path: "tests/tdd-runtime.green.test.ts",
        summary: "Authored focused tests.",
        diff: "@@ -0,0 +1 @@",
        addedLines: 1,
        removedLines: 0,
      });

      return createInstructionTurnResult({
        status: "success",
        finalText: "Authored focused tests.",
      });
    });

    const result = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd start vitest run tests/tdd-runtime.green.test.ts",
      executeTurn,
      runValidationCommand: async () => ({
        command: "vitest run tests/tdd-runtime.green.test.ts",
        exitCode: 0,
        stdout: "Unexpectedly green.",
        stderr: "",
        timedOut: false,
        signal: null,
      }),
    });

    expect(result.lane?.status).toBe("blocked");
    expect(result.lane?.currentStage).toBe("test-author");

    const escalations = await queryArtifacts(targetDirectory, {
      type: "tdd-escalation",
      includeContent: true,
      latestOnly: false,
    });
    expect(escalations.records).toHaveLength(1);
    expect(escalations.records[0]?.content).toMatchObject({
      stage: "test-author",
      reason: "already-green-contract",
    });
  });

  it("persists tdd stage state and handoffs across restart", async () => {
    const targetDirectory = await createTempDirectory("shipyard-tdd-persist-");
    await seedApprovedPlanningArtifacts(targetDirectory);

    const sessionState = createSessionState({
      sessionId: "tdd-persist-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep TDD stages durable.",
    });

    const started = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd start vitest run tests/tdd-runtime.persist.test.ts",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "tests/tdd-runtime.persist.test.ts",
          summary: "Authored focused tests.",
          diff: "@@ -0,0 +1 @@",
          addedLines: 1,
          removedLines: 0,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Authored focused tests.",
        });
      },
      runValidationCommand: async () => ({
        command: "vitest run tests/tdd-runtime.persist.test.ts",
        exitCode: 1,
        stdout: "RED observed.",
        stderr: "",
        timedOut: false,
        signal: null,
      }),
    });

    const reloadedSession = await loadSessionState(
      targetDirectory,
      sessionState.sessionId,
    );
    const reloadedLane = await loadTddLane(
      targetDirectory,
      started.lane?.laneId ?? "",
    );

    expect(reloadedSession?.activeTddLaneId).toBe(started.lane?.laneId ?? null);
    expect(reloadedSession?.workbenchState.tddState).toMatchObject({
      activeLaneId: started.lane?.laneId ?? null,
      currentStage: "implementer",
    });
    expect(reloadedLane).toMatchObject({
      laneId: started.lane?.laneId ?? null,
      currentStage: "implementer",
      stageAttempts: {
        testAuthor: 1,
      },
    });
  });

  it("records implementer escalations instead of mutating tests", async () => {
    const targetDirectory = await createTempDirectory("shipyard-tdd-implementer-escalation-");
    await seedApprovedPlanningArtifacts(targetDirectory);

    const sessionState = createSessionState({
      sessionId: "tdd-implementer-escalation-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep TDD stages durable.",
    });

    await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd start vitest run tests/tdd-runtime.immutable.test.ts",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "tests/tdd-runtime.immutable.test.ts",
          summary: "Authored focused tests.",
          diff: "@@ -0,0 +1 @@",
          addedLines: 1,
          removedLines: 0,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Authored focused tests.",
        });
      },
      runValidationCommand: async () => ({
        command: "vitest run tests/tdd-runtime.immutable.test.ts",
        exitCode: 1,
        stdout: "RED observed.",
        stderr: "",
        timedOut: false,
        signal: null,
      }),
    });

    const continueResult = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd continue",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "tests/tdd-runtime.immutable.test.ts",
          summary: "Attempted to weaken the test contract.",
          diff: "@@ -1 +1 @@",
          addedLines: 1,
          removedLines: 1,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Tried to update the test contract.",
        });
      },
      runValidationCommand: async () => ({
        command: "vitest run tests/tdd-runtime.immutable.test.ts",
        exitCode: 0,
        stdout: "Tests passed.",
        stderr: "",
        timedOut: false,
        signal: null,
      }),
    });

    expect(continueResult.lane?.status).toBe("blocked");
    expect(continueResult.lane?.currentStage).toBe("implementer");

    const escalations = await queryArtifacts(targetDirectory, {
      type: "tdd-escalation",
      includeContent: true,
      latestOnly: false,
    });
    expect(escalations.records.at(0)?.content).toMatchObject({
      stage: "implementer",
      reason: "immutable-test-artifact-modified",
      immutableTestPaths: ["tests/tdd-runtime.immutable.test.ts"],
    });
  });

  it("emits a reviewer quality report after green", async () => {
    const targetDirectory = await createTempDirectory("shipyard-tdd-reviewer-");
    await seedApprovedPlanningArtifacts(targetDirectory);

    const sessionState = createSessionState({
      sessionId: "tdd-reviewer-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep TDD stages durable.",
    });

    await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd start vitest run tests/tdd-runtime.reviewer.test.ts",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "tests/tdd-runtime.reviewer.test.ts",
          summary: "Authored focused tests.",
          diff: "@@ -0,0 +1 @@",
          addedLines: 1,
          removedLines: 0,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Authored focused tests.",
        });
      },
      runValidationCommand: async () => ({
        command: "vitest run tests/tdd-runtime.reviewer.test.ts",
        exitCode: 1,
        stdout: "RED observed.",
        stderr: "",
        timedOut: false,
        signal: null,
      }),
    });

    const afterImplementer = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd continue",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "src/tdd/turn.ts",
          summary: "Implemented the runtime lane.",
          diff: "@@ -0,0 +1 @@",
          addedLines: 1,
          removedLines: 0,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Implemented the runtime lane.",
        });
      },
      runValidationCommand: async () => ({
        command: "vitest run tests/tdd-runtime.reviewer.test.ts",
        exitCode: 0,
        stdout: "GREEN observed.",
        stderr: "",
        timedOut: false,
        signal: null,
      }),
    });

    expect(afterImplementer.lane?.currentStage).toBe("reviewer");

    const completed = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd continue",
    });

    expect(completed.lane?.status).toBe("completed");
    expect(completed.lane?.currentStage).toBe("reviewer");

    const reports = await queryArtifacts(targetDirectory, {
      type: "tdd-quality-report",
      includeContent: true,
      latestOnly: false,
    });
    expect(reports.records).toHaveLength(1);
    expect(reports.records[0]?.content).toMatchObject({
      stage: "reviewer",
      focusedValidation: {
        observedOutcome: "green",
      },
    });
  });

  it("records property or mutation adapters as pass skip or blocked", async () => {
    const targetDirectory = await createTempDirectory("shipyard-tdd-optional-checks-");
    await seedApprovedPlanningArtifacts(targetDirectory);

    const sessionState = createSessionState({
      sessionId: "tdd-optional-checks-session",
      targetDirectory,
      discovery: createDiscovery({
        "test:property": "pnpm property-check",
        "test:mutation": "pnpm mutation-check",
      }),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Keep TDD stages durable.",
    });

    await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd start --property --mutation vitest run tests/tdd-runtime.optional.test.ts",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "tests/tdd-runtime.optional.test.ts",
          summary: "Authored focused tests.",
          diff: "@@ -0,0 +1 @@",
          addedLines: 1,
          removedLines: 0,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Authored focused tests.",
        });
      },
      runValidationCommand: async (request) => {
        if (request.command === "vitest run tests/tdd-runtime.optional.test.ts") {
          return {
            command: request.command,
            exitCode: 1,
            stdout: "RED observed.",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }

        throw new Error(`Unexpected command during test-author stage: ${request.command}`);
      },
    });

    const afterImplementer = await executeTddTurn({
      sessionState,
      runtimeState,
      instruction: "tdd continue",
      executeTurn: async (options) => {
        await options.reporter?.onEdit?.({
          path: "src/tdd/contracts.ts",
          summary: "Implemented the runtime lane.",
          diff: "@@ -0,0 +1 @@",
          addedLines: 1,
          removedLines: 0,
        });

        return createInstructionTurnResult({
          status: "success",
          finalText: "Implemented the runtime lane.",
        });
      },
      runValidationCommand: async (request) => {
        if (request.command === "vitest run tests/tdd-runtime.optional.test.ts") {
          return {
            command: request.command,
            exitCode: 0,
            stdout: "GREEN observed.",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }

        if (request.command === "pnpm property-check") {
          return {
            command: request.command,
            exitCode: 0,
            stdout: "Property checks passed.",
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }

        if (request.command === "pnpm mutation-check") {
          return {
            command: request.command,
            exitCode: 1,
            stdout: "",
            stderr: "Mutation survivors remain.",
            timedOut: false,
            signal: null,
          };
        }

        throw new Error(`Unexpected command: ${request.command}`);
      },
    });

    expect(afterImplementer.lane?.optionalChecks).toEqual([
      expect.objectContaining({
        kind: "property",
        status: "passed",
      }),
      expect.objectContaining({
        kind: "mutation",
        status: "blocked",
      }),
    ]);
  });
});
