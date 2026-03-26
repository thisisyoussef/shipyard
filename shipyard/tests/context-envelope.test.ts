import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SERIALIZED_SESSION_HISTORY_CHAR_BUDGET,
  buildContextEnvelope,
  serializeContextEnvelope,
} from "../src/context/envelope.js";
import type { LoadedExecutionHandoff } from "../src/artifacts/types.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

describe("context envelope", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("builds the envelope with AGENTS rules, retries, blocked files, and recent errors", async () => {
    const targetDirectory = await createTempDirectory("shipyard-envelope-");
    await writeFile(
      path.join(targetDirectory, "AGENTS.md"),
      "Follow the repo rules before editing.\n",
      "utf8",
    );

    const envelope = await buildContextEnvelope({
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
        hasAgentsMd: true,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "shipyard",
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
      currentInstruction: "inspect src/app.ts",
      rollingSummary: "Turn 1: inspect README -> completed",
      injectedContext: ["Keep the tests green."],
      targetFilePaths: ["src/app.ts"],
      recentToolOutputs: ["read_file src/app.ts"],
      recentErrors: ["Verification failed."],
      currentGitDiff: "diff --git a/src/app.ts b/src/app.ts",
      retryCountsByFile: {
        "src/app.ts": 2,
      },
      blockedFiles: ["src/blocked.ts"],
    });

    expect(envelope.stable.projectRules).toContain("Follow the repo rules");
    expect(envelope.session.retryCountsByFile).toEqual({
      "src/app.ts": 2,
    });
    expect(envelope.session.blockedFiles).toEqual(["src/blocked.ts"]);
    expect(envelope.runtime.recentErrors).toEqual(["Verification failed."]);
    expect(envelope.task.injectedContext).toEqual(["Keep the tests green."]);
  });

  it("serializes the envelope with the required section headers in a stable order", async () => {
    const targetDirectory = await createTempDirectory("shipyard-envelope-order-");
    const envelope = await buildContextEnvelope({
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
      currentInstruction: "create a README",
      rollingSummary: "",
      injectedContext: [],
      recentErrors: [],
      retryCountsByFile: {},
      blockedFiles: [],
    });

    const serialized = serializeContextEnvelope(envelope);
    const expectedHeaders = [
      "Project Context",
      "Project Rules",
      "Injected Context",
      "Session History",
      "Latest Handoff",
      "Recent Errors",
      "Blocked Files",
    ];

    expect(expectedHeaders.every((header) => serialized.includes(header))).toBe(true);

    for (let index = 1; index < expectedHeaders.length; index += 1) {
      expect(serialized.indexOf(expectedHeaders[index - 1]!)).toBeLessThan(
        serialized.indexOf(expectedHeaders[index]!),
      );
    }

    expect(serialized).toContain("Instruction: create a README");
    expect(serialized).toContain("Available Scripts:\n(none)");
    expect(serialized).toContain("Injected Context\n(none)");
    expect(serialized).toContain("Latest Handoff\n(none)");
    expect(serialized).toContain("Blocked Files\n(none)");
  });

  it("serializes the latest handoff as structured resume context", async () => {
    const targetDirectory = await createTempDirectory("shipyard-envelope-handoff-");
    const latestHandoff: LoadedExecutionHandoff = {
      artifactPath: ".shipyard/artifacts/session-123/turn-3.handoff.json",
      handoff: {
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
        completedWork: ["Captured the implementation goal."],
        remainingWork: ["Resume in a fresh turn to finish the remaining task plan safely."],
        touchedFiles: ["src/app.ts"],
        blockedFiles: [],
        latestEvaluation: {
          command: "pnpm test",
          exitCode: 0,
          passed: true,
          summary: "Verification passed.",
        },
        nextRecommendedAction: "Resume from the handoff before making additional edits.",
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
          targetFilePaths: ["src/app.ts"],
          plannedSteps: [
            "Read the relevant files before editing.",
            "Implement the dashboard shell.",
            "Leave command-based verification to the verifier after the edit unless shell output is required now.",
          ],
        },
      },
    };

    const envelope = await buildContextEnvelope({
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
        projectName: "shipyard",
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
      currentInstruction: "continue the dashboard shell work",
      rollingSummary: "Turn 3: implement dashboard -> long run",
      latestHandoff,
    });

    const serialized = serializeContextEnvelope(envelope);

    expect(serialized).toContain("Latest Handoff");
    expect(serialized).toContain(latestHandoff.artifactPath);
    expect(serialized).toContain("Trigger: iteration-threshold");
    expect(serialized).toContain("Resume from the handoff before making additional edits.");
  });

  it("prioritizes touched files and next action when the latest handoff is oversized", async () => {
    const targetDirectory = await createTempDirectory("shipyard-envelope-priority-");
    const latestHandoff: LoadedExecutionHandoff = {
      artifactPath: ".shipyard/artifacts/session-123/turn-9.handoff.json",
      handoff: {
        version: 1,
        sessionId: "session-123",
        turnCount: 9,
        createdAt: "2026-03-25T23:10:00.000Z",
        instruction: "Continue the Trello-style dashboard build",
        phaseName: "code",
        runtimeMode: "graph",
        status: "success",
        summary: "Turn 9 checkpointed after a long greenfield continuation.",
        goal: "Continue the Trello-style dashboard build",
        completedWork: [
          `Low-priority prose ${"x".repeat(1_800)}`,
        ],
        remainingWork: [
          "Resume from the checkpoint and keep extending the just-created dashboard files.",
        ],
        touchedFiles: [
          "apps/web/src/App.tsx",
          "apps/web/src/lib/seed-data.ts",
          "apps/web/src/components/status-summary.tsx",
        ],
        blockedFiles: [],
        latestEvaluation: {
          command: "pnpm typecheck",
          exitCode: 0,
          passed: true,
          summary: "Typecheck passed after the checkpoint.",
        },
        nextRecommendedAction:
          "Resume from the persisted handoff and continue in the touched dashboard files before widening scope.",
        resetReason: {
          kind: "iteration-threshold",
          summary: "The acting loop crossed the long-run iteration threshold.",
          thresholds: {
            actingIterations: 4,
            recoveryAttempts: 1,
          },
          metrics: {
            actingIterations: 6,
            recoveryAttempts: 0,
            blockedFileCount: 0,
          },
        },
        taskPlan: {
          instruction: "Continue the Trello-style dashboard build",
          goal: "Continue the Trello-style dashboard build",
          targetFilePaths: ["apps/web/src/App.tsx"],
          plannedSteps: [
            "Continue the dashboard build safely.",
          ],
        },
      },
    };

    const envelope = await buildContextEnvelope({
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
        hasAgentsMd: true,
        topLevelFiles: ["package.json", "README.md", "AGENTS.md"],
        topLevelDirectories: ["apps", "packages"],
        projectName: "shipyard",
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
      currentInstruction: "Continue the Trello-style dashboard build",
      rollingSummary: "Turn 9 checkpointed after a long continuation.",
      latestHandoff,
    });

    const serialized = serializeContextEnvelope(envelope);
    const latestHandoffBody = serialized
      .split("Latest Handoff\n")[1]
      ?.split("\nActive Task")[0]
      ?? "";

    expect(latestHandoffBody).toContain("Touched Files:");
    expect(latestHandoffBody).toContain("apps/web/src/lib/seed-data.ts");
    expect(latestHandoffBody).toContain("Latest Evaluation: passed: Typecheck passed after the checkpoint.");
    expect(latestHandoffBody).toContain("Next Recommended Action:");
    expect(latestHandoffBody).not.toContain(`Low-priority prose ${"x".repeat(400)}`);
  });

  it("labels doc-seeded targets as bootstrap-ready instead of generic existing repos", async () => {
    const targetDirectory = await createTempDirectory("shipyard-envelope-bootstrap-ready-");
    const envelope = await buildContextEnvelope({
      targetDirectory,
      discovery: {
        isGreenfield: false,
        bootstrapReady: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: true,
        hasAgentsMd: true,
        topLevelFiles: ["AGENTS.md", "README.md"],
        topLevelDirectories: [],
        projectName: null,
        previewCapability: createUnavailablePreviewCapability(
          "Seed docs exist but no supported local preview signal was detected yet.",
        ),
      },
      currentInstruction: "Bootstrap this target",
      rollingSummary: "",
    });

    const serialized = serializeContextEnvelope(envelope);

    expect(serialized).toContain("Target Type: bootstrap-ready");
  });

  it("truncates oversized session history with an explicit budget marker", async () => {
    const targetDirectory = await createTempDirectory("shipyard-envelope-budget-");
    const longRollingSummary = `Turn 1: ${"x".repeat(4_500)}`;
    const envelope = await buildContextEnvelope({
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
        projectName: "shipyard",
        previewCapability: createUnavailablePreviewCapability(
          "No supported local preview signal was detected for this target.",
        ),
      },
      currentInstruction: "continue the dashboard shell work",
      rollingSummary: longRollingSummary,
      recentErrors: ["A very long runtime error that still needs to be bounded."],
      retryCountsByFile: {
        "src/app.ts": 2,
      },
    });

    const serialized = serializeContextEnvelope(envelope);
    const sessionHistoryBody = serialized
      .split("Session History\n")[1]
      ?.split("\n\nLatest Handoff")[0]
      ?? "";

    expect(sessionHistoryBody).toContain("[truncated");
    expect(sessionHistoryBody.length).toBeLessThanOrEqual(
      SERIALIZED_SESSION_HISTORY_CHAR_BUDGET + 200,
    );
  });
});
