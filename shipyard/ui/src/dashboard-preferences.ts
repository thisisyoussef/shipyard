export type DashboardTabId = "my-products" | "recent" | "starred";

export interface DashboardProductPreference {
  starred: boolean;
  lastOpenedAt: string | null;
}

export interface DashboardPreferences {
  activeTab: DashboardTabId;
  products: Record<string, DashboardProductPreference>;
}

export const DASHBOARD_PREFERENCES_STORAGE_KEY =
  "shipyard:dashboard-preferences";

type DashboardPreferenceReader = Pick<Storage, "getItem">;
type DashboardPreferenceWriter = Pick<Storage, "setItem">;

function getDashboardStorage():
  | (DashboardPreferenceReader & DashboardPreferenceWriter)
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

function isDashboardTabId(value: unknown): value is DashboardTabId {
  return (
    value === "my-products" ||
    value === "recent" ||
    value === "starred"
  );
}

function sanitizeDashboardProductPreference(
  value: unknown,
): DashboardProductPreference {
  if (typeof value !== "object" || value === null) {
    return {
      starred: false,
      lastOpenedAt: null,
    };
  }

  const candidate = value as {
    starred?: unknown;
    lastOpenedAt?: unknown;
  };

  return {
    starred: candidate.starred === true,
    lastOpenedAt:
      typeof candidate.lastOpenedAt === "string" &&
        candidate.lastOpenedAt.trim().length > 0
        ? candidate.lastOpenedAt
        : null,
  };
}

export function createInitialDashboardPreferences(): DashboardPreferences {
  return {
    activeTab: "my-products",
    products: {},
  };
}

export function sanitizeDashboardPreferences(
  value: unknown,
): DashboardPreferences {
  if (typeof value !== "object" || value === null) {
    return createInitialDashboardPreferences();
  }

  const candidate = value as {
    activeTab?: unknown;
    products?: unknown;
  };
  const products =
    typeof candidate.products === "object" && candidate.products !== null
      ? Object.fromEntries(
          Object.entries(candidate.products).map(([targetPath, preference]) => [
            targetPath,
            sanitizeDashboardProductPreference(preference),
          ]),
        )
      : {};

  return {
    activeTab: isDashboardTabId(candidate.activeTab)
      ? candidate.activeTab
      : "my-products",
    products,
  };
}

export function readDashboardPreferences(
  storage: DashboardPreferenceReader | null = getDashboardStorage(),
): DashboardPreferences {
  if (!storage) {
    return createInitialDashboardPreferences();
  }

  try {
    const rawValue = storage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialDashboardPreferences();
    }

    return sanitizeDashboardPreferences(JSON.parse(rawValue));
  } catch {
    return createInitialDashboardPreferences();
  }
}

export function writeDashboardPreferences(
  preferences: DashboardPreferences,
  storage: DashboardPreferenceWriter | null = getDashboardStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    /* localStorage unavailable */
  }
}

function getProductPreference(
  preferences: DashboardPreferences,
  targetPath: string,
): DashboardProductPreference {
  return preferences.products[targetPath] ?? {
    starred: false,
    lastOpenedAt: null,
  };
}

export function setDashboardActiveTab(
  preferences: DashboardPreferences,
  activeTab: DashboardTabId,
): DashboardPreferences {
  if (preferences.activeTab === activeTab) {
    return preferences;
  }

  return {
    ...preferences,
    activeTab,
  };
}

export function toggleDashboardProductStar(
  preferences: DashboardPreferences,
  targetPath: string,
): DashboardPreferences {
  const currentPreference = getProductPreference(preferences, targetPath);

  return {
    ...preferences,
    products: {
      ...preferences.products,
      [targetPath]: {
        ...currentPreference,
        starred: !currentPreference.starred,
      },
    },
  };
}

export function markDashboardProductOpened(
  preferences: DashboardPreferences,
  targetPath: string,
  openedAt: string,
): DashboardPreferences {
  const currentPreference = getProductPreference(preferences, targetPath);

  if (currentPreference.lastOpenedAt === openedAt) {
    return preferences;
  }

  return {
    ...preferences,
    products: {
      ...preferences.products,
      [targetPath]: {
        ...currentPreference,
        lastOpenedAt: openedAt,
      },
    },
  };
}
