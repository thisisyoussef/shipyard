import { describe, expect, it } from "vitest";

import { createSessionState } from "../src/engine/state.js";
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
    });

    expect(message).toMatchObject({
      type: "session:state",
      connectionState: "agent-busy",
      sessionId: "session-123",
      targetLabel: "shipyard-demo",
      targetDirectory: "/tmp/shipyard-demo",
      discoverySummary: "typescript (React) via pnpm",
      projectRulesLoaded: true,
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
    });
    await reporter.onEdit?.({
      path: "src/app.ts",
      summary: "Current workspace diff preview",
      diff: "@@ -1,1 +1,1 @@\n-console.log('before')\n+console.log('after')",
    });
    await reporter.onDone?.({
      status: "success",
      summary: "Turn finished.",
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
      },
      {
        type: "agent:edit",
        path: "src/app.ts",
        diff: "@@ -1,1 +1,1 @@\n-console.log('before')\n+console.log('after')",
      },
      {
        type: "agent:done",
        status: "success",
        summary: "Turn finished.",
      },
    ]);
  });
});
