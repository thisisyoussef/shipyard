import {
  createAnthropicModelAdapter,
  resolveAnthropicRuntimeConfig,
} from "./anthropic.js";
import {
  createUserTurnMessage,
  type ModelAdapter,
} from "./model-adapter.js";

export const DEFAULT_MODEL_PROVIDER = "anthropic";
export const DEFAULT_MODEL_ROUTE = "default" as const;
export const CODE_PHASE_MODEL_ROUTE = "phase:code" as const;
export const TARGET_MANAGER_PHASE_MODEL_ROUTE =
  "phase:target-manager" as const;
export const EXPLORER_MODEL_ROUTE = "subagent:explorer" as const;
export const PLANNER_MODEL_ROUTE = "subagent:planner" as const;
export const VERIFIER_MODEL_ROUTE = "subagent:verifier" as const;
export const BROWSER_EVALUATOR_MODEL_ROUTE =
  "subagent:browser-evaluator" as const;
export const TARGET_ENRICHMENT_MODEL_ROUTE = "target-enrichment" as const;

export const NAMED_MODEL_ROUTES = [
  CODE_PHASE_MODEL_ROUTE,
  TARGET_MANAGER_PHASE_MODEL_ROUTE,
  EXPLORER_MODEL_ROUTE,
  PLANNER_MODEL_ROUTE,
  VERIFIER_MODEL_ROUTE,
  BROWSER_EVALUATOR_MODEL_ROUTE,
  TARGET_ENRICHMENT_MODEL_ROUTE,
] as const;

export const MODEL_ROUTE_IDS = [
  DEFAULT_MODEL_ROUTE,
  ...NAMED_MODEL_ROUTES,
] as const;

export type ModelRouteId = (typeof MODEL_ROUTE_IDS)[number];
export type NamedModelRouteId = (typeof NAMED_MODEL_ROUTES)[number];

export interface ModelRouteDefinition {
  provider?: string;
  model?: string;
}

export interface ModelRoutingOverrides {
  defaultRoute?: ModelRouteDefinition;
  routes?: Partial<Record<NamedModelRouteId, ModelRouteDefinition>>;
}

export interface ModelRoutingConfig {
  defaultRoute: ModelRouteDefinition;
  routes: Partial<Record<NamedModelRouteId, ModelRouteDefinition>>;
}

export interface ResolvedModelRoute {
  routeId: ModelRouteId;
  provider: string;
  model: string | null;
}

export interface ModelRouteCapability extends ResolvedModelRoute {
  available: boolean;
  missingEnvironmentVariables: string[];
  reason: string | null;
}

export interface CreateModelRoutingConfigOptions extends ModelRoutingOverrides {
  env?: NodeJS.ProcessEnv;
}

interface ModelProviderDefinition {
  id: string;
  requiredEnvironmentVariables: string[];
  createAdapter?: (options?: {
    env?: NodeJS.ProcessEnv;
  }) => ModelAdapter;
  resolveDefaultModel?: (options?: {
    env?: NodeJS.ProcessEnv;
  }) => string | null;
}

const ROUTE_ENV_PREFIXES: Record<ModelRouteId, string> = {
  [DEFAULT_MODEL_ROUTE]: "SHIPYARD",
  [CODE_PHASE_MODEL_ROUTE]: "SHIPYARD_CODE",
  [TARGET_MANAGER_PHASE_MODEL_ROUTE]: "SHIPYARD_TARGET_MANAGER",
  [EXPLORER_MODEL_ROUTE]: "SHIPYARD_EXPLORER",
  [PLANNER_MODEL_ROUTE]: "SHIPYARD_PLANNER",
  [VERIFIER_MODEL_ROUTE]: "SHIPYARD_VERIFIER",
  [BROWSER_EVALUATOR_MODEL_ROUTE]: "SHIPYARD_BROWSER_EVALUATOR",
  [TARGET_ENRICHMENT_MODEL_ROUTE]: "SHIPYARD_TARGET_ENRICHMENT",
};

