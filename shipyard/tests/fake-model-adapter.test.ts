import { describe, expect, it } from "vitest";

import {
  createUserTurnMessage,
  createToolResultTurnMessage,
} from "../src/engine/model-adapter.js";
import { createToolSuccessResult } from "../src/tools/registry.js";
import {
  createFakeModelAdapter,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
  getLastStructuredUserMessage,
  getToolNamesFromCall,
  getToolResultContentParts,
} from "./support/fake-model-adapter.js";

describe("fake model adapter test harness", () => {
  it("can emit a tool-call turn and records normalized model input", async () => {
    const adapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "call_readme",
          name: "read_file",
          input: {
            path: "README.md",
          },
        },
      ], {
        text: "I should inspect the README first.",
      }),
    ]);

    const result = await adapter.createTurn({
      systemPrompt: "You are Shipyard.",
      messages: [createUserTurnMessage("Inspect README.md")],
      tools: [
        {
          name: "read_file",
          description: "Read a file.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
              },
            },
            required: ["path"],
            additionalProperties: false,
          },
          async execute() {
            return createToolSuccessResult("unused");
          },
        },
      ],
    });

    expect(result.stopReason).toBe("tool_call");
    expect(result.finalText).toBe("I should inspect the README first.");
    expect(result.toolCalls).toEqual([
      {
        id: "call_readme",
        name: "read_file",
        input: {
          path: "README.md",
        },
      },
    ]);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "Inspect README.md",
      },
    ]);
    expect(getToolNamesFromCall(adapter.calls[0]!)).toEqual(["read_file"]);
  });

  it("can emit a final-text turn and exposes normalized tool_result history", async () => {
    const adapter = createFakeModelAdapter([
      createFakeTextTurnResult("README inspected successfully."),
    ]);

    const result = await adapter.createTurn({
      systemPrompt: "You are Shipyard.",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              toolCallId: "call_readme",
              toolName: "read_file",
              input: {
                path: "README.md",
              },
            },
          ],
        },
        createToolResultTurnMessage([
          {
            toolCallId: "call_readme",
            result: createToolSuccessResult("Path: README.md\n# Shipyard"),
          },
        ]),
      ],
    });

    expect(result.stopReason).toBe("completed");
    expect(result.finalText).toBe("README inspected successfully.");

    const toolResultMessage = getLastStructuredUserMessage(adapter.calls[0]!);

    expect(toolResultMessage.role).toBe("user");
    expect(getToolResultContentParts(adapter.calls[0]!)).toEqual([
      {
        type: "tool_result",
        toolCallId: "call_readme",
        result: {
          success: true,
          output: "Path: README.md\n# Shipyard",
        },
      },
    ]);
  });
});
