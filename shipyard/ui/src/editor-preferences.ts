export type EditorWorkspaceTab = "preview" | "code" | "files";

export interface EditorLayoutPreference {
  activeTab: EditorWorkspaceTab;
  splitRatio: number;
}

export interface EditorPreferences {
  scopes: Record<string, EditorLayoutPreference>;
}

export const EDITOR_PREFERENCES_STORAGE_KEY = "shipyard:editor-preferences";
export const MIN_EDITOR_SPLIT_RATIO = 20;
export const MAX_EDITOR_SPLIT_RATIO = 80;

type EditorPreferenceReader = Pick<Storage, "getItem">;
type EditorPreferenceWriter = Pick<Storage, "setItem">;

function getEditorStorage():
  | (EditorPreferenceReader & EditorPreferenceWriter)
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

function isEditorWorkspaceTab(value: unknown): value is EditorWorkspaceTab {
  return value === "preview" || value === "code" || value === "files";
}

function clampSplitRatio(value: number): number {
  return Math.min(
    Math.max(Math.round(value), MIN_EDITOR_SPLIT_RATIO),
    MAX_EDITOR_SPLIT_RATIO,
  );
}

function sanitizeScopeKey(scopeKey: string): string {
  return scopeKey.trim();
}

export function createDefaultEditorLayoutPreference(): EditorLayoutPreference {
  return {
    activeTab: "preview",
    splitRatio: 40,
  };
}

function sanitizeEditorLayoutPreference(value: unknown): EditorLayoutPreference {
  if (typeof value !== "object" || value === null) {
    return createDefaultEditorLayoutPreference();
  }

  const candidate = value as {
    activeTab?: unknown;
    splitRatio?: unknown;
  };

  return {
    activeTab: isEditorWorkspaceTab(candidate.activeTab)
      ? candidate.activeTab
      : "preview",
    splitRatio:
      typeof candidate.splitRatio === "number" && Number.isFinite(candidate.splitRatio)
        ? clampSplitRatio(candidate.splitRatio)
        : 40,
  };
}

export function createInitialEditorPreferences(): EditorPreferences {
  return {
    scopes: {},
  };
}

export function sanitizeEditorPreferences(value: unknown): EditorPreferences {
  if (typeof value !== "object" || value === null) {
    return createInitialEditorPreferences();
  }

  const candidate = value as {
    scopes?: unknown;
  };
  const scopes =
    typeof candidate.scopes === "object" && candidate.scopes !== null
      ? Object.fromEntries(
          Object.entries(candidate.scopes).flatMap(([scopeKey, preference]) => {
            const normalizedScopeKey = sanitizeScopeKey(scopeKey);

            if (!normalizedScopeKey) {
              return [];
            }

            return [[
              normalizedScopeKey,
              sanitizeEditorLayoutPreference(preference),
            ]];
          }),
        )
      : {};

  return {
    scopes,
  };
}

export function readEditorPreferences(
  storage: EditorPreferenceReader | null = getEditorStorage(),
): EditorPreferences {
  if (!storage) {
    return createInitialEditorPreferences();
  }

  try {
    const rawValue = storage.getItem(EDITOR_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialEditorPreferences();
    }

    return sanitizeEditorPreferences(JSON.parse(rawValue));
  } catch {
    return createInitialEditorPreferences();
  }
}

export function writeEditorPreferences(
  preferences: EditorPreferences,
  storage: EditorPreferenceWriter | null = getEditorStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      EDITOR_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    /* localStorage unavailable */
  }
}

export function getEditorPreference(
  preferences: EditorPreferences,
  scopeKey: string,
): EditorLayoutPreference {
  const normalizedScopeKey = sanitizeScopeKey(scopeKey);

  if (!normalizedScopeKey) {
    return createDefaultEditorLayoutPreference();
  }

  return preferences.scopes[normalizedScopeKey] ?? createDefaultEditorLayoutPreference();
}

export function setEditorActiveTab(
  preferences: EditorPreferences,
  scopeKey: string,
  activeTab: EditorWorkspaceTab,
): EditorPreferences {
  const normalizedScopeKey = sanitizeScopeKey(scopeKey);

  if (!normalizedScopeKey) {
    return preferences;
  }

  const currentPreference = getEditorPreference(preferences, normalizedScopeKey);

  if (currentPreference.activeTab === activeTab) {
    return preferences;
  }

  return {
    ...preferences,
    scopes: {
      ...preferences.scopes,
      [normalizedScopeKey]: {
        ...currentPreference,
        activeTab,
      },
    },
  };
}

export function setEditorSplitRatio(
  preferences: EditorPreferences,
  scopeKey: string,
  splitRatio: number,
): EditorPreferences {
  const normalizedScopeKey = sanitizeScopeKey(scopeKey);

  if (!normalizedScopeKey) {
    return preferences;
  }

  const currentPreference = getEditorPreference(preferences, normalizedScopeKey);
  const nextSplitRatio = clampSplitRatio(splitRatio);

  if (currentPreference.splitRatio === nextSplitRatio) {
    return preferences;
  }

  return {
    ...preferences,
    scopes: {
      ...preferences.scopes,
      [normalizedScopeKey]: {
        ...currentPreference,
        splitRatio: nextSplitRatio,
      },
    },
  };
}
