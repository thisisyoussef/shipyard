import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSessionState,
  listSessionRunSummaries,
  saveSessionState,
  type SessionState,
} from "../src/engine/state.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createSavedSession(options: {
  sessionId: string;
  targetDirectory: string;
  targetLabel: string;
  lastActiveAt: string;
  turnCount: number;
  latestInstruction: string;
  latestSummary: string;
  latestStatus: "working" | "success" | "error" | "idle";
}): SessionState {
  const session = createSessionState({
    sessionId: options.sessionId,
    targetDirectory: options.targetDirectory,
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
      projectName: options.targetLabel,
    },
  });

  session.turnCount = options.turnCount;
  session.lastActiveAt = options.lastActiveAt;
  session.workbenchState.turns = [
    {
      id: `turn-${options.sessionId}`,
      instruction: options.latestInstruction,
      status: options.latestStatus,
      startedAt: options.lastActiveAt,
      summary: options.latestSummary,
      contextPreview: [],
      agentMessages: [options.latestSummary],
      activity: [],
    },
  ];

  return session;
}

describe("session run history", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("lists saved sessions in descending last-active order with turn previews", async () => {
    const targetDirectory = await createTempDirectory("shipyard-session-history-");
    const olderSession = createSavedSession({
      sessionId: "session-old",
      targetDirectory,
      targetLabel: "demo-target",
      lastActiveAt: "2026-03-24T18:01:00.000Z",
      turnCount: 2,
      latestInstruction: "inspect package.json",
      latestSummary: "Read the package manifest.",
      latestStatus: "success",
    });
    const newerSession = createSavedSession({
      sessionId: "session-new",
      targetDirectory,
      targetLabel: "demo-target",
      lastActiveAt: "2026-03-24T18:05:00.000Z",
      turnCount: 4,
      latestInstruction: "update the header copy",
      latestSummary: "Prepared the copy change.",
      latestStatus: "working",
    });

    await saveSessionState(olderSession);
    await saveSessionState(newerSession);

    const runs = await listSessionRunSummaries(targetDirectory, "session-new");

    expect(runs).toEqual([
      expect.objectContaining({
        sessionId: "session-new",
        targetLabel: "demo-target",
        turnCount: 4,
        latestInstruction: "update the header copy",
        latestSummary: "Prepared the copy change.",
        latestStatus: "working",
        isCurrent: true,
      }),
      expect.objectContaining({
        sessionId: "session-old",
        targetLabel: "demo-target",
        turnCount: 2,
        latestInstruction: "inspect package.json",
        latestSummary: "Read the package manifest.",
        latestStatus: "success",
        isCurrent: false,
      }),
    ]);
  });
});
