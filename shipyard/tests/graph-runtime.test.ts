import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import type { ContextEnvelope } from "../src/engine/state.js";
import {
  createAgentGraphState,
  createAgentRuntimeGraph,
  createAgentRuntimeNodes,
  routeAfterAct,
  routeAfterVerify,
  runAgentRuntime,
  runFallbackRuntime,
} from "../src/engine/graph.js";
import { createCodePhase } from "../src/phases/code/index.js";
import { CheckpointManager } from "../src/checkpoints/manager.js";
import {
  clearTrackedReadHashes,
  getTrackedReadHash,
  hashContents,
} from "../src/tools/file-state.js";

const createdDirectories: string[] = [];

interface MockAnthropicClient {
  messages: {
    create: (request: MessageCreateParamsNonStreaming) => Promise<Message>;
  };
}

function createContextEnvelope(): ContextEnvelope {
  return {
    stable: {
      discovery: {
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
      },
      projectRules: "",
      availableScripts: {
        test: "vitest run",
      },
    },
    task: {
      currentInstruction: "Inspect src/app.ts",
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
  };
}

function createAssistantMessage(options: {
  content: unknown[];
  stopReason: Message["stop_reason"];
  model?: Model;
}): Message {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    container: null,
    content: options.content as Message["content"],
    model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
    role: "assistant",
    stop_reason: options.stopReason,
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 42,
      output_tokens: 19,
      server_tool_use: null,
      service_tier: "standard",
    },
  };
}

function createMockAnthropicClient(responses: Message[]): MockAnthropicClient {
  let callIndex = 0;

  return {
    messages: {
      async create() {
        const response = responses[callIndex];
        callIndex += 1;

        if (!response) {
          throw new Error("No mock Claude response configured.");
        }

        return response;
      },
    },
  };
}

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-graph-"));
  createdDirectories.push(directory);
  return directory;
}

function createInitialState(targetDirectory = "/tmp/shipyard-graph") {
  return createAgentGraphState({
    sessionId: "session-123",
    instruction: "Inspect src/app.ts",
    contextEnvelope: createContextEnvelope(),
    targetDirectory,
    phaseConfig: createCodePhase(),
  });
}

