import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Message, MessageCreateParamsNonStreaming, MessageParam, Model } from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ANTHROPIC_MODEL,
} from "../src/engine/anthropic.js";
import {
  RAW_LOOP_MAX_ITERATIONS,
  runRawToolLoop,
  runRawToolLoopDetailed,
} from "../src/engine/raw-loop.js";
import "../src/tools/index.js";
import {
  getAnthropicTools,
  getTool,
  registerTool,
} from "../src/tools/registry.js";

const createdDirectories: string[] = [];
const LOGGER_TEST_TOOL_NAME = "loop_logger_test_tool";

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
  responses: Message[] | ((request: MessageCreateParamsNonStreaming, turnNumber: number) => Message | Promise<Message>),
): MockAnthropicClient {
  const calls: MessageCreateParamsNonStreaming[] = [];

  return {
    calls,
    messages: {
      async create(request) {
        calls.push(request);

        if (typeof responses === "function") {
          return await responses(request, calls.length);
        }

        const response = responses[calls.length - 1];

        if (!response) {
          throw new Error(`No mock Claude response configured for turn ${String(calls.length)}.`);
        }

        return response;
      },
    },
  };
}

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-raw-loop-"));
  createdDirectories.push(directory);
  return directory;
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function getLastUserToolResultMessage(
  request: MessageCreateParamsNonStreaming,
): MessageParam {
  const lastMessage = request.messages.at(-1);

  if (!lastMessage) {
    throw new Error("Expected a last message.");
  }

  if (lastMessage.role !== "user" || typeof lastMessage.content === "string") {
    throw new Error("Expected the last message to be a structured user tool_result message.");
  }

  return lastMessage;
}

function getToolResultPayloads(request: MessageCreateParamsNonStreaming): Array<{
  toolUseId: string;
  isError: boolean;
  payload: {
    success: boolean;
    output: string;
    error?: string;
  };
}> {
  const toolResultMessage = getLastUserToolResultMessage(request);

  if (typeof toolResultMessage.content === "string") {
    throw new Error("Expected structured tool_result content.");
  }

  return toolResultMessage.content.map((block) => {
    if (block.type !== "tool_result" || typeof block.content !== "string") {
      throw new Error("Expected tool_result blocks with string content.");
    }

    return {
      toolUseId: block.tool_use_id,
      isError: block.is_error ?? false,
      payload: JSON.parse(block.content) as {
        success: boolean;
        output: string;
        error?: string;
      },
    };
  });
}

if (!getTool(LOGGER_TEST_TOOL_NAME)) {
  registerTool<{ long_input: string }>({
    name: LOGGER_TEST_TOOL_NAME,
    description: "Test helper that echoes a long payload for raw-loop logging coverage.",
    inputSchema: {
      type: "object",
      properties: {
        long_input: {
          type: "string",
          description: "Long input used to prove log truncation.",
        },
      },
      required: ["long_input"],
      additionalProperties: false,
    },
    async execute(input) {
      return {
        success: true,
        output: `echo:${input.long_input}`,
      };
    },
  });
}

