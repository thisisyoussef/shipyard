export const SHIPYARD_DISABLE_RECENT_TOUCHED_SCOPE_WIDENING_ENV =
  "SHIPYARD_DISABLE_RECENT_TOUCHED_SCOPE_WIDENING";
export const SHIPYARD_PREFER_SINGLE_TURN_UI_BUILDS_ENV =
  "SHIPYARD_PREFER_SINGLE_TURN_UI_BUILDS";
export const SHIPYARD_ENABLE_STRICT_FRESH_UI_VERIFICATION_ENV =
  "SHIPYARD_ENABLE_STRICT_FRESH_UI_VERIFICATION";

export interface RuntimeFeatureFlags {
  disableRecentTouchedScopeWidening: boolean;
  preferSingleTurnUiBuilds: boolean;
  enableStrictFreshUiVerification: boolean;
}

export const DEFAULT_RUNTIME_FEATURE_FLAGS: RuntimeFeatureFlags = Object.freeze({
  disableRecentTouchedScopeWidening: false,
  preferSingleTurnUiBuilds: false,
  enableStrictFreshUiVerification: false,
});

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function normalizeRuntimeFeatureFlags(
  flags?: Partial<RuntimeFeatureFlags> | null,
): RuntimeFeatureFlags {
  return {
    ...DEFAULT_RUNTIME_FEATURE_FLAGS,
    ...(flags ?? {}),
  };
}

export function resolveRuntimeFeatureFlags(options: {
  env?: NodeJS.ProcessEnv;
  overrides?: Partial<RuntimeFeatureFlags>;
} = {}): RuntimeFeatureFlags {
  const env = options.env ?? process.env;

  return normalizeRuntimeFeatureFlags({
    disableRecentTouchedScopeWidening: parseBooleanEnv(
      env[SHIPYARD_DISABLE_RECENT_TOUCHED_SCOPE_WIDENING_ENV],
    ),
    preferSingleTurnUiBuilds: parseBooleanEnv(
      env[SHIPYARD_PREFER_SINGLE_TURN_UI_BUILDS_ENV],
    ),
    enableStrictFreshUiVerification: parseBooleanEnv(
      env[SHIPYARD_ENABLE_STRICT_FRESH_UI_VERIFICATION_ENV],
    ),
    ...(options.overrides ?? {}),
  });
}
