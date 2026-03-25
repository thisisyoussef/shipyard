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

import type {
  ContextReport,
  DiscoveryReport,
  TargetProfile,
} from "../src/artifacts/types.js";
import {
  parseExecutionSpec,
  PLANNER_TOOL_NAMES,
  runPlannerSubagent,
} from "../src/agents/planner.js";
import {
  createLightweightExecutionSpec,
  shouldCoordinatorUsePlanner,
} from "../src/agents/coordinator.js";
import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import type { ContextEnvelope } from "../src/engine/state.js";
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
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-planner-"));
  createdDirectories.push(directory);
  return directory;
}

function createDiscoveryReport(): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json"],
    topLevelDirectories: ["src"],
    projectName: "shipyard",
    previewCapability: {
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      command: null,
      reason: "No preview configured.",
      autoRefresh: "none",
    },
  };
}

function createTargetProfile(
  discovery: DiscoveryReport,
): TargetProfile {
  return {
    name: "Shipyard",
    description: "Persistent coding agent.",
    purpose: "Local coding workflow.",
    stack: ["TypeScript", "React"],
    architecture: "Coordinator plus helper agents.",
    keyPatterns: ["typed artifacts", "raw-loop helpers"],
    complexity: "medium",
    suggestedAgentsRules: "Prefer read-only helpers before edits.",
    suggestedScripts: {
      test: "pnpm test",
    },
    taskSuggestions: ["Add planner contract"],
    enrichedAt: "2026-03-25T12:00:00.000Z",
    enrichmentModel: DEFAULT_ANTHROPIC_MODEL,
    discoverySnapshot: discovery,
  };
}

function createContextReport(): ContextReport {
  return {
    query: "Fix the auth flow",
    findings: [
      {
        filePath: "src/auth.ts",
        excerpt: "export async function authenticateUser() {}",
        relevanceNote: "This file owns auth entry.",
      },
    ],
  };
}

