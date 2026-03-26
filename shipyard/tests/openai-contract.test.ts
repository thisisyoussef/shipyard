import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCallItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses";
import type { ResponsesModel } from "openai/resources/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_MODEL,
  buildOpenAIResponseRequest,
  createFunctionCallOutputItem,
  createOpenAIClient,
  createOpenAIModelAdapter,
  extractOpenAIFunctionToolCalls,
  extractOpenAITextOutput,
  normalizeOpenAIOutputItems,
  projectToolsToOpenAIFunctionTools,
  resolveOpenAIConfig,
} from "../src/engine/openai.js";
import {
  createAssistantToolCallTurnMessage,
  createToolResultTurnMessage,
  createUserTurnMessage,
  type ToolResultTurnContentPart,
  type TurnMessage,
} from "../src/engine/model-adapter.js";
import { runRawToolLoopDetailed } from "../src/engine/raw-loop.js";
import "../src/tools/index.js";
import { getTools } from "../src/tools/registry.js";

const createdDirectories: string[] = [];

interface MockOpenAIClient {
  responses: {
    create: (
      request: ResponseCreateParamsNonStreaming,
      options?: Record<string, unknown>,
    ) => Promise<Response>;
  };
  calls: ResponseCreateParamsNonStreaming[];
}

function createResponse(options: {
  output: ResponseOutputItem[];
  outputText?: string;
  status?: Response["status"];
  model?: ResponsesModel;
  incompleteReason?: Response.IncompleteDetails["reason"];
}): Response {
  return {
    id: `resp_${Math.random().toString(36).slice(2)}`,
    object: "response",
    created_at: 1_741_290_421,
    status: options.status ?? "completed",
    error: null,
    incomplete_details: options.incompleteReason
      ? {
        reason: options.incompleteReason,
      }
      : null,
    instructions: null,
    metadata: {},
    model: options.model ?? DEFAULT_OPENAI_MODEL,
    output: options.output,
    output_text: options.outputText ?? "",
    parallel_tool_calls: true,
    temperature: 1,
    text: {
      format: {
        type: "text",
      },
    },
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    truncation: "disabled",
    usage: {
      input_tokens: 24,
      input_tokens_details: {
        cached_tokens: 0,
      },
      output_tokens: 12,
      output_tokens_details: {
        reasoning_tokens: 0,
      },
      total_tokens: 36,
    },
  };
}

function createFunctionCallItem(
  overrides: Partial<ResponseFunctionToolCallItem> = {},
): ResponseFunctionToolCallItem {
  return {
    id: "fc_test_123",
    type: "function_call",
    call_id: "call_test_123",
    name: "read_file",
    arguments: "{\"path\":\"README.md\"}",
    status: "completed",
    ...overrides,
  };
}

function createMockOpenAIClient(
  responses:
    | Response[]
    | ((
      request: ResponseCreateParamsNonStreaming,
      turnNumber: number,
    ) => Response | Promise<Response>),
): MockOpenAIClient {
  const calls: ResponseCreateParamsNonStreaming[] = [];

  return {
    calls,
    responses: {
      async create(request) {
        calls.push(request);

        if (typeof responses === "function") {
          return await responses(request, calls.length);
        }

        const response = responses[calls.length - 1];

        if (!response) {
          throw new Error(
            `No mock OpenAI response configured for turn ${String(calls.length)}.`,
          );
        }

        return response;
      },
    },
  };
}

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-openai-"));
  createdDirectories.push(directory);
  return directory;
}

function getSingleToolResultPart(message: TurnMessage): ToolResultTurnContentPart {
  if (typeof message.content === "string") {
    throw new Error("Expected structured tool_result content.");
  }

  const firstPart = message.content[0];

  if (!firstPart || firstPart.type !== "tool_result") {
    throw new Error("Expected a tool_result content part.");
  }

  return firstPart;
}

