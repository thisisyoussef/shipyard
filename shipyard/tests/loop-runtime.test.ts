import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runShipyardLoop } from "../src/engine/loop.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import { createSessionState } from "../src/engine/state.js";
import type {
  ExecuteInstructionTurnOptions,
  InstructionTurnResult,
} from "../src/engine/turn.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createTurnResult(
  options: Partial<InstructionTurnResult> & Pick<InstructionTurnResult, "finalText" | "status">,
): InstructionTurnResult {
  return {
    phaseName: "code",
    runtimeMode: "graph",
    taskPlan: {
      instruction: "test instruction",
      goal: "test instruction",
      targetFilePaths: [],
      plannedSteps: [],
    },
    contextEnvelope: {
      stable: {
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
          "No supported local preview signal was detected for this target.",
        ),
      },
        projectRules: "",
        availableScripts: {},
      },
      task: {
        currentInstruction: "test instruction",
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
      },
    },
    summary: options.finalText,
    selectedTargetPath: null,
    langSmithTrace: null,
    ...options,
  };
}

class FakeReadline extends EventEmitter implements AsyncIterable<string> {
  private queuedResults: Array<IteratorResult<string>> = [];
  private pendingResolvers: Array<
    (result: IteratorResult<string>) => void
  > = [];

  promptCalls = 0;

  setPrompt(_prompt: string): void {
    // No-op for the test double.
  }

  prompt(): void {
    this.promptCalls += 1;
  }

  close(): void {
    this.finish();
  }

  pushLine(line: string): void {
    this.enqueue({
      done: false,
      value: line,
    });
  }

  finish(): void {
    this.enqueue({
      done: true,
      value: undefined,
    });
  }

  emitSigint(): void {
    this.emit("SIGINT");
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async () => {
        const nextResult = this.queuedResults.shift();

        if (nextResult) {
          return nextResult;
        }

        return await new Promise<IteratorResult<string>>((resolve) => {
          this.pendingResolvers.push(resolve);
        });
      },
    };
  }

  private enqueue(result: IteratorResult<string>): void {
    const nextResolver = this.pendingResolvers.shift();

    if (nextResolver) {
      nextResolver(result);
      return;
    }

    this.queuedResults.push(result);
  }
}

describe("terminal loop interrupts", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("cancels an active turn on SIGINT and keeps the session alive for the next instruction", async () => {
    const targetDirectory = await createTempDirectory("shipyard-loop-runtime-");
    const sessionState = createSessionState({
      sessionId: "loop-runtime-session",
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
          "No supported local preview signal was detected for this target.",
        ),
      },
    });
    const fakeReadline = new FakeReadline();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const executeTurn = vi.fn(
      async (
        options: ExecuteInstructionTurnOptions & {
          signal?: AbortSignal;
        },
      ): Promise<InstructionTurnResult> => {
        options.sessionState.turnCount += 1;

        if (options.sessionState.turnCount === 1) {
          return await new Promise<InstructionTurnResult>((resolve) => {
            const resolveCancelled = () => {
              resolve(
                createTurnResult({
                  status: "cancelled",
                  finalText:
                    "Turn 1 cancelled: Operator interrupted the active turn.",
                }),
              );
            };

            if (options.signal?.aborted) {
              resolveCancelled();
              return;
            }

            options.signal?.addEventListener("abort", resolveCancelled, {
              once: true,
            });
          });
        }

        return createTurnResult({
          status: "success",
          finalText: "Turn 2 completed.",
          summary: "Turn 2 completed successfully.",
        });
      },
    );

    const loopPromise = runShipyardLoop({
      sessionState,
      executeTurn,
      createReadlineInterface: () =>
        fakeReadline as unknown as ReturnType<typeof import("node:readline").createInterface>,
    });

    fakeReadline.pushLine("inspect the repo until I interrupt you");
    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(1);
    });

    fakeReadline.emitSigint();
    await vi.waitFor(() => {
      expect(fakeReadline.promptCalls).toBeGreaterThanOrEqual(2);
    });

    fakeReadline.pushLine("summarize the repo");
    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(2);
    });

    fakeReadline.pushLine("exit");
    await loopPromise;

    expect(executeTurn.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(sessionState.turnCount).toBe(2);
    expect(logSpy.mock.calls.flat()).toContain(
      "Interrupt requested. Waiting for Shipyard to stop the current turn...",
    );
    expect(logSpy.mock.calls.flat()).toContain("Turn 2 completed.");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
