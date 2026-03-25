import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import type {
  Message,
  MessageCreateParamsNonStreaming,
  Model,
} from "@anthropic-ai/sdk/resources/messages";
import WebSocket from "ws";

import { discoverTarget } from "../../src/context/discovery.js";
import { DEFAULT_ANTHROPIC_MODEL } from "../../src/engine/anthropic.js";
import { createSessionState } from "../../src/engine/state.js";
import type { BackendToFrontendMessage } from "../../src/ui/contracts.js";
import { startUiRuntimeServer } from "../../src/ui/server.js";
import { scaffoldPreviewableTarget } from "../support/preview-target.js";

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

interface PreviewScenarioResult {
  previewUrl: string;
  refreshReason: string;
}

interface UnavailableScenarioResult {
  reason: string;
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

  assert.equal(result.exitCode, 0, `${command} failed.\n${result.stderr}`);
}

async function initializeGitRepository(cwd: string): Promise<void> {
  await expectRawCommandSuccess(cwd, "git init");
  await expectRawCommandSuccess(cwd, "git config user.email shipyard@example.com");
  await expectRawCommandSuccess(cwd, "git config user.name 'Shipyard Tests'");
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

        assert(response, "No mock Claude response configured.");
        return response;
      },
    },
  };
}

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === socket.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the WebSocket connection."));
    }, 5_000);

    socket.once("open", () => {
      clearTimeout(timeoutHandle);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}

async function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: BackendToFrontendMessage) => boolean,
  timeoutMs = 8_000,
): Promise<BackendToFrontendMessage> {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the expected WebSocket message."));
    }, timeoutMs);

    socket.on("message", (rawMessage: WebSocket.RawData) => {
      const message = JSON.parse(rawMessage.toString()) as BackendToFrontendMessage;

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeoutHandle);
      resolve(message);
    });
  });
}

async function collectMessagesUntil(
  socket: WebSocket,
  predicate: (messages: BackendToFrontendMessage[]) => boolean,
  timeoutMs = 8_000,
): Promise<BackendToFrontendMessage[]> {
  const messages: BackendToFrontendMessage[] = [];

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the expected WebSocket message sequence."));
    }, timeoutMs);

    socket.on("message", (rawMessage: WebSocket.RawData) => {
      messages.push(
        JSON.parse(rawMessage.toString()) as BackendToFrontendMessage,
      );

      if (!predicate(messages)) {
        return;
      }

      clearTimeout(timeoutHandle);
      resolve(messages);
    });
  });
}

async function runPreviewableScenario(): Promise<PreviewScenarioResult> {
  const targetDirectory = await mkdtemp(
    path.join(tmpdir(), "shipyard-phase5-previewable-"),
  );

  try {
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "phase5-preview-target",
    });
    await initializeGitRepository(targetDirectory);
    await expectRawCommandSuccess(targetDirectory, "git add package.json");
    await expectRawCommandSuccess(
      targetDirectory,
      "git commit -m \"Initial preview smoke target\"",
    );

    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "phase5-preview-smoke",
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
              old_string: '  "name": "phase5-preview-target",',
              new_string: '  "name": "phase5-preview-target-updated",',
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
            text: "Preview smoke edit complete.",
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
      const previewReadyPromise = waitForSocketMessage(
        socket,
        (message) =>
          message.type === "preview:state" &&
          message.preview.status === "running" &&
          message.preview.url !== null,
      );

      await waitForSocketOpen(socket);
      const previewReady = await previewReadyPromise;
      assert.equal(previewReady.type, "preview:state");

      const previewUrl = previewReady.preview.url;
      assert(previewUrl, "Preview URL was not published.");

      const previewResponse = await fetch(previewUrl);
      assert.equal(previewResponse.ok, true, "Preview did not respond on loopback.");

      const turnMessagesPromise = collectMessagesUntil(
        socket,
        (messages) =>
          messages.some((message) =>
            message.type === "session:state" &&
            message.turnCount === 1 &&
            message.connectionState === "ready"
          ),
      );
      socket.send(
        JSON.stringify({
          type: "instruction",
          text: "rename the package in package.json",
        }),
      );

      const turnMessages = await turnMessagesPromise;
      const refreshMessages = turnMessages.filter(
        (
          message,
        ): message is Extract<BackendToFrontendMessage, { type: "preview:state" }> =>
          message.type === "preview:state",
      );
      const refreshedMessage = refreshMessages.find((message) =>
        message.preview.status === "running" &&
        message.preview.lastRestartReason !== null
      );

      assert(
        refreshMessages.some((message) => message.preview.status === "refreshing"),
        "Refresh state was not emitted after the edit.",
      );
      assert(refreshedMessage, "Preview never returned to a running state.");
      assert.match(
        refreshedMessage.preview.lastRestartReason ?? "",
        /Refresh requested/i,
      );
      await assert.doesNotReject(
        readFile(path.join(targetDirectory, "package.json"), "utf8"),
      );

      socket.close();

      return {
        previewUrl,
        refreshReason: refreshedMessage.preview.lastRestartReason ?? "",
      };
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(targetDirectory, { recursive: true, force: true });
  }
}

async function runUnavailableScenario(): Promise<UnavailableScenarioResult> {
  const targetDirectory = path.resolve(
    process.cwd(),
    "../test-targets/tic-tac-toe",
  );
  const discovery = await discoverTarget(targetDirectory);
  const sessionState = createSessionState({
    sessionId: "phase5-preview-unavailable",
    targetDirectory,
    discovery,
  });
  const runtime = await startUiRuntimeServer({
    sessionState,
    host: "127.0.0.1",
    port: 0,
    projectRules: "",
    projectRulesLoaded: true,
  });

  try {
    const socket = new WebSocket(runtime.socketUrl);
    const initialStatePromise = waitForSocketMessage(
      socket,
      (message) => message.type === "session:state",
    );

    await waitForSocketOpen(socket);
    const initialState = await initialStatePromise;
    assert.equal(initialState.type, "session:state");
    assert.equal(
      initialState.workbenchState.previewState.status,
      "unavailable",
    );

    socket.close();

    return {
      reason: initialState.workbenchState.previewState.lastRestartReason ?? "",
    };
  } finally {
    await runtime.close();
  }
}

async function main(): Promise<void> {
  const previewable = await runPreviewableScenario();
  const unavailable = await runUnavailableScenario();

  console.log("[phase5-preview] previewable target");
  console.log(`  preview url: ${previewable.previewUrl}`);
  console.log(`  refresh: ${previewable.refreshReason}`);
  console.log("[phase5-preview] unavailable target");
  console.log(`  reason: ${unavailable.reason}`);
  console.log("[phase5-preview] verification passed.");
}

void main().catch((error) => {
  console.error(
    `[phase5-preview] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
