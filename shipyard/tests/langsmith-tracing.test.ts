import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureLangSmithTracingEnabled,
  getLangSmithConfig,
  resolveLangSmithTraceReference,
  runWithLangSmithTrace,
} from "../src/tracing/langsmith.js";

describe("LangSmith tracing helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recognizes the required LangSmith environment variables", () => {
    const config = getLangSmithConfig({
      LANGCHAIN_TRACING_V2: "true",
      LANGCHAIN_API_KEY: "lsv2_test_123",
      LANGCHAIN_PROJECT: "shipyard",
      LANGCHAIN_ENDPOINT: "https://api.smith.langchain.com",
      LANGCHAIN_WORKSPACE_ID: "workspace-123",
    });

    expect(config.enabled).toBe(true);
    expect(config.project).toBe("shipyard");
    expect(config.endpoint).toBe("https://api.smith.langchain.com");
    expect(config.apiKey).toBe("lsv2_test_123");
    expect(config.workspaceId).toBe("workspace-123");
  });

  it("throws guidance when LangSmith tracing is not fully configured", () => {
    expect(() =>
      ensureLangSmithTracingEnabled({
        LANGCHAIN_TRACING_V2: "true",
        LANGCHAIN_PROJECT: "shipyard",
      })).toThrow(/LangSmith tracing is not fully configured/i);
  });

  it("skips trace capture and still executes when tracing is disabled", async () => {
    const fn = vi.fn(async (value: string) => `handled:${value}`);
    const result = await runWithLangSmithTrace({
      name: "shipyard.test.disabled",
      env: {},
      fn,
      args: ["input"],
    });

    expect(fn).toHaveBeenCalledWith("input");
    expect(result.result).toBe("handled:input");
    expect(result.trace).toBeNull();
  });

  it("merges result-derived metadata before the trace is finalized", async () => {
    const previousLangSmithTracing = process.env.LANGSMITH_TRACING;
    const previousLangChainTracing = process.env.LANGCHAIN_TRACING_V2;
    const previousLangSmithApiKey = process.env.LANGSMITH_API_KEY;
    const previousLangSmithProject = process.env.LANGSMITH_PROJECT;
    const createRun = vi.fn(async (_payload: Record<string, unknown>) => undefined);
    const updateRun = vi.fn(
      async (_id: string, _payload: Record<string, unknown>) => undefined,
    );
    const client = {
      createRun,
      updateRun,
      awaitPendingTraceBatches: vi.fn(async () => undefined),
      getRunUrl: vi.fn(async ({ runId }: { runId?: string }) =>
        `https://smith.langchain.com/runs/${runId ?? "missing"}`),
      getProjectUrl: vi.fn(async ({ projectName }: { projectName?: string }) =>
        `https://smith.langchain.com/projects/${projectName ?? "missing"}`),
    };

    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGSMITH_API_KEY = "lsv2_test_123";
    process.env.LANGSMITH_PROJECT = "shipyard";

    try {
      const traced = await runWithLangSmithTrace({
        name: "shipyard.test.metadata",
        env: {
          LANGSMITH_TRACING: "true",
          LANGSMITH_API_KEY: "lsv2_test_123",
          LANGSMITH_PROJECT: "shipyard",
        },
        client: client as never,
        metadata: {
          selectedPath: "lightweight",
          usedBrowserEvaluator: false,
        },
        getResultMetadata: (result: {
          selectedPath: string;
          usedBrowserEvaluator: boolean;
          handoffReason: string | null;
        }) => ({
          selectedPath: result.selectedPath,
          usedBrowserEvaluator: result.usedBrowserEvaluator,
          handoffReason: result.handoffReason,
        }),
        fn: async () => ({
          selectedPath: "planner-backed",
          usedBrowserEvaluator: true,
          handoffReason: "iteration-threshold",
        }),
        args: [],
      });

      expect(traced.result).toEqual({
        selectedPath: "planner-backed",
        usedBrowserEvaluator: true,
        handoffReason: "iteration-threshold",
      });
      expect(createRun).toHaveBeenCalledTimes(1);
      expect(updateRun).toHaveBeenCalledTimes(1);
      expect(updateRun.mock.calls[0]?.[1]).toMatchObject({
        extra: {
          metadata: {
            selectedPath: "planner-backed",
            usedBrowserEvaluator: true,
            handoffReason: "iteration-threshold",
          },
        },
      });
      expect(traced.trace?.runId).toBeTruthy();
    } finally {
      if (previousLangSmithTracing === undefined) {
        delete process.env.LANGSMITH_TRACING;
      } else {
        process.env.LANGSMITH_TRACING = previousLangSmithTracing;
      }

      if (previousLangChainTracing === undefined) {
        delete process.env.LANGCHAIN_TRACING_V2;
      } else {
        process.env.LANGCHAIN_TRACING_V2 = previousLangChainTracing;
      }

      if (previousLangSmithApiKey === undefined) {
        delete process.env.LANGSMITH_API_KEY;
      } else {
        process.env.LANGSMITH_API_KEY = previousLangSmithApiKey;
      }

      if (previousLangSmithProject === undefined) {
        delete process.env.LANGSMITH_PROJECT;
      } else {
        process.env.LANGSMITH_PROJECT = previousLangSmithProject;
      }
    }
  });

  it("resolves trace and project URLs from the LangSmith client", async () => {
    const client = {
      getRunUrl: vi.fn(async ({ runId }: { runId?: string }) =>
        `https://smith.langchain.com/runs/${runId ?? "missing"}`),
      getProjectUrl: vi.fn(async ({ projectName }: { projectName?: string }) =>
        `https://smith.langchain.com/projects/${projectName ?? "missing"}`),
    };

    const trace = await resolveLangSmithTraceReference(
      client as never,
      "shipyard",
      "run-123",
    );

    expect(trace).toEqual({
      projectName: "shipyard",
      runId: "run-123",
      traceUrl: "https://smith.langchain.com/runs/run-123",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    });
    expect(client.getRunUrl).toHaveBeenCalledWith({
      runId: "run-123",
    });
    expect(client.getProjectUrl).toHaveBeenCalledWith({
      projectName: "shipyard",
    });
  });

  it("retries transient run-url misses before surfacing the trace reference", async () => {
    vi.useFakeTimers();

    try {
      const client = {
        getRunUrl: vi.fn()
          .mockRejectedValueOnce(
            new Error("Received status [404]: Not Found. Message: {\"detail\":\"Run not found\"}"),
          )
          .mockRejectedValueOnce(
            new Error("Received status [404]: Not Found. Message: {\"detail\":\"Run not found\"}"),
          )
          .mockResolvedValue("https://smith.langchain.com/runs/run-123"),
        getProjectUrl: vi.fn(async ({ projectName }: { projectName?: string }) =>
          `https://smith.langchain.com/projects/${projectName ?? "missing"}`),
      };

      const tracePromise = resolveLangSmithTraceReference(
        client as never,
        "shipyard",
        "run-123",
      );

      await vi.advanceTimersByTimeAsync(10_000);

      await expect(tracePromise).resolves.toEqual({
        projectName: "shipyard",
        runId: "run-123",
        traceUrl: "https://smith.langchain.com/runs/run-123",
        projectUrl: "https://smith.langchain.com/projects/shipyard",
      });
      expect(client.getRunUrl).toHaveBeenCalledTimes(3);
      expect(client.getProjectUrl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it(
    "falls back to a partial trace reference when the run URL is not available yet",
    async () => {
      const client = {
        getRunUrl: vi.fn(async () => {
          throw new Error("Failed to fetch /runs/run-123. Received status [404]: Not Found.");
        }),
        getProjectUrl: vi.fn(async ({ projectName }: { projectName?: string }) =>
          `https://smith.langchain.com/projects/${projectName ?? "missing"}`),
      };

      await expect(
        resolveLangSmithTraceReference(
          client as never,
          "shipyard",
          "run-123",
        ),
      ).resolves.toEqual({
        projectName: "shipyard",
        runId: "run-123",
        traceUrl: null,
        projectUrl: "https://smith.langchain.com/projects/shipyard",
      });
      expect(client.getRunUrl).toHaveBeenCalledTimes(6);
      expect(client.getProjectUrl).toHaveBeenCalledWith({
        projectName: "shipyard",
      });
    },
    15_000,
  );

  it("can use a one-shot lookup policy for tiny direct-edit traces", async () => {
    const client = {
      getRunUrl: vi.fn(async () => {
        throw new Error("Failed to fetch /runs/run-123. Received status [404]: Not Found.");
      }),
      getProjectUrl: vi.fn(async ({ projectName }: { projectName?: string }) =>
        `https://smith.langchain.com/projects/${projectName ?? "missing"}`),
    };

    await expect(
      resolveLangSmithTraceReference(
        client as never,
        "shipyard",
        "run-123",
        {
          maxAttempts: 1,
          delayMs: 0,
        },
      ),
    ).resolves.toEqual({
      projectName: "shipyard",
      runId: "run-123",
      traceUrl: null,
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    });
    expect(client.getRunUrl).toHaveBeenCalledTimes(1);
    expect(client.getProjectUrl).toHaveBeenCalledWith({
      projectName: "shipyard",
    });
  });
});
