import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverTarget } from "../src/context/discovery.js";
import {
  createSessionState,
  ensureShipyardDirectories,
  saveSessionState,
} from "../src/engine/state.js";
import {
  formatUiStartupLines,
  parseArgs,
  resolveTargetsDirectory,
} from "../src/bin/shipyard.js";
import { createUnavailablePreviewCapability } from "../src/preview/contracts.js";
import { prepareHostedWorkspace } from "../src/hosting/workspace.js";
import type { BackendToFrontendMessage } from "../src/ui/contracts.js";
import {
  resolveUiHost,
  resolveUiPort,
  startUiRuntimeServer,
} from "../src/ui/server.js";
import { queueInstructionTurn } from "../ui/src/view-models.js";
import {
  createAbortError,
  createFakeModelAdapter,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
} from "./support/fake-model-adapter.js";
import { scaffoldPreviewableTarget } from "./support/preview-target.js";

const createdDirectories: string[] = [];
const socketMessageBuffers = new WeakMap<WebSocket, BackendToFrontendMessage[]>();
const trackedSockets = new WeakSet<WebSocket>();
const workspaceDirectory = path.resolve(process.cwd(), "..");
const originalEnv = { ...process.env };

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

async function removeDirectoryWithRetries(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        attempt === 3 ||
        !(error instanceof Error) ||
        !("code" in error) ||
        (
          error.code !== "ENOTEMPTY" &&
          error.code !== "EBUSY"
        )
      ) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
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
function createAbortAwareFakeModelAdapter(options?: {
  followUpText?: string;
}) {
  return createFakeModelAdapter(async (_input, context) => {
    if (context.turnNumber === 1) {
      return await new Promise((_, reject) => {
        const rejectAsAborted = () => reject(createAbortError());

        if (context.signal?.aborted) {
          rejectAsAborted();
          return;
        }

        context.signal?.addEventListener("abort", rejectAsAborted, {
          once: true,
        });
      });
    }

    return createFakeTextTurnResult(
      options?.followUpText ?? "Follow-up browser turn complete.",
    );
  });
}

function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: BackendToFrontendMessage) => boolean,
  timeoutMs = 10_000,
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
  timeoutMs = 10_000,
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

async function waitForSocketFailure(
  socket: WebSocket,
): Promise<{ code: number; reason: string }> {
  return await new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the websocket to fail."));
    }, 5_000);

    const handleClose = (code: number, reason: Buffer) => {
      clearTimeout(timeoutHandle);
      resolve({
        code,
        reason: reason.toString(),
      });
    };

    const handleError = (error: Error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    };

    socket.once("close", handleClose);
    socket.once("error", handleError);
  });
}

