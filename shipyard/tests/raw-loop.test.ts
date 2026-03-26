import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RAW_LOOP_MAX_ITERATIONS,
  runRawToolLoop,
  runRawToolLoopDetailed,
} from "../src/engine/raw-loop.js";
import "../src/tools/index.js";
import {
  getTools,
  getTool,
  registerTool,
} from "../src/tools/registry.js";
import {
  DEFAULT_FAKE_MODEL_NAME,
  DEFAULT_FAKE_MODEL_PROVIDER,
  createAbortError,
  createFakeModelAdapter,
  createFakeModelTurnResult,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
  getLastStructuredUserMessage,
  getToolNamesFromCall,
  getToolResultContentParts,
} from "./support/fake-model-adapter.js";

const createdDirectories: string[] = [];
const LOGGER_TEST_TOOL_NAME = "loop_logger_test_tool";

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-raw-loop-"));
  createdDirectories.push(directory);
  return directory;
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

describe("raw tool loop", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("returns final text when the model ends without tool use", async () => {
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult("Finished without tools."),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Summarize the workspace.",
      [],
      process.cwd(),
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("Finished without tools.");
    expect(modelAdapter.calls).toHaveLength(1);
    expect(modelAdapter.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "Summarize the workspace.",
      },
    ]);
    expect(getToolNamesFromCall(modelAdapter.calls[0]!)).toEqual([]);
  });

  it("reports provider-neutral model metadata for completed turns", async () => {
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult("Finished without tools."),
    ]);

    const result = await runRawToolLoopDetailed(
      "You are Shipyard.",
      "Summarize the workspace.",
      [],
      process.cwd(),
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result.modelProvider).toBe(DEFAULT_FAKE_MODEL_PROVIDER);
    expect(result.modelName).toBe(DEFAULT_FAKE_MODEL_NAME);
  });

  it("continues after a tool_use response and sends tool_result blocks back", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "README.md"), "# Shipyard\n", "utf8");
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_readme",
          name: "read_file",
          input: {
            path: "README.md",
          },
        },
      ], {
        text: "I should inspect the README first.",
      }),
      createFakeTextTurnResult("README inspected successfully."),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Inspect the README.",
      ["read_file"],
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("README inspected successfully.");
    expect(modelAdapter.calls).toHaveLength(2);
    expect(getToolNamesFromCall(modelAdapter.calls[0]!)).toEqual(["read_file"]);
    expect(modelAdapter.calls[1]?.messages).toHaveLength(3);
    expect(modelAdapter.calls[1]?.messages[1]).toEqual({
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I should inspect the README first.",
        },
        {
          type: "tool_call",
          toolCallId: "toolu_readme",
          toolName: "read_file",
          input: {
            path: "README.md",
          },
        },
      ],
    });

    const [toolResult] = getToolResultContentParts(modelAdapter.calls[1]!);

    expect(toolResult).toEqual({
      type: "tool_result",
      toolCallId: "toolu_readme",
      result: {
        success: true,
        output: expect.stringContaining("Path: README.md"),
      },
    });
    expect(toolResult?.result.output).toContain("# Shipyard");
  });

  it("executes all tool_use blocks from a single assistant turn in order", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "README.md"), "# Shipyard\n", "utf8");
    await writeFile(path.join(directory, "package.json"), '{ "name": "shipyard" }\n', "utf8");
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_list",
          name: "list_files",
          input: {
            path: ".",
            depth: 1,
          },
        },
        {
          id: "toolu_read",
          name: "read_file",
          input: {
            path: "package.json",
          },
        },
      ]),
      createFakeTextTurnResult(
        "I inspected the directory and package manifest.",
      ),
    ]);

    await runRawToolLoop(
      "You are Shipyard.",
      "Inspect the repo.",
      ["list_files", "read_file"],
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    const toolResults = getToolResultContentParts(modelAdapter.calls[1]!);

    expect(toolResults.map((result) => result.toolCallId)).toEqual([
      "toolu_list",
      "toolu_read",
    ]);
    expect(toolResults[0]?.result.output).toContain("./");
    expect(toolResults[1]?.result.output).toContain("Path: package.json");
  });

  it("compacts oversized completed tool turns before replaying them to the adapter", async () => {
    const directory = await createTempProject();
    const largeFileContents =
      `export const LARGE_PAYLOAD = "${"x".repeat(18_000)}";\n`;
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_big_write",
          name: "write_file",
          input: {
            path: "src/big.ts",
            content: largeFileContents,
          },
        },
      ]),
      createFakeToolCallTurnResult([
        {
          id: "toolu_read_package",
          name: "read_file",
          input: {
            path: "src/big.ts",
          },
        },
      ]),
      createFakeTextTurnResult("Large file written successfully."),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Create a large TypeScript file.",
      ["write_file", "read_file"],
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    const replayedHistory = JSON.stringify(modelAdapter.calls[2]?.messages ?? []);

    expect(result).toBe("Large file written successfully.");
    expect(replayedHistory).not.toContain(largeFileContents);
    expect(replayedHistory).toContain("src/big.ts");
    expect(replayedHistory).toContain("write_file");
    expect(replayedHistory).toContain("fingerprint=");
    expect(replayedHistory).toContain("Re-read the file from disk");
    expect(replayedHistory).toContain("toolu_read_package");
  });

  it("compacts oversized run_command output after the turn completes", async () => {
    const directory = await createTempProject();
    const commandOutput = "x".repeat(5_400);
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_run_large_command",
          name: "run_command",
          input: {
            command: `node -e "process.stdout.write('${commandOutput}')"`
          },
        },
      ]),
      createFakeToolCallTurnResult([
        {
          id: "toolu_list_after_command",
          name: "list_files",
          input: {
            path: ".",
            depth: 1,
          },
        },
      ]),
      createFakeTextTurnResult(
        "Finished after the long command output was compacted.",
      ),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Run a long command and then continue.",
      ["run_command", "list_files"],
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    const replayedHistory = JSON.stringify(modelAdapter.calls[2]?.messages ?? []);

    expect(result).toBe("Finished after the long command output was compacted.");
    expect(replayedHistory).not.toContain(commandOutput);
    expect(replayedHistory).toContain("run_command");
    expect(replayedHistory).toContain("output_chars=");
    expect(replayedHistory).toContain("fingerprint=");
    expect(replayedHistory).toContain("toolu_list_after_command");
  });

  it("retries stop_reason=max_tokens with a higher max_tokens budget", async () => {
    const modelAdapter = createFakeModelAdapter([
      createFakeModelTurnResult({
        stopReason: "max_tokens",
        rawStopReason: "max_tokens",
      }),
      createFakeTextTurnResult("Recovered after raising the output budget."),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Explain the repo status.",
      [],
      process.cwd(),
      {
        modelAdapter,
        logger: {
          log() {},
        },
        maxTokens: 1024,
        maxTokensRecoveryRetries: 1,
        maxTokensRetryMultiplier: 2,
      },
    );

    expect(result).toBe("Recovered after raising the output budget.");
    expect(modelAdapter.calls[0]?.maxTokens).toBe(1024);
    expect(modelAdapter.calls[1]?.maxTokens).toBe(2048);
    expect(modelAdapter.calls[0]?.messages).toEqual(modelAdapter.calls[1]?.messages);
  });

  it("raises a targeted budget error when max_tokens exhaustion persists", async () => {
    const modelAdapter = createFakeModelAdapter([
      createFakeModelTurnResult({
        stopReason: "max_tokens",
        rawStopReason: "max_tokens",
      }),
      createFakeModelTurnResult({
        stopReason: "max_tokens",
        rawStopReason: "max_tokens",
      }),
    ]);

    await expect(
      runRawToolLoop(
        "You are Shipyard.",
        "Explain the repo status.",
        [],
        process.cwd(),
        {
          modelAdapter,
          logger: {
            log() {},
          },
          maxTokens: 1024,
          maxTokensRecoveryRetries: 1,
          maxTokensRetryMultiplier: 2,
        },
      ),
    ).rejects.toThrowError(/output budget exhausted|stop_reason=max_tokens/i);
  });

  it("returns a continuation result after 25 iterations without a final response", async () => {
    const modelAdapter = createFakeModelAdapter((_input, { turnNumber }) =>
      createFakeToolCallTurnResult([
        {
          id: `toolu_missing_${String(turnNumber)}`,
          name: "missing_tool",
          input: {
            iteration: turnNumber,
          },
        },
      ]),
    );

    const result = await runRawToolLoopDetailed(
      "You are Shipyard.",
      "Keep going forever.",
      [],
      process.cwd(),
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result.status).toBe("continuation");
    expect(result.finalText).toMatch(
      new RegExp(`reached the acting iteration limit of ${String(RAW_LOOP_MAX_ITERATIONS)}`, "i"),
    );
    expect(result.didEdit).toBe(false);
    expect(result.iterations).toBe(RAW_LOOP_MAX_ITERATIONS);
    expect(modelAdapter.calls).toHaveLength(RAW_LOOP_MAX_ITERATIONS);
  });

  it("returns a failure tool_result when the model asks for an unknown tool", async () => {
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_unknown",
          name: "totally_unknown_tool",
          input: {
            path: "README.md",
          },
        },
      ]),
      createFakeTextTurnResult("I handled the unavailable tool safely."),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Try a missing tool.",
      ["read_file"],
      process.cwd(),
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("I handled the unavailable tool safely.");

    const [toolResult] = getToolResultContentParts(modelAdapter.calls[1]!);

    expect(toolResult).toEqual({
      type: "tool_result",
      toolCallId: "toolu_unknown",
      result: {
        success: false,
        output: "",
        error: 'Tool "totally_unknown_tool" is not available in this loop.',
      },
    });
  });

  it("returns a cancelled result when the active turn signal aborts the model request", async () => {
    const controller = new AbortController();
    const modelAdapter = createFakeModelAdapter((_input, { signal }) =>
      new Promise((_, reject) => {
        const rejectAsAborted = () => reject(createAbortError());

        if (signal?.aborted) {
          rejectAsAborted();
          return;
        }

        signal?.addEventListener("abort", rejectAsAborted, {
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
        modelAdapter,
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
    expect(modelAdapter.calls).toHaveLength(1);
  });

  it("logs truncated tool inputs and outputs", async () => {
    const longInput = "x".repeat(240);
    const loggerMessages: string[] = [];
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_logger",
          name: LOGGER_TEST_TOOL_NAME,
          input: {
            long_input: longInput,
          },
        },
      ]),
      createFakeTextTurnResult("Logged with truncation."),
    ]);

    await runRawToolLoop(
      "You are Shipyard.",
      "Exercise logger truncation.",
      [LOGGER_TEST_TOOL_NAME],
      process.cwd(),
      {
        modelAdapter,
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

  it("preserves the latest read-only tool cycle verbatim when compaction would otherwise drop fresh file contents", async () => {
    const directory = await createTempProject();
    const largeContents = `${"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu\n".repeat(260)}`;

    await writeFile(path.join(directory, "large.txt"), largeContents, "utf8");

    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_read_large",
          name: "read_file",
          input: {
            path: "large.txt",
          },
        },
      ]),
      createFakeTextTurnResult("Finished after keeping the read context."),
    ]);

    const result = await runRawToolLoop(
      "You are Shipyard.",
      "Read the large file and then continue.",
      ["read_file"],
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toBe("Finished after keeping the read context.");
    expect(modelAdapter.calls).toHaveLength(2);
    expect(modelAdapter.calls[1]?.messages).toHaveLength(3);
    expect(modelAdapter.calls[1]?.messages[1]).toMatchObject({
      role: "assistant",
    });
    expect(modelAdapter.calls[1]?.messages[2]).toMatchObject({
      role: "user",
    });

    const toolResultMessage = getLastStructuredUserMessage(modelAdapter.calls[1]!);

    expect(typeof toolResultMessage.content).not.toBe("string");
    expect(toolResultMessage.content).toHaveLength(1);
    expect(toolResultMessage.content[0]).toMatchObject({
      type: "tool_result",
      toolCallId: "toolu_read_large",
      result: {
        success: true,
      },
    });
  });
});
