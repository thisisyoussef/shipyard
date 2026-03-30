import type {
  ProjectBoardViewModel,
  SessionStateViewModel,
  TargetManagerViewModel,
} from "./view-models.js";
import { parseHash, type Route } from "./router.js";
import {
  getActiveProject,
  getSelectedTarget,
  getSelectedTargetPath,
} from "./target-selection.js";

export type AppRoute = Route;

export function resolveAppRoute(pathname: string, hash: string): AppRoute {
  const normalizedPath = pathname.trim().replace(/\/+$/, "") || "/";

  if (normalizedPath === "/human-feedback") {
    return { view: "human-feedback" };
  }

  return parseHash(hash);
}

export type ProductRouteIntent =
  | { kind: "none" }
  | { kind: "activate-project"; projectId: string }
  | { kind: "switch-target"; targetPath: string };

export interface ProductRouteState {
  status: "active" | "opening" | "missing";
  productId: string;
  productName: string | null;
  intent: ProductRouteIntent;
}

export type EditorRouteIntent = ProductRouteIntent;
export type EditorRouteState = ProductRouteState;
export type BoardRouteState = ProductRouteState;

interface SelectProductRouteStateOptions {
  productId: string;
  projectBoard: ProjectBoardViewModel | null;
  targetManager: TargetManagerViewModel | null;
  sessionState: SessionStateViewModel | null;
}

function findOpenProject(
  projectBoard: ProjectBoardViewModel | null,
  productId: string,
) {
  return projectBoard?.openProjects.find((project) =>
    project.projectId === productId || project.targetPath === productId
  );
}

function selectProductRouteState(
  options: SelectProductRouteStateOptions,
): ProductRouteState {
  const activeProject = getActiveProject(options.projectBoard);
  const selectedTarget = getSelectedTarget(options.targetManager);
  const activeTargetPath = activeProject?.targetPath
    ?? selectedTarget?.path
    ?? null;
  const activeSessionTargetPath = options.sessionState?.targetDirectory ?? null;
  const routeMatchesActiveProject = activeProject?.projectId === options.productId;
  const routeMatchesActiveTarget = activeTargetPath === options.productId;
  const expectedActiveTargetPath = routeMatchesActiveProject
    ? activeProject?.targetPath ?? null
    : routeMatchesActiveTarget
      ? activeTargetPath
      : null;
  const requestedProductName =
    activeProject?.targetName ??
    selectedTarget?.name ??
    (activeSessionTargetPath === options.productId
      ? options.sessionState?.targetLabel ?? null
      : null);

  if (expectedActiveTargetPath) {
    if (activeSessionTargetPath === expectedActiveTargetPath) {
      return {
        status: "active",
        productId: options.productId,
        productName: requestedProductName,
        intent: { kind: "none" },
      };
    }

    return {
      status: "opening",
      productId: options.productId,
      productName: requestedProductName,
      intent: { kind: "none" },
    };
  }

  if (activeSessionTargetPath === options.productId) {
    return {
      status: "opening",
      productId: options.productId,
      productName: requestedProductName,
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

export function selectEditorRouteState(
  options: SelectProductRouteStateOptions,
): EditorRouteState {
  return selectProductRouteState(options);
}

export function selectBoardRouteState(
  options: SelectProductRouteStateOptions,
): BoardRouteState {
  return selectProductRouteState(options);
}

function getPreferredProductId(
  projectBoard: ProjectBoardViewModel | null,
  targetManager: TargetManagerViewModel | null,
): string | null {
  const activeProject = getActiveProject(projectBoard);

  if (activeProject) {
    return activeProject.targetPath;
  }

  return getSelectedTargetPath(targetManager);
}

export function getPreferredEditorRoute(
  projectBoard: ProjectBoardViewModel | null,
  targetManager: TargetManagerViewModel | null,
): Extract<Route, { view: "editor" }> | null {
  const productId = getPreferredProductId(projectBoard, targetManager);

  if (!productId) {
    return null;
  }

  return {
    view: "editor",
    productId,
  };
}

export function getPreferredBoardRoute(
  projectBoard: ProjectBoardViewModel | null,
  targetManager: TargetManagerViewModel | null,
): Extract<Route, { view: "board" }> | null {
  const productId = getPreferredProductId(projectBoard, targetManager);

  if (!productId) {
    return null;
  }

  return {
    view: "board",
    productId,
  };
}
