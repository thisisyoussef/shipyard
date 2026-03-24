import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it } from "vitest";

import {
  parseVerificationReport,
  runVerifierSubagent,
  VERIFIER_TOOL_NAMES,
} from "../src/agents/verifier.js";
import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import "../src/tools/index.js";
import { getAnthropicTools } from "../src/tools/registry.js";

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

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-verifier-"));
  createdDirectories.push(directory);
  return directory;
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

describe("verifier subagent", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("uses only the run_command allowlist and fails closed on unauthorized tool requests", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_read",
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
            text: JSON.stringify({
              command: "pnpm test",
              exitCode: 0,
              passed: true,
              stdout: "",
              stderr: "",
              summary: "Verification passed.",
            }),
            citations: null,
          },
        ],
      }),
    ]);

    await expect(
      runVerifierSubagent("pnpm test", directory, {
        client,
        logger: {
          log() {},
        },
      }),
    ).rejects.toThrow(/read_file|command-only|not available|unauthorized/i);

    expect(client.calls[0]?.tools).toEqual(
      getAnthropicTools([...VERIFIER_TOOL_NAMES]),
    );
  });

  it("does not inherit prior assistant or user history", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              command: "pnpm test",
              exitCode: 0,
              passed: true,
              stdout: "",
              stderr: "",
              summary: "Verification passed.",
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runVerifierSubagent("pnpm test", directory, {
      client,
      logger: {
        log() {},
      },
    });

    expect(result).toEqual({
      command: "pnpm test",
      exitCode: 0,
      passed: true,
      stdout: "",
      stderr: "",
      summary: "Verification passed.",
    });
    expect(client.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "pnpm test",
      },
    ]);
  });

  it("runs a passing command and returns a structured report", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_run",
            name: "run_command",
            input: {
              command: "node -e \"console.log('ok')\"",
              timeout_seconds: 2,
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
            text: JSON.stringify({
              command: "node -e \"console.log('ok')\"",
              exitCode: 0,
              passed: true,
              stdout: "ok\n",
              stderr: "",
              summary: "Command passed: node -e \"console.log('ok')\"",
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runVerifierSubagent(
      "node -e \"console.log('ok')\"",
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      command: "node -e \"console.log('ok')\"",
      exitCode: 0,
      passed: true,
      stdout: "ok\n",
      stderr: "",
      summary: "Command passed: node -e \"console.log('ok')\"",
    });

    const toolResultPayloads = getToolResultPayloads(client.calls[1]!);

    expect(toolResultPayloads).toHaveLength(1);
    expect(toolResultPayloads[0]?.payload.success).toBe(true);
    expect(toolResultPayloads[0]?.payload.output).toContain("Command: node -e");
    expect(toolResultPayloads[0]?.payload.output).toContain("Exit code: 0");
    expect(toolResultPayloads[0]?.payload.output).toContain("ok");
  });

  it("rejects malformed final report JSON", () => {
    expect(() =>
      parseVerificationReport("not json at all", "pnpm test"),
    ).toThrow(/json|verificationreport/i);
  });

  it("returns a structured failure report for a failing command", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_fail",
            name: "run_command",
            input: {
              command: "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
              timeout_seconds: 2,
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
            text: JSON.stringify({
              command: "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
              exitCode: 2,
              passed: false,
              stdout: "",
              stderr: "bad\n",
              summary: "Command failed with exit code 2.",
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runVerifierSubagent(
      "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("bad");
    expect(result.summary).toContain("exit code 2");

    const toolResultPayloads = getToolResultPayloads(client.calls[1]!);

    expect(toolResultPayloads[0]?.isError).toBe(true);
    expect(toolResultPayloads[0]?.payload.error).toContain("Exit code: 2");
    expect(toolResultPayloads[0]?.payload.error).toContain("bad");
  });

  it("returns a structured failure report for a timed out command", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_timeout",
            name: "run_command",
            input: {
              command: "node -e \"setTimeout(() => console.log('done'), 2000)\"",
              timeout_seconds: 1,
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
            text: JSON.stringify({
              command: "node -e \"setTimeout(() => console.log('done'), 2000)\"",
              exitCode: null,
              passed: false,
              stdout: "",
              stderr: "",
              summary: "Command timed out after 1 second.",
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runVerifierSubagent(
      "node -e \"setTimeout(() => console.log('done'), 2000)\"",
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.summary).toContain("timed out");

    const toolResultPayloads = getToolResultPayloads(client.calls[1]!);

    expect(toolResultPayloads[0]?.isError).toBe(true);
    expect(toolResultPayloads[0]?.payload.error).toContain("Timed out: yes");
  });
});
