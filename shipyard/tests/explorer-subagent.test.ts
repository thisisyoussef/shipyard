import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it } from "vitest";

import { EXPLORER_TOOL_NAMES, parseContextReport, runExplorerSubagent } from "../src/agents/explorer.js";
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
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-explorer-"));
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

describe("explorer subagent", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("uses only the read-only tool allowlist and fails closed on unauthorized tool requests", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_write",
            name: "write_file",
            input: {
              path: "notes.md",
              contents: "hello",
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
              query: "inspect the repo",
              findings: [],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    await expect(
      runExplorerSubagent("inspect the repo", directory, {
        client,
        logger: {
          log() {},
        },
      }),
    ).rejects.toThrow(/write_file|read-only|not available/i);

    expect(client.calls[0]?.tools).toEqual(
      getAnthropicTools([...EXPLORER_TOOL_NAMES]),
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
              query: "find auth files",
              findings: [],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runExplorerSubagent("find auth files", directory, {
      client,
      logger: {
        log() {},
      },
    });

    expect(result).toEqual({
      query: "find auth files",
      findings: [],
    });
    expect(client.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "find auth files",
      },
    ]);
  });

  it("runs a broad discovery question and returns structured findings", async () => {
    const directory = await createTempProject();
    const authPath = path.join(directory, "src", "auth.ts");

    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(
      authPath,
      "export async function authenticateUser(token: string) {\n  return token.length > 0;\n}\n",
      "utf8",
    );

    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_search",
            name: "search_files",
            input: {
              pattern: "authenticateUser",
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
              path: "src/auth.ts",
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
              query: "find all files that handle authentication",
              findings: [
                {
                  filePath: "src/auth.ts",
                  excerpt: "export async function authenticateUser(token: string) {",
                  relevanceNote: "Defines the authentication entry point.",
                },
              ],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runExplorerSubagent(
      "find all files that handle authentication",
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      query: "find all files that handle authentication",
      findings: [
        {
          filePath: "src/auth.ts",
          excerpt: "export async function authenticateUser(token: string) {",
          relevanceNote: "Defines the authentication entry point.",
        },
      ],
    });

    const toolResultPayloads = getToolResultPayloads(client.calls[1]!);

    expect(toolResultPayloads).toHaveLength(2);
    expect(toolResultPayloads[0]?.payload.success).toBe(true);
    expect(toolResultPayloads[0]?.payload.output).toContain("src/auth.ts:1:");
    expect(toolResultPayloads[1]?.payload.output).toContain("Path: src/auth.ts");
    expect(toolResultPayloads[1]?.payload.output).toContain("authenticateUser");
  });

  it("rejects malformed final report JSON", () => {
    expect(() =>
      parseContextReport("not json at all", "find auth files"),
    ).toThrow(/json|contextreport/i);
  });

  it("accepts valid report JSON wrapped in prose and markdown fences", () => {
    const result = parseContextReport(
      [
        "Perfect! I found the relevant files.",
        "",
        "```json",
        JSON.stringify({
          query: "find auth files",
          findings: [
            {
              filePath: "src/auth.ts",
              excerpt: "export async function authenticateUser(token: string) {",
              relevanceNote: "Defines the authentication entry point.",
            },
          ],
        }, null, 2),
        "```",
      ].join("\n"),
      "find auth files",
    );

    expect(result).toEqual({
      query: "find auth files",
      findings: [
        {
          filePath: "src/auth.ts",
          excerpt: "export async function authenticateUser(token: string) {",
          relevanceNote: "Defines the authentication entry point.",
        },
      ],
    });
  });

  it("returns an empty findings array when discovery returns no matches", async () => {
    const directory = await createTempProject();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: "find files about payments",
              findings: [],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runExplorerSubagent(
      "find files about payments",
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result.findings).toEqual([]);
  });
});
