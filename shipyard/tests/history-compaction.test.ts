import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";

import {
  RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET,
  buildCompactedMessageHistory,
} from "../src/engine/history-compaction.js";

function createStructuredToolResultMessage(content: string): MessageParam {
  return {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        content,
        is_error: false,
      },
    ],
  };
}

describe("history compaction", () => {
  it("retains compact previews for large write-heavy turns", () => {
    const result = buildCompactedMessageHistory({
      initialUserMessage: {
        role: "user",
        content:
          "Build a Trello clone.\n" +
          "x".repeat(RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET),
      },
      completedTurns: [
        {
          turnNumber: 5,
          assistantMessage: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_1",
                name: "write_file",
                input: {
                  path: "src/data/seedData.ts",
                  content: "seed".repeat(4_000),
                },
                caller: {
                  type: "direct",
                },
              },
            ],
          },
          toolResultMessage: createStructuredToolResultMessage(
            JSON.stringify({
              success: true,
              output: "Created src/data/seedData.ts\nLines: 595",
            }),
          ),
          toolExecutions: [
            {
              toolName: "write_file",
              input: {
                path: "src/data/seedData.ts",
              },
              success: true,
              output: "Created src/data/seedData.ts\nLines: 595",
              editedPath: "src/data/seedData.ts",
              touchedFiles: ["src/data/seedData.ts"],
              historyDigest: {
                requestLine:
                  "write_file(src/data/seedData.ts) lines=595 chars=16000 fingerprint=test-hash preview=\"export const seedData = {\"",
                resultLine:
                  "write_file(src/data/seedData.ts) success lines=595 fingerprint=test-hash preview=\"export const seedData = {\\n  boards: [\\n    {\\n      id: 'board-1',\\n      name: 'Roadmap'\". Re-read the file from disk if exact contents are needed.",
                isWriteLike: true,
                prefersVerbatimTail: false,
              },
            },
          ],
        },
      ],
    });

    const serialized = JSON.stringify(result.messages);

    expect(result.didCompact).toBe(true);
    expect(serialized).toContain("src/data/seedData.ts");
    expect(serialized).toContain("created 595 lines");
    expect(serialized).toContain("Roadmap");
  });
});
