import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    create: (request: MessageCreateParamsNonStreaming) => Promise<Message>;
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