describe("raw Claude tool loop", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("returns final text when Claude ends without tool use", async () => {
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Finished without tools.",
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Summarize the workspace.",
      [],
      process.cwd(),
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("Finished without tools.");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "Summarize the workspace.",
      },
    ]);
    expect(client.calls[0]?.tools).toEqual([]);
  });

  it("continues after a tool_use response and sends tool_result blocks back", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "README.md"), "# Shipyard\n", "utf8");
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "text",
            text: "I should inspect the README first.",
            citations: null,
          },
          {
            type: "tool_use",
            id: "toolu_readme",
            name: "read_file",
            input: {
              path: "README.md",
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
            text: "README inspected successfully.",
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Inspect the README.",
      ["read_file"],
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("README inspected successfully.");
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]?.tools).toEqual(getAnthropicTools(["read_file"]));
    expect(client.calls[1]?.messages).toHaveLength(3);
    expect(client.calls[1]?.messages[1]).toEqual({
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I should inspect the README first.",
          citations: null,
        },
        {
          type: "tool_use",
          id: "toolu_readme",
          name: "read_file",
          input: {
            path: "README.md",
          },
          caller: {
            type: "direct",
          },
        },
      ],
    });

    const [toolResult] = getToolResultPayloads(client.calls[1]!);

    expect(toolResult).toEqual({
      toolUseId: "toolu_readme",
      isError: false,
      payload: {
        success: true,
        output: expect.stringContaining("Path: README.md"),
      },
    });
    expect(toolResult?.payload.output).toContain("# Shipyard");
  });

  it("executes all tool_use blocks from a single assistant turn in order", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "README.md"), "# Shipyard\n", "utf8");
    await writeFile(path.join(directory, "package.json"), '{ "name": "shipyard" }\n', "utf8");
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_list",
            name: "list_files",
            input: {
              path: ".",
              depth: 1,
            },
            caller: {
              type: "direct",
            },
          },
          {
            type: "tool_use",
            id: "toolu_read",
            name: "read_file",
            input: {
              path: "package.json",
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
            text: "I inspected the directory and package manifest.",
            citations: null,
          },
        ],
      }),
    ]);

    await runRawToolLoop(
      "You are Shipyard.",
      "Inspect the repo.",
      ["list_files", "read_file"],
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    const toolResults = getToolResultPayloads(client.calls[1]!);

    expect(toolResults.map((result) => result.toolUseId)).toEqual([
      "toolu_list",
      "toolu_read",
    ]);
    expect(toolResults[0]?.payload.output).toContain("./");
    expect(toolResults[1]?.payload.output).toContain("Path: package.json");
  });

  it("fails after 25 iterations without a final response", async () => {
    const client = createMockAnthropicClient((_request, turnNumber) =>
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: `toolu_missing_${String(turnNumber)}`,
            name: "missing_tool",
            input: {
              iteration: turnNumber,
            },
            caller: {
              type: "direct",
            },
          },
        ],
      }),
    );

    await expect(
      runRawToolLoop(
        "You are Shipyard.",
        "Keep going forever.",
        [],
        process.cwd(),
        {
          client,
          logger: {
            log() {},
          },
        },
      ),
    ).rejects.toThrowError(
      new RegExp(`exceeded ${String(RAW_LOOP_MAX_ITERATIONS)} iterations`, "i"),
    );

    expect(client.calls).toHaveLength(RAW_LOOP_MAX_ITERATIONS);
  });

  it("returns a failure tool_result when Claude asks for an unknown tool", async () => {
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_unknown",
            name: "totally_unknown_tool",
            input: {
              path: "README.md",
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
            text: "I handled the unavailable tool safely.",
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Try a missing tool.",
      ["read_file"],
      process.cwd(),
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("I handled the unavailable tool safely.");

    const [toolResult] = getToolResultPayloads(client.calls[1]!);

    expect(toolResult).toEqual({
      toolUseId: "toolu_unknown",
      isError: true,
      payload: {
        success: false,
        output: "",
        error: 'Tool "totally_unknown_tool" is not available in this loop.',
      },
    });
  });

  it("returns a cancelled result when the active turn signal aborts the model request", async () => {
    const controller = new AbortController();
    const client = createMockAnthropicClient((_request, _turnNumber) =>
      new Promise<Message>((_resolve, reject) => {
        const rejectAsAborted = () => reject(createAbortError());

        if (controller.signal.aborted) {
          rejectAsAborted();
          return;
        }

        controller.signal.addEventListener("abort", rejectAsAborted, {
          once: true,
        });
      }),
    );
    const pendingResult = runRawToolLoopDetailed(
      "You are Shipyard.",
      "Keep working until I interrupt you.",
      [],
      process.cwd(),
      {
        client,
        logger: {
          log() {},
        },
        signal: controller.signal,
      },
    );

    await Promise.resolve();
    controller.abort("Operator interrupted the active turn.");

    const result = await pendingResult;

    expect(result.status).toBe("cancelled");
    expect(result.finalText).toContain("Operator interrupted the active turn.");
    expect(result.didEdit).toBe(false);
    expect(client.calls).toHaveLength(1);
  });

  it("logs truncated tool inputs and outputs", async () => {
    const longInput = "x".repeat(240);
    const loggerMessages: string[] = [];
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_logger",
            name: LOGGER_TEST_TOOL_NAME,
            input: {
              long_input: longInput,
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
            text: "Logged with truncation.",
            citations: null,
          },
        ],
      }),
    ]);

    await runRawToolLoop(
      "You are Shipyard.",
      "Exercise logger truncation.",
      [LOGGER_TEST_TOOL_NAME],
      process.cwd(),
      {
        client,
        logger: {
          log(message) {
            loggerMessages.push(message);
          },
        },
      },
    );

    const toolCallLog = loggerMessages.find((message) =>
      message.includes(`tool_call ${LOGGER_TEST_TOOL_NAME}`),
    );
    const toolResultLog = loggerMessages.find((message) =>
      message.includes(`tool_result ${LOGGER_TEST_TOOL_NAME} success`),
    );

    expect(toolCallLog).toBeDefined();
    expect(toolResultLog).toBeDefined();
    expect(toolCallLog).toContain("[truncated");
    expect(toolResultLog).toContain("[truncated");
    expect(toolCallLog).not.toContain(longInput);
    expect(toolResultLog).not.toContain(`echo:${longInput}`);
  });
});
