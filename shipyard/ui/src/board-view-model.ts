import type { BadgeTone } from "./primitives.js";
import type {
  ProjectBoardViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
  TaskBoardViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";
import {
  getActiveProject,
  getSelectedTargetPath,
} from "./target-selection.js";

export interface BoardStoryOption {
  id: string;
  label: string;
  taskCount: number;
}

export interface BoardNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface BoardEmptyState {
  title: string;
  detail: string;
}

export interface BoardColumnViewModel {
  id: string;
  label: string;
  order: number;
  count: number;
}

export interface BoardTaskViewModel {
  id: string;
  title: string;
  description: string;
  state: string;
  agentId: string | null;
  storyId: string | null;
  storyTitle: string | null;
  dependencies: string[];
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoardViewModel {
  status: "missing-target" | "loading" | "ready";
  scopeKey: string | null;
  selectedStoryId: string;
  storyOptions: BoardStoryOption[];
  columns: BoardColumnViewModel[];
  tasks: BoardTaskViewModel[];
  notice: BoardNotice | null;
  emptyState: BoardEmptyState | null;
  summary: string | null;
  updatedAt: string | null;
}

interface CreateBoardViewModelOptions {
  taskBoard: TaskBoardViewModel | null;
  connectionState: WorkbenchConnectionState;
  sessionState: SessionStateViewModel | null;
  targetManager: TargetManagerViewModel | null;
  projectBoard: ProjectBoardViewModel | null;
  selectedStoryId: string;
}

function createMissingTargetState(): BoardViewModel {
  return {
    status: "missing-target",
    scopeKey: null,
    selectedStoryId: "all",
    storyOptions: [],
    columns: [],
    tasks: [],
    notice: null,
    emptyState: {
      title: "Select a product first",
      detail:
        "Open a product from the dashboard or return to the editor before using the board.",
    },
    summary: null,
    updatedAt: null,
  };
}

function createLoadingState(
  scopeKey: string,
  connectionState: WorkbenchConnectionState,
): BoardViewModel {
  switch (connectionState) {
    case "disconnected":
      return {
        status: "loading",
        scopeKey,
        selectedStoryId: "all",
        storyOptions: [],
        columns: [],
        tasks: [],
        notice: null,
        emptyState: {
          title: "Waiting for the board to reconnect",
          detail:
            "Shipyard is disconnected and does not have a synced board snapshot for this product yet.",
        },
        summary: null,
        updatedAt: null,
      };
    case "error":
      return {
        status: "loading",
        scopeKey,
        selectedStoryId: "all",
        storyOptions: [],
        columns: [],
        tasks: [],
        notice: null,
        emptyState: {
          title: "Board updates are unavailable",
          detail:
            "Shipyard hit a connection error before the task board loaded. Refresh status or reopen the product to retry.",
        },
        summary: null,
        updatedAt: null,
      };
    case "connecting":
      return {
        status: "loading",
        scopeKey,
        selectedStoryId: "all",
        storyOptions: [],
        columns: [],
        tasks: [],
        notice: null,
        emptyState: {
          title: "Connecting to the live board",
          detail:
            "Shipyard is reconnecting and will populate the latest task graph for this product as soon as the runtime responds.",
        },
        summary: null,
        updatedAt: null,
      };
    default:
      return {
        status: "loading",
        scopeKey,
        selectedStoryId: "all",
        storyOptions: [],
        columns: [],
        tasks: [],
        notice: null,
        emptyState: {
          title: "Loading board",
          detail:
            "Shipyard is syncing the live task board for this product.",
        },
        summary: null,
        updatedAt: null,
      };
  }
}

function buildBoardNotice(
  connectionState: WorkbenchConnectionState,
): BoardNotice | null {
  switch (connectionState) {
    case "disconnected":
      return {
        tone: "warning",
        title: "Showing the last synced board snapshot",
        detail:
          "Shipyard is disconnected. The board will refresh automatically after the browser runtime reconnects.",
      };
    case "connecting":
      return {
        tone: "accent",
        title: "Reconnecting to live board updates",
        detail:
          "Shipyard is re-establishing the browser session. Current task positions may be slightly stale until the next sync arrives.",
      };
    case "error":
      return {
        tone: "danger",
        title: "Board updates paused after a connection error",
        detail:
          "You are looking at the last synced board snapshot while Shipyard recovers the browser runtime.",
      };
    default:
      return null;
  }
}

function normalizeSelectedStoryId(selectedStoryId: string): string {
  const normalizedSelectedStoryId = selectedStoryId.trim();
  return normalizedSelectedStoryId.length > 0
    ? normalizedSelectedStoryId
    : "all";
}

export function resolveBoardScopeKey(
  options: Pick<
    CreateBoardViewModelOptions,
    "sessionState" | "targetManager" | "projectBoard"
  >,
): string | null {
  const activeProject = getActiveProject(options.projectBoard);

  if (activeProject?.targetPath) {
    return activeProject.targetPath;
  }

  const selectedTargetPath = getSelectedTargetPath(options.targetManager);

  if (selectedTargetPath) {
    return selectedTargetPath;
  }

  if (
    options.sessionState?.activePhase === "code" &&
    options.sessionState.targetDirectory.trim().length > 0
  ) {
    return options.sessionState.targetDirectory;
  }

  return options.projectBoard?.openProjects[0]?.targetPath ?? null;
}

export function createBoardViewModel(
  options: CreateBoardViewModelOptions,
): BoardViewModel {
  const scopeKey = resolveBoardScopeKey(options);

  if (!scopeKey) {
    return createMissingTargetState();
  }

  if (!options.taskBoard) {
    return createLoadingState(scopeKey, options.connectionState);
  }

  const allTasks = options.taskBoard.columns.flatMap((column) =>
    column.cards.map((card) => ({
      id: card.cardId,
      title: card.title,
      description: card.summary,
      state: card.columnId,
      agentId: card.ownerRoleId,
      storyId: card.storyId,
      storyTitle: card.storyTitle,
      dependencies: card.blockedByIds,
      blocked: card.status === "blocked" || card.blockedByIds.length > 0,
      createdAt: card.updatedAt,
      updatedAt: card.updatedAt,
    }))
  );
  const storyOptions = [
    {
      id: "all",
      label: "All stories",
      taskCount: allTasks.length,
    },
  ];
  const storyOptionMap = new Map<string, BoardStoryOption>();

  for (const task of allTasks) {
    if (!task.storyId) {
      continue;
    }

    const existingOption = storyOptionMap.get(task.storyId);

    if (existingOption) {
      existingOption.taskCount += 1;
      continue;
    }

    storyOptionMap.set(task.storyId, {
      id: task.storyId,
      label: task.storyTitle ?? task.storyId,
      taskCount: 1,
    });
  }

  storyOptions.push(...storyOptionMap.values());

  const requestedStoryId = normalizeSelectedStoryId(options.selectedStoryId);
  const selectedStoryId =
    requestedStoryId === "all" || storyOptionMap.has(requestedStoryId)
      ? requestedStoryId
      : "all";
  const tasks = selectedStoryId === "all"
    ? allTasks
    : allTasks.filter((task) => task.storyId === selectedStoryId);
  const columns = options.taskBoard.columns.map((column, order) => ({
    id: column.id,
    label: column.label,
    order,
    count: tasks.filter((task) => task.state === column.id).length,
  }));

  return {
    status: "ready",
    scopeKey,
    selectedStoryId,
    storyOptions,
    columns,
    tasks,
    notice: buildBoardNotice(options.connectionState),
    emptyState: tasks.length === 0
      ? {
        title: "No active tasks yet",
        detail:
          "Shipyard will populate the board as soon as stories and implementation tasks are planned for this product.",
      }
      : null,
    summary: options.taskBoard.summary,
    updatedAt: options.taskBoard.updatedAt,
  };
}
