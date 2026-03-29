import {
  hasUiHealthRuntimeDetails,
  type UiHealthResponse,
} from "../ui/health.js";

export interface MissionThresholds {
  missingHealthGraceMs: number;
  minimumRestartGapMs: number;
  busyStallMs: number;
  softMemoryLimitMb: number;
  hardMemoryLimitMb: number;
}

export interface MissionObservation {
  nowMs: number;
  lastHealthyAtMs: number | null;
  lastRuntimeRestartAtMs: number | null;
  previousRuntimeLastActiveAt: string | null;
  health: UiHealthResponse | null;
  thresholds: MissionThresholds;
}

export interface MissionDecision {
  restartRuntime: boolean;
  restartReason: string | null;
  ensureUltimate: boolean;
}

export const DEFAULT_MISSION_THRESHOLDS: MissionThresholds = {
  missingHealthGraceMs: 45_000,
  minimumRestartGapMs: 30_000,
  busyStallMs: 20 * 60_000,
  softMemoryLimitMb: 1_024,
  hardMemoryLimitMb: 1_536,
};

export function bytesToMegabytes(bytes: number): number {
  return bytes / (1024 * 1024);
}

function restartGapActive(observation: MissionObservation): boolean {
  return (
    observation.lastRuntimeRestartAtMs !== null &&
    observation.nowMs - observation.lastRuntimeRestartAtMs <
      observation.thresholds.minimumRestartGapMs
  );
}

export function decideMissionAction(
  observation: MissionObservation,
): MissionDecision {
  if (
    observation.health === null ||
    !hasUiHealthRuntimeDetails(observation.health)
  ) {
    const healthExpired =
      observation.lastHealthyAtMs !== null &&
      observation.nowMs - observation.lastHealthyAtMs >=
        observation.thresholds.missingHealthGraceMs;

    return {
      restartRuntime: healthExpired && !restartGapActive(observation),
      restartReason: healthExpired
        ? "UI health telemetry has been unavailable beyond the grace window."
        : null,
      ensureUltimate: false,
    };
  }

  const runtime = observation.health.runtime;
  const rssMb = bytesToMegabytes(runtime.memoryUsage.rssBytes);

  if (rssMb >= observation.thresholds.hardMemoryLimitMb) {
    return {
      restartRuntime: true,
      restartReason:
        `Runtime RSS ${rssMb.toFixed(0)} MB exceeded the hard limit ` +
        `${String(observation.thresholds.hardMemoryLimitMb)} MB.`,
      ensureUltimate: false,
    };
  }

  if (!restartGapActive(observation)) {
    if (
      rssMb >= observation.thresholds.softMemoryLimitMb &&
      runtime.connectionState !== "agent-busy"
    ) {
      return {
        restartRuntime: true,
        restartReason:
          `Runtime RSS ${rssMb.toFixed(0)} MB exceeded the soft limit ` +
          `${String(observation.thresholds.softMemoryLimitMb)} MB while idle.`,
        ensureUltimate: false,
      };
    }

    if (
      runtime.preview.status === "error" &&
      runtime.connectionState !== "agent-busy"
    ) {
      return {
        restartRuntime: true,
        restartReason:
          "Preview supervision entered an error state while the runtime was idle.",
        ensureUltimate: false,
      };
    }

    if (runtime.connectionState === "error") {
      return {
        restartRuntime: true,
        restartReason:
          "Runtime entered an error state while idle and needs a clean restart.",
        ensureUltimate: false,
      };
    }

    const lastActiveAtMs = Date.parse(runtime.lastActiveAt);
    const sameLastActiveAt =
      observation.previousRuntimeLastActiveAt !== null &&
      observation.previousRuntimeLastActiveAt === runtime.lastActiveAt;

    if (
      runtime.connectionState === "agent-busy" &&
      sameLastActiveAt &&
      Number.isFinite(lastActiveAtMs) &&
      observation.nowMs - lastActiveAtMs >= observation.thresholds.busyStallMs
    ) {
      return {
        restartRuntime: true,
        restartReason:
          "Runtime has remained agent-busy without session activity beyond the stall threshold.",
        ensureUltimate: false,
      };
    }
  }

  return {
    restartRuntime: false,
    restartReason: null,
    ensureUltimate:
      runtime.connectionState === "ready" && !runtime.ultimate.active,
  };
}
