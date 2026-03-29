import { describe, expect, it } from "vitest";

import { createSessionState } from "../src/engine/state.js";
import {
  parseFrontendMessage,
  serializeBackendMessage,
} from "../src/ui/contracts.js";
import {
  createSessionStateMessage,
  createUiInstructionReporter,
} from "../src/ui/events.js";
import type { BackendToFrontendMessage } from "../src/ui/contracts.js";

describe("ui event helpers", () => {
  it("serializes full session snapshots for the browser bridge", () => {
    const sessionState = createSessionState({
      sessionId: "session-123",
      targetDirectory: "/tmp/shipyard-demo",
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
        topLevelFiles: ["package.json", "tsconfig.json"],
        topLevelDirectories: ["src"],
        projectName: "shipyard-demo",
      },
    });

    const message = createSessionStateMessage({
      sessionState,
      connectionState: "agent-busy",
      projectRulesLoaded: true,
      workspaceDirectory: "/tmp/shipyard-workspace",
      sessionHistory: [
        {
          sessionId: "session-123",
          targetLabel: "shipyard-demo",
          targetDirectory: "/tmp/shipyard-demo",
          activePhase: "code",
          startedAt: "2026-03-24T12:00:00.000Z",
          lastActiveAt: "2026-03-24T12:05:00.000Z",
          turnCount: 1,
          latestInstruction: "inspect package.json",
          latestSummary: "Read the package manifest.",
          latestStatus: "success",
          isCurrent: true,
        },
      ],
    });

    expect(message).toMatchObject({
      type: "session:state",
      connectionState: "agent-busy",
      sessionId: "session-123",
      targetLabel: "shipyard-demo",
      targetDirectory: "/tmp/shipyard-demo",
      workspaceDirectory: "/tmp/shipyard-workspace",
      discoverySummary: "typescript (React) via pnpm",
      projectRulesLoaded: true,
      sessionHistory: [
        {
          sessionId: "session-123",
          latestInstruction: "inspect package.json",
          latestStatus: "success",
          isCurrent: true,
        },
      ],
      discovery: {
        projectName: "shipyard-demo",
        framework: "React",
      },
    });
  });

  it("emits typed tool, edit, and done messages through the reporter", async () => {
    const sessionState = createSessionState({
      sessionId: "session-456",
      targetDirectory: "/tmp/shipyard-ui",
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
    const messages: BackendToFrontendMessage[] = [];
    const reporter = createUiInstructionReporter({
      send(message) {
        messages.push(message);
      },
      projectRulesLoaded: false,
      workspaceDirectory: "/tmp/shipyard-workspace",
      sessionHistory: [],
    });

    await reporter.onTurnState?.({
      sessionState,
      connectionState: "agent-busy",
    });
    await reporter.onToolCall?.({
      callId: "call-read",
      toolName: "read_file",
      summary: "path: package.json",
    });
    await reporter.onToolResult?.({
      callId: "call-read",
      toolName: "read_file",
      success: true,
      summary: "Read package.json (12 lines, hash abcd1234).",
      detail: [
        "Read package.json",
        "Lines: 12",
        "Hash: abcd1234",
      ].join("\n"),
    });
    await reporter.onEdit?.({
      path: "src/app.ts",
      summary: "Applied targeted edit to src/app.ts",
      diff: "@@ -1,1 +1,1 @@\n-console.log('before')\n+console.log('after')",
      beforePreview: "console.log('before')",
      afterPreview: "console.log('after')",
      addedLines: 1,
      removedLines: 1,
    });
    await reporter.onDone?.({
      status: "success",
      summary: "Turn finished.",
      langSmithTrace: {
        projectName: "shipyard",
        runId: "run-123",
        traceUrl: "https://smith.langchain.com/runs/run-123",
        projectUrl: "https://smith.langchain.com/projects/shipyard",
      },
    });

    expect(messages).toMatchObject([
      {
        type: "session:state",
        connectionState: "agent-busy",
      },
      {
        type: "agent:tool_call",
        callId: "call-read",
        toolName: "read_file",
        summary: "path: package.json",
      },
      {
        type: "agent:tool_result",
        callId: "call-read",
        toolName: "read_file",
        success: true,
        detail: "Read package.json\nLines: 12\nHash: abcd1234",
      },
      {
        type: "agent:edit",
        path: "src/app.ts",
        summary: "Applied targeted edit to src/app.ts",
        diff: "@@ -1,1 +1,1 @@\n-console.log('before')\n+console.log('after')",
        beforePreview: "console.log('before')",
        afterPreview: "console.log('after')",
        addedLines: 1,
        removedLines: 1,
      },
      {
        type: "agent:done",
        status: "success",
        summary: "Turn finished.",
        langSmithTrace: {
          projectName: "shipyard",
          runId: "run-123",
          traceUrl: "https://smith.langchain.com/runs/run-123",
          projectUrl: "https://smith.langchain.com/projects/shipyard",
        },
      },
    ]);
  });

  it("validates the target manager websocket contracts", () => {
    expect(
      parseFrontendMessage(
        JSON.stringify({
          type: "session:resume_request",
          sessionId: "session-previous",
        }),
      ),
    ).toEqual({
      type: "session:resume_request",
      sessionId: "session-previous",
    });

    expect(
      parseFrontendMessage(
        JSON.stringify({
          type: "target:switch_request",
          targetPath: "/tmp/demo-target",
          requestId: "request-switch-1",
        }),
      ),
    ).toEqual({
      type: "target:switch_request",
      targetPath: "/tmp/demo-target",
      requestId: "request-switch-1",
    });

    expect(
      parseFrontendMessage(
        JSON.stringify({
          type: "target:create_request",
          name: "alpha app",
          description: "Create a demo target.",
          scaffoldType: "react-ts",
          requestId: "request-create-1",
        }),
      ),
    ).toEqual({
      type: "target:create_request",
      name: "alpha app",
      description: "Create a demo target.",
      scaffoldType: "react-ts",
      requestId: "request-create-1",
    });

    expect(
      parseFrontendMessage(
        JSON.stringify({
          type: "deploy:request",
        }),
      ),
    ).toEqual({
      type: "deploy:request",
      platform: "vercel",
    });

    expect(() =>
      parseFrontendMessage(
        JSON.stringify({
          type: "target:create_request",
          name: "",
          description: "invalid",
        }),
      ),
    ).toThrow('Invalid client message payload for "target:create_request".');

    const serialized = serializeBackendMessage({
      type: "target:state",
      state: {
        currentTarget: {
          path: "/tmp/demo-target",
          name: "demo-target",
          description: "Demo target summary.",
          language: "typescript",
          framework: "React",
          hasProfile: true,
        },
        availableTargets: [],
        enrichmentStatus: {
          status: "complete",
          message: "Target profile saved.",
        },
      },
    });

    expect(JSON.parse(serialized)).toMatchObject({
      type: "target:state",
      state: {
        currentTarget: {
          name: "demo-target",
          hasProfile: true,
        },
        enrichmentStatus: {
          status: "complete",
        },
      },
    });

    expect(
      JSON.parse(
        serializeBackendMessage({
          type: "target:switch_complete",
          success: true,
          message: "Created and selected demo-target.",
          requestId: "request-create-1",
          projectId: "project-demo",
          state: {
            currentTarget: {
              path: "/tmp/demo-target",
              name: "demo-target",
              description: "Demo target summary.",
              language: "typescript",
              framework: "React",
              hasProfile: true,
            },
            availableTargets: [],
            enrichmentStatus: {
              status: "complete",
              message: "Target profile saved.",
            },
          },
        }),
      ),
    ).toMatchObject({
      type: "target:switch_complete",
      requestId: "request-create-1",
      projectId: "project-demo",
      success: true,
    });
  });
});
