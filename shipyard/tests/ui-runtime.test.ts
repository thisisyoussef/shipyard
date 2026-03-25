import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { discoverTarget } from "../src/context/discovery.js";
import { DEFAULT_ANTHROPIC_MODEL } from "../src/engine/anthropic.js";
import { createSessionState, saveSessionState } from "../src/engine/state.js";
import { formatUiStartupLines, parseArgs } from "../src/bin/shipyard.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import type { BackendToFrontendMessage } from "../src/ui/contracts.js";
import { startUiRuntimeServer } from "../src/ui/server.js";
import { queueInstructionTurn } from "../ui/src/view-models.js";
import { scaffoldPreviewableTarget } from "./support/preview-target.js";

const createdDirectories: string[] = [];
const socketMessageBuffers = new WeakMap<WebSocket, BackendToFrontendMessage[]>();
const trackedSockets = new WeakSet<WebSocket>();
const workspaceDirectory = path.resolve(process.cwd(), "..");

interface MockAnthropicClient {
  messages: {
    create: (request: MessageCreateParamsNonStreaming) => Promise<Message>;
  };
}

interface RawCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function runRawCommand(
  cwd: string,
  command: string,
): Promise<RawCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

async function expectRawCommandSuccess(
  cwd: string,
  command: string,
): Promise<void> {
  const result = await runRawCommand(cwd, command);

  expect(result.exitCode).toBe(0);
}

async function initializeGitRepository(cwd: string): Promise<void> {
  await expectRawCommandSuccess(cwd, "git init");
  await expectRawCommandSuccess(cwd, "git config user.email shipyard@example.com");
  await expectRawCommandSuccess(cwd, "git config user.name 'Shipyard Tests'");
}

function createTargetManagerDiscovery(targetsDirectory: string) {
  return {
    isGreenfield: true,
    language: null,
    framework: null,
    packageManager: null,
    scripts: {},
    hasReadme: false,
    hasAgentsMd: false,
    topLevelFiles: [],
    topLevelDirectories: [],
    projectName: path.basename(targetsDirectory) || "targets",
    previewCapability: createUnavailablePreviewCapability(
      "Target manager mode does not start a preview until a target is selected.",
    ),
  };
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

function createMockAnthropicClient(responses: Message[]): MockAnthropicClient {
  let callIndex = 0;

  return {
    messages: {
      async create() {
        const response = responses[callIndex];
        callIndex += 1;

        if (!response) {
          throw new Error("No mock Claude response configured.");
        }

        return response;
      },
    },
  };
}

function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: BackendToFrontendMessage) => boolean,
  timeoutMs = 5_000,
): Promise<BackendToFrontendMessage> {
  const messages = getSocketMessages(socket);
  const existingMatch = messages.find(predicate);

  if (existingMatch) {
    return Promise.resolve(existingMatch);
  }

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the expected WebSocket message."));
    }, timeoutMs);
    const pollHandle = setInterval(() => {
      const nextMatch = messages.find(predicate);

      if (!nextMatch) {
        return;
      }

      clearTimeout(timeoutHandle);
      clearInterval(pollHandle);
      resolve(nextMatch);
    }, 10);
  });
}

function collectMessagesUntil(
  socket: WebSocket,
  predicate: (messages: BackendToFrontendMessage[]) => boolean,
  timeoutMs = 5_000,
): Promise<BackendToFrontendMessage[]> {
  const messages = getSocketMessages(socket);
  const startIndex = messages.length;

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the expected WebSocket message sequence."));
    }, timeoutMs);
    const pollHandle = setInterval(() => {
      const pendingMessages = messages.slice(startIndex);

      if (!predicate(pendingMessages)) {
        return;
      }

      clearTimeout(timeoutHandle);
      clearInterval(pollHandle);
      resolve(pendingMessages);
    }, 10);
  });
}

