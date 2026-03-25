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

import type { EvaluationPlan } from "../src/artifacts/types.js";
import {
  normalizeEvaluationPlan,
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

function createVerifierCommandResponses(options: {
  toolUseId: string;
  command: string;
  exitCode: number | null;
  passed: boolean;
  stdout: string;
  stderr: string;
  summary: string;
  timeoutSeconds?: number;
}): Message[] {
  return [
    createAssistantMessage({
      stopReason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: options.toolUseId,
          name: "run_command",
          input: {
            command: options.command,
            timeout_seconds: options.timeoutSeconds ?? 2,
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
            command: options.command,
            exitCode: options.exitCode,
            passed: options.passed,
            stdout: options.stdout,
            stderr: options.stderr,
            summary: options.summary,
          }),
          citations: null,
        },
      ],
    }),
  ];
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
      evaluationPlan: {
        summary: "Run the verification command.",
        checks: [
          {
            id: "check-1",
            label: "Run pnpm test",
            kind: "command",
            command: "pnpm test",
            required: true,
          },
        ],
      },
      checks: [
        {
          checkId: "check-1",
          label: "Run pnpm test",
          kind: "command",
          command: "pnpm test",
          required: true,
          status: "passed",
          exitCode: 0,
          stdout: "",
          stderr: "",
          summary: "Verification passed.",
        },
      ],
      firstHardFailure: null,
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
      evaluationPlan: {
        summary: "Run the verification command.",
        checks: [
          {
            id: "check-1",
            label: "Run node -e \"console.log('ok')\"",
            kind: "command",
            command: "node -e \"console.log('ok')\"",
            required: true,
          },
        ],
      },
      checks: [
        {
          checkId: "check-1",
          label: "Run node -e \"console.log('ok')\"",
          kind: "command",
          command: "node -e \"console.log('ok')\"",
          required: true,
          status: "passed",
          exitCode: 0,
          stdout: "ok\n",
          stderr: "",
          summary: "Command passed: node -e \"console.log('ok')\"",
        },
      ],
      firstHardFailure: null,
    });

    const toolResultPayloads = getToolResultPayloads(client.calls[1]!);

    expect(toolResultPayloads).toHaveLength(1);
    expect(toolResultPayloads[0]?.payload.success).toBe(true);
    expect(toolResultPayloads[0]?.payload.output).toContain("Command: node -e");
    expect(toolResultPayloads[0]?.payload.output).toContain("Exit code: 0");
    expect(toolResultPayloads[0]?.payload.output).toContain("ok");
  });

  it("evaluation plan validation rejects empty or malformed plans", () => {
    expect(() =>
      normalizeEvaluationPlan({
        summary: "No checks",
        checks: [],
      } satisfies EvaluationPlan),
    ).toThrow(/evaluation plan|checks/i);

    expect(() =>
      normalizeEvaluationPlan({
        summary: "Missing required checks",
        checks: [
          {
            id: "optional-only",
            label: "Optional smoke check",
            kind: "command",
            command: "pnpm test",
            required: false,
          },
        ],
      } satisfies EvaluationPlan),
    ).toThrow(/required|evaluation plan/i);
  });

  it("single command input normalizes to a one-check evaluation plan", () => {
    expect(normalizeEvaluationPlan("pnpm test")).toEqual({
      summary: "Run the verification command.",
      checks: [
        {
          id: "check-1",
          label: "Run pnpm test",
          kind: "command",
          command: "pnpm test",
          required: true,
        },
      ],
    } satisfies EvaluationPlan);
  });

  it("verification report captures ordered per-check results", async () => {
    const directory = await createTempProject();
    const evaluationPlan = {
      summary: "Validate the auth flow.",
      checks: [
        {
          id: "unit-tests",
          label: "Run unit tests",
          kind: "command",
          command: "node -e \"console.log('unit ok')\"",
          required: true,
        },
        {
          id: "build-check",
          label: "Run build",
          kind: "command",
          command: "node -e \"console.log('build ok')\"",
          required: true,
        },
      ],
    } satisfies EvaluationPlan;
    const client = createMockAnthropicClient([
      ...createVerifierCommandResponses({
        toolUseId: "toolu_unit",
        command: "node -e \"console.log('unit ok')\"",
        exitCode: 0,
        passed: true,
        stdout: "unit ok\n",
        stderr: "",
        summary: "Unit tests passed.",
      }),
      ...createVerifierCommandResponses({
        toolUseId: "toolu_build",
        command: "node -e \"console.log('build ok')\"",
        exitCode: 0,
        passed: true,
        stdout: "build ok\n",
        stderr: "",
        summary: "Build passed.",
      }),
    ]);

    const result = await runVerifierSubagent(evaluationPlan, directory, {
      client,
      logger: {
        log() {},
      },
    });

    expect(result.passed).toBe(true);
    expect(result.evaluationPlan).toEqual(evaluationPlan);
    expect(result.firstHardFailure).toBeNull();
    expect(result.checks).toEqual([
      {
        checkId: "unit-tests",
        label: "Run unit tests",
        kind: "command",
        command: "node -e \"console.log('unit ok')\"",
        required: true,
        status: "passed",
        exitCode: 0,
        stdout: "unit ok\n",
        stderr: "",
        summary: "Unit tests passed.",
      },
      {
        checkId: "build-check",
        label: "Run build",
        kind: "command",
        command: "node -e \"console.log('build ok')\"",
        required: true,
        status: "passed",
        exitCode: 0,
        stdout: "build ok\n",
        stderr: "",
        summary: "Build passed.",
      },
    ]);
    expect(result.summary).toMatch(/all 2 evaluation checks passed/i);
  });

  it("rejects malformed final report JSON", () => {
    expect(() =>
      parseVerificationReport("not json at all", "pnpm test"),
    ).toThrow(/json|verificationreport/i);
  });

  it("accepts valid report JSON wrapped in prose and markdown fences", () => {
    const result = parseVerificationReport(
      [
        "Verification complete.",
        "",
        "```json",
        JSON.stringify({
          command: "pnpm test",
          exitCode: 0,
          passed: true,
          stdout: "ok\n",
          stderr: "",
          summary: "Verification passed.",
        }, null, 2),
        "```",
      ].join("\n"),
      "pnpm test",
    );

    expect(result).toEqual({
      command: "pnpm test",
      exitCode: 0,
      passed: true,
      stdout: "ok\n",
      stderr: "",
      summary: "Verification passed.",
    });
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

  it("required failing checks fail the overall evaluation", async () => {
    const directory = await createTempProject();
    const evaluationPlan = {
      summary: "Verify the auth fix.",
      checks: [
        {
          id: "unit-tests",
          label: "Run unit tests",
          kind: "command",
          command: "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
          required: true,
        },
        {
          id: "smoke-check",
          label: "Run optional smoke check",
          kind: "command",
          command: "node -e \"console.log('smoke ok')\"",
          required: false,
        },
      ],
    } satisfies EvaluationPlan;
    const client = createMockAnthropicClient([
      ...createVerifierCommandResponses({
        toolUseId: "toolu_required_fail",
        command: "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
        exitCode: 2,
        passed: false,
        stdout: "",
        stderr: "bad\n",
        summary: "Unit tests failed with exit code 2.",
      }),
    ]);

    const result = await runVerifierSubagent(evaluationPlan, directory, {
      client,
      logger: {
        log() {},
      },
    });

    expect(result.passed).toBe(false);
    expect(result.command).toBe(
      "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
    );
    expect(result.firstHardFailure).toEqual({
      checkId: "unit-tests",
      label: "Run unit tests",
      command: "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
    });
    expect(result.checks).toEqual([
      {
        checkId: "unit-tests",
        label: "Run unit tests",
        kind: "command",
        command: "node -e \"process.stderr.write('bad\\n'); process.exit(2)\"",
        required: true,
        status: "failed",
        exitCode: 2,
        stdout: "",
        stderr: "bad\n",
        summary: "Unit tests failed with exit code 2.",
      },
      {
        checkId: "smoke-check",
        label: "Run optional smoke check",
        kind: "command",
        command: "node -e \"console.log('smoke ok')\"",
        required: false,
        status: "skipped",
        exitCode: null,
        stdout: "",
        stderr: "",
        summary: "Skipped after required check \"Run unit tests\" failed.",
      },
    ]);
    expect(result.summary).toMatch(/run unit tests/i);
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

  it("optional check failures do not mask required-check success", async () => {
    const directory = await createTempProject();
    const evaluationPlan = {
      summary: "Validate the auth fix.",
      checks: [
        {
          id: "unit-tests",
          label: "Run unit tests",
          kind: "command",
          command: "node -e \"console.log('unit ok')\"",
          required: true,
        },
        {
          id: "smoke-check",
          label: "Run optional smoke check",
          kind: "command",
          command: "node -e \"process.stderr.write('optional fail\\n'); process.exit(1)\"",
          required: false,
        },
      ],
    } satisfies EvaluationPlan;
    const client = createMockAnthropicClient([
      ...createVerifierCommandResponses({
        toolUseId: "toolu_required_pass",
        command: "node -e \"console.log('unit ok')\"",
        exitCode: 0,
        passed: true,
        stdout: "unit ok\n",
        stderr: "",
        summary: "Unit tests passed.",
      }),
      ...createVerifierCommandResponses({
        toolUseId: "toolu_optional_fail",
        command: "node -e \"process.stderr.write('optional fail\\n'); process.exit(1)\"",
        exitCode: 1,
        passed: false,
        stdout: "",
        stderr: "optional fail\n",
        summary: "Optional smoke check failed.",
      }),
    ]);

    const result = await runVerifierSubagent(evaluationPlan, directory, {
      client,
      logger: {
        log() {},
      },
    });

    expect(result.passed).toBe(true);
    expect(result.command).toBe("node -e \"console.log('unit ok')\"");
    expect(result.exitCode).toBe(0);
    expect(result.firstHardFailure).toBeNull();
    expect(result.checks?.map((check) => check.status)).toEqual([
      "passed",
      "failed",
    ]);
    expect(result.summary).toMatch(/optional checks failed/i);
    expect(result.summary).toMatch(/run optional smoke check/i);
  });
});
