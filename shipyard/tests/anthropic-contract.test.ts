import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANTHROPIC_MAX_TOKENS,
  DEFAULT_ANTHROPIC_TIMEOUT_MS,
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageRequest,
  createAnthropicClient,
  createAnthropicMessage,
  createAnthropicModelAdapter,
  createAssistantHistoryMessage,
  createToolResultPayload,
  createUserTextMessage,
  createUserToolResultMessage,
  extractAssistantText,
  extractAssistantToolUseBlocks,
  normalizeAssistantResponseBlocks,
  projectToolsToAnthropicTools,
  resolveAnthropicConfig,
} from "../src/engine/anthropic.js";
import type { ToolResultTurnContentPart, TurnMessage } from "../src/engine/model-adapter.js";
import "../src/tools/index.js";
import { getTools } from "../src/tools/registry.js";

function createAssistantMessage(content: unknown[]): Message {
  return {
    id: "msg_test_123",
    container: null,
    content: content as Message["content"],
    model: DEFAULT_ANTHROPIC_MODEL,
    role: "assistant",
    stop_reason: "tool_use",
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 32,
      output_tokens: 14,
      server_tool_use: null,
      service_tier: "standard",
    },
  };
}

function getSingleToolResultBlock(
  message: TurnMessage,
): ToolResultTurnContentPart {
  if (typeof message.content === "string") {
    throw new Error("Expected structured tool_result content.");
  }

  const firstPart = message.content[0];

  if (!firstPart || firstPart.type !== "tool_result") {
    throw new Error("Expected a tool_result content part.");
  }

  return firstPart;
}