const modelProviderDefinitions: Record<string, ModelProviderDefinition> = {
  anthropic: {
    id: "anthropic",
    requiredEnvironmentVariables: ["ANTHROPIC_API_KEY"],
    createAdapter(options = {}) {
      return createAnthropicModelAdapter({
        env: options.env,
      });
    },
    resolveDefaultModel(options = {}) {
      return resolveAnthropicRuntimeConfig({
        env: options.env,
      }).model;
    },
  },
  openai: {
    id: "openai",
    requiredEnvironmentVariables: ["OPENAI_API_KEY"],
    resolveDefaultModel(options = {}) {
      const env = options.env ?? process.env;
      return normalizeOptionalString(env.SHIPYARD_OPENAI_MODEL) ?? null;
    },
  },
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeRouteDefinition(
  route: ModelRouteDefinition | null | undefined,
): ModelRouteDefinition | undefined {
  if (!route) {
    return undefined;
  }

  const provider = normalizeOptionalString(route.provider);
  const model = normalizeOptionalString(route.model);

  if (!provider && !model) {
    return undefined;
  }

  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

function mergeRouteDefinitions(
  ...routes: Array<ModelRouteDefinition | null | undefined>
): ModelRouteDefinition {
  return routes.reduce<ModelRouteDefinition>((accumulator, route) => {
    const normalizedRoute = normalizeRouteDefinition(route);

    if (!normalizedRoute) {
      return accumulator;
    }

    return {
      ...accumulator,
      ...normalizedRoute,
    };
  }, {});
}

function readRouteDefinitionFromEnv(
  routeId: ModelRouteId,
  env: NodeJS.ProcessEnv,
): ModelRouteDefinition | undefined {
  const prefix = ROUTE_ENV_PREFIXES[routeId];

  return normalizeRouteDefinition({
    provider: env[`${prefix}_MODEL_PROVIDER`],
    model: env[`${prefix}_MODEL`],
  });
}

function assertKnownRouteId(routeId: string | undefined): ModelRouteId {
  const candidate = routeId?.trim() || DEFAULT_MODEL_ROUTE;

  if ((MODEL_ROUTE_IDS as readonly string[]).includes(candidate)) {
    return candidate as ModelRouteId;
  }

  throw new Error(`Unknown model route "${candidate}".`);
}

function getProviderDefinition(
  providerId: string,
): ModelProviderDefinition | null {
  return modelProviderDefinitions[providerId] ?? null;
}

export function createModelRoutingConfig(
  options: CreateModelRoutingConfigOptions = {},
): ModelRoutingConfig {
  const env = options.env ?? process.env;
  const routes: Partial<Record<NamedModelRouteId, ModelRouteDefinition>> = {};

  for (const routeId of NAMED_MODEL_ROUTES) {
    const mergedRoute = mergeRouteDefinitions(
      readRouteDefinitionFromEnv(routeId, env),
      options.routes?.[routeId],
    );

    if (normalizeRouteDefinition(mergedRoute)) {
      routes[routeId] = mergedRoute;
    }
  }

  return {
    defaultRoute: mergeRouteDefinitions(
      {
        provider: DEFAULT_MODEL_PROVIDER,
      },
      readRouteDefinitionFromEnv(DEFAULT_MODEL_ROUTE, env),
      options.defaultRoute,
    ),
    routes,
  };
}

export function resolveModelRoute(options: {
  routing: ModelRoutingConfig;
  routeId?: ModelRouteId | string;
  override?: ModelRouteDefinition;
  env?: NodeJS.ProcessEnv;
}): ResolvedModelRoute {
  const routeId = assertKnownRouteId(options.routeId);
  const env = options.env ?? process.env;
  const routeOverride = routeId === DEFAULT_MODEL_ROUTE
    ? undefined
    : options.routing.routes[routeId as NamedModelRouteId];
  const mergedRoute = mergeRouteDefinitions(
    options.routing.defaultRoute,
    routeOverride,
    options.override,
  );
  const provider = normalizeOptionalString(mergedRoute.provider);

  if (!provider) {
    throw new Error(
      `Model route "${routeId}" does not resolve to a provider.`,
    );
  }

  const providerDefinition = getProviderDefinition(provider);

  if (!providerDefinition) {
    throw new Error(`Unknown model provider "${provider}".`);
  }

  const model = normalizeOptionalString(mergedRoute.model)
    ?? providerDefinition.resolveDefaultModel?.({ env })
    ?? null;

  return {
    routeId,
    provider,
    model,
  };
}

export function resolveModelRouteCapability(options: {
  routing: ModelRoutingConfig;
  routeId?: ModelRouteId | string;
  override?: ModelRouteDefinition;
  env?: NodeJS.ProcessEnv;
  requireAdapter?: boolean;
}): ModelRouteCapability {
  const routeId = assertKnownRouteId(options.routeId);
  const routeOverride = routeId === DEFAULT_MODEL_ROUTE
    ? undefined
    : options.routing.routes[routeId as NamedModelRouteId];
  const mergedRoute = mergeRouteDefinitions(
    options.routing.defaultRoute,
    routeOverride,
    options.override,
  );
  let resolvedRoute: ResolvedModelRoute;

  try {
    resolvedRoute = resolveModelRoute({
      ...options,
      routeId,
    });
  } catch (error) {
    return {
      routeId,
      provider: normalizeOptionalString(mergedRoute.provider) ?? "unknown",
      model: normalizeOptionalString(mergedRoute.model),
      available: false,
      missingEnvironmentVariables: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const env = options.env ?? process.env;
  const providerDefinition = getProviderDefinition(resolvedRoute.provider);

  if (!providerDefinition) {
    return {
      ...resolvedRoute,
      available: false,
      missingEnvironmentVariables: [],
      reason: `Unknown model provider "${resolvedRoute.provider}".`,
    };
  }

  const missingEnvironmentVariables = providerDefinition.requiredEnvironmentVariables
    .filter((envName) => !normalizeOptionalString(env[envName]));

  if (missingEnvironmentVariables.length > 0) {
    return {
      ...resolvedRoute,
      available: false,
      missingEnvironmentVariables,
      reason:
        `Missing ${missingEnvironmentVariables.join(", ")} for provider "${resolvedRoute.provider}" ` +
        `on route "${resolvedRoute.routeId}".`,
    };
  }

  if (options.requireAdapter && !providerDefinition.createAdapter) {
    return {
      ...resolvedRoute,
      available: false,
      missingEnvironmentVariables: [],
      reason:
        `Provider "${resolvedRoute.provider}" for route "${resolvedRoute.routeId}" ` +
        "is configured but no model adapter is registered yet.",
    };
  }

  return {
    ...resolvedRoute,
    available: true,
    missingEnvironmentVariables,
    reason: null,
  };
}

export function createModelAdapterForRoute(options: {
  routing: ModelRoutingConfig;
  routeId?: ModelRouteId | string;
  override?: ModelRouteDefinition;
  env?: NodeJS.ProcessEnv;
}): ResolvedModelRoute & {
  modelAdapter: ModelAdapter;
} {
  const capability = resolveModelRouteCapability({
    ...options,
    requireAdapter: true,
  });

  if (!capability.available) {
    throw new Error(
      capability.reason
      ?? `Model route "${capability.routeId}" is unavailable.`,
    );
  }

  const providerDefinition = getProviderDefinition(capability.provider);

  if (!providerDefinition?.createAdapter) {
    throw new Error(
      `Provider "${capability.provider}" does not have a registered model adapter.`,
    );
  }

  return {
    routeId: capability.routeId,
    provider: capability.provider,
    model: capability.model,
    modelAdapter: providerDefinition.createAdapter({
      env: options.env,
    }),
  };
}

export function createTargetEnrichmentInvokerFromRouting(options: {
  routing: ModelRoutingConfig;
  env?: NodeJS.ProcessEnv;
}): (
  prompt: string,
) => Promise<{
  text: string;
  model: string;
}> {
  return async (prompt: string) => {
    const selection = createModelAdapterForRoute({
      routing: options.routing,
      routeId: TARGET_ENRICHMENT_MODEL_ROUTE,
      env: options.env,
    });
    const result = await selection.modelAdapter.createTurn({
      systemPrompt:
        "You analyze software projects. Return only valid JSON that matches the requested schema.",
      messages: [createUserTurnMessage(prompt)],
      model: selection.model ?? undefined,
      temperature: 0,
    });

    if (result.stopReason !== "completed") {
      throw new Error(
        `Target enrichment route "${selection.routeId}" stopped with "${result.stopReason}".`,
      );
    }

    const text = result.finalText.trim();

    if (!text) {
      throw new Error("Target enrichment model returned no text.");
    }

    return {
      text,
      model: result.model,
    };
  };
}
