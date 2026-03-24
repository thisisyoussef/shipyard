import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { discoverTarget } from "../src/context/discovery.js";
import { createSessionState } from "../src/engine/state.js";
import { parseArgs } from "../src/bin/shipyard.js";
import type { BackendToFrontendMessage } from "../src/ui/contracts.js";
import { startUiRuntimeServer } from "../src/ui/server.js";

const createdDirectories: string[] = [];

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
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for the expected WebSocket message."));
    }, timeoutMs);

    const onMessage = (rawMessage: WebSocket.RawData) => {
      const parsed = JSON.parse(rawMessage.toString()) as BackendToFrontendMessage;

      if (!predicate(parsed)) {
        return;
      }

      clearTimeout(timeoutHandle);
      socket.off("message", onMessage);
      resolve(parsed);
    };

    socket.on("message", onMessage);
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

  it("boots a local UI server and rejects invalid websocket messages clearly", async () => {
    const targetDirectory = await createTempDirectory("shipyard-ui-runtime-");
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
      projectRulesLoaded: false,
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
        await new Promise<void>((resolve, reject) => {
          const timeoutHandle = setTimeout(() => {
            reject(new Error("Timed out waiting for the websocket connection."));
          }, 5_000);

          socket.once("open", () => {
            clearTimeout(timeoutHandle);
            resolve();
          });
        });

        const initialState = await initialStatePromise;
        expect(initialState).toMatchObject({
          type: "session:state",
          runtimeMode: "ui",
          sessionId: "ui-session",
        });

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
  });
});
