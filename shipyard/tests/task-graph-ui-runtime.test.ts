import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { saveArtifact } from "../src/artifacts/registry/index.js";
import { createSessionState } from "../src/engine/state.js";
import { buildBacklogArtifact } from "../src/pipeline/planning-artifacts.js";
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
      messages.push(JSON.parse(rawMessage.toString()) as BackendToFrontendMessage);
    });
  }

  return messages;
}

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("open", onOpen);
      socket.off("error", onError);
    };

    socket.on("open", onOpen);
    socket.on("error", onError);
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

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("task graph ui runtime", () => {
  it("publishes task board projection snapshots without requiring a rendered board ui", async () => {
    const targetDirectory = await createTempDirectory("shipyard-task-graph-ui-");
    const now = "2026-03-28T18:45:00.000Z";

    await mkdir(targetDirectory, { recursive: true });
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "task-graph-ui" }, null, 2),
      "utf8",
    );

    const storyArtifact = await saveArtifact(targetDirectory, {
      type: "user-story-artifact",
      id: "ui-task-graph-stories",
      status: "approved",
      producedBy: "pm",
      producedAt: now,
      approvedAt: now,
      approvedBy: "user",
      contentKind: "json",
      content: {
        title: "Stories",
        summary: "UI runtime stories.",
        stories: [
          {
            id: "STORY-UI-001",
            epicId: "EPIC-UI",
            title: "Publish task board state",
            userStory:
              "As an operator, I want a board snapshot so that future UI can render it.",
            acceptanceCriteria: ["Board projection is published."],
            edgeCases: [],
            dependencies: [],
            estimatedComplexity: "Medium",
            priority: 1,
          },
        ],
      },
    });

    const specArtifact = await saveArtifact(targetDirectory, {
      type: "technical-spec-artifact",
      id: "ui-task-graph-specs",
      status: "approved",
      producedBy: "pm",
      producedAt: now,
      approvedAt: now,
      approvedBy: "user",
      contentKind: "json",
      content: {
        title: "Specs",
        summary: "UI runtime specs.",
        specs: [
          {
            id: "SPEC-UI-001",
            storyId: "STORY-UI-001",
            title: "Task board publication spec",
            overview: "Publish the task board to the UI runtime.",
            dataModel: [],
            apiContract: [],
            componentStructure: [],
            stateManagement: "Use the workbench snapshot.",
            errorHandling: [],
            testExpectations: ["Wait for tasks:state over websocket."],
            implementationOrder: ["sync", "publish"],
            designReferences: [],
          },
        ],
      },
    });

    await saveArtifact(targetDirectory, {
      type: "backlog-artifact",
      id: "ui-task-graph-backlog",
      status: "approved",
      producedBy: "pm",
      producedAt: now,
      approvedAt: now,
      approvedBy: "user",
      contentKind: "json",
      content: buildBacklogArtifact([storyArtifact, specArtifact]) as unknown as import("../src/artifacts/types.js").ArtifactContent,
    });

    const runtime = await startUiRuntimeServer({
      sessionState: createSessionState({
        sessionId: "ui-task-graph-session",
        targetDirectory,
        discovery: {
          isGreenfield: false,
          language: "TypeScript",
          framework: "React",
          packageManager: "pnpm",
          scripts: {},
          hasReadme: false,
          hasAgentsMd: false,
          topLevelFiles: ["package.json"],
          topLevelDirectories: [],
          projectName: "task-graph-ui",
          previewCapability: {
            status: "unavailable",
            kind: null,
            runner: null,
            scriptName: null,
            command: null,
            reason: "No preview configured.",
            autoRefresh: "none",
          },
        },
      }),
      host: "127.0.0.1",
      port: 0,
      projectRules: "",
      projectRulesLoaded: false,
      runtimeMode: "fallback",
    });

    try {
      const socket = new WebSocket(runtime.socketUrl);

      try {
        await waitForSocketOpen(socket);

        const sessionStatePromise = waitForSocketMessage(
          socket,
          (message) =>
            message.type === "session:state" &&
            message.workbenchState.taskBoard !== null,
        );
        const taskBoardPromise = waitForSocketMessage(
          socket,
          (message) => message.type === "tasks:state",
        );

        const [sessionState, taskBoard] = await Promise.all([
          sessionStatePromise,
          taskBoardPromise,
        ]);

        expect(sessionState).toMatchObject({
          type: "session:state",
        });
        if (sessionState.type !== "session:state") {
          throw new Error("Expected a session:state message.");
        }
        expect(sessionState.workbenchState.taskBoard).toMatchObject({
          columns: expect.arrayContaining([
            expect.objectContaining({
              id: "ready",
              cards: [
                expect.objectContaining({
                  storyId: "STORY-UI-001",
                  sourceControl: expect.objectContaining({
                    degraded: true,
                  }),
                }),
              ],
            }),
          ]),
        });

        expect(taskBoard).toMatchObject({
          type: "tasks:state",
          state: expect.objectContaining({
            columns: expect.arrayContaining([
              expect.objectContaining({
                id: "ready",
              }),
            ]),
          }),
        });
      } finally {
        socket.close();
      }
    } finally {
      await runtime.close();
    }
  });
});
