import type { DiscoveryReport, TargetProfile } from "../artifacts/types.js";
import type { EnrichTargetOptions } from "../tools/target-manager/enrich-target.js";
import {
  TARGET_ENRICHMENT_MODEL_ROUTE,
  type ModelRouteCapability,
  type ModelRoutingConfig,
  createTargetEnrichmentInvokerFromRouting,
  resolveModelRouteCapability,
} from "./model-routing.js";

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

export interface AutomaticTargetEnrichmentCapabilityOptions {
  invokeModel?: TargetEnrichmentInvoker;
  modelRouting: ModelRoutingConfig;
  env?: NodeJS.ProcessEnv;
}

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
  options: AutomaticTargetEnrichmentCapabilityOptions,
): boolean {
  return resolveAutomaticTargetEnrichmentCapability(options).available;
}

export function resolveAutomaticTargetEnrichmentCapability(
  options: AutomaticTargetEnrichmentCapabilityOptions,
): ModelRouteCapability {
  if (options.invokeModel) {
    return {
      routeId: TARGET_ENRICHMENT_MODEL_ROUTE,
      provider: "custom",
      model: null,
      available: true,
      missingEnvironmentVariables: [],
      reason: null,
    };
  }

  return resolveModelRouteCapability({
    routing: options.modelRouting,
    routeId: TARGET_ENRICHMENT_MODEL_ROUTE,
    env: options.env,
    requireAdapter: true,
  });
}

export function getTargetEnrichmentInvoker(
  options: AutomaticTargetEnrichmentCapabilityOptions,
): TargetEnrichmentInvoker {
  return options.invokeModel
    ?? createTargetEnrichmentInvokerFromRouting({
      routing: options.modelRouting,
      env: options.env,
    });
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
