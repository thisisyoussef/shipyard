import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
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
            "Verify the result after the edit.",
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
});
