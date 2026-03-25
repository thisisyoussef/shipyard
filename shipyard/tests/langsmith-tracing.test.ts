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

  it("falls back to a partial trace reference when the run URL is not available yet", async () => {
    vi.useFakeTimers();

    const client = {
      getRunUrl: vi.fn(async () => {
        throw new Error("Failed to fetch /runs/run-123. Received status [404]: Not Found.");
      }),
      getProjectUrl: vi.fn(async ({ projectName }: { projectName?: string }) =>
        `https://smith.langchain.com/projects/${projectName ?? "missing"}`),
    };

    const tracePromise = resolveLangSmithTraceReference(
      client as never,
      "shipyard",
      "run-123",
    );

    await vi.runAllTimersAsync();

    await expect(tracePromise).resolves.toEqual({
      projectName: "shipyard",
      runId: "run-123",
      traceUrl: null,
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    });
    expect(client.getRunUrl).toHaveBeenCalledTimes(3);
    expect(client.getProjectUrl).toHaveBeenCalledWith({
      projectName: "shipyard",
    });
  });
});
