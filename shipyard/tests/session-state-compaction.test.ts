import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSessionState,
  loadSessionState,
  saveSessionState,
} from "../src/engine/state.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

describe("session state compaction", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("compacts persisted workbench state while preserving the active turn", async () => {
    const targetDirectory = await createTempDirectory("shipyard-session-compact-");
    const session = createSessionState({
      sessionId: "session-compact",
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
        projectName: "demo-target",
      },
    });

    session.workbenchState.agentStatus = "A".repeat(1_500);
    session.workbenchState.latestError = "B".repeat(1_000);
    session.workbenchState.sessionHistory = Array.from({ length: 25 }, (_, index) => ({
      sessionId: `history-${String(index)}`,
      targetLabel: "demo-target",
      targetDirectory,
      activePhase: "code" as const,
      startedAt: "2026-03-28T00:00:00.000Z",
      lastActiveAt: "2026-03-28T00:00:00.000Z",
      turnCount: index,
      latestInstruction: `Instruction ${String(index)}`,
      latestSummary: `Summary ${String(index)}`,
      latestStatus: "success" as const,
      isCurrent: false,
    }));
    session.workbenchState.contextHistory = Array.from({ length: 50 }, (_, index) => ({
      id: `context-${String(index)}`,
      text: `Context ${String(index)}`,
      submittedAt: "2026-03-28T00:00:00.000Z",
      turnId: `turn-${String(index)}`,
    }));

    const completedTurns = Array.from({ length: 12 }, (_, index) => ({
      id: `turn-complete-${String(index)}`,
      instruction: `Completed instruction ${String(index)} ${"x".repeat(300)}`,
      status: "success" as const,
      startedAt: "2026-03-28T00:00:00.000Z",
      summary: `Completed summary ${String(index)}`,
      contextPreview: [`preview ${String(index)}`],
      agentMessages: Array.from({ length: 8 }, () => "message".repeat(100)),
      langSmithTrace: null,
      activity: Array.from({ length: 35 }, (_, activityIndex) => ({
        id: `activity-${String(index)}-${String(activityIndex)}`,
        kind: "tool" as const,
        title: "read file",
        detail: "detail".repeat(250),
        tone: "success" as const,
        detailBody: "body".repeat(400),
      })),
    }));

    const activeTurn = {
      id: "turn-working",
      instruction: "Working instruction",
      status: "working" as const,
      startedAt: "2026-03-28T00:00:00.000Z",
      summary: "Working summary",
      contextPreview: ["working-preview"],
      agentMessages: Array.from({ length: 10 }, () => "message".repeat(120)),
      langSmithTrace: null,
      activity: Array.from({ length: 55 }, (_, activityIndex) => ({
        id: `working-activity-${String(activityIndex)}`,
        kind: "tool" as const,
        title: "read file",
        detail: "detail".repeat(250),
        tone: "working" as const,
        detailBody: "body".repeat(400),
      })),
    };

    session.workbenchState.turns = [...completedTurns, activeTurn];
    session.workbenchState.activeTurnId = activeTurn.id;
    session.workbenchState.fileEvents = Array.from({ length: 70 }, (_, index) => ({
      id: `file-${String(index)}`,
      path: `src/file-${String(index)}.ts`,
      status: "success" as const,
      title: "read file",
      summary: "summary".repeat(200),
      turnId: index < 35 ? activeTurn.id : completedTurns[index % completedTurns.length]!.id,
      diffLines: Array.from({ length: 20 }, (_, diffIndex) => ({
        id: `diff-${String(index)}-${String(diffIndex)}`,
        kind: "context" as const,
        text: "diff".repeat(100),
      })),
      beforePreview: "before".repeat(200),
      afterPreview: "after".repeat(200),
    }));
    session.workbenchState.pendingToolCalls = {
      active: {
        turnId: activeTurn.id,
        toolName: "read_file",
      },
      stale: {
        turnId: "turn-pruned",
        toolName: "read_file",
      },
    };

    await saveSessionState(session);
    const restored = await loadSessionState(targetDirectory, session.sessionId);

    expect(restored).not.toBeNull();
    expect(session.workbenchState.turns).toHaveLength(8);
    expect(restored!.workbenchState.turns).toHaveLength(8);
    expect(restored!.workbenchState.turns.some((turn) => turn.id === activeTurn.id)).toBe(true);
    expect(restored!.workbenchState.activeTurnId).toBe(activeTurn.id);
    expect(restored!.workbenchState.sessionHistory).toHaveLength(20);
    expect(restored!.workbenchState.contextHistory).toHaveLength(30);
    expect(restored!.workbenchState.fileEvents).toHaveLength(40);
    expect(restored!.workbenchState.pendingToolCalls).toEqual({});
    expect(restored!.workbenchState.agentStatus.length).toBeLessThanOrEqual(400);
    expect(restored!.workbenchState.latestError).toBeNull();

    const restoredActiveTurn = restored!.workbenchState.turns.find((turn) => turn.id === activeTurn.id);
    const restoredCompletedTurn = restored!.workbenchState.turns.find((turn) => turn.id !== activeTurn.id);

    expect(restoredActiveTurn?.activity).toHaveLength(40);
    expect(restoredActiveTurn?.activity[0]?.detailBody?.length ?? 0).toBeGreaterThan(0);
    expect(restoredCompletedTurn?.activity).toHaveLength(20);
    expect(restoredCompletedTurn?.activity[0]?.detailBody).toBeUndefined();
  });

  it("resets stale runtime-only UI state when reloading a saved session", async () => {
    const targetDirectory = await createTempDirectory("shipyard-session-resume-");
    const session = createSessionState({
      sessionId: "session-resume",
      targetDirectory,
      discovery: {
        isGreenfield: false,
        language: "typescript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          dev: "vite",
        },
        hasReadme: true,
        hasAgentsMd: true,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "resume-target",
      },
    });

    session.workbenchState.connectionState = "error";
    session.workbenchState.latestError = "The previous runtime crashed.";
    session.workbenchState.pendingToolCalls = {
      stale: {
        turnId: "turn-stale",
        toolName: "read_file",
      },
    };
    session.workbenchState.previewState = {
      status: "error",
      summary: "Preview failed earlier.",
      url: null,
      logTail: ["boom"],
      lastRestartReason: "Crash loop",
    };

    await saveSessionState(session);
    const restored = await loadSessionState(targetDirectory, session.sessionId);

    expect(restored).not.toBeNull();
    expect(restored!.workbenchState.connectionState).toBe("ready");
    expect(restored!.workbenchState.latestError).toBeNull();
    expect(restored!.workbenchState.pendingToolCalls).toEqual({});
    expect(restored!.workbenchState.previewState.status).not.toBe("error");
    expect(restored!.workbenchState.previewState.summary).not.toBe(
      "Preview failed earlier.",
    );
  });
});
