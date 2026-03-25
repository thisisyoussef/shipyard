import type {
  PreviewAutoRefreshMode,
  DiscoveryReport,
  PreviewCapabilityReport,
  PreviewRunner,
  PreviewState,
} from "../artifacts/types.js";

export const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT_PLACEHOLDER = "<port>";
export const STARTER_CANVAS_WAITING_SUMMARY =
  "Starter canvas will appear here while Shipyard prepares the first previewable app.";
export const STARTER_CANVAS_RUNNING_SUMMARY =
  "Starter canvas is ready while Shipyard prepares the first project preview.";

export function createUnavailablePreviewCapability(
  reason: string,
): PreviewCapabilityReport {
  return {
    status: "unavailable",
    kind: null,
    runner: null,
    scriptName: null,
    command: null,
    reason,
    autoRefresh: "none",
  };
}

export function createIdlePreviewState(summary: string): PreviewState {
  return {
    status: "idle",
    summary,
    url: null,
    logTail: [],
    lastRestartReason: null,
  };
}

export function createStarterCanvasIdleState(): PreviewState {
  return createIdlePreviewState(STARTER_CANVAS_WAITING_SUMMARY);
}

export function createPreviewStateFromCapability(
  capability: PreviewCapabilityReport,
): PreviewState {
  if (capability.status === "unavailable") {
    return {
      status: "unavailable",
      summary: "Preview unavailable for this target.",
      url: null,
      logTail: [],
      lastRestartReason: capability.reason,
    };
  }

  return createIdlePreviewState(
    "Preview is available. Shipyard will start it automatically for this browser session.",
  );
}

export function shouldUseStarterCanvasForScratchTarget(options: {
  activePhase: "code" | "target-manager";
  discovery: Pick<
    DiscoveryReport,
    "isGreenfield" | "topLevelFiles" | "previewCapability"
  >;
}): boolean {
  if (options.activePhase !== "code") {
    return false;
  }

  if (options.discovery.previewCapability.status !== "unavailable") {
    return false;
  }

  return (
    options.discovery.isGreenfield ||
    !options.discovery.topLevelFiles.includes("package.json")
  );
}

export function createInitialPreviewState(options: {
  activePhase: "code" | "target-manager";
  discovery: Pick<
    DiscoveryReport,
    "isGreenfield" | "topLevelFiles" | "previewCapability"
  >;
}): PreviewState {
  if (shouldUseStarterCanvasForScratchTarget(options)) {
    return createStarterCanvasIdleState();
  }

  return createPreviewStateFromCapability(options.discovery.previewCapability);
}

export function resolvePreviewRunner(
  packageManager: string | null,
): PreviewRunner {
  if (packageManager === "pnpm") {
    return "pnpm";
  }

  if (packageManager === "yarn") {
    return "yarn";
  }

  if (packageManager === "bun") {
    return "bun";
  }

  return "npm";
}

function formatRunnerCommand(runner: PreviewRunner, scriptName: string): string {
  if (runner === "yarn") {
    return `yarn ${scriptName}`;
  }

  if (runner === "bun") {
    return `bun run ${scriptName}`;
  }

  return `${runner} run ${scriptName}`;
}

export function formatPreviewCommand(
  runner: PreviewRunner,
  scriptName: string,
  options?: {
    host?: string;
    portPlaceholder?: string;
    strictPort?: boolean;
  },
): string {
  const host = options?.host ?? PREVIEW_HOST;
  const portPlaceholder = options?.portPlaceholder ?? PREVIEW_PORT_PLACEHOLDER;
  const strictPortSuffix = options?.strictPort === false ? "" : " --strictPort";

  return `${formatRunnerCommand(runner, scriptName)} -- --host ${host} --port ${portPlaceholder}${strictPortSuffix}`;
}

export function getPreviewRefreshSummary(
  autoRefresh: PreviewAutoRefreshMode,
  reason: string,
): string {
  if (autoRefresh === "native-hmr") {
    return `Refresh requested: ${reason}`;
  }

  if (autoRefresh === "restart") {
    return `Restart requested: ${reason}`;
  }

  return reason;
}