describe("OpenAI Responses adapter contract", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("fails clearly when OPENAI_API_KEY is missing", () => {
    expect(() =>
      createOpenAIClient({
        env: {},
      }),
    ).toThrowError(/Missing OPENAI_API_KEY/i);
  });

  it("projects registry tools into OpenAI function tools", () => {
    const [readFileTool, editBlockTool] = getTools(["read_file", "edit_block"]);

    expect(
      projectToolsToOpenAIFunctionTools(getTools(["read_file", "edit_block"])),
    ).toEqual([
      {
        type: "function",
        name: "read_file",
        description: readFileTool?.description,
        parameters: readFileTool?.inputSchema,
        strict: false,
      },
      {
        type: "function",
        name: "edit_block",
        description: editBlockTool?.description,
        parameters: editBlockTool?.inputSchema,
        strict: false,
      },
    ]);
  });

  it("assembles a Responses request with the resolved model, tools, and history items", () => {
    const tools = projectToolsToOpenAIFunctionTools(getTools(["read_file"]));
    const request = buildOpenAIResponseRequest({
      systemPrompt: "You are Shipyard.",
      messages: [
        createUserTurnMessage("Inspect README.md"),
        createAssistantToolCallTurnMessage([
          {
            id: "call_readme",
            name: "read_file",
            input: {
              path: "README.md",
            },
          },
        ], {
          text: "I should inspect the file first.",
        }),
        createToolResultTurnMessage([
          {
            toolCallId: "call_readme",
            result: {
              success: true,
              output: "Read 1 line from README.md.",
            },
          },
        ]),
      ],
      tools,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        SHIPYARD_OPENAI_MODEL: "gpt-env-route",
        SHIPYARD_OPENAI_MAX_TOKENS: "4096",
      },
    });

    expect(request.instructions).toBe("You are Shipyard.");
    expect(request.model).toBe("gpt-env-route");
    expect(request.max_output_tokens).toBe(4096);
    expect(request.tools).toBe(tools);
    expect(request.tool_choice).toBe("auto");
    expect(request.input).toEqual([
      {
        role: "user",
        type: "message",
        content: "Inspect README.md",
      },
      {
        role: "assistant",
        type: "message",
        content: "I should inspect the file first.",
      },
      {
        type: "function_call",
        id: "fc_call_readme",
        call_id: "call_readme",
        name: "read_file",
        arguments: "{\"path\":\"README.md\"}",
      },
      {
        type: "function_call_output",
        call_id: "call_readme",
        output: expect.stringContaining("\"success\": true"),
      },
    ]);
  });

  it("resolves Shipyard OpenAI env overrides for both client and request budgets", () => {
    const env = {
      OPENAI_API_KEY: "test-key",
      SHIPYARD_OPENAI_MODEL: "gpt-route",
      SHIPYARD_OPENAI_MAX_TOKENS: "2048",
      SHIPYARD_OPENAI_TIMEOUT_MS: "90000",
      SHIPYARD_OPENAI_MAX_RETRIES: "2",
    } as NodeJS.ProcessEnv;
    const config = resolveOpenAIConfig({ env });
    const request = buildOpenAIResponseRequest({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTurnMessage("Inspect package.json")],
      env,
    });

    expect(config).toMatchObject({
      apiKey: "test-key",
      model: "gpt-route",
      maxTokens: 2048,
      timeoutMs: 90_000,
      maxRetries: 2,
    });
    expect(request.model).toBe("gpt-route");
    expect(request.max_output_tokens).toBe(2048);
  });

  it("maps Responses function_call items into the provider-neutral adapter contract", async () => {
    const adapter = createOpenAIModelAdapter({
      client: createMockOpenAIClient([
        createResponse({
          outputText: "I should inspect the file first.",
          output: [
            {
              id: "msg_123",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "I should inspect the file first.",
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
            createFunctionCallItem(),
          ],
        }),
      ]),
    });

    const result = await adapter.createTurn({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTurnMessage("Inspect README.md")],
      tools: getTools(["read_file"]),
    });

    expect(result.stopReason).toBe("tool_call");
    expect(result.finalText).toBe("I should inspect the file first.");
    expect(result.toolCalls).toEqual([
      {
        id: "call_test_123",
        name: "read_file",
        input: {
          path: "README.md",
        },
      },
    ]);
    expect(result.message).toEqual({
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I should inspect the file first.",
        },
        {
          type: "tool_call",
          toolCallId: "call_test_123",
          toolName: "read_file",
          input: {
            path: "README.md",
          },
        },
      ],
    });
  });

  it("encodes tool-call results as function_call_output items keyed by call_id", () => {
    const message = createToolResultTurnMessage([
      {
        toolCallId: "call_result_123",
        result: {
          success: false,
          output: "",
          error: "File not found: README.md",
        },
      },
    ]);

    const outputItem = createFunctionCallOutputItem(
      getSingleToolResultPart(message),
    );

    expect(outputItem).toMatchObject({
      type: "function_call_output",
      call_id: "call_result_123",
    });
    expect(String(outputItem.output)).toContain("\"error\": \"File not found: README.md\"");
  });

  it("extracts final text from Responses output when no tool calls are present", async () => {
    const adapter = createOpenAIModelAdapter({
      client: createMockOpenAIClient([
        createResponse({
          outputText: "Finished without tools.",
          output: [
            {
              id: "msg_final",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "Finished without tools.",
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
      ]),
    });

    const result = await adapter.createTurn({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTurnMessage("Summarize the workspace.")],
    });

    expect(result.stopReason).toBe("completed");
    expect(result.finalText).toBe("Finished without tools.");
    expect(result.toolCalls).toEqual([]);
  });

  it("fails descriptively on malformed function-call arguments", () => {
    expect(() =>
      extractOpenAIFunctionToolCalls([
        createFunctionCallItem({
          arguments: "{not-valid-json}",
        }),
      ]),
    ).toThrowError(/Malformed OpenAI function call arguments/i);
  });

  it("fails descriptively on unsupported output item types", () => {
    expect(() =>
      normalizeOpenAIOutputItems([
        {
          type: "mystery_output",
        } as unknown as ResponseOutputItem,
      ]),
    ).toThrowError(/Unsupported OpenAI output item type "mystery_output"/i);
  });

  it("runs the shared raw loop through the OpenAI adapter without duplicating the loop", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "README.md"), "# Shipyard\n", "utf8");
    const client = createMockOpenAIClient([
      createResponse({
        outputText: "I should inspect the file first.",
        output: [
          {
            id: "msg_tool",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "I should inspect the file first.",
                annotations: [],
                logprobs: [],
              },
            ],
          },
          createFunctionCallItem({
            call_id: "call_read_file_loop",
            arguments: "{\"path\":\"README.md\"}",
          }),
        ],
      }),
      createResponse({
        outputText: "README.md just contains a Shipyard heading.",
        output: [
          {
            id: "msg_done",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "README.md just contains a Shipyard heading.",
                annotations: [],
                logprobs: [],
              },
            ],
          },
        ],
      }),
    ]);

    const result = await runRawToolLoopDetailed(
      "You are Shipyard.",
      "Inspect README.md",
      ["read_file"],
      directory,
      {
        modelAdapter: createOpenAIModelAdapter({ client }),
        logger: {
          log() {},
        },
      },
    );

    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("README.md just contains a Shipyard heading.");
    expect(result.modelProvider).toBe("openai");
    expect(result.modelName).toBe(DEFAULT_OPENAI_MODEL);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "function_call_output",
          call_id: "call_read_file_loop",
        }),
      ]),
    );
  });

  it("maps max_output_tokens incomplete responses to the shared max_tokens stop reason", async () => {
    const adapter = createOpenAIModelAdapter({
      client: createMockOpenAIClient([
        createResponse({
          outputText: "",
          status: "incomplete",
          incompleteReason: "max_output_tokens",
          output: [],
        }),
      ]),
    });

    const result = await adapter.createTurn({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTurnMessage("Keep talking")],
      maxTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    });

    expect(result.stopReason).toBe("max_tokens");
  });

  it("extracts text output from assistant messages and refusals", () => {
    expect(
      extractOpenAITextOutput([
        {
          id: "msg_refusal",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Normal text",
              annotations: [],
              logprobs: [],
            },
            {
              type: "refusal",
              refusal: "I cannot do that.",
            },
          ],
        },
      ]),
    ).toBe("Normal text\n\nI cannot do that.");
  });
});
