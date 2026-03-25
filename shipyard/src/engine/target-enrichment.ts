import type { DiscoveryReport, TargetProfile } from "../artifacts/types.js";
import type { EnrichTargetOptions } from "../tools/target-manager/enrich-target.js";

export interface AutomaticEnrichmentPlanInput {
  discovery: DiscoveryReport;
  targetProfile?: TargetProfile;
  creationDescription?: string;
}

export type AutomaticEnrichmentPlan =
  | {
      kind: "skip-existing-profile";
    }
  | {
      kind: "run-now";
      queuedMessage: string;
      userDescription?: string;
    }
  | {
      kind: "needs-description";
      message: string;
    };

export type TargetEnrichmentInvoker = NonNullable<
  EnrichTargetOptions["invokeModel"]
>;

const DEFAULT_QUEUED_MESSAGE = "Analyzing this target in the background.";
const NEEDS_DESCRIPTION_MESSAGE =
  "Not enough context yet to analyze this target.";

function hasProjectContext(discovery: DiscoveryReport): boolean {
  return (
    discovery.topLevelFiles.length > 0 ||
    discovery.topLevelDirectories.length > 0
  );
}

export function hasAutomaticTargetEnrichmentCapability(
  invokeModel?: TargetEnrichmentInvoker,
): boolean {
  return Boolean(invokeModel || process.env.ANTHROPIC_API_KEY?.trim());
}

export function planAutomaticEnrichment(
  input: AutomaticEnrichmentPlanInput,
): AutomaticEnrichmentPlan {
  if (input.targetProfile) {
    return {
      kind: "skip-existing-profile",
    };
  }

  const trimmedDescription = input.creationDescription?.trim() || undefined;

  if (hasProjectContext(input.discovery) || trimmedDescription) {
    return {
      kind: "run-now",
      queuedMessage: DEFAULT_QUEUED_MESSAGE,
      userDescription: trimmedDescription,
    };
  }

  return {
    kind: "needs-description",
    message: NEEDS_DESCRIPTION_MESSAGE,
  };
}
