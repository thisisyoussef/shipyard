import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import { createSessionState } from "../src/engine/state.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
} from "../src/engine/turn.js";

const createdDirectories: string[] = [];

interface MockAnthropicClient {
  messages: {
    create: (
      request: MessageCreateParamsNonStreaming,
      options?: Record<string, unknown>,
    ) => Promise<Message>;
  };
  calls: MessageCreateParamsNonStreaming[];
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

function createMockAnthropicClient(
  responses: Message[],
): MockAnthropicClient {
  const calls: MessageCreateParamsNonStreaming[] = [];

  return {
    calls,
    messages: {
      async create(request) {
        calls.push(request);
        const response = responses[calls.length - 1];

        if (!response) {
          throw new Error("No mock Claude response configured.");
        }

        return response;
      },
    },
  };
}

function createAbortAwareMockAnthropicClient(options?: {
  finalText?: string;
}): MockAnthropicClient {
  const calls: MessageCreateParamsNonStreaming[] = [];

  return {
    calls,
    messages: {
      async create(request, requestOptions) {
        calls.push(request);

        if (calls.length === 1) {
          const signal = requestOptions?.signal instanceof AbortSignal
            ? requestOptions.signal
            : undefined;

          return await new Promise<Message>((_resolve, reject) => {
            const rejectAsAborted = () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            };

            if (signal?.aborted) {
              rejectAsAborted();
              return;
            }

            signal?.addEventListener("abort", rejectAsAborted, { once: true });
          });
        }

        return createAssistantMessage({
          stopReason: "end_turn",
          content: [
            {
              type: "text",
              text: options?.finalText ?? "Follow-up turn complete.",
              citations: null,
            },
          ],
        });
      },
    },
  };
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

describe("instruction runtime handoff", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("sends the composed phase prompt plus serialized context through the graph runtime", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-live-");
    await writeFile(
      path.join(targetDirectory, "AGENTS.md"),
      "Always inspect the target file before editing.\n",
      "utf8",
    );
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "shipyard-turn-target" }, null, 2),
      "utf8",
    );
    const sessionState = createSessionState({
      sessionId: "turn-live-session",
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
        projectName: "shipyard-turn-target",
      },
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Inspection complete.",
            citations: null,
          },
        ],
      }),
    ]);
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: ["Use the current scripts as the source of truth."],
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "inspect package.json",
    });

    expect(result.runtimeMode).toBe("graph");
    expect(result.status).toBe("success");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.system).toContain("Project Context");
    expect(client.calls[0]?.system).toContain("Project Rules");
    expect(client.calls[0]?.system).toContain("Injected Context");
    expect(client.calls[0]?.system).toContain("Session History");
    expect(client.calls[0]?.system).toContain("Recent Errors");
    expect(client.calls[0]?.system).toContain("Blocked Files");
    expect(client.calls[0]?.system).toContain(
      "Always inspect the target file before editing.",
    );
    expect(client.calls[0]?.system).toContain(
      "Use the current scripts as the source of truth.",
    );
    expect(client.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "inspect package.json",
      },
    ]);
    expect(sessionState.rollingSummary).toContain("inspect package.json");
    expect(sessionState.rollingSummary).toContain("completed via graph");
  });

  it("can invoke the fallback runtime without changing instruction handling", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-fallback-");
    const sessionState = createSessionState({
      sessionId: "turn-fallback-session",
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
      },
    });
    const runActingLoop = vi.fn(async () => ({
      finalText: "Fallback runtime complete.",
      messageHistory: [],
      iterations: 1,
      didEdit: false,
      lastEditedFile: null,
    }));
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeMode: "fallback",
      runtimeDependencies: {
        runActingLoop,
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "create a README",
    });

    expect(result.runtimeMode).toBe("fallback");
    expect(result.status).toBe("success");
    expect(result.finalText).toBe("Fallback runtime complete.");
    expect(runActingLoop).toHaveBeenCalledTimes(1);
    expect(sessionState.rollingSummary).toContain("create a README");
    expect(sessionState.rollingSummary).toContain("completed via fallback");
  });

  it("treats operator cancellation as a first-class turn outcome and allows a follow-up turn", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-cancel-");
    const sessionState = createSessionState({
      sessionId: "turn-cancel-session",
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
      },
    });
    const client = createAbortAwareMockAnthropicClient({
      finalText: "Follow-up turn complete.",
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });
    const doneEvents: Array<{
      status: "success" | "error" | "cancelled";
      summary: string;
    }> = [];
    const textEvents: string[] = [];
    const errorEvents: string[] = [];
    const cancellationController = new AbortController();

    const cancelledTurnPromise = executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "inspect the repo until I interrupt you",
      signal: cancellationController.signal,
      reporter: {
        onDone(event) {
          doneEvents.push(event);
        },
        onText(text) {
          textEvents.push(text);
        },
        onError(message) {
          errorEvents.push(message);
        },
      },
    });

    await vi.waitFor(() => {
      expect(client.calls).toHaveLength(1);
    });
    cancellationController.abort("Operator interrupted the active turn.");

    const cancelledTurn = await cancelledTurnPromise;

    expect(cancelledTurn.status).toBe("cancelled");
    expect(cancelledTurn.finalText).toContain("Turn 1 cancelled");
    expect(cancelledTurn.finalText).toContain(
      "Operator interrupted the active turn.",
    );
    expect(doneEvents[0]).toMatchObject({
      status: "cancelled",
      summary: "Operator interrupted the active turn.",
    });
    expect(errorEvents).toEqual([]);
    expect(textEvents[0]).toContain("Turn 1 cancelled");
    expect(sessionState.rollingSummary).toContain("cancelled via graph");

    const followUpTurn = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "summarize the repo now",
    });

    expect(followUpTurn.status).toBe("success");
    expect(followUpTurn.finalText).toBe("Follow-up turn complete.");
    expect(sessionState.turnCount).toBe(2);
    expect(sessionState.rollingSummary).toContain(
      "Turn 2: summarize the repo now ->",
    );
  });

  it("carries forward recent session history while keeping the rolling summary bounded", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-history-");
    const sessionState = createSessionState({
      sessionId: "turn-history-session",
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
      },
    });
    const client = createMockAnthropicClient(
      Array.from({ length: 10 }, (_, index) =>
        createAssistantMessage({
          stopReason: "end_turn",
          content: [
            {
              type: "text",
              text: `Handled turn ${String(index + 1)}.`,
              citations: null,
            },
          ],
        })),
    );
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: ["Base context for every turn."],
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    for (let turn = 1; turn <= 10; turn += 1) {
      const result = await executeInstructionTurn({
        sessionState,
        runtimeState,
        instruction: `inspect file ${String(turn)}`,
        injectedContext: [`Context for turn ${String(turn)}`],
      });

      expect(result.status).toBe("success");
    }

    expect(sessionState.turnCount).toBe(10);
    expect(client.calls).toHaveLength(10);

    const finalSystemPrompt = client.calls[9]?.system ?? "";

    expect(finalSystemPrompt).toContain("Base context for every turn.");
    expect(finalSystemPrompt).toContain("Context for turn 10");
    expect(finalSystemPrompt).not.toContain("Context for turn 9");
    expect(finalSystemPrompt).toContain("Turn 2: inspect file 2 ->");
    expect(finalSystemPrompt).toContain("Turn 9: inspect file 9 ->");
    expect(finalSystemPrompt).not.toContain("Turn 1: inspect file 1 ->");

    const rollingSummaryLines = sessionState.rollingSummary.split("\n");

    expect(rollingSummaryLines).toHaveLength(8);
    expect(sessionState.rollingSummary).toContain("Turn 3: inspect file 3 ->");
    expect(sessionState.rollingSummary).toContain("Turn 10: inspect file 10 ->");
    expect(sessionState.rollingSummary).not.toContain("Turn 2: inspect file 2 ->");
  });

  it("captures a selected target path when the target manager phase uses select_target", async () => {
    const targetsDirectory = await createTempDirectory(
      "shipyard-turn-target-manager-",
    );
    const selectedTargetDirectory = path.join(targetsDirectory, "alpha-app");
    await mkdir(selectedTargetDirectory, { recursive: true });
    await writeFile(
      path.join(selectedTargetDirectory, "package.json"),
      JSON.stringify({ name: "alpha-app" }, null, 2),
      "utf8",
    );
    const sessionState = createSessionState({
      sessionId: "turn-target-manager-session",
      targetDirectory: targetsDirectory,
      targetsDirectory,
      activePhase: "target-manager",
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
        projectName: "targets",
      },
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool-select-1",
            name: "select_target",
            input: {
              target_path: selectedTargetDirectory,
            },
            caller: {
              type: "assistant",
            },
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Selected alpha-app and prepared the coding session.",
            citations: null,
          },
        ],
      }),
    ]);
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [`Targets directory: ${targetsDirectory}`],
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Open the alpha-app target.",
    });

    expect(result.phaseName).toBe("target-manager");
    expect(result.status).toBe("success");
    expect(result.selectedTargetPath).toBe(selectedTargetDirectory);
    expect(runtimeState.pendingTargetSelectionPath).toBe(selectedTargetDirectory);
    expect(client.calls[0]?.system).toContain("target-manager mode");
    expect(client.calls[0]?.system).toContain("select_target");
  });

  it("fails clearly instead of using the offline preview path when ANTHROPIC_API_KEY is missing", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-missing-key-");
    const sessionState = createSessionState({
      sessionId: "turn-missing-key-session",
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
      },
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
    });
    const previousApiKey = process.env.ANTHROPIC_API_KEY;

    delete process.env.ANTHROPIC_API_KEY;

    try {
      const result = await executeInstructionTurn({
        sessionState,
        runtimeState,
        instruction: "create a README",
      });

      expect(result.runtimeMode).toBe("graph");
      expect(result.status).toBe("error");
      expect(result.summary).toMatch(/Missing ANTHROPIC_API_KEY/i);
      expect(result.finalText).toContain("Turn 1 stopped: Missing ANTHROPIC_API_KEY");
      expect(sessionState.rollingSummary).toContain("create a README");
      expect(sessionState.rollingSummary).toContain("failed via graph");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousApiKey;
      }
    }
  });
});
