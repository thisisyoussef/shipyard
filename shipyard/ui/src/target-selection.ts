import type {
  ProjectBoardProjectViewModel,
  ProjectBoardViewModel,
  TargetManagerViewModel,
} from "./view-models.js";

export const TARGET_MANAGER_UNSELECTED_NAME = "No target selected";

export function getSelectedTarget(
  targetManager: TargetManagerViewModel | null,
) {
  const currentTarget = targetManager?.currentTarget;

  if (
    !currentTarget?.path ||
    currentTarget.name === TARGET_MANAGER_UNSELECTED_NAME
  ) {
    return null;
  }

  return currentTarget;
}

export function getSelectedTargetPath(
  targetManager: TargetManagerViewModel | null,
): string | null {
  return getSelectedTarget(targetManager)?.path ?? null;
}

export function getActiveProject(
  projectBoard: ProjectBoardViewModel | null,
): ProjectBoardProjectViewModel | null {
  if (!projectBoard?.activeProjectId) {
    return null;
  }

  return projectBoard.openProjects.find(
    (project) => project.projectId === projectBoard.activeProjectId,
  ) ?? null;
}
