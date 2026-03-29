export const DEFAULT_MODEL_PROVIDER = "anthropic";
export const DEFAULT_MODEL_ROUTE = "default" as const;
export const CODE_PHASE_MODEL_ROUTE = "phase:code" as const;
export const TARGET_MANAGER_PHASE_MODEL_ROUTE =
  "phase:target-manager" as const;
export const EXPLORER_MODEL_ROUTE = "subagent:explorer" as const;
export const PLANNER_MODEL_ROUTE = "subagent:planner" as const;
export const VERIFIER_MODEL_ROUTE = "subagent:verifier" as const;
export const HUMAN_SIMULATOR_MODEL_ROUTE = "subagent:human-simulator" as const;
export const BROWSER_EVALUATOR_MODEL_ROUTE =
  "subagent:browser-evaluator" as const;
export const TARGET_ENRICHMENT_MODEL_ROUTE = "target-enrichment" as const;

export const NAMED_MODEL_ROUTES = [
  CODE_PHASE_MODEL_ROUTE,
  TARGET_MANAGER_PHASE_MODEL_ROUTE,
  EXPLORER_MODEL_ROUTE,
  PLANNER_MODEL_ROUTE,
  VERIFIER_MODEL_ROUTE,
  HUMAN_SIMULATOR_MODEL_ROUTE,
  BROWSER_EVALUATOR_MODEL_ROUTE,
  TARGET_ENRICHMENT_MODEL_ROUTE,
] as const;

export const MODEL_ROUTE_IDS = [
  DEFAULT_MODEL_ROUTE,
  ...NAMED_MODEL_ROUTES,
] as const;

export type ModelRouteId = (typeof MODEL_ROUTE_IDS)[number];
export type NamedModelRouteId = (typeof NAMED_MODEL_ROUTES)[number];