describe("Phase 4 graph runtime contract", () => {
  afterEach(async () => {
    clearTrackedReadHashes();

    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("graph state can represent retries, blocked files, last edited file, and final result", () => {
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix src/app.ts",
      contextEnvelope: createContextEnvelope(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
      retryCountsByFile: {
        "src/app.ts": 3,
      },
      blockedFiles: ["src/app.ts"],
      lastEditedFile: "src/app.ts",
      finalResult: "Blocked after repeated failures.",
      status: "done",
    });

    expect(state.retryCountsByFile["src/app.ts"]).toBe(3);
    expect(state.blockedFiles).toEqual(["src/app.ts"]);
    expect(state.lastEditedFile).toBe("src/app.ts");
    expect(state.finalResult).toBe("Blocked after repeated failures.");
    expect(state.status).toBe("done");
  });

  it("status helpers route act to verify when an edit occurred", () => {
    expect(routeAfterAct({ status: "verifying" })).toBe("verify");
  });

  it("status helpers route verify failure to recover", () => {
    expect(routeAfterVerify({ status: "recovering" })).toBe("recover");
  });

  it("act node checkpoints before edit_block runs", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "src", "app.ts");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export const count = 1;\n", "utf8");

    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_read_file",
            name: "read_file",
            input: {
              path: "src/app.ts",
            },
            caller: {
              type: "direct",
            },
          },
          {
            type: "tool_use",
            id: "toolu_edit_block",
            name: "edit_block",
            input: {
              path: "src/app.ts",
              old_string: "export const count = 1;\n",
              new_string: "export const count = 2;\n",
            },
            caller: {
              type: "direct",
            },
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Updated src/app.ts.",
            citations: null,
          },
        ],
      }),
    ]);

    const checkpointManager = {
      checkpoint: vi.fn(async (relativePath: string) => {
        expect(relativePath).toBe("src/app.ts");
        expect(await readFile(appPath, "utf8")).toBe(
          "export const count = 1;\n",
        );
        return path.join(directory, ".shipyard", "checkpoints", "session-123", "mock.checkpoint");
      }),
      revert: vi.fn(async () => true),
    };

    const nodes = createAgentRuntimeNodes({
      dependencies: {
        createCheckpointManager: () => checkpointManager,
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const update = await nodes.act(createInitialState(directory));

    expect(checkpointManager.checkpoint).toHaveBeenCalledTimes(1);
    expect(await readFile(appPath, "utf8")).toBe("export const count = 2;\n");
    expect(update.status).toBe("verifying");
    expect(update.lastEditedFile).toBe("src/app.ts");
  });

  it("recover restores the latest checkpoint, refreshes hashes, and retries", async () => {
    const directory = await createTempProject();
    const appPath = path.join(directory, "src", "app.ts");

    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(appPath, "export const count = 1;\n", "utf8");

    const checkpointManager = new CheckpointManager(directory, "session-123");
    await checkpointManager.checkpoint("src/app.ts");
    await writeFile(appPath, "broken change\n", "utf8");

    const nodes = createAgentRuntimeNodes({
      dependencies: {
        createCheckpointManager: () => checkpointManager,
      },
    });
    const state = createAgentGraphState({
      sessionId: "session-123",
      instruction: "Fix src/app.ts",
      contextEnvelope: createContextEnvelope(),
      targetDirectory: directory,
      phaseConfig: createCodePhase(),
      lastEditedFile: "src/app.ts",
      lastError: "Verification failed.",
    });

    const update = await nodes.recover(state);
    const restoredHash = hashContents("export const count = 1;\n");

    expect(await readFile(appPath, "utf8")).toBe("export const count = 1;\n");
    expect(update.status).toBe("planning");
    expect(update.retryCountsByFile).toEqual({
      "src/app.ts": 1,
    });
    expect(update.fileHashes).toEqual({
      "src/app.ts": restoredHash,
    });
    expect(getTrackedReadHash("src/app.ts")).toBe(restoredHash);
  });

  it("act node fails clearly after 25 tool-loop iterations", async () => {
    const graph = createAgentRuntimeGraph({
      dependencies: {
        runActingLoop: vi.fn(async () => {
          throw new Error(
            "Raw Claude loop exceeded 25 iterations without reaching a final response.",
          );
        }),
      },
    });

    const finalState = await graph.invoke(createInitialState());

    expect(finalState.status).toBe("failed");
    expect(finalState.actingIterations).toBe(25);
    expect(finalState.finalResult).toMatch(/exceeded 25 iterations/i);
  });

  it("fallback runtime preserves retry and blocked-file semantics", async () => {
    const runActingLoop = vi.fn(async () => ({
      finalText: "Applied a fix.",
      messageHistory: [],
      iterations: 1,
      didEdit: true,
      lastEditedFile: "src/app.ts",
    }));
    const verifyState = vi.fn(async () => ({
      command: "pnpm test",
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "tests failed",
      summary: "Verification failed.",
    }));
    const checkpointManager = {
      checkpoint: vi.fn(async () => "/tmp/mock.checkpoint"),
      revert: vi.fn(async () => false),
    };
    const directory = await createTempProject();

    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "src", "app.ts"), "broken change\n", "utf8");

    const finalState = await runFallbackRuntime(createInitialState(directory), {
      maxRecoveriesPerFile: 2,
      dependencies: {
        runActingLoop,
        verifyState,
        createCheckpointManager: () => checkpointManager,
      },
    });

    expect(runActingLoop).toHaveBeenCalledTimes(3);
    expect(verifyState).toHaveBeenCalledTimes(3);
    expect(checkpointManager.revert).toHaveBeenCalledTimes(3);
    expect(finalState.fallbackMode).toBe(true);
    expect(finalState.retryCountsByFile).toEqual({
      "src/app.ts": 3,
    });
    expect(finalState.blockedFiles).toEqual(["src/app.ts"]);
    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toMatch(
      /Blocked src\/app\.ts after 3 failed verification attempts\./,
    );
  });

  it("graph runtime follows plan to act to respond when no edit occurs", async () => {
    const finalState = await runAgentRuntime(createInitialState(), {
      dependencies: {
        runActingLoop: async () => ({
          finalText: "Inspection complete without edits.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toBe("Inspection complete without edits.");
    expect(finalState.fallbackMode).toBe(false);
  });
});
