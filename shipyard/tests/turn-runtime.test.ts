import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import { createSessionState } from "../src/engine/state.js";
import * as graphRuntime from "../src/engine/graph.js";
import { createCodePhase } from "../src/phases/code/index.js";
import "../src/tools/index.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
} from "../src/engine/turn.js";
import * as langsmith from "../src/tracing/langsmith.js";

const createdDirectories: string[] = [];

interface MockAnthropicClient {
  messages: {
    create: (
      request: MessageCreateParamsNonStreaming,
      options?: Record<string, unknown>,
    ) => Promise<Message>;
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

function createAbortAwareMockAnthropicClient(options?: {
  finalText?: string;
}): MockAnthropicClient {
  const calls: MessageCreateParamsNonStreaming[] = [];

  return {
    calls,
    messages: {
      async create(request, requestOptions) {
        calls.push(request);

        if (calls.length === 1) {
          const signal = requestOptions?.signal instanceof AbortSignal
            ? requestOptions.signal
            : undefined;

          return await new Promise<Message>((_resolve, reject) => {
            const rejectAsAborted = () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            };

            if (signal?.aborted) {
              rejectAsAborted();
              return;
            }

            signal?.addEventListener("abort", rejectAsAborted, { once: true });
          });
        }

        return createAssistantMessage({
          stopReason: "end_turn",
          content: [
            {
              type: "text",
              text: options?.finalText ?? "Follow-up turn complete.",
              citations: null,
            },
          ],
        });
      },
    },
  };
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

describe("instruction runtime handoff", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("sends the composed phase prompt plus serialized context through the graph runtime", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-live-");
    await writeFile(
      path.join(targetDirectory, "AGENTS.md"),
      "Always inspect the target file before editing.\n",
      "utf8",
    );
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "shipyard-turn-target" }, null, 2),
      "utf8",
    );
    const sessionState = createSessionState({
      sessionId: "turn-live-session",
      targetDirectory,
      discovery: {
        isGreenfield: false,
        language: "typescript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
        },
        hasReadme: true,
        hasAgentsMd: true,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "shipyard-turn-target",
      },
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Inspection complete.",
            citations: null,
          },
        ],
      }),
    ]);
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: ["Use the current scripts as the source of truth."],
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "inspect package.json",
    });

    expect(result.runtimeMode).toBe("graph");
    expect(result.status).toBe("success");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.system).toContain("Project Context");
    expect(client.calls[0]?.system).toContain("Project Rules");
    expect(client.calls[0]?.system).toContain("Injected Context");
    expect(client.calls[0]?.system).toContain("Session History");
    expect(client.calls[0]?.system).toContain("Recent Errors");
    expect(client.calls[0]?.system).toContain("Blocked Files");
    expect(client.calls[0]?.system).toContain(
      "Always inspect the target file before editing.",
    );
    expect(client.calls[0]?.system).toContain(
      "Use the current scripts as the source of truth.",
    );
    expect(client.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "inspect package.json",
      },
    ]);
    expect(sessionState.rollingSummary).toContain("inspect package.json");
    expect(sessionState.rollingSummary).toContain("completed via graph");
  });

  it("can invoke the fallback runtime without changing instruction handling", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-fallback-");
    const sessionState = createSessionState({
      sessionId: "turn-fallback-session",
      targetDirectory,
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
      },
    });
    const runActingLoop = vi.fn(async () => ({
      finalText: "Fallback runtime complete.",
      messageHistory: [],
      iterations: 1,
      didEdit: false,
      lastEditedFile: null,
    }));
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeMode: "fallback",
      runtimeDependencies: {
        runActingLoop,
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "create a README",
    });

    expect(result.runtimeMode).toBe("fallback");
    expect(result.status).toBe("success");
    expect(result.finalText).toBe("Fallback runtime complete.");
    expect(runActingLoop).toHaveBeenCalledTimes(1);
    expect(sessionState.rollingSummary).toContain("create a README");
    expect(sessionState.rollingSummary).toContain("completed via fallback");
  });

  it("surfaces explorer and planner tool activity through the outer reporter", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-subagent-tools-");
    await mkdir(path.join(targetDirectory, "src"), { recursive: true });
    await writeFile(
      path.join(targetDirectory, "src", "auth.ts"),
      "export async function authenticateUser(token: string) {\n  return token.length > 0;\n}\n",
      "utf8",
    );
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "shipyard-subagent-tools" }, null, 2),
      "utf8",
    );

    const sessionState = createSessionState({
      sessionId: "turn-subagent-tools-session",
      targetDirectory,
      discovery: {
        isGreenfield: false,
        language: "typescript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
        },
        hasReadme: true,
        hasAgentsMd: false,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "shipyard-subagent-tools",
      },
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_search_auth",
            name: "search_files",
            input: {
              pattern: "authenticateUser",
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
              query: "Identify the files most relevant to this request: Fix the auth flow",
              findings: [
                {
                  filePath: "src/auth.ts",
                  excerpt: "export async function authenticateUser(token: string) {",
                  relevanceNote: "This file owns the auth entry point.",
                },
              ],
            }),
            citations: null,
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_read_auth",
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
              goal: "Repair the auth flow without widening scope.",
              deliverables: ["Update the auth entry point."],
              acceptanceCriteria: ["Authentication succeeds for valid credentials."],
              verificationIntent: ["Run the auth-focused tests."],
              targetFilePaths: ["src/auth.ts"],
              risks: ["Regression risk in authentication state handling."],
            }),
            citations: null,
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Auth flow updated safely.",
            citations: null,
          },
        ],
      }),
    ]);
    const toolCalls: string[] = [];
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Fix the auth flow",
      reporter: {
        onToolCall(event) {
          toolCalls.push(event.toolName);
        },
      },
    });

    expect(result.status).toBe("success");
    expect(result.harnessRoute.usedExplorer).toBe(true);
    expect(result.harnessRoute.usedPlanner).toBe(true);
    expect(toolCalls).toEqual(
      expect.arrayContaining(["search_files", "read_file"]),
    );
  });

  it("treats operator cancellation as a first-class turn outcome and allows a follow-up turn", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-cancel-");
    const sessionState = createSessionState({
      sessionId: "turn-cancel-session",
      targetDirectory,
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
      },
    });
    const client = createAbortAwareMockAnthropicClient({
      finalText: "Follow-up turn complete.",
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });
    const doneEvents: Array<{
      status: "success" | "error" | "cancelled";
      summary: string;
    }> = [];
    const textEvents: string[] = [];
    const errorEvents: string[] = [];
    const cancellationController = new AbortController();

    const cancelledTurnPromise = executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "inspect the repo until I interrupt you",
      signal: cancellationController.signal,
      reporter: {
        onDone(event) {
          doneEvents.push(event);
        },
        onText(text) {
          textEvents.push(text);
        },
        onError(message) {
          errorEvents.push(message);
        },
      },
    });

    await vi.waitFor(() => {
      expect(client.calls).toHaveLength(1);
    });
    cancellationController.abort("Operator interrupted the active turn.");

    const cancelledTurn = await cancelledTurnPromise;

    expect(cancelledTurn.status).toBe("cancelled");
    expect(cancelledTurn.finalText).toContain("Turn 1 cancelled");
    expect(cancelledTurn.finalText).toContain(
      "Operator interrupted the active turn.",
    );
    expect(doneEvents[0]).toMatchObject({
      status: "cancelled",
      summary: "Operator interrupted the active turn.",
    });
    expect(errorEvents).toEqual([]);
    expect(textEvents[0]).toContain("Turn 1 cancelled");
    expect(sessionState.rollingSummary).toContain("cancelled via graph");

    const followUpTurn = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "summarize the repo now",
    });

    expect(followUpTurn.status).toBe("success");
    expect(followUpTurn.finalText).toBe("Follow-up turn complete.");
    expect(sessionState.turnCount).toBe(2);
    expect(sessionState.rollingSummary).toContain(
      "Turn 2: summarize the repo now ->",
    );
  });

  it("keeps same-session bootstrap follow-ups on the lightweight path using recent touched files", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-bootstrap-follow-up-");
    await writeFile(path.join(targetDirectory, "AGENTS.md"), "seed rules\n", "utf8");
    await writeFile(path.join(targetDirectory, "README.md"), "seed readme\n", "utf8");

    const sessionState = createSessionState({
      sessionId: "turn-bootstrap-follow-up-session",
      targetDirectory,
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: true,
        hasAgentsMd: true,
        topLevelFiles: ["AGENTS.md", "README.md"],
        topLevelDirectories: [],
        projectName: "shipyard-bootstrap-follow-up",
      },
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_bootstrap_workspace",
            name: "bootstrap_target",
            input: {
              description: "Scaffold a full-stack workspace for follow-up continuation tests.",
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
            text: "Workspace bootstrapped successfully.",
            citations: null,
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Continued the scaffold without extra planning.",
            citations: null,
          },
        ],
      }),
    ]);
    const runExplorerSubagent = vi.fn(async () => ({
      query: "Continue the scaffold with a dashboard view.",
      findings: [],
    }));
    const runPlannerSubagent = vi.fn(async () => ({
      instruction: "Continue the scaffold with a dashboard view.",
      goal: "Keep expanding the scaffold.",
      deliverables: ["Add a dashboard view."],
      acceptanceCriteria: ["The dashboard view exists."],
      verificationIntent: ["Run the relevant checks."],
      targetFilePaths: ["apps/web/src/App.tsx"],
      risks: [],
    }));
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
        runExplorerSubagent,
        runPlannerSubagent,
      },
    });

    const bootstrapTurn = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Bootstrap the current target with the shared workspace scaffold.",
    });

    expect(bootstrapTurn.status).toBe("success");
    expect(sessionState.discovery.isGreenfield).toBe(false);
    expect(sessionState.recentTouchedFiles).toContain("apps/web/src/App.tsx");

    const followUpTurn = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Continue the scaffold with a dashboard view.",
    });

    expect(followUpTurn.status).toBe("success");
    expect(followUpTurn.harnessRoute.selectedPath).toBe("lightweight");
    expect(followUpTurn.harnessRoute.usedExplorer).toBe(false);
    expect(followUpTurn.harnessRoute.usedPlanner).toBe(false);
    expect(followUpTurn.taskPlan.targetFilePaths).toContain("apps/web/src/App.tsx");
    expect(runExplorerSubagent).not.toHaveBeenCalled();
    expect(runPlannerSubagent).not.toHaveBeenCalled();
  });

  it("carries forward recent session history while keeping the rolling summary bounded", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-history-");
    const sessionState = createSessionState({
      sessionId: "turn-history-session",
      targetDirectory,
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
      },
    });
    const client = createMockAnthropicClient(
      Array.from({ length: 10 }, (_, index) =>
        createAssistantMessage({
          stopReason: "end_turn",
          content: [
            {
              type: "text",
              text: `Handled turn ${String(index + 1)}.`,
              citations: null,
            },
          ],
        })),
    );
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: ["Base context for every turn."],
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    for (let turn = 1; turn <= 10; turn += 1) {
      const result = await executeInstructionTurn({
        sessionState,
        runtimeState,
        instruction: `inspect file ${String(turn)}`,
        injectedContext: [`Context for turn ${String(turn)}`],
      });

      expect(result.status).toBe("success");
    }

    expect(sessionState.turnCount).toBe(10);
    expect(client.calls).toHaveLength(10);

    const finalSystemPrompt = client.calls[9]?.system ?? "";

    expect(finalSystemPrompt).toContain("Base context for every turn.");
    expect(finalSystemPrompt).toContain("Context for turn 10");
    expect(finalSystemPrompt).not.toContain("Context for turn 9");
    expect(finalSystemPrompt).toContain("Turn 2: inspect file 2 ->");
    expect(finalSystemPrompt).toContain("Turn 9: inspect file 9 ->");
    expect(finalSystemPrompt).not.toContain("Turn 1: inspect file 1 ->");

    const rollingSummaryLines = sessionState.rollingSummary.split("\n");

    expect(rollingSummaryLines).toHaveLength(8);
    expect(sessionState.rollingSummary).toContain("Turn 3: inspect file 3 ->");
    expect(sessionState.rollingSummary).toContain("Turn 10: inspect file 10 ->");
    expect(sessionState.rollingSummary).not.toContain("Turn 2: inspect file 2 ->");
  });

  it("captures a selected target path when the target manager phase uses select_target", async () => {
    const targetsDirectory = await createTempDirectory(
      "shipyard-turn-target-manager-",
    );
    const selectedTargetDirectory = path.join(targetsDirectory, "alpha-app");
    await mkdir(selectedTargetDirectory, { recursive: true });
    await writeFile(
      path.join(selectedTargetDirectory, "package.json"),
      JSON.stringify({ name: "alpha-app" }, null, 2),
      "utf8",
    );
    const sessionState = createSessionState({
      sessionId: "turn-target-manager-session",
      targetDirectory: targetsDirectory,
      targetsDirectory,
      activePhase: "target-manager",
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: "targets",
      },
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool-select-1",
            name: "select_target",
            input: {
              target_path: selectedTargetDirectory,
            },
            caller: {
              type: "assistant",
            },
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: "Selected alpha-app and prepared the coding session.",
            citations: null,
          },
        ],
      }),
    ]);
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      baseInjectedContext: [`Targets directory: ${targetsDirectory}`],
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          client,
          logger: {
            log() {},
          },
        }),
      },
    });

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Open the alpha-app target.",
    });

    expect(result.phaseName).toBe("target-manager");
    expect(result.status).toBe("success");
    expect(result.selectedTargetPath).toBe(selectedTargetDirectory);
    expect(runtimeState.pendingTargetSelectionPath).toBe(selectedTargetDirectory);
    expect(client.calls[0]?.system).toContain("target-manager mode");
    expect(client.calls[0]?.system).toContain("select_target");
  });

  it("fails clearly instead of using the offline preview path when ANTHROPIC_API_KEY is missing", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-missing-key-");
    const sessionState = createSessionState({
      sessionId: "turn-missing-key-session",
      targetDirectory,
      discovery: {
        isGreenfield: true,
        language: null,
        framework: null,
        packageManager: null,
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: [],
        topLevelDirectories: [],
        projectName: null,
      },
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
    });
    const previousApiKey = process.env.ANTHROPIC_API_KEY;

    delete process.env.ANTHROPIC_API_KEY;

    try {
      const result = await executeInstructionTurn({
        sessionState,
        runtimeState,
        instruction: "create a README",
      });

      expect(result.runtimeMode).toBe("graph");
      expect(result.status).toBe("error");
      expect(result.summary).toMatch(/Missing ANTHROPIC_API_KEY/i);
      expect(result.finalText).toContain("Turn 1 stopped: Missing ANTHROPIC_API_KEY");
      expect(sessionState.rollingSummary).toContain("create a README");
      expect(sessionState.rollingSummary).toContain("failed via graph");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousApiKey;
      }
    }
  });

  it("returns harness-route metadata and prepares the final LangSmith turn metadata", async () => {
    const targetDirectory = await createTempDirectory("shipyard-turn-route-");
    const sessionState = createSessionState({
      sessionId: "turn-route-session",
      targetDirectory,
      discovery: {
        isGreenfield: false,
        language: "typescript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
        },
        hasReadme: true,
        hasAgentsMd: false,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "turn-route-target",
      },
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
    });
    const outerTrace = {
      projectName: "shipyard",
      runId: "trace-turn-123",
      traceUrl: "https://smith.langchain.com/runs/trace-turn-123",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    };
    let capturedTraceMetadata: Record<string, unknown> | null = null;

    vi.spyOn(langsmith, "runWithLangSmithTrace").mockImplementation(
      async (traceOptions: any) => {
        const result = await traceOptions.fn(...traceOptions.args);
        capturedTraceMetadata = traceOptions.getResultMetadata?.(result) ?? null;

        return {
          result,
          trace: outerTrace,
        };
      },
    );

    vi.spyOn(graphRuntime, "runAgentRuntime").mockResolvedValue(
      graphRuntime.createAgentGraphState({
        sessionId: "turn-route-session",
        instruction: "Polish the main screen",
        contextEnvelope: {
          stable: {
            discovery: sessionState.discovery,
            projectRules: "",
            availableScripts: sessionState.discovery.scripts,
          },
          task: {
            currentInstruction: "Polish the main screen",
            injectedContext: [],
            targetFilePaths: ["src/app.tsx"],
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
            activeTask: null,
          },
        },
        previewState: sessionState.workbenchState.previewState,
        targetDirectory,
        phaseConfig: createCodePhase(),
        planningMode: "planner",
        executionSpec: {
          instruction: "Polish the main screen",
          goal: "Polish the main screen without widening scope.",
          deliverables: ["Refine src/app.tsx."],
          acceptanceCriteria: ["The main screen matches the request."],
          verificationIntent: ["Run the verification checks."],
          targetFilePaths: ["src/app.tsx"],
          risks: [],
        },
        taskPlan: {
          instruction: "Polish the main screen",
          goal: "Polish the main screen without widening scope.",
          targetFilePaths: ["src/app.tsx"],
          plannedSteps: [
            "Read the relevant files before editing.",
            "Refine the main screen.",
            "Verify the result after the edit.",
          ],
        },
        harnessRoute: {
          selectedPath: "planner-backed",
          usedExplorer: true,
          usedPlanner: true,
          usedVerifier: true,
          verificationMode: "command+browser",
          verificationCheckCount: 2,
          usedBrowserEvaluator: true,
          browserEvaluationStatus: "passed",
          handoffLoaded: false,
          handoffEmitted: false,
          handoffReason: null,
          firstHardFailure: null,
        },
        actingIterations: 5,
        lastEditedFile: "src/app.tsx",
        finalResult: "Polished the main screen.",
        status: "done",
        verificationReport: {
          command: "pnpm test",
          exitCode: 0,
          passed: true,
          stdout: "",
          stderr: "",
          summary: "Verification passed.",
          evaluationPlan: {
            summary: "Run the verification checks.",
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
          checks: [],
          firstHardFailure: null,
          browserEvaluationReport: null,
        },
      }),
    );

    const result = await executeInstructionTurn({
      sessionState,
      runtimeState,
      instruction: "Polish the main screen",
    });

    expect(result.handoff.emitted?.handoff.resetReason.kind).toBe("iteration-threshold");
    expect(result.harnessRoute).toMatchObject({
      selectedPath: "planner-backed",
      verificationMode: "command+browser",
      usedBrowserEvaluator: true,
      handoffEmitted: true,
      handoffReason: "iteration-threshold",
    });
    expect(result.langSmithTrace).toEqual(outerTrace);
    expect(capturedTraceMetadata).toEqual(
      expect.objectContaining({
        selectedPath: "planner-backed",
        verificationMode: "command+browser",
        usedBrowserEvaluator: true,
        handoffEmitted: true,
        handoffReason: "iteration-threshold",
      }),
    );
  });
});
