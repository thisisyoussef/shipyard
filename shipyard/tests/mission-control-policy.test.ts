import { describe, expect, it } from "vitest";

import { createDefaultHostingWorkbenchState } from "../src/hosting/contracts.js";
import {
  DEFAULT_MISSION_THRESHOLDS,
  decideMissionAction,
} from "../src/mission-control/policy.js";
import type { UiHealthResponse } from "../src/ui/health.js";

function createHealthResponse(
  overrides: Partial<UiHealthResponse> = {},
): UiHealthResponse {
  return {
    ok: true,
    runtimeMode: "ui",
    accessProtected: false,
    sessionId: "session-123",
    targetLabel: "target",
    targetDirectory: "/tmp/target",
    workspaceDirectory: "/tmp/workspace",
    turnCount: 3,
    runtime: {
      pid: 1234,
      uptimeMs: 60_000,
      connectionState: "ready",
      agentStatus: "Ready.",
      latestError: null,
      activeTurnId: null,
      instructionInFlight: false,
      deployInFlight: false,
      memoryUsage: {
        rssBytes: 512 * 1024 * 1024,
        heapTotalBytes: 256 * 1024 * 1024,
        heapUsedBytes: 128 * 1024 * 1024,
        externalBytes: 0,
        arrayBuffersBytes: 0,
      },
      preview: {
        status: "running",
        summary: "Preview healthy.",
        url: "http://127.0.0.1:4173/",
        logTail: [],
        lastRestartReason: null,
      },
      hosting: createDefaultHostingWorkbenchState(),
      ultimate: {
        active: true,
        brief: "Keep going.",
        startedAt: "2026-03-28T00:00:00.000Z",
        pendingHumanFeedback: 0,
        statusText: "Ultimate mode is active.",
      },
      lastActiveAt: "2026-03-28T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("mission control policy", () => {
  it("requests a restart when UI health has been unavailable beyond the grace window", () => {
    const decision = decideMissionAction({
      nowMs: 100_000,
      lastHealthyAtMs: 0,
      lastRuntimeRestartAtMs: null,
      previousRuntimeLastActiveAt: null,
      health: null,
      thresholds: DEFAULT_MISSION_THRESHOLDS,
    });

    expect(decision).toMatchObject({
      restartRuntime: true,
      ensureUltimate: false,
    });
    expect(decision.restartReason).toContain("unavailable");
  });

  it("requests a soft-memory restart only when the runtime is idle", () => {
    const decision = decideMissionAction({
      nowMs: 100_000,
      lastHealthyAtMs: 95_000,
      lastRuntimeRestartAtMs: null,
      previousRuntimeLastActiveAt: null,
      health: createHealthResponse({
        runtime: {
          ...createHealthResponse().runtime!,
          memoryUsage: {
            ...createHealthResponse().runtime!.memoryUsage,
            rssBytes:
              (DEFAULT_MISSION_THRESHOLDS.softMemoryLimitMb + 32) * 1024 * 1024,
          },
        },
      }),
      thresholds: DEFAULT_MISSION_THRESHOLDS,
    });

    expect(decision.restartRuntime).toBe(true);
    expect(decision.restartReason).toContain("soft limit");
  });

  it("requests a restart when the runtime is busy but stalled", () => {
    const health = createHealthResponse({
      runtime: {
        ...createHealthResponse().runtime!,
        connectionState: "agent-busy",
        lastActiveAt: "2026-03-28T00:00:00.000Z",
      },
    });

    const decision = decideMissionAction({
      nowMs: Date.parse("2026-03-28T00:25:00.000Z"),
      lastHealthyAtMs: Date.parse("2026-03-28T00:24:00.000Z"),
      lastRuntimeRestartAtMs: null,
      previousRuntimeLastActiveAt: "2026-03-28T00:00:00.000Z",
      health,
      thresholds: DEFAULT_MISSION_THRESHOLDS,
    });

    expect(decision.restartRuntime).toBe(true);
    expect(decision.restartReason).toContain("stall threshold");
  });

  it("requests an ultimate restart when the runtime is ready but ultimate mode is idle", () => {
    const decision = decideMissionAction({
      nowMs: 100_000,
      lastHealthyAtMs: 95_000,
      lastRuntimeRestartAtMs: null,
      previousRuntimeLastActiveAt: null,
      health: createHealthResponse({
        runtime: {
          ...createHealthResponse().runtime!,
          ultimate: {
            active: false,
            brief: null,
            startedAt: null,
            pendingHumanFeedback: 0,
            statusText: "Ultimate mode is idle.",
          },
        },
      }),
      thresholds: DEFAULT_MISSION_THRESHOLDS,
    });

    expect(decision).toEqual({
      restartRuntime: false,
      restartReason: null,
      ensureUltimate: true,
    });
  });

  it("requests a restart when the runtime is in an idle error state", () => {
    const decision = decideMissionAction({
      nowMs: 100_000,
      lastHealthyAtMs: 95_000,
      lastRuntimeRestartAtMs: null,
      previousRuntimeLastActiveAt: null,
      health: createHealthResponse({
        runtime: {
          ...createHealthResponse().runtime!,
          connectionState: "error",
        },
      }),
      thresholds: DEFAULT_MISSION_THRESHOLDS,
    });

    expect(decision.restartRuntime).toBe(true);
    expect(decision.restartReason).toContain("error state");
  });
});
