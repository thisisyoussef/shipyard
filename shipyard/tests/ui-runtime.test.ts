import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { discoverTarget } from "../src/context/discovery.js";
import { createSessionState } from "../src/engine/state.js";
import { formatUiStartupLines, parseArgs } from "../src/bin/shipyard.js";
import type { BackendToFrontendMessage } from "../src/ui/contracts.js";
import { startUiRuntimeServer } from "../src/ui/server.js";

const createdDirectories: string[] = [];
const socketMessageBuffers = new WeakMap<WebSocket, BackendToFrontendMessage[]>();
const trackedSockets = new WeakSet<WebSocket>();

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
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
      sessionId: undefined,
      ui: true,
    });
  });

  it("UI startup surfaces the browser URL and current connection state", () => {
    const lines = formatUiStartupLines({
      url: "http://127.0.0.1:3210",
      socketUrl: "ws://127.0.0.1:3210/ws",
      sessionId: "ui-session",
      connectionState: "ready",
    });

    expect(lines.join("\n")).toContain("http://127.0.0.1:3210");
    expect(lines.join("\n")).toContain("ws://127.0.0.1:3210/ws");
    expect(lines.join("\n")).toContain("ui-session");
    expect(lines.join("\n")).toContain("ready");
  });

  it("streams ordered tool activity and reconnects with the current session snapshot", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-runtime-");
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "ui-bridge-target" }, null, 2),
      "utf8",
    );
    const discovery = await discoverTarget(targetDirectory);
    const sessionState = createSessionState({
      sessionId: "ui-session",
      targetDirectory,
      discovery,
    });
    const runtime = await startUiRuntimeServer({
      sessionState,
      host: "127.0.0.1",
      port: 0,
      projectRules: "Always inspect the file before editing it.",
      projectRulesLoaded: true,
    });

    try {
      const healthResponse = await fetch(`${runtime.url}/api/health`);
      expect(healthResponse.ok).toBe(true);

      const healthJson = await healthResponse.json();
      expect(healthJson).toMatchObject({
        ok: true,
        runtimeMode: "ui",
        sessionId: "ui-session",
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
            text: "inspect package.json",
            injectedContext: ["Use the current scripts as the source of truth."],
          }),
        );

        const turnMessages = await turnMessagesPromise;
        expect(turnMessages.map((message) => message.type)).toEqual([
          "session:state",
          "agent:thinking",
          "agent:tool_call",
          "agent:tool_result",
          "agent:tool_call",
          "agent:tool_result",
          "agent:text",
          "agent:done",
          "session:state",
        ]);

        const toolCalls = turnMessages.filter((message) => message.type === "agent:tool_call");
        const toolResults = turnMessages.filter((message) => message.type === "agent:tool_result");
        expect(toolCalls).toHaveLength(2);
        expect(toolResults).toHaveLength(2);
        expect(toolCalls[0]).toMatchObject({
          type: "agent:tool_call",
          toolName: "read_file",
          summary: "path: package.json",
        });
        expect(toolCalls[1]).toMatchObject({
          type: "agent:tool_call",
          toolName: "list_files",
        });
        expect(toolResults[0]).toMatchObject({
          type: "agent:tool_result",
          toolName: "read_file",
          success: true,
        });
        expect(toolResults[1]).toMatchObject({
          type: "agent:tool_result",
          toolName: "list_files",
          success: true,
        });
        expect(toolResults[0]?.callId).toBe(toolCalls[0]?.callId);
        expect(toolResults[1]?.callId).toBe(toolCalls[1]?.callId);

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
                instruction: "inspect package.json",
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
        expect(errorSequence.map((message) => message.type)).toEqual([
          "session:state",
          "agent:thinking",
          "agent:tool_call",
          "agent:tool_result",
          "agent:text",
          "agent:error",
          "agent:done",
          "session:state",
        ]);
        expect(errorSequence[2]).toMatchObject({
          type: "agent:tool_call",
          toolName: "read_file",
        });
        expect(errorSequence[3]).toMatchObject({
          type: "agent:tool_result",
          toolName: "read_file",
          success: false,
        });
        expect(errorSequence[4]).toMatchObject({
          type: "agent:text",
          text: "Turn 1 stopped: File not found: missing.ts",
        });
        expect(errorSequence[5]).toMatchObject({
          type: "agent:error",
          message: "File not found: missing.ts",
        });
        expect(errorSequence[6]).toMatchObject({
          type: "agent:done",
          status: "error",
          summary: "File not found: missing.ts",
        });

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
            "Invalid client message type: bogus. Expected instruction, cancel, or status.",
        });
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  }, 20_000);
});