function createContextEnvelope(): ContextEnvelope {
  return {
    stable: {
      discovery: createDiscoveryReport(),
      projectRules: "",
      availableScripts: {
        test: "vitest run",
      },
    },
    task: {
      currentInstruction: "Fix src/app.ts",
      injectedContext: [],
      targetFilePaths: [],
    },
    runtime: {
      recentToolOutputs: [],
      recentErrors: [],
      currentGitDiff: null,
    },
    session: {
      rollingSummary: "",
      retryCountsByFile: {},
      blockedFiles: [],
      latestHandoff: null,
    },
  };
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

describe("planner subagent", () => {
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
    const discovery = createDiscoveryReport();
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
              instruction: "Fix the auth flow",
              goal: "Fix the auth flow",
              deliverables: ["Update the auth implementation."],
              acceptanceCriteria: ["The auth flow works."],
              verificationIntent: ["Run the test suite."],
              targetFilePaths: ["src/auth.ts"],
              risks: ["Regression risk in auth."],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    await expect(
      runPlannerSubagent(
        {
          instruction: "Fix the auth flow",
          discovery,
        },
        directory,
        {
          client,
          logger: {
            log() {},
          },
        },
      ),
    ).rejects.toThrow(/write_file|read-only|not available|unauthorized/i);

    expect(client.calls[0]?.tools).toEqual(
      getAnthropicTools([...PLANNER_TOOL_NAMES]),
    );
  });

  it("does not inherit prior history and includes discovery, target profile, and explorer findings in the prompt", async () => {
    const directory = await createTempProject();
    const discovery = createDiscoveryReport();
    const targetProfile = createTargetProfile(discovery);
    const contextReport = createContextReport();
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              instruction: "Fix the auth flow",
              goal: "Fix the auth flow",
              deliverables: ["Update the auth implementation."],
              acceptanceCriteria: ["The auth flow works."],
              verificationIntent: ["Run the auth tests."],
              targetFilePaths: ["src/auth.ts"],
              risks: ["Regression risk in auth."],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runPlannerSubagent(
      {
        instruction: "Fix the auth flow",
        discovery,
        targetProfile,
        contextReport,
      },
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      instruction: "Fix the auth flow",
      goal: "Fix the auth flow",
      deliverables: ["Update the auth implementation."],
      acceptanceCriteria: ["The auth flow works."],
      verificationIntent: ["Run the auth tests."],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Regression risk in auth."],
    });
    expect(client.calls[0]?.messages).toHaveLength(1);
    expect(client.calls[0]?.messages[0]).toEqual({
      role: "user",
      content: expect.stringContaining("Fix the auth flow"),
    });
    expect(client.calls[0]?.messages[0]?.content).toContain('"projectName": "shipyard"');
    expect(client.calls[0]?.messages[0]?.content).toContain('"name": "Shipyard"');
    expect(client.calls[0]?.messages[0]?.content).toContain('"filePath": "src/auth.ts"');
  });

  it("runs a broad planning request and returns a structured execution spec", async () => {
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
              instruction: "Fix the auth flow",
              goal: "Repair the authentication flow without widening scope.",
              deliverables: [
                "Update the auth entry point to match the requested behavior.",
              ],
              acceptanceCriteria: [
                "Authentication succeeds for valid tokens.",
                "The change stays within the auth surface.",
              ],
              verificationIntent: [
                "Run the auth-focused test coverage.",
                "Run the repo test suite if auth coverage is unclear.",
              ],
              targetFilePaths: ["src/auth.ts"],
              risks: ["Regression risk in authentication state handling."],
            }),
            citations: null,
          },
        ],
      }),
    ]);

    const result = await runPlannerSubagent(
      {
        instruction: "Fix the auth flow",
        discovery: createDiscoveryReport(),
      },
      directory,
      {
        client,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      instruction: "Fix the auth flow",
      goal: "Repair the authentication flow without widening scope.",
      deliverables: [
        "Update the auth entry point to match the requested behavior.",
      ],
      acceptanceCriteria: [
        "Authentication succeeds for valid tokens.",
        "The change stays within the auth surface.",
      ],
      verificationIntent: [
        "Run the auth-focused test coverage.",
        "Run the repo test suite if auth coverage is unclear.",
      ],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Regression risk in authentication state handling."],
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
      parseExecutionSpec("not json at all", "Fix the auth flow"),
    ).toThrow(/json|executionspec/i);
  });

  it("accepts valid report JSON wrapped in prose and markdown fences", () => {
    const result = parseExecutionSpec(
      [
        "Planning complete.",
        "",
        "```json",
        JSON.stringify({
          instruction: "Fix the auth flow",
          goal: "Fix the auth flow",
          deliverables: ["Update auth behavior."],
          acceptanceCriteria: ["The auth flow works."],
          verificationIntent: ["Run the auth tests."],
          targetFilePaths: ["src/auth.ts"],
          risks: ["Auth regression risk."],
        }, null, 2),
        "```",
      ].join("\n"),
      "Fix the auth flow",
    );

    expect(result).toEqual({
      instruction: "Fix the auth flow",
      goal: "Fix the auth flow",
      deliverables: ["Update auth behavior."],
      acceptanceCriteria: ["The auth flow works."],
      verificationIntent: ["Run the auth tests."],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Auth regression risk."],
    });
  });

  it("planner routing helper skips trivial exact-path instructions", () => {
    expect(
      shouldCoordinatorUsePlanner({
        instruction: "Update src/app.ts to rename the counter export.",
        contextEnvelope: createContextEnvelope(),
      }),
    ).toBe(false);
  });

  it("lightweight execution specs preserve deliverables, acceptance criteria, and verification intent", () => {
    const executionSpec = createLightweightExecutionSpec({
      instruction: "Update src/app.ts to rename the counter export.",
      contextEnvelope: createContextEnvelope(),
    });

    expect(executionSpec).toMatchObject({
      instruction: "Update src/app.ts to rename the counter export.",
      goal: "Update src/app.ts to rename the counter export.",
      targetFilePaths: ["src/app.ts"],
    });
    expect(executionSpec.deliverables).not.toHaveLength(0);
    expect(executionSpec.acceptanceCriteria).not.toHaveLength(0);
    expect(executionSpec.verificationIntent).not.toHaveLength(0);
  });
});