function getSocketMessages(socket: WebSocket): BackendToFrontendMessage[] {
  const existing = socketMessageBuffers.get(socket);

  if (existing) {
    return existing;
  }

  const messages: BackendToFrontendMessage[] = [];
  socketMessageBuffers.set(socket, messages);

  if (!trackedSockets.has(socket)) {
    trackedSockets.add(socket);
    socket.on("message", (rawMessage: WebSocket.RawData) => {
      messages.push(
        JSON.parse(rawMessage.toString()) as BackendToFrontendMessage,
      );
    });
  }

  return messages;
}

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the websocket connection."));
    }, 5_000);

    socket.once("open", () => {
      clearTimeout(timeoutHandle);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Canonical UI event-stream contract (SV-S02)
//
// Source of truth: src/engine/turn.ts executeInstructionTurn + src/ui/events.ts
//
// Success turn:
//   REQUIRED: session:state(agent-busy), agent:thinking, agent:text, agent:done(success), session:state(ready)
//   OPTIONAL (interleaved): agent:tool_call, agent:tool_result, agent:edit
//   ORDERING: agent:text BEFORE agent:done; every tool_result AFTER its matching tool_call
//
// Failed turn:
//   REQUIRED: session:state(agent-busy), agent:thinking, agent:text, agent:error, agent:done(error), session:state(error)
//   OPTIONAL (interleaved): agent:tool_call, agent:tool_result, agent:edit
//   ORDERING: agent:text BEFORE agent:error; agent:error BEFORE agent:done
// ---------------------------------------------------------------------------

/**
 * Assert that `required` events appear in the sequence in order, allowing
 * other events between them. This is the contract-style alternative to a
 * brittle `toEqual` on the full array.
 */
function assertEventOrdering(
  actual: BackendToFrontendMessage[],
  required: BackendToFrontendMessage["type"][],
): void {
  const types = actual.map((m) => m.type);
  let cursor = 0;

  for (const expected of required) {
    const index = types.indexOf(expected, cursor);
    expect(index, `Expected "${expected}" after position ${cursor} in [${types.join(", ")}]`).toBeGreaterThanOrEqual(cursor);
    cursor = index + 1;
  }
}

/**
 * Assert that every event type in `required` appears at least once.
 */
function assertRequiredEvents(
  actual: BackendToFrontendMessage[],
  required: BackendToFrontendMessage["type"][],
): void {
  const types = new Set(actual.map((m) => m.type));

  for (const r of required) {
    expect(types, `Expected event "${r}" to be present`).toContain(r);
  }
}

describe("ui runtime contract", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("parses --ui as the browser runtime selector", () => {
    const options = parseArgs(["--target", "./demo", "--ui"]);

    expect(options).toEqual({
      targetPath: "./demo",
      targetsDir: "./test-targets",
      sessionId: undefined,
      ui: true,
    });
  });

  it("UI startup surfaces workspace identity, URLs, and collision recovery context", () => {
    const lines = formatUiStartupLines({
      url: "http://127.0.0.1:3211",
      socketUrl: "ws://127.0.0.1:3211/ws",
      sessionId: "ui-session",
      connectionState: "ready",
      workspaceDirectory: "/tmp/shipyard-workspace",
      targetDirectory: "/tmp/shipyard-workspace/test-targets/tic-tac-toe",
      requestedPort: 3210,
      actualPort: 3211,
      existingRuntime: {
        url: "http://127.0.0.1:3210",
        sessionId: "other-session",
        targetLabel: "tic-tac-toe",
        targetDirectory: "/tmp/other-worktree/test-targets/tic-tac-toe",
        workspaceDirectory: "/tmp/other-worktree",
      },
    });

    expect(lines.join("\n")).toContain("/tmp/shipyard-workspace");
    expect(lines.join("\n")).toContain("/tmp/shipyard-workspace/test-targets/tic-tac-toe");
    expect(lines.join("\n")).toContain("Requested port 3210 was already serving Shipyard session other-session");
    expect(lines.join("\n")).toContain("/tmp/other-worktree/test-targets/tic-tac-toe");
    expect(lines.join("\n")).toContain("http://127.0.0.1:3211");
    expect(lines.join("\n")).toContain("ws://127.0.0.1:3211/ws");
    expect(lines.join("\n")).toContain("ui-session");
    expect(lines.join("\n")).toContain("ready");
  });

  it("moves to the next open port when another Shipyard UI runtime already owns the requested port", async () => {
    const firstTargetDirectory = await createTempDirectory("shipyard-ui-port-primary-");
    const secondTargetDirectory = await createTempDirectory("shipyard-ui-port-secondary-");
    const firstDiscovery = await discoverTarget(firstTargetDirectory);
    const secondDiscovery = await discoverTarget(secondTargetDirectory);
    const firstRuntime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-primary-session",
        targetDirectory: firstTargetDirectory,
        discovery: firstDiscovery,
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
    });

    let secondRuntime: Awaited<ReturnType<typeof startUiRuntimeServer>> | null = null;

    try {
      secondRuntime = await startUiRuntimeServer({
        sessionState: createSessionState({
          sessionId: "ui-secondary-session",
          targetDirectory: secondTargetDirectory,
          discovery: secondDiscovery,
        }),
        host: "127.0.0.1",
        port: firstRuntime.port,
        projectRules: "",
        projectRulesLoaded: false,
      });

      expect(secondRuntime.port).not.toBe(firstRuntime.port);
      expect(secondRuntime.portResolution).toMatchObject({
        requestedPort: firstRuntime.port,
        usedFallbackPort: true,
        existingRuntime: {
          sessionId: "ui-primary-session",
          targetDirectory: firstTargetDirectory,
          workspaceDirectory,
        },
      });

      const healthResponse = await fetch(`${secondRuntime.url}/api/health`);
      expect(healthResponse.ok).toBe(true);
      await expect(healthResponse.json()).resolves.toMatchObject({
        workspaceDirectory,
        targetDirectory: secondTargetDirectory,
      });
    } finally {
      if (secondRuntime) {
        await secondRuntime.close();
      }

      await firstRuntime.close();
    }
  });

  it("publishes target manager state on connect and switches targets from the browser", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-ui-targets-");
    const alphaTargetDirectory = path.join(targetsDirectory, "alpha-app");
    const betaTargetDirectory = path.join(targetsDirectory, "beta-app");
    await mkdir(alphaTargetDirectory, { recursive: true });
    await mkdir(betaTargetDirectory, { recursive: true });
    await writeFile(
      path.join(alphaTargetDirectory, "package.json"),
      JSON.stringify({ name: "alpha-app" }, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(betaTargetDirectory, "package.json"),
      JSON.stringify({ name: "beta-app" }, null, 2),
      "utf8",
    );

    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-target-manager-session",
        targetDirectory: targetsDirectory,
        targetsDirectory,
        activePhase: "target-manager",
        discovery: createTargetManagerDiscovery(targetsDirectory),
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialSessionStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );
      const initialTargetStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "target:state",
      );

      try {
        await waitForSocketOpen(socket);

        const initialSessionState = await initialSessionStatePromise;
        const initialTargetState = await initialTargetStatePromise;

        expect(initialSessionState).toMatchObject({
          type: "session:state",
          activePhase: "target-manager",
          targetDirectory: targetsDirectory,
        });
        expect(initialTargetState).toMatchObject({
          type: "target:state",
          state: {
            currentTarget: {
              name: "No target selected",
            },
            availableTargets: [
              {
                name: "alpha-app",
              },
              {
                name: "beta-app",
              },
            ],
          },
        });

        const switchSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.activePhase === "code" &&
              message.targetDirectory === betaTargetDirectory
            ),
        );
        socket.send(
          JSON.stringify({
            type: "target:switch_request",
            targetPath: betaTargetDirectory,
          }),
        );

        const switchSequence = await switchSequencePromise;
        const switchComplete = switchSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "target:switch_complete" }
          > => message.type === "target:switch_complete",
        );

        expect(switchComplete).toMatchObject({
          type: "target:switch_complete",
          success: true,
          state: {
            currentTarget: {
              path: betaTargetDirectory,
              name: "beta-app",
            },
          },
        });
        expect(
          switchSequence.some((message) =>
            message.type === "session:state" &&
            message.activePhase === "code" &&
            message.targetDirectory === betaTargetDirectory
          ),
        ).toBe(true);
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("creates a new target from the browser and switches the session into code mode", async () => {
    const targetsDirectory = await createTempDirectory(
      "shipyard-ui-create-target-",
    );
    const createdTargetDirectory = path.join(targetsDirectory, "gamma-app");
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-target-create-session",
        targetDirectory: targetsDirectory,
        targetsDirectory,
        activePhase: "target-manager",
        discovery: createTargetManagerDiscovery(targetsDirectory),
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialTargetStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "target:state",
      );

      try {
        await waitForSocketOpen(socket);
        await initialTargetStatePromise;

        const createSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.activePhase === "code" &&
              message.targetDirectory === createdTargetDirectory
            ),
        );
        socket.send(
          JSON.stringify({
            type: "target:create_request",
            name: "gamma app",
            description: "Created from the browser workbench.",
            scaffoldType: "react-ts",
          }),
        );

        const createSequence = await createSequencePromise;
        const switchComplete = createSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "target:switch_complete" }
          > => message.type === "target:switch_complete",
        );

        expect(switchComplete).toMatchObject({
          type: "target:switch_complete",
          success: true,
          state: {
            currentTarget: {
              path: createdTargetDirectory,
              name: "gamma-app",
            },
          },
        });
        await expect(
          readFile(path.join(createdTargetDirectory, "README.md"), "utf8"),
        ).resolves.toContain("Created from the browser workbench.");
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("publishes previous runs for the current target and resumes a selected session", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-session-history-");
    const discovery = await discoverTarget(targetDirectory);
    const previousSession = createSessionState({
      sessionId: "ui-session-previous",
      targetDirectory,
      discovery,
    });
    previousSession.turnCount = 3;
    previousSession.lastActiveAt = "2026-03-24T18:00:00.000Z";
    previousSession.workbenchState = queueInstructionTurn(
      previousSession.workbenchState,
      "inspect the preview config",
      ["Use the current preview command as source of truth."],
    );
    previousSession.workbenchState.turns[0] = {
      ...previousSession.workbenchState.turns[0]!,
      status: "success",
      summary: "Confirmed the preview command.",
    };
    await saveSessionState(previousSession);

    const currentSession = createSessionState({
      sessionId: "ui-session-current",
      targetDirectory,
      discovery,
    });
    currentSession.turnCount = 1;
    currentSession.lastActiveAt = "2026-03-24T18:05:00.000Z";
    currentSession.workbenchState = queueInstructionTurn(
      currentSession.workbenchState,
      "open the session list",
      [],
    );
    currentSession.workbenchState.turns[0] = {
      ...currentSession.workbenchState.turns[0]!,
      status: "success",
      summary: "Current run is visible.",
    };

    const runtime = await startUiRuntimeServer({
      sessionState: currentSession,
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );

      try {
        await waitForSocketOpen(socket);
        const initialState = await initialStatePromise;

        expect(initialState).toMatchObject({
          type: "session:state",
          sessionId: "ui-session-current",
          sessionHistory: [
            expect.objectContaining({
              sessionId: "ui-session-current",
              isCurrent: true,
            }),
            expect.objectContaining({
              sessionId: "ui-session-previous",
              latestInstruction: "inspect the preview config",
              latestSummary: "Confirmed the preview command.",
              isCurrent: false,
            }),
          ],
        });

        const resumeSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.sessionId === "ui-session-previous"
            ),
        );
        socket.send(
          JSON.stringify({
            type: "session:resume_request",
            sessionId: "ui-session-previous",
          }),
        );

        const resumeSequence = await resumeSequencePromise;
        const resumedState = resumeSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "session:state" }
          > =>
            message.type === "session:state" &&
            message.sessionId === "ui-session-previous",
        );

        expect(resumedState).toMatchObject({
          type: "session:state",
          sessionId: "ui-session-previous",
          turnCount: 3,
          workbenchState: {
            turns: [
              expect.objectContaining({
                instruction: "inspect the preview config",
                summary: "Confirmed the preview command.",
              }),
            ],
          },
        });
        expect(resumedState?.sessionHistory).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sessionId: "ui-session-previous",
              isCurrent: true,
            }),
            expect.objectContaining({
              sessionId: "ui-session-current",
              isCurrent: false,
            }),
          ]),
        );
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("streams browser enrichment progress and publishes the updated target profile", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-enrich-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "browser-enrich-target" }, null, 2),
      "utf8",
    );
    const discovery = await discoverTarget(targetDirectory);
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-enrich-session",
        targetDirectory,
        targetsDirectory: path.dirname(targetDirectory),
        activePhase: "code",
        discovery,
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      targetEnrichmentInvoker: async () => ({
        text: JSON.stringify({
          name: "browser-enrich-target",
          description: "AI summary for browser enrichment.",
          purpose: "Verify browser enrichment flows.",
          stack: ["TypeScript"],
          architecture: "Single package workspace",
          keyPatterns: ["target-manager state"],
          complexity: "small",
          suggestedAgentsRules: "# AGENTS.md\nKeep changes focused.",
          suggestedScripts: {
            test: "vitest run",
          },
          taskSuggestions: ["Add a README"],
        }),
        model: "test-model",
      }),
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialTargetStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "target:state",
      );

      try {
        await waitForSocketOpen(socket);
        await initialTargetStatePromise;

        const enrichmentSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "target:state" &&
              message.state.currentTarget.hasProfile
            ),
        );
        socket.send(
          JSON.stringify({
            type: "target:enrich_request",
          }),
        );

        const enrichmentSequence = await enrichmentSequencePromise;
        const progressStatuses = enrichmentSequence.flatMap((message) =>
          message.type === "target:enrichment_progress"
            ? [message.status]
            : [],
        );
        const updatedTargetState = enrichmentSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "target:state" }
          > =>
            message.type === "target:state" &&
            message.state.currentTarget.hasProfile,
        );

        expect(progressStatuses).toContain("started");
        expect(progressStatuses).toContain("in-progress");
        expect(progressStatuses).toContain("complete");
        expect(updatedTargetState).toMatchObject({
          type: "target:state",
          state: {
            currentTarget: {
              path: targetDirectory,
              hasProfile: true,
              description: "AI summary for browser enrichment.",
            },
          },
        });
        await expect(
          readFile(path.join(targetDirectory, ".shipyard", "profile.json"), "utf8"),
        ).resolves.toContain("AI summary for browser enrichment.");
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("streams ordered tool activity, surfaces file edits, and reconnects with the current session snapshot", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-runtime-");
    const packageJsonContents = `${JSON.stringify(
      {
        name: "ui-bridge-target",
        version: "1.0.0",
      },
      null,
      2,
    )}\n`;

    await writeFile(
      path.join(targetDirectory, "package.json"),
      packageJsonContents,
      "utf8",
    );
    await initializeGitRepository(targetDirectory);
    await expectRawCommandSuccess(targetDirectory, "git add package.json");
    await expectRawCommandSuccess(
      targetDirectory,
      "git commit -m \"Initial UI smoke target\"",
    );
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-session",
      targetDirectory,
      discovery,
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_read_file",
            name: "read_file",
            input: {
              path: "package.json",
            },
            caller: {
              type: "direct",
            },
          },
          {
            type: "tool_use",
            id: "toolu_edit_block",
            name: "edit_block",
            input: {
              path: "package.json",
              old_string: '  "name": "ui-bridge-target",',
              new_string: '  "name": "ui-bridge-target-smoke",',
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
            text: "Inspection complete.",
            citations: null,
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_run_command",
            name: "run_command",
            input: {
              command: "git diff --stat",
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
              command: "git diff --stat",
              exitCode: 0,
              passed: true,
              stdout: " package.json | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
              stderr: "",
              summary: "Verification passed.",
            }),
            citations: null,
          },
        ],
      }),
    ]);
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "Always inspect the file before editing it.",
      projectRulesLoaded: true,
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            client,
          };
        },
      },
    });
    const tracePath = path.join(
      targetDirectory,
      ".shipyard",
      "traces",
      "ui-session.jsonl",
    );

    try {
      const initialTrace = await readFile(tracePath, "utf8");
      expect(initialTrace).toContain('"event":"session.start"');
      expect(initialTrace).toContain('"sessionId":"ui-session"');

      const healthResponse = await fetch(`${runtime.url}/api/health`);
      expect(healthResponse.ok).toBe(true);

      const healthJson = await healthResponse.json();
      expect(healthJson).toMatchObject({
        ok: true,
        runtimeMode: "ui",
        sessionId: "ui-session",
        workspaceDirectory,
        targetDirectory,
      });

      const socket = new WebSocket(runtime.socketUrl);
      const initialStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );

      try {
        await waitForSocketOpen(socket);

        const initialState = await initialStatePromise;
        expect(initialState).toMatchObject({
          type: "session:state",
          runtimeMode: "ui",
          sessionId: "ui-session",
          targetDirectory,
          workspaceDirectory,
          projectRulesLoaded: true,
        });

        const turnMessagesPromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.connectionState === "ready" &&
              message.turnCount === 1
            ),
        );
        socket.send(
          JSON.stringify({
            type: "instruction",
            text: "rename the package in package.json",
            injectedContext: ["Use the current scripts as the source of truth."],
          }),
        );

        const turnMessages = await turnMessagesPromise;

        // Contract-style: assert required events are present and in order,
        // allowing optional tool/edit events between them.
        assertRequiredEvents(turnMessages, [
          "session:state",
          "agent:thinking",
          "agent:tool_call",
          "agent:tool_result",
          "agent:edit",
          "agent:text",
          "agent:done",
        ]);
        assertEventOrdering(turnMessages, [
          "session:state",
          "agent:thinking",
          "agent:edit",
          "agent:text",
          "agent:done",
          "session:state",
        ]);

        // Tool calls must appear before their results (paired by callId below).
        const toolCalls = turnMessages.filter((message) => message.type === "agent:tool_call");
        const toolResults = turnMessages.filter((message) => message.type === "agent:tool_result");
        const editPreview = turnMessages.find((message) => message.type === "agent:edit");
        expect(toolCalls).toHaveLength(2);
        expect(toolResults).toHaveLength(2);
        expect(toolCalls[0]).toMatchObject({
          type: "agent:tool_call",
          toolName: "read_file",
          summary: "path: package.json",
        });
        expect(toolCalls[1]).toMatchObject({
          type: "agent:tool_call",
          toolName: "edit_block",
          summary: "path: package.json",
        });
        expect(toolResults[0]).toMatchObject({
          type: "agent:tool_result",
          toolName: "read_file",
          success: true,
        });
        expect(toolResults[1]).toMatchObject({
          type: "agent:tool_result",
          toolName: "edit_block",
          success: true,
        });
        expect(toolResults[0]?.callId).toBe(toolCalls[0]?.callId);
        expect(toolResults[1]?.callId).toBe(toolCalls[1]?.callId);
        expect(editPreview).toMatchObject({
          type: "agent:edit",
          path: "package.json",
          summary: "Current workspace diff preview for package.json",
          diff: expect.stringContaining("ui-bridge-target-smoke"),
        });

        const updatedTrace = await readFile(tracePath, "utf8");
        expect(updatedTrace).toContain('"event":"instruction.plan"');
        expect(updatedTrace).toContain('"status":"success"');
        expect(updatedTrace).toContain(
          '"instruction":"rename the package in package.json"',
        );
        await expect(
          readFile(path.join(targetDirectory, "package.json"), "utf8"),
        ).resolves.toContain('"name": "ui-bridge-target-smoke"');

        const persistedSession = JSON.parse(
          await readFile(
            path.join(targetDirectory, ".shipyard", "sessions", "ui-session.json"),
            "utf8",
          ),
        ) as {
          turnCount: number;
          workbenchState: {
            turns: Array<{
              instruction: string;
            }>;
          };
        };
        expect(persistedSession.turnCount).toBe(1);
        expect(persistedSession.workbenchState.turns[0]?.instruction).toBe(
          "rename the package in package.json",
        );

        const refreshedStatusPromise = waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.turnCount === 1 &&
            message.connectionState === "ready",
        );
        socket.send(JSON.stringify({ type: "status" }));
        const refreshedStatus = await refreshedStatusPromise;
        expect(refreshedStatus).toMatchObject({
          type: "session:state",
          targetDirectory,
          discovery: {
            projectName: "ui-bridge-target",
          },
        });

        socket.close();

        const reconnectedSocket = new WebSocket(runtime.socketUrl);

        try {
          const reconnectStatePromise = waitForSocketMessage(
            reconnectedSocket,
            (message) => message.type === "session:state",
          );
          await waitForSocketOpen(reconnectedSocket);
        const reconnectState = await reconnectStatePromise;
        expect(reconnectState).toMatchObject({
          type: "session:state",
          turnCount: 1,
          targetDirectory,
            discovery: {
            projectName: "ui-bridge-target",
          },
          workbenchState: {
            turns: [
              {
                instruction: "rename the package in package.json",
                contextPreview: ["Use the current scripts as the source of truth."],
              },
            ],
            contextHistory: [
              {
                text: "Use the current scripts as the source of truth.",
              },
            ],
          },
        });
      } finally {
        reconnectedSocket.close();
        }
      } finally {
        if (socket.readyState === socket.OPEN) {
          socket.close();
        }
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("auto-starts previewable targets and streams refresh state after an edit", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-preview-");
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "ui-preview-target",
    });
    await initializeGitRepository(targetDirectory);
    await expectRawCommandSuccess(targetDirectory, "git add package.json");
    await expectRawCommandSuccess(
      targetDirectory,
      "git commit -m \"Initial preview target\"",
    );

    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-preview-session",
      targetDirectory,
      discovery,
    });
    const client = createMockAnthropicClient([
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_read_file_preview",
            name: "read_file",
            input: {
              path: "package.json",
            },
            caller: {
              type: "direct",
            },
          },
          {
            type: "tool_use",
            id: "toolu_edit_block_preview",
            name: "edit_block",
            input: {
              path: "package.json",
              old_string: '  "name": "ui-preview-target",',
              new_string: '  "name": "ui-preview-target-edited",',
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
            text: "Preview-ready edit complete.",
            citations: null,
          },
        ],
      }),
      createAssistantMessage({
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_run_command_preview",
            name: "run_command",
            input: {
              command: "git diff --stat",
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
              command: "git diff --stat",
              exitCode: 0,
              passed: true,
              stdout: " package.json | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
              stderr: "",
              summary: "Verification passed.",
            }),
            citations: null,
          },
        ],
      }),
    ]);
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "Always inspect the file before editing it.",
      projectRulesLoaded: true,
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            client,
          };
        },
      },
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );
      const previewReadyPromise = waitForSocketMessage(
        socket,
        (message) =>
          message.type === "preview:state" &&
          message.preview.status === "running" &&
          message.preview.url !== null,
      );

      try {
        await waitForSocketOpen(socket);

        const initialState = await initialStatePromise;
        expect(initialState).toMatchObject({
          type: "session:state",
          sessionId: "ui-preview-session",
          discovery: {
            previewCapability: {
              status: "available",
              kind: "dev-server",
            },
          },
        });

        const previewReady = await previewReadyPromise;
        expect(previewReady.type).toBe("preview:state");

        if (previewReady.type !== "preview:state") {
          throw new Error("Expected a preview:state message.");
        }

        expect(previewReady.preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
        expect(previewReady.preview.logTail.join("\n")).toContain("VITE v5.0.8 ready");

        const previewResponse = await fetch(previewReady.preview.url ?? "");
        expect(previewResponse.ok).toBe(true);
        await expect(previewResponse.text()).resolves.toContain("Preview Ready");

        const turnMessagesPromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.turnCount === 1 &&
              message.connectionState === "ready"
            ),
          10_000,
        );
        socket.send(
          JSON.stringify({
            type: "instruction",
            text: "rename the package in package.json",
          }),
        );

        const turnMessages = await turnMessagesPromise;

        assertRequiredEvents(turnMessages, [
          "session:state",
          "agent:thinking",
          "agent:tool_call",
          "agent:tool_result",
          "agent:edit",
          "preview:state",
          "agent:text",
          "agent:done",
        ]);
        assertEventOrdering(turnMessages, [
          "session:state",
          "agent:thinking",
          "agent:edit",
          "preview:state",
          "agent:text",
          "agent:done",
          "session:state",
        ]);

        const refreshMessages = turnMessages.filter(
          (
            message,
          ): message is Extract<BackendToFrontendMessage, { type: "preview:state" }> =>
            message.type === "preview:state",
        );

        expect(
          refreshMessages.some((message) => message.preview.status === "refreshing"),
        ).toBe(true);
        expect(
          refreshMessages.some((message) =>
            message.preview.status === "running" &&
            message.preview.lastRestartReason?.includes("Refresh requested") === true
          ),
        ).toBe(true);
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("emits agent:error for a failed instruction and keeps the socket alive", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-runtime-error-");
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-error-session",
      targetDirectory,
      discovery,
    });
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
    });
    const tracePath = path.join(
      targetDirectory,
      ".shipyard",
      "traces",
      "ui-error-session.jsonl",
    );

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );

      try {
        await waitForSocketOpen(socket);
        await initialStatePromise;

        const errorSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.connectionState === "error"
            ),
        );
        socket.send(
          JSON.stringify({
            type: "instruction",
            text: "inspect missing.ts",
          }),
        );

        const errorSequence = await errorSequencePromise;

        // Contract-style: assert required events and ordering.
        // The runtime may legitimately insert tool events between these.
        assertRequiredEvents(errorSequence, [
          "session:state",
          "agent:thinking",
          "agent:text",
          "agent:error",
          "agent:done",
        ]);
        assertEventOrdering(errorSequence, [
          "session:state",
          "agent:thinking",
          "agent:text",
          "agent:error",
          "agent:done",
          "session:state",
        ]);

        // Verify content payloads by filtering, not by index.
        const agentText = errorSequence.find((m) => m.type === "agent:text");
        const agentError = errorSequence.find((m) => m.type === "agent:error");
        const agentDone = errorSequence.find((m) => m.type === "agent:done");

        expect(agentText).toMatchObject({
          type: "agent:text",
          text: expect.stringContaining("Turn 1 stopped: Missing ANTHROPIC_API_KEY"),
        });
        expect(agentError).toMatchObject({
          type: "agent:error",
          message: expect.stringContaining("Missing ANTHROPIC_API_KEY"),
        });
        expect(agentDone).toMatchObject({
          type: "agent:done",
          status: "error",
          summary: expect.stringContaining("Missing ANTHROPIC_API_KEY"),
        });

        const errorTrace = await readFile(tracePath, "utf8");
        expect(errorTrace).toContain('"event":"instruction.plan"');
        expect(errorTrace).toContain('"status":"error"');
        expect(errorTrace).toContain('"instruction":"inspect missing.ts"');

        const statusAfterErrorPromise = waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.turnCount === 1 &&
            message.connectionState === "ready",
        );
        socket.send(JSON.stringify({ type: "status" }));
        const statusAfterError = await statusAfterErrorPromise;
        expect(statusAfterError).toMatchObject({
          type: "session:state",
          sessionId: "ui-error-session",
        });
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  // Repeated-run stability guard (AC-4): run the error-stream contract
  // assertion 3 times sequentially in a single test to surface ordering flakes.
  it("error-stream contract is stable across 3 repeated runs", async () => {
    for (let run = 0; run < 3; run++) {
      const targetDirectory = await createTempDirectory("shipyard-ui-stability-");
      const discovery = await discoverTarget(targetDirectory);
      const sessionState = createSessionState({
        sessionId: `stability-${String(run)}-${Date.now()}`,
        targetDirectory,
        discovery,
      });
      const runtime = await startUiRuntimeServer({
        sessionState,
        host: "127.0.0.1",
        port: 0,
        projectRules: "",
        projectRulesLoaded: false,
      });

      try {
        const socket = new WebSocket(runtime.socketUrl);
        // Attach message handler BEFORE waiting for open, so we don't miss
        // the session:state the server sends immediately on connection.
        const initialStatePromise = waitForSocketMessage(
          socket,
          (m) => m.type === "session:state",
        );
        await waitForSocketOpen(socket);
        await initialStatePromise;

        const errorSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((m) =>
              m.type === "session:state" && m.connectionState === "error"
            ),
        );
        socket.send(
          JSON.stringify({ type: "instruction", text: "inspect nothing.ts" }),
        );

        const errorSequence = await errorSequencePromise;

        // Contract invariants that must hold on every run:
        assertRequiredEvents(errorSequence, [
          "session:state",
          "agent:thinking",
          "agent:text",
          "agent:error",
          "agent:done",
        ]);
        assertEventOrdering(errorSequence, [
          "agent:text",
          "agent:error",
          "agent:done",
        ]);

        const done = errorSequence.find((m) => m.type === "agent:done");
        expect(done).toMatchObject({ status: "error" });

        socket.close();
      } finally {
        await runtime.close();
      }
    }
  }, 30_000);

  it("rejects invalid websocket messages clearly", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-runtime-invalid-");
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-invalid-session",
      targetDirectory,
      discovery,
    });
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );

      try {
        await waitForSocketOpen(socket);
        await initialStatePromise;
        socket.send(JSON.stringify({ type: "bogus" }));

        const invalidMessageError = await waitForSocketMessage(
          socket,
          (message) => message.type === "agent:error",
        );
        expect(invalidMessageError).toMatchObject({
          type: "agent:error",
          message:
            "Invalid client message type: bogus. Expected instruction, cancel, status, session:resume_request, target:switch_request, target:create_request, or target:enrich_request.",
        });
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);
});
