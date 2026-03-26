import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ExecutionHandoff,
  VerificationReport,
} from "../src/artifacts/types.js";
import {
  createExecutionHandoffDecision,
  loadExecutionHandoff,
  saveExecutionHandoff,
} from "../src/artifacts/handoff.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import { createSessionState } from "../src/engine/state.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
} from "../src/engine/turn.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createVerificationReport(
  overrides: Partial<VerificationReport> = {},
): VerificationReport {
  return {
    command: "pnpm test",
    exitCode: 1,
    passed: false,
    stdout: "",
    stderr: "Failed.",
    summary: "Verification failed.",
    ...overrides,
  };
}

function createExecutionHandoff(
  overrides: Partial<ExecutionHandoff> = {},
): ExecutionHandoff {
  return {
    version: 1,
    sessionId: "session-123",
    turnCount: 3,
    createdAt: "2026-03-25T21:30:00.000Z",
    instruction: "Implement the dashboard shell",
    phaseName: "code",
    runtimeMode: "graph",
    status: "success",
    summary: "Turn 3 completed via graph: dashboard shell is scaffolded.",
    goal: "Implement the dashboard shell",
    completedWork: [
      "Captured the implementation goal.",
      "Touched src/app.ts and src/routes.tsx.",
    ],
    remainingWork: [
      "Resume in a fresh turn to finish the remaining task plan safely.",
    ],
    touchedFiles: ["src/app.ts", "src/routes.tsx"],
    blockedFiles: [],
    latestEvaluation: {
      command: "pnpm test",
      exitCode: 0,
      passed: true,
      summary: "Verification passed.",
    },
    nextRecommendedAction:
      "Resume from the handoff before making additional edits.",
    resetReason: {
      kind: "iteration-threshold",
      summary: "The acting loop crossed the long-run iteration threshold.",
      thresholds: {
        actingIterations: 4,
        recoveryAttempts: 1,
      },
      metrics: {
        actingIterations: 5,
        recoveryAttempts: 0,
        blockedFileCount: 0,
      },
    },
    taskPlan: {
      instruction: "Implement the dashboard shell",
      goal: "Implement the dashboard shell",
      targetFilePaths: ["src/app.ts", "src/routes.tsx"],
      plannedSteps: [
        "Read the relevant files before editing.",
        "Implement the dashboard shell.",
        "Leave command-based verification to the verifier after the edit unless shell output is required now.",
      ],
    },
    ...overrides,
  };
}