describe("Anthropic client contract", () => {
  it("fails clearly when ANTHROPIC_API_KEY is missing", () => {
    expect(() =>
      createAnthropicClient({
        env: {},
      }),
    ).toThrowError(/Missing ANTHROPIC_API_KEY/i);
  });

  it("uses higher Anthropic defaults for code-writing loops", () => {
    const config = resolveAnthropicConfig({
      env: {
        ANTHROPIC_API_KEY: "test-key",
      },
    });

    expect(config.maxTokens).toBe(12_288);
    expect(config.timeoutMs).toBe(600_000);
    expect(DEFAULT_ANTHROPIC_MAX_TOKENS).toBe(12_288);
    expect(DEFAULT_ANTHROPIC_TIMEOUT_MS).toBe(600_000);
  });

  it("assembles a Claude request from registry-produced tools unchanged", () => {
    const messages = [createUserTextMessage("Inspect package.json")];
    const tools = projectToolsToAnthropicTools(
      getTools(["read_file", "edit_block"]),
    );
    const request = buildAnthropicMessageRequest({
      systemPrompt: "You are Shipyard.",
      messages,
      tools,
    });

    expect(request.system).toBe("You are Shipyard.");
    expect(request.messages).toEqual(messages);
    expect(request.messages).not.toBe(messages);
    expect(request.tools).toBe(tools);
    expect(request.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(request.max_tokens).toBe(DEFAULT_ANTHROPIC_MAX_TOKENS);

    messages.push(createUserTextMessage("Mutate after request assembly."));

    expect(request.messages).toEqual([
      {
        role: "user",
        content: "Inspect package.json",
      },
    ]);
  });

  it("resolves Shipyard Anthropic env overrides for both client and request budgets", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-key",
      SHIPYARD_ANTHROPIC_MODEL: "claude-opus-4-1",
      SHIPYARD_ANTHROPIC_MAX_TOKENS: "12288",
      SHIPYARD_ANTHROPIC_TIMEOUT_MS: "90000",
      SHIPYARD_ANTHROPIC_MAX_RETRIES: "2",
    } as NodeJS.ProcessEnv;
    const config = resolveAnthropicConfig({ env });
    const request = buildAnthropicMessageRequest({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTextMessage("Inspect package.json")],
      env,
    });

    expect(config).toMatchObject({
      apiKey: "test-key",
      model: "claude-opus-4-1",
      maxTokens: 12_288,
      timeoutMs: 90_000,
      maxRetries: 2,
    });
    expect(request.model).toBe("claude-opus-4-1");
    expect(request.max_tokens).toBe(12_288);
  });

  it("wraps Anthropic timeouts with a targeted timeout message", async () => {
    await expect(
      createAnthropicMessage(
        {
          messages: {
            async create() {
              throw new Anthropic.APIConnectionTimeoutError();
            },
          },
        },
        {
          systemPrompt: "You are Shipyard.",
          messages: [createUserTextMessage("Inspect package.json")],
          timeoutMs: 600_000,
        },
      ),
    ).rejects.toThrowError(
      /Anthropic API request timed out after 600000ms during message creation/i,
    );
  });

  it("maps Anthropic responses into the provider-neutral adapter contract", async () => {
    const adapter = createAnthropicModelAdapter({
      client: {
        messages: {
          async create() {
            return createAssistantMessage([
              {
                type: "text",
                text: "I should inspect the file first.",
                citations: null,
              },
              {
                type: "tool_use",
                id: "toolu_read_file",
                name: "read_file",
                input: {
                  path: "README.md",
                },
                caller: {
                  type: "direct",
                },
              },
            ]);
          },
        },
      },
    });

    const result = await adapter.createTurn({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTextMessage("Inspect README.md")],
      tools: getTools(["read_file"]),
    });

    expect(result.stopReason).toBe("tool_call");
    expect(result.finalText).toBe("I should inspect the file first.");
    expect(result.toolCalls).toEqual([
      {
        id: "toolu_read_file",
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
          toolCallId: "toolu_read_file",
          toolName: "read_file",
          input: {
            path: "README.md",
          },
        },
      ],
    });
  });

  it("inherits Anthropic env overrides through adapter defaults", () => {
    const adapter = createAnthropicModelAdapter({
      env: {
        ANTHROPIC_API_KEY: "test-key",
        SHIPYARD_ANTHROPIC_MODEL: "claude-opus-4-1",
        SHIPYARD_ANTHROPIC_MAX_TOKENS: "24576",
      },
      client: {
        messages: {
          async create() {
            return createAssistantMessage([
              {
                type: "text",
                text: "Ready.",
                citations: null,
              },
            ]);
          },
        },
      },
    });

    expect(adapter.defaultModel).toBe("claude-opus-4-1");
    expect(adapter.defaultMaxTokens).toBe(24_576);
  });

  it("rejects invalid Shipyard Anthropic env overrides clearly", () => {
    expect(() =>
      resolveAnthropicConfig({
        apiKey: "test-key",
        env: {
          SHIPYARD_ANTHROPIC_MAX_TOKENS: "not-a-number",
        },
      }),
    ).toThrowError(/SHIPYARD_ANTHROPIC_MAX_TOKENS/i);

    expect(() =>
      resolveAnthropicConfig({
        apiKey: "test-key",
        env: {
          SHIPYARD_ANTHROPIC_TIMEOUT_MS: "-1",
        },
      }),
    ).toThrowError(/SHIPYARD_ANTHROPIC_TIMEOUT_MS/i);
  });

  it("rejects blank prompts and blank user messages before request assembly", () => {
    expect(() =>
      buildAnthropicMessageRequest({
        systemPrompt: "   ",
        messages: [createUserTextMessage("Inspect README.md")],
      }),
    ).toThrowError(/systemPrompt must not be blank/i);

    expect(() =>
      buildAnthropicMessageRequest({
        systemPrompt: "You are Shipyard.",
        messages: [{ role: "user", content: "   " }],
      }),
    ).toThrowError(/messages\[0\]\.content must not be blank/i);
  });

  it("extracts assistant tool_use blocks and preserves replayable assistant content", () => {
    const assistantMessage = createAssistantMessage([
      {
        type: "text",
        text: "I will inspect the file before editing it.",
        citations: null,
      },
      {
        type: "tool_use",
        id: "toolu_read_file",
        name: "read_file",
        input: {
          path: "README.md",
        },
        caller: {
          type: "direct",
        },
      },
    ]);

    const normalizedBlocks = normalizeAssistantResponseBlocks(assistantMessage.content);
    const replayMessage = createAssistantHistoryMessage(assistantMessage);
    const toolUses = extractAssistantToolUseBlocks(assistantMessage);

    expect(normalizedBlocks).toHaveLength(2);
    expect(extractAssistantText(assistantMessage)).toBe(
      "I will inspect the file before editing it.",
    );
    expect(toolUses).toEqual([
      {
        type: "tool_use",
        id: "toolu_read_file",
        name: "read_file",
        input: {
          path: "README.md",
        },
        caller: {
          type: "direct",
        },
      },
    ]);
    expect(replayMessage).toEqual({
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I will inspect the file before editing it.",
        },
        {
          type: "tool_call",
          toolCallId: "toolu_read_file",
          toolName: "read_file",
          input: {
            path: "README.md",
          },
        },
      ],
    });
  });

  it("creates user tool_result messages that preserve success and error payloads", () => {
    const successMessage = createUserToolResultMessage("toolu_success", {
      success: true,
      output: "Read 12 lines from README.md.",
    });
    const errorMessage = createUserToolResultMessage("toolu_error", {
      success: false,
      output: "",
      error: "Anchor not found in README.md.",
    });

    expect(createToolResultPayload({
      success: true,
      output: "Read 12 lines from README.md.",
    })).toContain('"success": true');

    const successBlock = getSingleToolResultBlock(successMessage);
    const errorBlock = getSingleToolResultBlock(errorMessage);

    expect(successBlock.result.success).toBe(true);
    expect(successBlock.result).toEqual({
      success: true,
      output: "Read 12 lines from README.md.",
    });
    expect(errorBlock.result.success).toBe(false);
    expect(errorBlock.result).toEqual({
      success: false,
      output: "",
      error: "Anchor not found in README.md.",
    });
  });

  it("fails descriptively on unknown assistant content block types", () => {
    expect(() =>
      normalizeAssistantResponseBlocks([
        {
          type: "text",
          text: "I have a plan.",
          citations: null,
        },
        {
          type: "mystery_block",
        },
      ]),
    ).toThrowError(/Unsupported assistant content block type "mystery_block"/i);
  });
});
