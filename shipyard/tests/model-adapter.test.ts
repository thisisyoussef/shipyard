import { describe, expect, it } from "vitest";

import {
  createAssistantTextTurnMessage,
  createAssistantToolCallTurnMessage,
  createToolResultTurnMessage,
  createUserTurnMessage,
  extractTextFromTurnMessage,
  extractToolCallsFromTurnMessage,
  normalizeToolCallResults,
} from "../src/engine/model-adapter.js";
import { createToolSuccessResult } from "../src/tools/registry.js";

describe("model adapter contract helpers", () => {
  it("represents a no-tool turn with provider-neutral message helpers", () => {
    const userMessage = createUserTurnMessage("Inspect README.md");
    const assistantMessage = createAssistantTextTurnMessage(
      "Inspecting the README now.",
    );

    expect(userMessage).toEqual({
      role: "user",
      content: "Inspect README.md",
    });
    expect(assistantMessage.role).toBe("assistant");
    expect(extractTextFromTurnMessage(assistantMessage)).toBe(
      "Inspecting the README now.",
    );
    expect(extractToolCallsFromTurnMessage(assistantMessage)).toEqual([]);
  });

  it("represents a tool-call turn without leaking provider wire types", () => {
    const assistantMessage = createAssistantToolCallTurnMessage(
      [
        {
          id: "call_readme",
          name: "read_file",
          input: {
            path: "README.md",
          },
        },
      ],
      {
        text: "I should inspect the README first.",
      },
    );

    expect(extractTextFromTurnMessage(assistantMessage)).toBe(
      "I should inspect the README first.",
    );
    expect(extractToolCallsFromTurnMessage(assistantMessage)).toEqual([
      {
        id: "call_readme",
        name: "read_file",
        input: {
          path: "README.md",
        },
      },
    ]);
  });

  it("normalizes tool-call results into structured turn content", () => {
    const toolResult = createToolSuccessResult("ok");
    const normalizedResults = normalizeToolCallResults([
      {
        toolCallId: "call_readme",
        result: toolResult,
      },
    ]);
    const message = createToolResultTurnMessage([
      {
        toolCallId: "call_readme",
        result: toolResult,
      },
    ]);

    expect(normalizedResults).toEqual([
      {
        type: "tool_result",
        toolCallId: "call_readme",
        result: toolResult,
      },
    ]);
    expect(message).toEqual({
      role: "user",
      content: normalizedResults,
    });
  });

  it("fails descriptively when a tool-call result is malformed", () => {
    expect(() =>
      normalizeToolCallResults([
        {
          toolCallId: "   ",
          result: createToolSuccessResult("ok"),
        },
      ]),
    ).toThrowError(/toolCallResults\[0\]\.toolCallId must not be blank/i);
  });
});