function extractCookieHeader(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

  return setCookieHeader.split(";")[0] ?? null;
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
  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);
    process.env = {
      ...originalEnv,
    };

    for (const directory of directories) {
      await removeDirectoryWithRetries(directory);
    }
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

  it("resolves SHIPYARD_TARGETS_DIR when no explicit target or flag is provided", () => {
    process.env.SHIPYARD_TARGETS_DIR = "/app/workspace";

    const options = parseArgs(["--ui"]);
    const resolvedTargetsDirectory = resolveTargetsDirectory(["--ui"], options);

    expect(resolvedTargetsDirectory).toBe("/app/workspace");
  });

  it("keeps explicit target paths ahead of SHIPYARD_TARGETS_DIR", () => {
    process.env.SHIPYARD_TARGETS_DIR = "/app/workspace";

    const options = parseArgs(["--target", "./demo", "--ui"]);
    const resolvedTargetsDirectory = resolveTargetsDirectory(
      ["--target", "./demo", "--ui"],
      options,
    );

    expect(resolvedTargetsDirectory).toBe(path.resolve(process.cwd(), "."));
  });

  it("resolves UI host and port from provider-friendly env fallbacks", () => {
    process.env.SHIPYARD_UI_HOST = "0.0.0.0";
    process.env.PORT = "4110";

    expect(resolveUiHost()).toBe("0.0.0.0");
    expect(resolveUiPort(undefined)).toBe(4110);
  });

  it("prefers SHIPYARD_UI_PORT over PORT when both are set", () => {
    process.env.SHIPYARD_UI_PORT = "4210";
    process.env.PORT = "4110";

    expect(resolveUiPort(undefined)).toBe(4210);
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
  }, 10_000);

  it("boots the UI runtime on provider env host and port and reports hosted health state", async () => {
    process.env.SHIPYARD_UI_HOST = "0.0.0.0";
    process.env.PORT = "0";
    const targetDirectory = await createTempDirectory("shipyard-ui-hosted-");
    const discovery = await discoverTarget(targetDirectory);
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-hosted-session",
        targetDirectory,
        discovery,
      }),
      projectRules: "",
      projectRulesLoaded: false,
    });

    try {
      expect(runtime.host).toBe("0.0.0.0");
      expect(runtime.port).toBeGreaterThan(0);

      const healthResponse = await fetch(
        `http://127.0.0.1:${String(runtime.port)}/api/health`,
      );

      expect(healthResponse.ok).toBe(true);
      await expect(healthResponse.json()).resolves.toMatchObject({
        workspaceDirectory,
        targetDirectory,
      });
    } finally {
      await runtime.close();
    }
  });

  it("prepares an empty mounted hosted workspace for first boot", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-workspace-");
    process.env.SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE = "1";
    process.env.RAILWAY_VOLUME_MOUNT_PATH = targetsDirectory;

    const workspace = await prepareHostedWorkspace(targetsDirectory);

    expect(workspace).toMatchObject({
      rootPath: targetsDirectory,
      volumeMountPath: targetsDirectory,
      persistentRequired: true,
      mode: "persistent",
    });
  });

  it("fails loudly when persistent hosted storage is required but no Railway volume is mounted", async () => {
    const targetsDirectory = await createTempDirectory(
      "shipyard-hosted-workspace-missing-volume-",
    );
    process.env.SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE = "1";

    await expect(prepareHostedWorkspace(targetsDirectory)).rejects.toThrowError(
      /Persistent hosted workspace requires a Railway volume mount/i,
    );
  });

  it("restores existing hosted targets and resumes their latest saved session after restart", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-hosted-restore-");
    const restoredTargetDirectory = path.join(targetsDirectory, "restored-app");
    await mkdir(restoredTargetDirectory, { recursive: true });
    await writeFile(
      path.join(restoredTargetDirectory, "package.json"),
      JSON.stringify({ name: "restored-app" }, null, 2),
      "utf8",
    );

    const restoredDiscovery = await discoverTarget(restoredTargetDirectory);
    const restoredSession = createSessionState({
      sessionId: "restored-target-session",
      targetDirectory: restoredTargetDirectory,
      targetsDirectory,
      discovery: restoredDiscovery,
    });
    restoredSession.turnCount = 4;
    restoredSession.lastActiveAt = "2026-03-25T12:00:00.000Z";
    restoredSession.workbenchState = queueInstructionTurn(
      restoredSession.workbenchState,
      "resume the prior hosted session",
      [],
    );
    restoredSession.workbenchState.turns[0] = {
      ...restoredSession.workbenchState.turns[0]!,
      status: "success",
      summary: "Recovered session from persistent hosted workspace.",
    };
    await saveSessionState(restoredSession);

    process.env.SHIPYARD_TARGETS_DIR = targetsDirectory;
    process.env.SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE = "1";
    process.env.RAILWAY_VOLUME_MOUNT_PATH = targetsDirectory;

    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-hosted-restore-session",
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
        const initialTargetState = await initialTargetStatePromise;

        expect(initialTargetState).toMatchObject({
          type: "target:state",
          state: {
            availableTargets: [
              {
                name: "restored-app",
                path: restoredTargetDirectory,
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
              message.targetDirectory === restoredTargetDirectory &&
              message.sessionId === "restored-target-session"
            ),
        );
        socket.send(
          JSON.stringify({
            type: "target:switch_request",
            targetPath: restoredTargetDirectory,
          }),
        );

        const switchSequence = await switchSequencePromise;
        const restoredSessionState = switchSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "session:state" }
          > =>
            message.type === "session:state" &&
            message.activePhase === "code" &&
            message.targetDirectory === restoredTargetDirectory,
        );

        expect(restoredSessionState).toMatchObject({
          type: "session:state",
          sessionId: "restored-target-session",
          targetDirectory: restoredTargetDirectory,
          activePhase: "code",
          turnCount: 4,
        });
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
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
      targetEnrichmentInvoker: async (prompt) => ({
        text: JSON.stringify({
          name: prompt.includes("beta-app") ? "beta-app" : "alpha-app",
          description: prompt.includes("beta-app")
            ? "Auto-enriched beta target."
            : "Auto-enriched alpha target.",
          purpose: "Verify browser auto-enrichment after switching targets.",
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
              message.type === "target:state" &&
              message.state.currentTarget.path === betaTargetDirectory &&
              message.state.currentTarget.hasProfile
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
        const switchCompleteIndex = switchSequence.findIndex(
          (message) => message.type === "target:switch_complete",
        );
        const firstEnrichmentIndex = switchSequence.findIndex(
          (message) => message.type === "target:enrichment_progress",
        );
        const progressStatuses = switchSequence.flatMap((message) =>
          message.type === "target:enrichment_progress"
            ? [message.status]
            : []
        );
        const enrichedTargetState = switchSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "target:state" }
          > =>
            message.type === "target:state" &&
            message.state.currentTarget.path === betaTargetDirectory &&
            message.state.currentTarget.hasProfile,
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
        expect(switchCompleteIndex).toBeGreaterThanOrEqual(0);
        expect(firstEnrichmentIndex).toBeGreaterThan(switchCompleteIndex);
        expect(progressStatuses).toEqual(
          expect.arrayContaining(["started", "in-progress", "complete"]),
        );
        expect(enrichedTargetState).toMatchObject({
          type: "target:state",
          state: {
            currentTarget: {
              path: betaTargetDirectory,
              hasProfile: true,
              description: "Auto-enriched beta target.",
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
        await expect(
          readFile(path.join(betaTargetDirectory, ".shipyard", "profile.json"), "utf8"),
        ).resolves.toContain("Auto-enriched beta target.");
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("accepts text uploads, rehydrates pending receipts, and injects them into the next turn", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-upload-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify(
        {
          name: "ui-upload-target",
          version: "1.0.0",
        },
        null,
        2,
      ),
      "utf8",
    );

    const discovery = await discoverTarget(targetDirectory);
    let expectedStoredPath: string | null = null;
    let expectedOriginalName: string | null = null;
    const modelAdapter = createFakeModelAdapter(async (input) => {
      expect(expectedStoredPath).toBeTruthy();
      expect(expectedOriginalName).toBeTruthy();
      expect(input.systemPrompt).toContain(
        `Original filename: ${expectedOriginalName ?? ""}`,
      );
      expect(input.systemPrompt).toContain(
        `Stored path: ${expectedStoredPath ?? ""}`,
      );
      expect(input.systemPrompt).toContain("Keep edits narrow.");

      return createFakeTextTurnResult("Upload context inspected.");
    });
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-upload-session",
        targetDirectory,
        discovery,
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "Always inspect uploaded files before editing them.",
      projectRulesLoaded: true,
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            modelAdapter,
          };
        },
      },
    });
    const tracePath = path.join(
      targetDirectory,
      ".shipyard",
      "traces",
      "ui-upload-session.jsonl",
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

        const uploadSyncPromise = waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.workbenchState.pendingUploads.length === 1,
        );

        const uploadForm = new FormData();
        uploadForm.set("sessionId", "ui-upload-session");
        uploadForm.append(
          "files",
          new File(
            ["# Hosted upload spec\n\nKeep edits narrow.\n"],
            "spec.md",
            { type: "text/markdown" },
          ),
        );

        const uploadResponse = await fetch(`${runtime.url}/api/uploads`, {
          method: "POST",
          body: uploadForm,
        });

        expect(uploadResponse.status).toBe(201);

        const uploadJson = await uploadResponse.json() as {
          receipts: Array<{
            id: string;
            originalName: string;
            storedRelativePath: string;
            sizeBytes: number;
            mediaType: string;
            previewText: string;
            previewSummary: string;
            uploadedAt: string;
          }>;
        };
        const receipt = uploadJson.receipts[0];

        expect(receipt).toMatchObject({
          originalName: "spec.md",
          storedRelativePath: expect.stringContaining(
            ".shipyard/uploads/ui-upload-session/",
          ),
          sizeBytes: expect.any(Number),
          mediaType: "text/markdown",
          previewText: expect.stringContaining("# Hosted upload spec"),
          previewSummary: "Markdown preview available.",
        });

        expectedStoredPath = receipt?.storedRelativePath ?? null;
        expectedOriginalName = receipt?.originalName ?? null;

        await expect(
          readFile(
            path.join(targetDirectory, receipt?.storedRelativePath ?? ""),
            "utf8",
          ),
        ).resolves.toContain("Keep edits narrow.");

        const uploadedState = await uploadSyncPromise;
        expect(uploadedState).toMatchObject({
          type: "session:state",
          workbenchState: {
            pendingUploads: [
              {
                id: receipt?.id,
                originalName: "spec.md",
                storedRelativePath: receipt?.storedRelativePath,
              },
            ],
          },
        });

        socket.close();

        const reconnectedSocket = new WebSocket(runtime.socketUrl);

        try {
          const reconnectStatePromise = waitForSocketMessage(
            reconnectedSocket,
            (message) =>
              message.type === "session:state" &&
              message.workbenchState.pendingUploads.length === 1,
          );
          await waitForSocketOpen(reconnectedSocket);
          const reconnectState = await reconnectStatePromise;

          expect(reconnectState).toMatchObject({
            type: "session:state",
            workbenchState: {
              pendingUploads: [
                {
                  originalName: "spec.md",
                  storedRelativePath: receipt?.storedRelativePath,
                },
              ],
            },
          });

          const turnDonePromise = waitForSocketMessage(
            reconnectedSocket,
            (message) => message.type === "agent:done",
            10_000,
          );
          reconnectedSocket.send(
            JSON.stringify({
              type: "instruction",
              text: "inspect the uploaded spec",
            }),
          );

          await turnDonePromise;
          const readyStatePromise = waitForSocketMessage(
            reconnectedSocket,
            (message) =>
              message.type === "session:state" &&
              message.turnCount === 1 &&
              message.workbenchState.pendingUploads.length === 0,
            10_000,
          );
          reconnectedSocket.send(JSON.stringify({ type: "status" }));
          const readyState = await readyStatePromise;

          expect(readyState).toMatchObject({
            type: "session:state",
            workbenchState: {
              pendingUploads: [],
              turns: [
                {
                  instruction: "inspect the uploaded spec",
                  contextPreview: [
                    expect.stringContaining("Upload: spec.md"),
                  ],
                },
              ],
            },
          });
        } finally {
          reconnectedSocket.close();
        }
      } finally {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }

      const persistedSession = JSON.parse(
        await readFile(
          path.join(
            targetDirectory,
            ".shipyard",
            "sessions",
            "ui-upload-session.json",
          ),
          "utf8",
        ),
      ) as {
        workbenchState: {
          pendingUploads: unknown[];
          turns: Array<{
            contextPreview: string[];
          }>;
        };
      };

      expect(persistedSession.workbenchState.pendingUploads).toEqual([]);
      expect(persistedSession.workbenchState.turns[0]?.contextPreview).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Upload: spec.md"),
        ]),
      );

      const traceContents = await readFile(tracePath, "utf8");
      expect(traceContents).toContain('"event":"upload.accepted"');
      expect(traceContents).toContain(
        expectedStoredPath ?? ".shipyard/uploads/ui-upload-session/",
      );
      expect(traceContents).toContain('"event":"upload.handoff"');
    } finally {
      await runtime.close();
    }
  }, 25_000);

  it("rejects duplicate and unsupported uploads and removes pending receipts cleanly", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-upload-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "ui-upload-validation-target" }, null, 2),
      "utf8",
    );

    const discovery = await discoverTarget(targetDirectory);
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-upload-validation-session",
        targetDirectory,
        discovery,
      }),
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

        const uploadForm = new FormData();
        uploadForm.set("sessionId", "ui-upload-validation-session");
        uploadForm.append(
          "files",
          new File(["hello from shipyard\n"], "notes.txt", {
            type: "text/plain",
          }),
        );

        const uploadResponse = await fetch(`${runtime.url}/api/uploads`, {
          method: "POST",
          body: uploadForm,
        });
        const uploadJson = await uploadResponse.json() as {
          receipts: Array<{
            id: string;
            storedRelativePath: string;
          }>;
        };
        const uploadedReceipt = uploadJson.receipts[0];

        expect(uploadResponse.status).toBe(201);
        expect(uploadedReceipt).toBeDefined();

        const duplicateForm = new FormData();
        duplicateForm.set("sessionId", "ui-upload-validation-session");
        duplicateForm.append(
          "files",
          new File(["another note\n"], "notes.txt", {
            type: "text/plain",
          }),
        );

        const duplicateResponse = await fetch(`${runtime.url}/api/uploads`, {
          method: "POST",
          body: duplicateForm,
        });
        expect(duplicateResponse.status).toBe(409);
        await expect(duplicateResponse.json()).resolves.toMatchObject({
          error: expect.stringContaining("already attached"),
        });

        const binaryForm = new FormData();
        binaryForm.set("sessionId", "ui-upload-validation-session");
        binaryForm.append(
          "files",
          new File([new Uint8Array([0, 159, 146, 150])], "blob.bin", {
            type: "application/octet-stream",
          }),
        );

        const binaryResponse = await fetch(`${runtime.url}/api/uploads`, {
          method: "POST",
          body: binaryForm,
        });
        expect(binaryResponse.status).toBe(415);
        await expect(binaryResponse.json()).resolves.toMatchObject({
          error: expect.stringContaining("Unsupported"),
        });

        const removalSyncPromise = waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.workbenchState.pendingUploads.length === 0,
        );

        const deleteResponse = await fetch(
          `${runtime.url}/api/uploads/${uploadedReceipt?.id ?? ""}?sessionId=ui-upload-validation-session`,
          {
            method: "DELETE",
          },
        );

        expect(deleteResponse.status).toBe(200);
        await expect(deleteResponse.json()).resolves.toMatchObject({
          removedId: uploadedReceipt?.id,
        });
        await removalSyncPromise;
        await expect(
          readFile(
            path.join(
              targetDirectory,
              uploadedReceipt?.storedRelativePath ?? "",
            ),
            "utf8",
          ),
        ).rejects.toThrow();
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 15_000);

  it("creates a new target from the browser, auto-enriches it, and switches the session into code mode", async () => {
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
      targetEnrichmentInvoker: async () => ({
        text: JSON.stringify({
          name: "gamma-app",
          description: "Auto-enriched gamma target.",
          purpose: "Verify browser auto-enrichment after creating a target.",
          stack: ["TypeScript", "React"],
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

        const createSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "target:state" &&
              message.state.currentTarget.path === createdTargetDirectory &&
              message.state.currentTarget.hasProfile
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
        const switchCompleteIndex = createSequence.findIndex(
          (message) => message.type === "target:switch_complete",
        );
        const firstEnrichmentIndex = createSequence.findIndex(
          (message) => message.type === "target:enrichment_progress",
        );
        const progressStatuses = createSequence.flatMap((message) =>
          message.type === "target:enrichment_progress"
            ? [message.status]
            : []
        );
        const enrichedTargetState = createSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "target:state" }
          > =>
            message.type === "target:state" &&
            message.state.currentTarget.path === createdTargetDirectory &&
            message.state.currentTarget.hasProfile,
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
        expect(switchCompleteIndex).toBeGreaterThanOrEqual(0);
        expect(firstEnrichmentIndex).toBeGreaterThan(switchCompleteIndex);
        expect(progressStatuses).toEqual(
          expect.arrayContaining(["started", "in-progress", "complete"]),
        );
        expect(enrichedTargetState).toMatchObject({
          type: "target:state",
          state: {
            currentTarget: {
              path: createdTargetDirectory,
              hasProfile: true,
              description: "Auto-enriched gamma target.",
            },
          },
        });
        await expect(
          readFile(path.join(createdTargetDirectory, "README.md"), "utf8"),
        ).resolves.toContain("Created from the browser workbench.");
        await expect(
          readFile(path.join(createdTargetDirectory, ".shipyard", "profile.json"), "utf8"),
        ).resolves.toContain("Auto-enriched gamma target.");
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("creates a new target while the current project remains busy in the background", async () => {
    const targetsDirectory = await createTempDirectory(
      "shipyard-ui-multi-project-create-",
    );
    const alphaTargetDirectory = path.join(targetsDirectory, "alpha-app");
    const gammaTargetDirectory = path.join(targetsDirectory, "gamma-app");
    await mkdir(alphaTargetDirectory, { recursive: true });
    await writeFile(
      path.join(alphaTargetDirectory, "package.json"),
      JSON.stringify({ name: "alpha-app" }, null, 2),
      "utf8",
    );

    const alphaDiscovery = await discoverTarget(alphaTargetDirectory);
    const modelAdapter = createAbortAwareFakeModelAdapter();
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-multi-project-alpha",
        targetDirectory: alphaTargetDirectory,
        targetsDirectory,
        discovery: alphaDiscovery,
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      runtimeMode: "fallback",
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            modelAdapter,
          };
        },
      },
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const initialSessionStatePromise = waitForSocketMessage(
        socket,
        (message) => message.type === "session:state",
      );

      try {
        await waitForSocketOpen(socket);
        await initialSessionStatePromise;

        socket.send(
          JSON.stringify({
            type: "instruction",
            text: "keep alpha running until I switch back",
          }),
        );
        await waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.targetDirectory === alphaTargetDirectory &&
            message.connectionState === "agent-busy",
        );

        const createSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.targetDirectory === gammaTargetDirectory &&
              message.connectionState === "ready"
            ) &&
            messages.some((message) =>
              message.type === "projects:state"
            ),
        );
        socket.send(
          JSON.stringify({
            type: "target:create_request",
            name: "gamma app",
            description: "Created while alpha stays busy.",
            scaffoldType: "react-ts",
          }),
        );

        const createSequence = await createSequencePromise;
        const busyGuardError = createSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "agent:error" }
          > =>
            message.type === "agent:error" &&
            message.message.includes("Finish the current browser action"),
        );
        const projectsState = createSequence.find(
          (message) => message.type === "projects:state",
        ) as
          | (BackendToFrontendMessage & {
              type: "projects:state";
              state: {
                activeProjectId: string | null;
                openProjects: Array<{
                  projectId: string;
                  targetPath: string;
                  status: string;
                }>;
              };
            })
          | undefined;
        const gammaState = createSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "session:state" }
          > =>
            message.type === "session:state" &&
            message.targetDirectory === gammaTargetDirectory,
        );

        expect(busyGuardError).toBeUndefined();
        expect(projectsState).toMatchObject({
          type: "projects:state",
          state: {
            activeProjectId: gammaTargetDirectory,
            openProjects: expect.arrayContaining([
              expect.objectContaining({
                projectId: alphaTargetDirectory,
                targetPath: alphaTargetDirectory,
                status: "agent-busy",
              }),
              expect.objectContaining({
                projectId: gammaTargetDirectory,
                targetPath: gammaTargetDirectory,
                status: "ready",
              }),
            ]),
          },
        });
        expect(gammaState).toMatchObject({
          type: "session:state",
          targetDirectory: gammaTargetDirectory,
          connectionState: "ready",
        });
        await expect(
          readFile(path.join(gammaTargetDirectory, "README.md"), "utf8"),
        ).resolves.toContain("Created while alpha stays busy.");
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("activates an already-open project without duplicating the target runtime", async () => {
    const targetsDirectory = await createTempDirectory(
      "shipyard-ui-multi-project-activate-",
    );
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

    const alphaDiscovery = await discoverTarget(alphaTargetDirectory);
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-multi-project-activate-alpha",
        targetDirectory: alphaTargetDirectory,
        targetsDirectory,
        discovery: alphaDiscovery,
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

      try {
        await waitForSocketOpen(socket);
        await initialSessionStatePromise;

        const openBetaSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.targetDirectory === betaTargetDirectory
            ) &&
            messages.some((message) => message.type === "projects:state"),
        );
        socket.send(
          JSON.stringify({
            type: "target:switch_request",
            targetPath: betaTargetDirectory,
          }),
        );
        await openBetaSequencePromise;

        const activateAlphaSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "session:state" &&
              message.targetDirectory === alphaTargetDirectory &&
              message.connectionState === "ready"
            ) &&
            messages.some((message) => message.type === "projects:state"),
        );
        socket.send(
          JSON.stringify({
            type: "project:activate_request",
            projectId: alphaTargetDirectory,
          }),
        );

        const activateAlphaSequence = await activateAlphaSequencePromise;
        const projectsState = activateAlphaSequence.find(
          (message) => message.type === "projects:state",
        ) as
          | (BackendToFrontendMessage & {
              type: "projects:state";
              state: {
                activeProjectId: string | null;
                openProjects: Array<{
                  projectId: string;
                  targetPath: string;
                }>;
              };
            })
          | undefined;
        const activeAlphaState = activateAlphaSequence.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "session:state" }
          > =>
            message.type === "session:state" &&
            message.targetDirectory === alphaTargetDirectory,
        );

        expect(projectsState).toMatchObject({
          type: "projects:state",
          state: {
            activeProjectId: alphaTargetDirectory,
          },
        });
        expect(projectsState?.state.openProjects).toHaveLength(2);
        expect(
          projectsState?.state.openProjects.map((project) => project.targetPath),
        ).toEqual(
          expect.arrayContaining([
            alphaTargetDirectory,
            betaTargetDirectory,
          ]),
        );
        expect(activeAlphaState).toMatchObject({
          type: "session:state",
          targetDirectory: alphaTargetDirectory,
          connectionState: "ready",
        });
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
    const existingProfile = {
      name: "browser-enrich-target",
      description: "Existing target profile.",
      purpose: "Skip initial auto-enrichment so the manual browser path stays testable.",
      stack: ["TypeScript"],
      architecture: "Single package workspace",
      keyPatterns: ["target-manager state"],
      complexity: "small" as const,
      suggestedAgentsRules: "# AGENTS.md\nKeep changes focused.",
      suggestedScripts: {
        test: "vitest run",
      },
      taskSuggestions: ["Add a README"],
      enrichedAt: "2026-03-25T00:00:00.000Z",
      enrichmentModel: "test-model",
      discoverySnapshot: {
        isGreenfield: false,
        language: "javascript",
        framework: null,
        packageManager: "npm",
        scripts: {},
        hasReadme: false,
        hasAgentsMd: false,
        topLevelFiles: ["package.json"],
        topLevelDirectories: [],
        projectName: "browser-enrich-target",
        previewCapability: createUnavailablePreviewCapability(
          "No preview available.",
        ),
      },
    };
    await ensureShipyardDirectories(targetDirectory);
    await writeFile(
      path.join(targetDirectory, ".shipyard", "profile.json"),
      JSON.stringify(existingProfile, null, 2),
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
        targetProfile: existingProfile,
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

  it("auto-enriches an already-selected target when the browser first connects", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-initial-enrich-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "initial-enrich-target" }, null, 2),
      "utf8",
    );
    const discovery = await discoverTarget(targetDirectory);
    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-initial-enrich-session",
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
          name: "initial-enrich-target",
          description: "Auto-enriched on initial browser sync.",
          purpose: "Verify initial browser auto-enrichment.",
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

      try {
        await waitForSocketOpen(socket);

        const enrichmentSequence = await collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "target:state" &&
              message.state.currentTarget.path === targetDirectory &&
              message.state.currentTarget.hasProfile
            ),
        );
        const progressStatuses = enrichmentSequence.flatMap((message) =>
          message.type === "target:enrichment_progress"
            ? [message.status]
            : []
        );

        expect(progressStatuses).toEqual(
          expect.arrayContaining(["started", "in-progress", "complete"]),
        );
        expect(
          enrichmentSequence.some((message) =>
            message.type === "target:state" &&
            message.state.currentTarget.path === targetDirectory &&
            message.state.currentTarget.description ===
              "Auto-enriched on initial browser sync."
          ),
        ).toBe(true);
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("does not let a stale background enrichment overwrite the newly active target", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-ui-stale-guard-");
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
        sessionId: "ui-stale-guard-session",
        targetDirectory: targetsDirectory,
        targetsDirectory,
        activePhase: "target-manager",
        discovery: createTargetManagerDiscovery(targetsDirectory),
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      targetEnrichmentInvoker: async (prompt) => {
        if (prompt.includes("alpha-app")) {
          await new Promise((resolve) => {
            setTimeout(resolve, 200);
          });

          return {
            text: JSON.stringify({
              name: "alpha-app",
              description: "Alpha target profile.",
              purpose: "Verify stale background updates do not win.",
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
          };
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });

        return {
          text: JSON.stringify({
            name: "beta-app",
            description: "Beta target profile.",
            purpose: "Verify stale background updates do not win.",
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
        };
      },
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);
      const messages = getSocketMessages(socket);

      try {
        await waitForSocketOpen(socket);
        await waitForSocketMessage(
          socket,
          (message) => message.type === "target:state",
        );

        socket.send(
          JSON.stringify({
            type: "target:switch_request",
            targetPath: alphaTargetDirectory,
          }),
        );
        await waitForSocketMessage(
          socket,
          (message) =>
            message.type === "target:switch_complete" &&
            message.state.currentTarget.path === alphaTargetDirectory,
        );

        socket.send(
          JSON.stringify({
            type: "target:switch_request",
            targetPath: betaTargetDirectory,
          }),
        );
        await collectMessagesUntil(
          socket,
          (sequence) =>
            sequence.some((message) =>
              message.type === "target:state" &&
              message.state.currentTarget.path === betaTargetDirectory &&
              message.state.currentTarget.description === "Beta target profile."
            ),
        );
        await new Promise((resolve) => {
          setTimeout(resolve, 250);
        });

        expect(
          messages.some((message) =>
            message.type === "target:state" &&
            message.state.currentTarget.path === betaTargetDirectory &&
            message.state.currentTarget.description === "Alpha target profile."
          ),
        ).toBe(false);
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it("does not surface late background enrichment errors after UI shutdown", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-close-enrich-");
    await writeFile(
      path.join(targetDirectory, "README.md"),
      "# Close Enrichment Test\n",
      "utf8",
    );
    const discovery = await discoverTarget(targetDirectory);

    let resolveEnrichment: (value: { text: string; model: string }) => void = (
      _value,
    ) => {
      throw new Error("Expected the delayed enrichment resolver to be set.");
    };
    const enrichmentResult = new Promise<{ text: string; model: string }>(
      (resolve) => {
        resolveEnrichment = resolve;
      },
    );

    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-close-enrich-session",
        targetDirectory,
        targetsDirectory: path.dirname(targetDirectory),
        activePhase: "code",
        discovery,
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      targetEnrichmentInvoker: async () => enrichmentResult,
    });
    let closed = false;

    try {
      const socket = new WebSocket(runtime.socketUrl);

      try {
        await waitForSocketOpen(socket);
        await collectMessagesUntil(
          socket,
          (messages) =>
            messages.some(
              (message) =>
                message.type === "target:enrichment_progress" &&
                message.status === "queued",
            ),
        );
      } finally {
        socket.close();
      }

      await runtime.close();
      closed = true;
      resolveEnrichment({
        text: JSON.stringify({
          name: "close-enrich-target",
          description: "Should never be persisted after shutdown.",
          purpose: "Verify UI shutdown cancels late session writes.",
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
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    } finally {
      if (!closed) {
        await runtime.close();
      }
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
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_read_file",
          name: "read_file",
          input: {
            path: "package.json",
          },
        },
        {
          id: "toolu_edit_block",
          name: "edit_block",
          input: {
            path: "package.json",
            old_string: '  "name": "ui-bridge-target",',
            new_string: '  "name": "ui-bridge-target-smoke",',
          },
        },
      ]),
      createFakeTextTurnResult("Inspection complete."),
      createFakeToolCallTurnResult([
        {
          id: "toolu_run_command",
          name: "run_command",
          input: {
            command: "git diff --stat",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        command: "git diff --stat",
        exitCode: 0,
        passed: true,
        stdout: " package.json | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
        stderr: "",
        summary: "Verification passed.",
      })),
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
            modelAdapter,
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
        expect(toolCalls).toHaveLength(3);
        expect(toolResults).toHaveLength(3);
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
        expect(toolCalls[2]).toMatchObject({
          type: "agent:tool_call",
          toolName: "run_command",
          summary: expect.stringContaining("git diff --stat"),
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
        expect(toolResults[2]).toMatchObject({
          type: "agent:tool_result",
          toolName: "run_command",
          success: true,
        });
        expect(toolResults[0]?.callId).toBe(toolCalls[0]?.callId);
        expect(toolResults[1]?.callId).toBe(toolCalls[1]?.callId);
        expect(toolResults[2]?.callId).toBe(toolCalls[2]?.callId);
        expect(editPreview).toMatchObject({
          type: "agent:edit",
          path: "package.json",
          summary: "Applied targeted edit to package.json",
          diff: expect.stringContaining('"name": "ui-bridge-target-smoke"'),
          beforePreview: expect.stringContaining('"name": "ui-bridge-target"'),
          afterPreview: expect.stringContaining('"name": "ui-bridge-target-smoke"'),
          addedLines: 1,
          removedLines: 1,
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
            projectName: "ui-bridge-target-smoke",
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
            projectName: "ui-bridge-target-smoke",
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
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_read_file_preview",
          name: "read_file",
          input: {
            path: "package.json",
          },
        },
        {
          id: "toolu_edit_block_preview",
          name: "edit_block",
          input: {
            path: "package.json",
            old_string: '  "name": "ui-preview-target",',
            new_string: '  "name": "ui-preview-target-edited",',
          },
        },
      ]),
      createFakeTextTurnResult("Preview-ready edit complete."),
      createFakeToolCallTurnResult([
        {
          id: "toolu_run_command_preview",
          name: "run_command",
          input: {
            command: "git diff --stat",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        command: "git diff --stat",
        exitCode: 0,
        passed: true,
        stdout: " package.json | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
        stderr: "",
        summary: "Verification passed.",
      })),
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
            modelAdapter,
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
            ) &&
            messages.some((message) =>
              message.type === "preview:state" &&
              message.preview.status === "running" &&
              message.preview.lastRestartReason?.includes("Refresh requested") === true
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
        expect(
          turnMessages.findIndex((message) => message.type === "agent:edit"),
        ).toBeLessThan(
          turnMessages.findIndex((message) =>
            message.type === "preview:state" &&
            (
              message.preview.status === "refreshing" ||
              message.preview.status === "running"
            )
          ),
        );
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("starts scratch targets on a starter canvas and promotes to a real preview after previewable edits", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-ui-starter-canvas-",
    );
    await initializeGitRepository(targetDirectory);

    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-starter-canvas-session",
      targetDirectory,
      discovery,
    });
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_read_file_starter_canvas",
          name: "read_file",
          input: {
            path: "package.json",
          },
        },
        {
          id: "toolu_edit_block_starter_canvas",
          name: "edit_block",
          input: {
            path: "package.json",
            old_string: '  "name": "ui-starter-preview",',
            new_string: '  "name": "ui-starter-preview-ready",',
          },
        },
      ]),
      createFakeTextTurnResult("Starter canvas target updated."),
      createFakeToolCallTurnResult([
        {
          id: "toolu_run_command_starter_canvas",
          name: "run_command",
          input: {
            command: "git diff --stat",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        command: "git diff --stat",
        exitCode: 0,
        passed: true,
        stdout: " package.json | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
        stderr: "",
        summary: "Verification passed.",
      })),
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
            modelAdapter,
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
      const starterCanvasPromise = waitForSocketMessage(
        socket,
        (message) =>
          message.type === "preview:state" &&
          message.preview.status === "running" &&
          message.preview.summary.includes("Starter canvas") &&
          message.preview.url !== null,
      );

      try {
        await waitForSocketOpen(socket);

        const initialState = await initialStatePromise;
        expect(initialState).toMatchObject({
          type: "session:state",
          sessionId: "ui-starter-canvas-session",
          workbenchState: {
            previewState: {
              summary: expect.stringContaining("Starter canvas"),
            },
          },
        });

        const starterCanvas = await starterCanvasPromise;
        if (starterCanvas.type !== "preview:state") {
          throw new Error("Expected a preview:state starter canvas message.");
        }

        const starterCanvasResponse = await fetch(starterCanvas.preview.url ?? "");
        expect(starterCanvasResponse.ok).toBe(true);
        await expect(starterCanvasResponse.text()).resolves.toContain(
          'data-shipyard-starter-canvas="true"',
        );

        await scaffoldPreviewableTarget({
          targetDirectory,
          name: "ui-starter-preview",
        });
        await expectRawCommandSuccess(targetDirectory, "git add .");
        await expectRawCommandSuccess(
          targetDirectory,
          "git commit -m \"Scaffold starter canvas preview target\"",
        );

        const turnMessagesPromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some((message) =>
              message.type === "preview:state" &&
              message.preview.status === "running" &&
              message.preview.logTail.join("\n").includes("VITE v5.0.8 ready")
            ) &&
            messages.some((message) =>
              message.type === "session:state" &&
              message.turnCount === 1 &&
              message.connectionState === "ready"
            ),
          15_000,
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

        const finalPreview = turnMessages.find(
          (
            message,
          ): message is Extract<
            BackendToFrontendMessage,
            { type: "preview:state" }
          > =>
            message.type === "preview:state" &&
            message.preview.status === "running" &&
            message.preview.logTail.join("\n").includes("VITE v5.0.8 ready"),
        );

        expect(
          turnMessages.some(
            (message) =>
              message.type === "preview:state" &&
              message.preview.status === "starting",
          ),
        ).toBe(true);
        expect(finalPreview?.preview.url).toMatch(
          /^http:\/\/127\.0\.0\.1:\d+\/?$/,
        );

        const previewResponse = await fetch(finalPreview?.preview.url ?? "");
        expect(previewResponse.ok).toBe(true);
        await expect(previewResponse.text()).resolves.toContain("Preview Ready");
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 25_000);

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

  it("cancels an active browser turn and allows a follow-up instruction in the same session", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-runtime-cancel-");
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-cancel-session",
      targetDirectory,
      discovery,
    });
    const modelAdapter = createAbortAwareFakeModelAdapter({
      followUpText: "Follow-up browser turn complete.",
    });
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      runtimeMode: "fallback",
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            modelAdapter,
          };
        },
      },
    });
    const tracePath = path.join(
      targetDirectory,
      ".shipyard",
      "traces",
      "ui-cancel-session.jsonl",
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

        const cancelledSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some(
              (message) =>
                message.type === "agent:done" &&
                message.status === "cancelled",
            ) &&
            messages.some(
              (message) =>
                message.type === "session:state" &&
                message.connectionState === "ready" &&
                message.turnCount === 1,
            ),
        );
        socket.send(
          JSON.stringify({
            type: "instruction",
            text: "inspect the repo until I interrupt you",
          }),
        );
        await waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.connectionState === "agent-busy",
        );
        socket.send(JSON.stringify({ type: "cancel" }));

        const cancelledSequence = await cancelledSequencePromise;
        const cancelledDone = cancelledSequence.find(
          (message) => message.type === "agent:done",
        );
        const cancelledError = cancelledSequence.find(
          (message) => message.type === "agent:error",
        );

        expect(cancelledDone).toMatchObject({
          type: "agent:done",
          status: "cancelled",
          summary: "Operator interrupted the active turn.",
        });
        expect(cancelledError).toBeUndefined();

        const followUpSequencePromise = collectMessagesUntil(
          socket,
          (messages) =>
            messages.some(
              (message) =>
                message.type === "agent:done" &&
                message.status === "success",
            ) &&
            messages.some(
              (message) =>
                message.type === "session:state" &&
                message.connectionState === "ready" &&
                message.turnCount === 2,
            ),
        );
        socket.send(
          JSON.stringify({
            type: "instruction",
            text: "summarize the repo now",
          }),
        );

        const followUpSequence = await followUpSequencePromise;
        const followUpDone = followUpSequence.find(
          (message) => message.type === "agent:done",
        );

        expect(followUpDone).toMatchObject({
          type: "agent:done",
          status: "success",
          summary: expect.stringContaining("completed"),
        });

        const traceContents = await readFile(tracePath, "utf8");
        expect(traceContents).toContain('"status":"cancelled"');
        expect(traceContents).toContain('"instruction":"inspect the repo until I interrupt you"');
        expect(traceContents).toContain('"instruction":"summarize the repo now"');
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
            "Invalid client message type: bogus. Expected instruction, cancel, status, session:resume_request, target:switch_request, target:create_request, project:activate_request, target:enrich_request, or deploy:request.",
        });
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("runs deploy requests through the browser contract and recovers the latest production URL on reconnect", async () => {
    process.env.VERCEL_TOKEN = "phase-nine-vercel-token";
    const targetDirectory = await createTempDirectory("shipyard-ui-deploy-");
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-deploy-session",
      targetDirectory,
      discovery,
    });
    const deployInvocations: Array<{
      platform: string;
      targetDirectory: string;
    }> = [];
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      async executeDeploy(input, deployTargetDirectory) {
        deployInvocations.push({
          platform: input.platform,
          targetDirectory: deployTargetDirectory,
        });

        return {
          success: true,
          output: "Production URL: https://shipyard-demo.vercel.app",
          data: {
            platform: "vercel",
            productionUrl: "https://shipyard-demo.vercel.app",
            command: "vercel deploy --prod --yes --token [redacted]",
            logExcerpt: "Production URL: https://shipyard-demo.vercel.app",
            exitCode: 0,
            timedOut: false,
          },
        };
      },
    });

    const firstSocket = new WebSocket(runtime.socketUrl);

    try {
      const firstStatePromise = waitForSocketMessage(
        firstSocket,
        (message) => message.type === "session:state",
      );

      await waitForSocketOpen(firstSocket);
      const firstState = await firstStatePromise;
      expect(firstState).toMatchObject({
        type: "session:state",
        workbenchState: {
          latestDeploy: {
            status: "idle",
            platform: "vercel",
            available: true,
            unavailableReason: null,
          },
        },
      });

      const deploySequencePromise = collectMessagesUntil(
        firstSocket,
        (messages) =>
          messages.some(
            (message) =>
              message.type === "deploy:state" &&
              message.deploy.status === "success",
          ) &&
          messages.some(
            (message) =>
              message.type === "agent:tool_call" &&
              message.toolName === "deploy_target",
          ) &&
          messages.some(
            (message) =>
              message.type === "agent:tool_result" &&
              message.toolName === "deploy_target" &&
              message.success,
          ),
      );

      firstSocket.send(
        JSON.stringify({
          type: "deploy:request",
          platform: "vercel",
        }),
      );

      const deployMessages = await deploySequencePromise;
      expect(deployInvocations).toEqual([
        {
          platform: "vercel",
          targetDirectory,
        },
      ]);
      expect(deployMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "deploy:state",
            deploy: expect.objectContaining({
              status: "deploying",
              available: false,
            }),
          }),
          expect.objectContaining({
            type: "agent:tool_call",
            toolName: "deploy_target",
          }),
          expect.objectContaining({
            type: "agent:tool_result",
            toolName: "deploy_target",
            success: true,
            summary: "Deploy completed. Public URL: https://shipyard-demo.vercel.app",
            command: "vercel deploy --prod --yes --token [redacted]",
          }),
          expect.objectContaining({
            type: "deploy:state",
            deploy: expect.objectContaining({
              status: "success",
              productionUrl: "https://shipyard-demo.vercel.app",
              available: true,
            }),
          }),
        ]),
      );

      const reconnectedSocket = new WebSocket(runtime.socketUrl);

      try {
        const recoveredStatePromise = waitForSocketMessage(
          reconnectedSocket,
          (message) => message.type === "session:state",
        );
        await waitForSocketOpen(reconnectedSocket);
        const recoveredState = await recoveredStatePromise;

        expect(recoveredState).toMatchObject({
          type: "session:state",
          workbenchState: {
            latestDeploy: {
              status: "success",
              platform: "vercel",
              productionUrl: "https://shipyard-demo.vercel.app",
              available: true,
              unavailableReason: null,
              command: "vercel deploy --prod --yes --token [redacted]",
            },
          },
        });
      } finally {
        reconnectedSocket.close();
      }
    } finally {
      firstSocket.close();
      await runtime.close();
    }
  }, 20_000);

  it("auto-publishes successful edited turns to Vercel and restores the public URL on reconnect", async () => {
    process.env.VERCEL_TOKEN = "phase-nine-vercel-token";
    const targetDirectory = await createTempDirectory("shipyard-ui-auto-deploy-");
    const packageJsonContents = `${JSON.stringify(
      {
        name: "ui-auto-deploy-target",
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
      "git commit -m \"Initial auto deploy target\"",
    );

    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-auto-deploy-session",
      targetDirectory,
      discovery,
    });
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_read_file_auto_deploy",
          name: "read_file",
          input: {
            path: "package.json",
          },
        },
        {
          id: "toolu_edit_block_auto_deploy",
          name: "edit_block",
          input: {
            path: "package.json",
            old_string: '  "name": "ui-auto-deploy-target",',
            new_string: '  "name": "ui-auto-deploy-target-updated",',
          },
        },
      ]),
      createFakeTextTurnResult("Updated the target package metadata."),
      createFakeToolCallTurnResult([
        {
          id: "toolu_run_command_auto_deploy",
          name: "run_command",
          input: {
            command: "git diff --stat",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        command: "git diff --stat",
        exitCode: 0,
        passed: true,
        stdout:
          " package.json | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
        stderr: "",
        summary: "Verification passed.",
      })),
    ]);
    const deployInvocations: Array<{
      platform: string;
      targetDirectory: string;
    }> = [];
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "Always inspect files before editing them.",
      projectRulesLoaded: true,
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            modelAdapter,
          };
        },
      },
      async executeDeploy(input, deployTargetDirectory) {
        deployInvocations.push({
          platform: input.platform,
          targetDirectory: deployTargetDirectory,
        });

        return {
          success: true,
          output: "Production URL: https://shipyard-auto-deploy.vercel.app",
          data: {
            platform: "vercel",
            productionUrl: "https://shipyard-auto-deploy.vercel.app",
            command: "vercel deploy --prod --yes --token [redacted]",
            logExcerpt: "Production URL: https://shipyard-auto-deploy.vercel.app",
            exitCode: 0,
            timedOut: false,
          },
        };
      },
    });

    const firstSocket = new WebSocket(runtime.socketUrl);

    try {
      const firstStatePromise = waitForSocketMessage(
        firstSocket,
        (message) => message.type === "session:state",
      );

      await waitForSocketOpen(firstSocket);
      await firstStatePromise;

      const publishSequencePromise = collectMessagesUntil(
        firstSocket,
        (messages) =>
          messages.some(
            (message) =>
              message.type === "deploy:state" &&
              message.deploy.status === "success" &&
              message.deploy.productionUrl ===
                "https://shipyard-auto-deploy.vercel.app",
          ) &&
          messages.some(
            (message) =>
              message.type === "session:state" &&
              message.connectionState === "ready" &&
              message.turnCount === 2,
          ),
      );

      firstSocket.send(
        JSON.stringify({
          type: "instruction",
          text: "rename the package in package.json",
        }),
      );

      const publishMessages = await publishSequencePromise;
      expect(deployInvocations).toEqual([
        {
          platform: "vercel",
          targetDirectory,
        },
      ]);

      const firstTurnDoneIndex = publishMessages.findIndex(
        (message) => message.type === "agent:done",
      );
      const deployToolCallIndex = publishMessages.findIndex(
        (message) =>
          message.type === "agent:tool_call" &&
          message.toolName === "deploy_target",
      );
      const deployState = publishMessages.find(
        (
          message,
        ): message is Extract<
          BackendToFrontendMessage,
          { type: "deploy:state" }
        > =>
          message.type === "deploy:state" &&
          message.deploy.status === "deploying",
      );
      const deployToolResult = publishMessages.find(
        (
          message,
        ): message is Extract<
          BackendToFrontendMessage,
          { type: "agent:tool_result" }
        > =>
          message.type === "agent:tool_result" &&
          message.toolName === "deploy_target",
      );
      const deploySuccessState = publishMessages.find(
        (
          message,
        ): message is Extract<
          BackendToFrontendMessage,
          { type: "deploy:state" }
        > =>
          message.type === "deploy:state" &&
          message.deploy.status === "success",
      );
      const finalReadyState = publishMessages.find(
        (
          message,
        ): message is Extract<
          BackendToFrontendMessage,
          { type: "session:state" }
        > =>
          message.type === "session:state" &&
          message.connectionState === "ready" &&
          message.turnCount === 2,
      );

      expect(firstTurnDoneIndex).toBeGreaterThanOrEqual(0);
      expect(deployToolCallIndex).toBeGreaterThan(firstTurnDoneIndex);
      expect(publishMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "agent:edit",
            path: "package.json",
            summary: "Applied targeted edit to package.json",
          }),
        ]),
      );
      expect(deployState).toMatchObject({
        type: "deploy:state",
        deploy: {
          status: "deploying",
          available: false,
        },
      });
      expect(deployToolResult).toMatchObject({
        type: "agent:tool_result",
        toolName: "deploy_target",
        success: true,
        summary:
          "Deploy completed. Public URL: https://shipyard-auto-deploy.vercel.app",
      });
      expect(deploySuccessState).toMatchObject({
        type: "deploy:state",
        deploy: {
          status: "success",
          productionUrl: "https://shipyard-auto-deploy.vercel.app",
          available: true,
        },
      });
      expect(finalReadyState).toMatchObject({
        type: "session:state",
        connectionState: "ready",
        turnCount: 2,
        workbenchState: {
          latestDeploy: {
            status: "success",
            productionUrl: "https://shipyard-auto-deploy.vercel.app",
          },
        },
      });

      const reconnectedSocket = new WebSocket(runtime.socketUrl);

      try {
        const recoveredStatePromise = waitForSocketMessage(
          reconnectedSocket,
          (message) => message.type === "session:state",
        );
        await waitForSocketOpen(reconnectedSocket);
        const recoveredState = await recoveredStatePromise;

        expect(recoveredState).toMatchObject({
          type: "session:state",
          turnCount: 2,
          workbenchState: {
            latestDeploy: {
              status: "success",
              productionUrl: "https://shipyard-auto-deploy.vercel.app",
              available: true,
            },
          },
        });
      } finally {
        reconnectedSocket.close();
      }
    } finally {
      firstSocket.close();
      await runtime.close();
    }
  }, 20_000);

  it("requires a valid hosted access token before exposing session state over HTTP or websocket", async () => {
    process.env.SHIPYARD_ACCESS_TOKEN = "phase-nine-demo-token";
    const targetDirectory = await createTempDirectory("shipyard-ui-access-");
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-access-session",
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
      const lockedAccessResponse = await fetch(`${runtime.url}/api/access`);
      expect(lockedAccessResponse.ok).toBe(true);
      await expect(lockedAccessResponse.json()).resolves.toMatchObject({
        required: true,
        authenticated: false,
      });

      const publicHealthResponse = await fetch(`${runtime.url}/api/health`);
      expect(publicHealthResponse.ok).toBe(true);
      await expect(publicHealthResponse.json()).resolves.toMatchObject({
        ok: true,
        runtimeMode: "ui",
        accessProtected: true,
      });

      const lockedSocket = new WebSocket(runtime.socketUrl);
      await expect(waitForSocketFailure(lockedSocket)).rejects.toThrowError(
        /Unauthorized|Unexpected server response: 401/i,
      );

      const invalidAccessResponse = await fetch(`${runtime.url}/api/access`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "wrong-token",
        }),
      });
      expect(invalidAccessResponse.status).toBe(401);
      await expect(invalidAccessResponse.json()).resolves.toMatchObject({
        required: true,
        authenticated: false,
        message: "Invalid access token. Enter the shared token to continue.",
      });

      const grantedAccessResponse = await fetch(`${runtime.url}/api/access`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "phase-nine-demo-token",
        }),
      });
      expect(grantedAccessResponse.ok).toBe(true);

      const grantedCookie = extractCookieHeader(
        grantedAccessResponse.headers.get("set-cookie"),
      );
      expect(grantedCookie).toBeTruthy();
      await expect(grantedAccessResponse.json()).resolves.toMatchObject({
        required: true,
        authenticated: true,
      });

      const unlockedHealthResponse = await fetch(`${runtime.url}/api/health`, {
        headers: grantedCookie
          ? {
              cookie: grantedCookie,
            }
          : undefined,
      });
      expect(unlockedHealthResponse.ok).toBe(true);
      await expect(unlockedHealthResponse.json()).resolves.toMatchObject({
        ok: true,
        runtimeMode: "ui",
        sessionId: "ui-access-session",
        workspaceDirectory,
        targetDirectory,
      });

      const unlockedSocket = new WebSocket(runtime.socketUrl, {
        headers: grantedCookie
          ? {
              Cookie: grantedCookie,
            }
          : undefined,
      });
      const initialStatePromise = waitForSocketMessage(
        unlockedSocket,
        (message) => message.type === "session:state",
      );

      try {
        await waitForSocketOpen(unlockedSocket);
        const initialState = await initialStatePromise;
        expect(initialState).toMatchObject({
          type: "session:state",
          sessionId: "ui-access-session",
          targetDirectory,
        });
      } finally {
        unlockedSocket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("persists uploaded text files across reconnects and injects them into the next turn", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-uploads-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify(
        {
          name: "upload-target",
          version: "1.0.0",
        },
        null,
        2,
      ),
      "utf8",
    );
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-upload-session",
      targetDirectory,
      discovery,
    });
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult("Uploaded context received."),
    ]);
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      runtimeDependencies: {
        async createRawLoopOptions() {
          return {
            modelAdapter,
          };
        },
      },
    });

    try {
      const firstSocket = new WebSocket(runtime.socketUrl);
      const initialStatePromise = waitForSocketMessage(
        firstSocket,
        (message) => message.type === "session:state",
      );

      await waitForSocketOpen(firstSocket);
      await initialStatePromise;

      const uploadForm = new FormData();
      uploadForm.set("sessionId", "ui-upload-session");
      uploadForm.append(
        "files",
        new File(["# Notes\nRemember the preview contract.\n"], "brief.md", {
          type: "text/markdown",
        }),
      );

      const uploadResponse = await fetch(`${runtime.url}/api/uploads`, {
        method: "POST",
        body: uploadForm,
      });
      expect(uploadResponse.status).toBe(201);

      const uploadJson = await uploadResponse.json() as {
        receipts: Array<{
          id: string;
          originalName: string;
          storedRelativePath: string;
        }>;
      };
      expect(uploadJson.receipts).toHaveLength(1);
      expect(uploadJson.receipts[0]).toMatchObject({
        originalName: "brief.md",
        storedRelativePath: expect.stringContaining(
          ".shipyard/uploads/ui-upload-session/",
        ),
      });

      const pendingUploadMessage = await waitForSocketMessage(
        firstSocket,
        (
          message,
        ): message is Extract<BackendToFrontendMessage, { type: "session:state" }> =>
          message.type === "session:state" &&
          message.workbenchState.pendingUploads.length === 1,
      ).catch((error) => {
        throw new Error(
          `Timed out waiting for the pending upload snapshot: ${
            error instanceof Error ? error.message : String(error)
          }\n${JSON.stringify(getSocketMessages(firstSocket), null, 2)}`,
        );
      });
      expect(pendingUploadMessage).toMatchObject({
        type: "session:state",
        sessionId: "ui-upload-session",
      });
      if (pendingUploadMessage.type !== "session:state") {
        throw new Error("Expected a session:state upload snapshot.");
      }

      const storedUpload = pendingUploadMessage.workbenchState.pendingUploads[0];
      expect(storedUpload).toMatchObject({
        originalName: "brief.md",
        storedRelativePath: expect.stringContaining(
          ".shipyard/uploads/ui-upload-session/",
        ),
      });

      if (!storedUpload?.storedRelativePath) {
        throw new Error("Expected a stored upload path.");
      }

      await expect(
        readFile(path.join(targetDirectory, storedUpload.storedRelativePath), "utf8"),
      ).resolves.toContain("Remember the preview contract.");

      firstSocket.close();

      const secondSocket = new WebSocket(runtime.socketUrl);
      const reconnectedStatePromise = waitForSocketMessage(
        secondSocket,
        (
          message,
        ): message is Extract<BackendToFrontendMessage, { type: "session:state" }> =>
          message.type === "session:state" &&
          message.workbenchState.pendingUploads.length === 1,
      );

      try {
        await waitForSocketOpen(secondSocket);
        const reconnectedState = await reconnectedStatePromise.catch((error) => {
          throw new Error(
            `Timed out waiting for the reconnected upload snapshot: ${
              error instanceof Error ? error.message : String(error)
            }\n${JSON.stringify(getSocketMessages(secondSocket), null, 2)}`,
          );
        });
        if (reconnectedState.type !== "session:state") {
          throw new Error("Expected a session:state reconnect snapshot.");
        }
        expect(reconnectedState.workbenchState.pendingUploads[0]).toMatchObject({
          id: storedUpload.id,
          originalName: "brief.md",
          storedRelativePath: storedUpload.storedRelativePath,
        });

        const busyStatePromise = waitForSocketMessage(
          secondSocket,
          (
            message,
          ): message is Extract<BackendToFrontendMessage, { type: "session:state" }> =>
            message.type === "session:state" &&
            message.connectionState === "agent-busy",
        );
        secondSocket.send(
          JSON.stringify({
            type: "instruction",
            text: "Summarize the uploaded note.",
          }),
        );

        const busyState = await busyStatePromise.catch((error) => {
          throw new Error(
            `Timed out waiting for the busy upload turn snapshot: ${
              error instanceof Error ? error.message : String(error)
            }\n${JSON.stringify(getSocketMessages(secondSocket), null, 2)}`,
          );
        });
        if (busyState.type !== "session:state") {
          throw new Error("Expected a session:state busy snapshot.");
        }
        expect(busyState.workbenchState.turns[0]?.contextPreview.join("\n")).toContain(
          `Upload: brief.md -> ${storedUpload.storedRelativePath}`,
        );
        expect(busyState.workbenchState.pendingUploads).toHaveLength(0);
      } finally {
        secondSocket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("removes pending uploaded files and deletes their stored copies", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-upload-remove-");
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-upload-remove-session",
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

        const uploadForm = new FormData();
        uploadForm.set("sessionId", "ui-upload-remove-session");
        uploadForm.append(
          "files",
          new File(["temporary upload"], "scratch.txt", {
            type: "text/plain",
          }),
        );

        const uploadResponse = await fetch(`${runtime.url}/api/uploads`, {
          method: "POST",
          body: uploadForm,
        });
        expect(uploadResponse.ok).toBe(true);

        const pendingUploadMessage = await waitForSocketMessage(
          socket,
          (
            message,
          ): message is Extract<BackendToFrontendMessage, { type: "session:state" }> =>
            message.type === "session:state" &&
            message.workbenchState.pendingUploads.length === 1,
        );
        if (pendingUploadMessage.type !== "session:state") {
          throw new Error("Expected a session:state upload snapshot.");
        }
        const pendingUpload = pendingUploadMessage.workbenchState.pendingUploads[0];

        if (!pendingUpload?.storedRelativePath) {
          throw new Error("Expected a stored upload to remove.");
        }

        const deleteResponse = await fetch(
          `${runtime.url}/api/uploads/${encodeURIComponent(pendingUpload.id)}?sessionId=${encodeURIComponent("ui-upload-remove-session")}`,
          {
            method: "DELETE",
          },
        );
        expect(deleteResponse.ok).toBe(true);
        await expect(deleteResponse.json()).resolves.toMatchObject({
          removedId: pendingUpload.id,
        });

        const clearedUploadsMessage = await waitForSocketMessage(
          socket,
          (
            message,
          ): message is Extract<BackendToFrontendMessage, { type: "session:state" }> =>
            message.type === "session:state" &&
            message.workbenchState.pendingUploads.length === 0,
        );
        if (clearedUploadsMessage.type !== "session:state") {
          throw new Error("Expected a session:state clear-upload snapshot.");
        }
        expect(clearedUploadsMessage.type).toBe("session:state");
        await expect(
          readFile(path.join(targetDirectory, pendingUpload.storedRelativePath), "utf8"),
        ).rejects.toThrowError();
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);
});
