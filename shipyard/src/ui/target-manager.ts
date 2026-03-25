import path from "node:path";

import type { SessionState } from "../engine/state.js";
import {
  listTargetsTool,
  type TargetListEntry,
} from "../tools/target-manager/list-targets.js";
import type {
  TargetEnrichmentState,
  TargetManagerState,
  TargetSummary,
} from "./contracts.js";

export const IDLE_TARGET_ENRICHMENT_STATE: TargetEnrichmentState = {
  status: "idle",
  message: null,
};

function isNodeError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function createTargetSummaryFromListEntry(
  entry: TargetListEntry,
): TargetSummary {
  return {
    path: entry.path,
    name: entry.name,
    description: entry.profileSummary,
    language: entry.language,
    framework: entry.framework,
    hasProfile: entry.hasProfile,
  };
}

function createCurrentTargetSummary(
  sessionState: SessionState,
): TargetSummary {
  if (sessionState.activePhase === "target-manager") {
    return {
      path: sessionState.targetsDirectory,
      name: "No target selected",
      description: "Select an existing target or create a new scaffold to begin.",
      language: null,
      framework: null,
      hasProfile: false,
    };
  }

  return {
    path: sessionState.targetDirectory,
    name:
      sessionState.discovery.projectName ??
      path.basename(sessionState.targetDirectory) ??
      sessionState.targetDirectory,
    description:
      sessionState.targetProfile?.description ??
      (sessionState.discovery.isGreenfield
        ? "Greenfield target waiting for the first implementation pass."
        : "Project selected. Run enrichment to add an AI-authored summary."),
    language: sessionState.discovery.language,
    framework: sessionState.discovery.framework,
    hasProfile: Boolean(sessionState.targetProfile),
  };
}

async function listAvailableTargetSummaries(
  targetsDirectory: string,
): Promise<TargetSummary[]> {
  try {
    const targets = await listTargetsTool({
      targetsDir: targetsDirectory,
    });

    return targets.map(createTargetSummaryFromListEntry);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function buildTargetManagerState(
  sessionState: SessionState,
  enrichmentStatus: TargetEnrichmentState = IDLE_TARGET_ENRICHMENT_STATE,
): Promise<TargetManagerState> {
  const currentTarget = createCurrentTargetSummary(sessionState);
  const availableTargets = await listAvailableTargetSummaries(
    sessionState.targetsDirectory,
  );
  const nextAvailableTargets =
    sessionState.activePhase === "code" &&
    !availableTargets.some((target) => target.path === currentTarget.path)
      ? [currentTarget, ...availableTargets]
      : availableTargets;

  return {
    currentTarget,
    availableTargets: nextAvailableTargets,
    enrichmentStatus,
  };
}
