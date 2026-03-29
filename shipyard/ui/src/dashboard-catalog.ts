import type {
  ProjectBoardProjectViewModel,
  ProjectBoardViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
} from "./view-models.js";
import type {
  DashboardPreferences,
  DashboardTabId,
} from "./dashboard-preferences.js";
import { getSelectedTarget } from "./target-selection.js";

export type DashboardCardStatus =
  | "ready"
  | "agent-busy"
  | "error"
  | "connecting"
  | "available";

export interface DashboardCardViewModel {
  id: string;
  path: string;
  name: string;
  description: string | null;
  stackLabel: string;
  status: DashboardCardStatus;
  statusLabel: string;
  lastActivity: string | null;
  starred: boolean;
  previewThumbnail?: string;
  previewUrl?: string;
  previewLabel: string;
  previewDetail: string;
  active: boolean;
  open: boolean;
}

export interface DashboardCatalogViewModel {
  activeTab: DashboardTabId;
  cards: DashboardCardViewModel[];
  visibleCards: DashboardCardViewModel[];
  emptyState: {
    title: string;
    detail: string;
  } | null;
}

interface DashboardCatalogOptions {
  targetManager: TargetManagerViewModel | null;
  projectBoard: ProjectBoardViewModel | null;
  sessionState: SessionStateViewModel | null;
  preferences: DashboardPreferences;
}

interface CatalogSeed {
  path: string;
  name: string;
  description: string | null;
  language: string | null;
  framework: string | null;
  hasProfile: boolean;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/gu, "/").replace(/\/+$/u, "");
  const segments = normalized.split("/");
  return segments.at(-1) ?? filePath;
}

function pickLatestTimestamp(
  ...timestamps: Array<string | null | undefined>
): string | null {
  const validTimestamps = timestamps.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  if (validTimestamps.length === 0) {
    return null;
  }

  return validTimestamps.reduce((latestTimestamp, candidate) =>
    new Date(candidate).getTime() > new Date(latestTimestamp).getTime()
      ? candidate
      : latestTimestamp
  );
}

