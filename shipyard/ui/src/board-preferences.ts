export interface BoardScopePreference {
  selectedStoryId: string;
}

export interface BoardPreferences {
  scopes: Record<string, BoardScopePreference>;
}

export const BOARD_PREFERENCES_STORAGE_KEY = "shipyard:board-preferences";

type BoardPreferenceReader = Pick<Storage, "getItem">;
type BoardPreferenceWriter = Pick<Storage, "setItem">;

function getBoardStorage():
  | (BoardPreferenceReader & BoardPreferenceWriter)
  | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    return localStorage;
  } catch {
    return null;
  }
}

function sanitizeScopeKey(scopeKey: string): string {
  return scopeKey.trim();
}

function sanitizeSelectedStoryId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function sanitizeBoardScopePreference(
  value: unknown,
): BoardScopePreference | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as {
    selectedStoryId?: unknown;
  };
  const selectedStoryId = sanitizeSelectedStoryId(candidate.selectedStoryId);

  if (!selectedStoryId) {
    return null;
  }

  return {
    selectedStoryId,
  };
}

export function createInitialBoardPreferences(): BoardPreferences {
  return {
    scopes: {},
  };
}

export function sanitizeBoardPreferences(value: unknown): BoardPreferences {
  if (typeof value !== "object" || value === null) {
    return createInitialBoardPreferences();
  }

  const candidate = value as {
    scopes?: unknown;
  };
  const scopes =
    typeof candidate.scopes === "object" && candidate.scopes !== null
      ? Object.fromEntries(
          Object.entries(candidate.scopes).flatMap(([scopeKey, preference]) => {
            const normalizedScopeKey = sanitizeScopeKey(scopeKey);
            const normalizedPreference =
              sanitizeBoardScopePreference(preference);

            if (!normalizedScopeKey || !normalizedPreference) {
              return [];
            }

            return [[normalizedScopeKey, normalizedPreference]];
          }),
        )
      : {};

  return {
    scopes,
  };
}

export function readBoardPreferences(
  storage: BoardPreferenceReader | null = getBoardStorage(),
): BoardPreferences {
  if (!storage) {
    return createInitialBoardPreferences();
  }

  try {
    const rawValue = storage.getItem(BOARD_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialBoardPreferences();
    }

    return sanitizeBoardPreferences(JSON.parse(rawValue));
  } catch {
    return createInitialBoardPreferences();
  }
}

export function writeBoardPreferences(
  preferences: BoardPreferences,
  storage: BoardPreferenceWriter | null = getBoardStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      BOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    /* localStorage unavailable */
  }
}

export function getBoardSelectedStory(
  preferences: BoardPreferences,
  scopeKey: string,
): string {
  const normalizedScopeKey = sanitizeScopeKey(scopeKey);

  if (!normalizedScopeKey) {
    return "all";
  }

  return preferences.scopes[normalizedScopeKey]?.selectedStoryId ?? "all";
}

export function setBoardSelectedStory(
  preferences: BoardPreferences,
  scopeKey: string,
  selectedStoryId: string,
): BoardPreferences {
  const normalizedScopeKey = sanitizeScopeKey(scopeKey);
  const normalizedSelectedStoryId = sanitizeSelectedStoryId(selectedStoryId);

  if (!normalizedScopeKey) {
    return preferences;
  }

  if (!normalizedSelectedStoryId || normalizedSelectedStoryId === "all") {
    if (!(normalizedScopeKey in preferences.scopes)) {
      return preferences;
    }

    const { [normalizedScopeKey]: _removedPreference, ...remainingScopes } =
      preferences.scopes;

    return {
      ...preferences,
      scopes: remainingScopes,
    };
  }

  if (
    preferences.scopes[normalizedScopeKey]?.selectedStoryId ===
      normalizedSelectedStoryId
  ) {
    return preferences;
  }

  return {
    ...preferences,
    scopes: {
      ...preferences.scopes,
      [normalizedScopeKey]: {
        selectedStoryId: normalizedSelectedStoryId,
      },
    },
  };
}
