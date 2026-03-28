import type { ProjectBoardViewModel, TargetManagerViewModel } from "./view-models.js";
import { parseHash, type Route } from "./router.js";

export type AppRoute = Route;

export function resolveAppRoute(pathname: string, hash: string): AppRoute {
  const normalizedPath = pathname.trim().replace(/\/+$/, "") || "/";

  if (normalizedPath === "/human-feedback") {
    return { view: "human-feedback" };
  }

  return parseHash(hash);
}

export type EditorRouteIntent =
  | { kind: "none" }
  | { kind: "activate-project"; projectId: string }
  | { kind: "switch-target"; targetPath: string };

export interface EditorRouteState {
  status: "active" | "opening" | "missing";
  productId: string;
  productName: string | null;
  intent: EditorRouteIntent;
}

interface SelectEditorRouteStateOptions {
  productId: string;
  projectBoard: ProjectBoardViewModel | null;
  targetManager: TargetManagerViewModel | null;
}

function findOpenProject(
  projectBoard: ProjectBoardViewModel | null,
  productId: string,
) {
  return projectBoard?.openProjects.find((project) =>
    project.projectId === productId || project.targetPath === productId
  );
}

function getActiveProject(projectBoard: ProjectBoardViewModel | null) {
  if (!projectBoard?.activeProjectId) {
    return null;
  }

  return projectBoard.openProjects.find(
    (project) => project.projectId === projectBoard.activeProjectId,
  ) ?? null;
}

export function selectEditorRouteState(
  options: SelectEditorRouteStateOptions,
): EditorRouteState {
  const activeProject = getActiveProject(options.projectBoard);
  const activeTargetPath = activeProject?.targetPath
    ?? options.targetManager?.currentTarget.path
    ?? null;

  if (
    activeTargetPath === options.productId ||
    activeProject?.projectId === options.productId
  ) {
    return {
      status: "active",
      productId: options.productId,
      productName:
        activeProject?.targetName ?? options.targetManager?.currentTarget.name ?? null,
      intent: { kind: "none" },
    };
  }

  const openProject = findOpenProject(options.projectBoard, options.productId);

  if (openProject) {
    return {
      status: "opening",
      productId: options.productId,
      productName: openProject.targetName,
      intent: {
        kind: "activate-project",
        projectId: openProject.projectId,
      },
    };
  }

  const knownTarget = options.targetManager?.availableTargets.find(
    (target) => target.path === options.productId,
  );

  if (knownTarget) {
    return {
      status: "opening",
      productId: options.productId,
      productName: knownTarget.name,
      intent: {
        kind: "switch-target",
        targetPath: knownTarget.path,
      },
    };
  }

  return {
    status: "missing",
    productId: options.productId,
    productName: null,
    intent: { kind: "none" },
  };
}

export function getPreferredEditorRoute(
  projectBoard: ProjectBoardViewModel | null,
  targetManager: TargetManagerViewModel | null,
): Extract<Route, { view: "editor" }> | null {
  const activeProject = getActiveProject(projectBoard);

  if (activeProject) {
    return {
      view: "editor",
      productId: activeProject.targetPath,
    };
  }

  const currentTargetPath = targetManager?.currentTarget.path;

  if (!currentTargetPath) {
    return null;
  }

  return {
    view: "editor",
    productId: currentTargetPath,
  };
}
