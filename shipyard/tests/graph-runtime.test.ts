import { describe, expect, it, vi } from "vitest";

import type { ContextEnvelope } from "../src/engine/state.js";
import {
  createAgentGraphState,
  createAgentRuntimeGraph,
  routeAfterAct,
  routeAfterVerify,
  runAgentRuntime,
  runFallbackRuntime,
} from "../src/engine/graph.js";
import { createCodePhase } from "../src/phases/code/index.js";

function createContextEnvelope(): ContextEnvelope {
  return {
    stable: {
      discovery: {
        isGreenfield: false,
        language: "TypeScript",
        framework: "React",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
        },
        hasReadme: true,
        hasAgentsMd: true,
        topLevelFiles: ["package.json"],
        topLevelDirectories: ["src"],
        projectName: "shipyard",
      },
      projectRules: "",
      availableScripts: {
        test: "vitest run",
      },
    },
    task: {
      currentInstruction: "Inspect src/app.ts",
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
    },
  };
}

function createInitialState() {
  return createAgentGraphState({
    instruction: "Inspect src/app.ts",
    contextEnvelope: createContextEnvelope(),
    targetDirectory: "/tmp/shipyard-graph",
    phaseConfig: createCodePhase(),
  });
}

describe("Phase 4 graph runtime contract", () => {
  it("graph state can represent retries, blocked files, last edited file, and final result", () => {
    const state = createAgentGraphState({
      instruction: "Fix src/app.ts",
      contextEnvelope: createContextEnvelope(),
      targetDirectory: "/tmp/shipyard-graph",
      phaseConfig: createCodePhase(),
      retryCountsByFile: {
        "src/app.ts": 2,
      },
      blockedFiles: ["src/app.ts"],
      lastEditedFile: "src/app.ts",
      finalResult: "Blocked after repeated failures.",
      status: "failed",
    });

    expect(state.retryCountsByFile["src/app.ts"]).toBe(2);
    expect(state.blockedFiles).toEqual(["src/app.ts"]);
    expect(state.lastEditedFile).toBe("src/app.ts");
    expect(state.finalResult).toBe("Blocked after repeated failures.");
    expect(state.status).toBe("failed");
  });

  it("status helpers route act to verify when an edit occurred", () => {
    expect(routeAfterAct({ status: "verifying" })).toBe("verify");
  });

  it("status helpers route verify failure to recover", () => {
    expect(routeAfterVerify({ status: "recovering" })).toBe("recover");
  });

  it("act node fails clearly after 25 tool-loop iterations", async () => {
    const graph = createAgentRuntimeGraph({
      dependencies: {
        runActingLoop: vi.fn(async () => {
          throw new Error(
            "Raw Claude loop exceeded 25 iterations without reaching a final response.",
          );
        }),
      },
    });

    const finalState = await graph.invoke(createInitialState());

    expect(finalState.status).toBe("failed");
    expect(finalState.actingIterations).toBe(25);
    expect(finalState.finalResult).toMatch(/exceeded 25 iterations/i);
  });

  it("fallback runtime preserves retry and blocked-file semantics", async () => {
    const runActingLoop = vi.fn(async () => ({
      finalText: "Applied a fix.",
      messageHistory: [],
      iterations: 1,
      didEdit: true,
      lastEditedFile: "src/app.ts",
    }));
    const verifyState = vi.fn(async () => ({
      command: "pnpm test",
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "tests failed",
      summary: "Verification failed.",
    }));

    const finalState = await runFallbackRuntime(createInitialState(), {
      maxRecoveriesPerFile: 2,
      dependencies: {
        runActingLoop,
        verifyState,
      },
    });

    expect(runActingLoop).toHaveBeenCalledTimes(2);
    expect(verifyState).toHaveBeenCalledTimes(2);
    expect(finalState.fallbackMode).toBe(true);
    expect(finalState.retryCountsByFile).toEqual({
      "src/app.ts": 2,
    });
    expect(finalState.blockedFiles).toEqual(["src/app.ts"]);
    expect(finalState.status).toBe("failed");
    expect(finalState.finalResult).toMatch(/Blocked src\/app\.ts after 2 failed verification attempts\./);
  });

  it("graph runtime follows plan to act to respond when no edit occurs", async () => {
    const finalState = await runAgentRuntime(createInitialState(), {
      dependencies: {
        runActingLoop: async () => ({
          finalText: "Inspection complete without edits.",
          messageHistory: [],
          iterations: 1,
          didEdit: false,
          lastEditedFile: null,
        }),
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.finalResult).toBe("Inspection complete without edits.");
    expect(finalState.fallbackMode).toBe(false);
  });
});