describe("execution handoff artifacts", () => {
  afterEach(async () => {
    vi.restoreAllMocks();

    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("saves and reloads a typed handoff artifact under .shipyard/artifacts", async () => {
    const targetDirectory = await createTempDirectory("shipyard-handoff-");
    const saved = await saveExecutionHandoff(
      targetDirectory,
      createExecutionHandoff(),
    );

    expect(saved.artifactPath).toContain(".shipyard/artifacts/session-123/");
    const reloaded = await loadExecutionHandoff(
      targetDirectory,
      saved.artifactPath,
    );

    expect(reloaded.error).toBeNull();
    expect(reloaded.handoff).toEqual(saved);
  });

  it("returns an explicit fallback error for malformed persisted handoffs", async () => {
    const targetDirectory = await createTempDirectory("shipyard-handoff-bad-");
    const relativePath = ".shipyard/artifacts/session-123/bad-turn.handoff.json";
    const absolutePath = path.join(targetDirectory, relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "{bad json", "utf8");

    const loaded = await loadExecutionHandoff(targetDirectory, relativePath);

    expect(loaded.handoff).toBeNull();
    expect(loaded.error).toMatch(/Malformed execution handoff/i);
  });

  it("keeps the lightweight path for trivial runs and emits handoffs for long or unstable runs", () => {
    expect(
      createExecutionHandoffDecision({
        actingIterations: 1,
        retryCountsByFile: {},
        blockedFiles: [],
      }),
    ).toMatchObject({
      shouldPersist: false,
      kind: null,
    });

    expect(
      createExecutionHandoffDecision({
        actingIterations: 5,
        retryCountsByFile: {},
        blockedFiles: [],
      }),
    ).toMatchObject({
      shouldPersist: true,
      kind: "iteration-threshold",
    });

    expect(
      createExecutionHandoffDecision({
        actingIterations: 1,
        retryCountsByFile: {
          "src/app.ts": 1,
        },
        blockedFiles: [],
      }),
    ).toMatchObject({
      shouldPersist: true,
      kind: "recovery-threshold",
    });
  });

  it("emits a handoff after a long run and injects it into the next turn as structured context", async () => {
    const targetDirectory = await createTempDirectory("shipyard-handoff-turn-");
    const sessionState = createSessionState({
      sessionId: "handoff-session",
      targetDirectory,
      discovery: {
        isGreenfield: false,
        language: "typescript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
        },
        hasReadme: true,
        hasAgentsMd: false,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "handoff-target",
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
    });
    const runActingLoop = vi
      .fn()
      .mockResolvedValueOnce({
        finalText: "Long run complete.",
        messageHistory: [],
        iterations: 5,
        didEdit: false,
        lastEditedFile: "src/app.ts",
        touchedFiles: ["src/app.ts", "src/routes.tsx", "src/lib/data.ts"],
      })
      .mockResolvedValueOnce({
        finalText: "Resumed from handoff.",
        messageHistory: [],
        iterations: 1,
        didEdit: false,
        lastEditedFile: null,
        touchedFiles: [],
      });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        runActingLoop,
        verifyState: async () =>
          createVerificationReport({
            exitCode: 0,
            passed: true,
            summary: "Verification passed.",
          }),
      },
    });

    const emittedTurn = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Implement the dashboard shell in src/app.ts",
    });

    expect(emittedTurn.handoff.loadError).toBeNull();
    expect(emittedTurn.handoff.loaded).toBeNull();
    expect(emittedTurn.handoff.emitted?.artifactPath).toContain(
      ".shipyard/artifacts/handoff-session/",
    );
    expect(sessionState.activeHandoffPath).toBe(
      emittedTurn.handoff.emitted?.artifactPath,
    );

    const artifactContents = JSON.parse(
      await readFile(
        path.join(
          targetDirectory,
          emittedTurn.handoff.emitted?.artifactPath ?? "",
        ),
        "utf8",
      ),
    ) as ExecutionHandoff;
    expect(artifactContents.resetReason.kind).toBe("iteration-threshold");
    expect(artifactContents.touchedFiles).toEqual(
      expect.arrayContaining(["src/app.ts", "src/routes.tsx", "src/lib/data.ts"]),
    );
    expect(artifactContents.completedWork).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Goal checkpointed"),
        expect.stringContaining("Recent touched files"),
      ]),
    );

    const resumedTurn = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Continue the dashboard work in src/app.ts.",
    });

    expect(resumedTurn.handoff.loaded?.artifactPath).toBe(
      emittedTurn.handoff.emitted?.artifactPath,
    );
    expect(resumedTurn.contextEnvelope.session.latestHandoff).toMatchObject({
      artifactPath: emittedTurn.handoff.emitted?.artifactPath,
      handoff: {
        nextRecommendedAction: expect.stringContaining("Resume"),
      },
    });
    expect(sessionState.activeHandoffPath).toBeNull();
  });

  it("drops a corrupted active handoff pointer and falls back to normal execution", async () => {
    const targetDirectory = await createTempDirectory("shipyard-handoff-corrupt-");
    const sessionState = createSessionState({
      sessionId: "handoff-corrupt-session",
      targetDirectory,
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
        previewCapability: createUnavailablePreviewCapability(
          "Greenfield target; no supported local preview has been detected yet.",
        ),
      },
    });
    const badRelativePath =
      ".shipyard/artifacts/handoff-corrupt-session/bad-turn.handoff.json";

    sessionState.activeHandoffPath = badRelativePath;

    await mkdir(path.join(targetDirectory, ".shipyard", "artifacts", "handoff-corrupt-session"), {
      recursive: true,
    });
    await writeFile(
      path.join(targetDirectory, badRelativePath),
      "{ definitely not valid json",
      "utf8",
    );

    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        runActingLoop: async () => ({
          finalText: "Fallback execution still worked.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Inspect the target.",
    });

    expect(result.status).toBe("success");
    expect(result.contextEnvelope.session.latestHandoff).toBeNull();
    expect(result.handoff.loadError).toMatch(/Malformed execution handoff/i);
    expect(sessionState.activeHandoffPath).toBeNull();
  });
});