function compareDashboardCards(
  left: DashboardCardViewModel,
  right: DashboardCardViewModel,
): number {
  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }

  if (left.open !== right.open) {
    return left.open ? -1 : 1;
  }

  if (left.lastActivity && right.lastActivity) {
    const timestampDifference =
      new Date(right.lastActivity).getTime() -
      new Date(left.lastActivity).getTime();

    if (timestampDifference !== 0) {
      return timestampDifference;
    }
  } else if (left.lastActivity || right.lastActivity) {
    return left.lastActivity ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function createStatusModel(
  project: ProjectBoardProjectViewModel | null,
  active: boolean,
  hasProfile: boolean,
): Pick<DashboardCardViewModel, "status" | "statusLabel"> {
  if (project) {
    switch (project.status) {
      case "agent-busy":
        return {
          status: "agent-busy",
          statusLabel: active ? "Working now" : "Background work",
        };
      case "error":
        return {
          status: "error",
          statusLabel: "Needs attention",
        };
      case "connecting":
        return {
          status: "connecting",
          statusLabel: "Connecting",
        };
      case "ready":
      default:
        return {
          status: "ready",
          statusLabel: active ? "Active" : "Ready",
        };
    }
  }

  return {
    status: "available",
    statusLabel: hasProfile ? "Available" : "Needs profile",
  };
}

function createPreviewDetail(
  seed: CatalogSeed,
  project: ProjectBoardProjectViewModel | null,
): string {
  if (seed.description) {
    return seed.description;
  }

  if (project?.status === "error") {
    return "Open this product to inspect the runtime and recover it.";
  }

  if (!seed.hasProfile) {
    return "Shipyard will add richer target metadata after the next activation.";
  }

  if (project) {
    return "Open this product to inspect the live workspace and recent runtime state.";
  }

  return "Open this product to inspect the workspace and continue the next pass.";
}

function createPreviewLabel(
  card: Pick<DashboardCardViewModel, "status" | "statusLabel" | "open" | "active">,
): string {
  if (card.active) {
    return "Current workspace";
  }

  if (card.open) {
    return "Open runtime";
  }

  return card.statusLabel;
}

function normalizeUrl(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed ? trimmed : undefined;
}

function resolvePreviewSurface(
  project: ProjectBoardProjectViewModel | null,
): Pick<DashboardCardViewModel, "previewUrl" | "previewLabel"> | null {
  const privatePreviewUrl = normalizeUrl(project?.privatePreviewUrl);

  if (privatePreviewUrl) {
    return {
      previewUrl: privatePreviewUrl,
      previewLabel: "Live preview",
    };
  }

  const publicDeploymentUrl = normalizeUrl(project?.publicDeploymentUrl);

  if (publicDeploymentUrl) {
    return {
      previewUrl: publicDeploymentUrl,
      previewLabel: "Production deploy",
    };
  }

  return null;
}

function createEmptyState(
  activeTab: DashboardTabId,
  hasLoadedCatalog: boolean,
  cardCount: number,
): DashboardCatalogViewModel["emptyState"] {
  if (!hasLoadedCatalog) {
    return {
      title: "Loading products",
      detail: "Shipyard is syncing the latest target catalog and runtime state.",
    };
  }

  if (cardCount === 0) {
    return {
      title: "No products yet",
      detail:
        "Start with the hero prompt or create a new product to give Shipyard a live workspace.",
    };
  }

  switch (activeTab) {
    case "recent":
      return {
        title: "No recent products yet",
        detail:
          "Open a product from the catalog and Shipyard will keep it handy for quick return trips.",
      };
    case "starred":
      return {
        title: "No starred products yet",
        detail:
          "Star the products you revisit often to keep a quick shortlist on hand.",
      };
    case "my-products":
    default:
      return null;
  }
}

function shouldIncludeCurrentTarget(
  targetManager: TargetManagerViewModel | null,
): boolean {
  return getSelectedTarget(targetManager) !== null;
}

export function buildDashboardCatalog(
  options: DashboardCatalogOptions,
): DashboardCatalogViewModel {
  const seeds = new Map<string, CatalogSeed>();
  const openProjectsByTargetPath = new Map(
    (options.projectBoard?.openProjects ?? []).map((project) => [
      project.targetPath,
      project,
    ]),
  );

  for (const target of options.targetManager?.availableTargets ?? []) {
    seeds.set(target.path, {
      path: target.path,
      name: target.name,
      description: target.description,
      language: target.language,
      framework: target.framework,
      hasProfile: target.hasProfile,
    });
  }

  if (shouldIncludeCurrentTarget(options.targetManager)) {
    const currentTarget = getSelectedTarget(options.targetManager)!;
    const existingSeed = seeds.get(currentTarget.path);

    seeds.set(currentTarget.path, {
      path: currentTarget.path,
      name: currentTarget.name,
      description: currentTarget.description,
      language: currentTarget.language,
      framework: currentTarget.framework,
      hasProfile: currentTarget.hasProfile,
      ...existingSeed,
    });
  }

  if (
    options.sessionState &&
    options.sessionState.activePhase === "code" &&
    options.sessionState.targetDirectory.trim().length > 0
  ) {
    const existingSeed = seeds.get(options.sessionState.targetDirectory);

    seeds.set(options.sessionState.targetDirectory, {
      path: options.sessionState.targetDirectory,
      name:
        existingSeed?.name ??
        options.sessionState.targetLabel ??
        basename(options.sessionState.targetDirectory),
      description: existingSeed?.description ?? null,
      language: existingSeed?.language ?? options.sessionState.discovery.language,
      framework: existingSeed?.framework ?? options.sessionState.discovery.framework,
      hasProfile: existingSeed?.hasProfile ?? false,
    });
  }

  for (const project of options.projectBoard?.openProjects ?? []) {
    const existingSeed = seeds.get(project.targetPath);

    seeds.set(project.targetPath, {
      path: project.targetPath,
      name: existingSeed?.name ?? project.targetName,
      description: existingSeed?.description ?? project.description,
      language: existingSeed?.language ?? null,
      framework: existingSeed?.framework ?? null,
      hasProfile: existingSeed?.hasProfile ?? project.hasProfile,
    });
  }

  const activeTargetPath = options.projectBoard?.openProjects.find(
    (project) => project.projectId === options.projectBoard?.activeProjectId,
  )?.targetPath ?? (
    shouldIncludeCurrentTarget(options.targetManager)
      ? options.targetManager?.currentTarget.path
      : null
  );

  const cards = Array.from(seeds.values())
    .filter((seed) => seed.path.trim().length > 0)
    .map<DashboardCardViewModel>((seed) => {
      const project = openProjectsByTargetPath.get(seed.path) ?? null;
      const preference = options.preferences.products[seed.path] ?? {
        starred: false,
        lastOpenedAt: null,
      };
      const active =
        activeTargetPath === seed.path &&
        (
          project !== null ||
          options.sessionState?.targetDirectory === seed.path
        );
      const open = project !== null;
      const statusModel = createStatusModel(project, active, seed.hasProfile);
      const lastActivity = pickLatestTimestamp(
        project?.lastActiveAt,
        preference.lastOpenedAt,
        options.sessionState?.targetDirectory === seed.path
          ? options.sessionState.lastActiveAt
          : null,
      );
      const stackLabel = seed.framework ?? seed.language ?? "Unknown stack";
      const previewSurface = resolvePreviewSurface(project);

      const baseCard: DashboardCardViewModel = {
        id: seed.path,
        path: seed.path,
        name: seed.name,
        description: seed.description,
        stackLabel,
        status: statusModel.status,
        statusLabel: statusModel.statusLabel,
        lastActivity,
        starred: preference.starred,
        previewDetail: createPreviewDetail(seed, project),
        previewLabel: previewSurface?.previewLabel ?? "Available",
        active,
        open,
        previewUrl: previewSurface?.previewUrl,
      };

      return {
        ...baseCard,
        previewLabel:
          previewSurface?.previewLabel ??
          createPreviewLabel(baseCard),
      };
    })
    .sort(compareDashboardCards);

  const visibleCards = options.preferences.activeTab === "recent"
    ? cards.filter((card) => card.lastActivity !== null)
    : options.preferences.activeTab === "starred"
      ? cards.filter((card) => card.starred)
      : cards;
  const hasLoadedCatalog =
    options.targetManager !== null ||
    options.projectBoard !== null ||
    options.sessionState !== null;

  return {
    activeTab: options.preferences.activeTab,
    cards,
    visibleCards,
    emptyState:
      visibleCards.length === 0
        ? createEmptyState(
            options.preferences.activeTab,
            hasLoadedCatalog,
            cards.length,
          )
        : null,
  };
}
