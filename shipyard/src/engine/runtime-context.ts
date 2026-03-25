import { loadProjectRules } from "../context/envelope.js";
import type { SessionState } from "./state.js";
import type { InstructionRuntimeState } from "./turn.js";

export function createProjectRulesInjectedContext(projectRules: string): string[] {
  return projectRules
    ? ["Loaded AGENTS.md rules into the stable context layer."]
    : [];
}

export function createTargetManagerInjectedContext(
  targetsDirectory: string,
): string[] {
  return [
    `Target manager mode is active.`,
    `Targets directory: ${targetsDirectory}`,
    "When calling list_targets or create_target, use the exact absolute targets directory from context.",
  ];
}

export async function applySessionSwitchToRuntime(
  sessionState: SessionState,
  runtimeState: InstructionRuntimeState,
): Promise<void> {
  runtimeState.projectRules = await loadProjectRules(sessionState.targetDirectory);
  runtimeState.baseInjectedContext = createProjectRulesInjectedContext(
    runtimeState.projectRules,
  );
  runtimeState.recentToolOutputs = [];
  runtimeState.recentErrors = [];
  runtimeState.retryCountsByFile = {};
  runtimeState.blockedFiles = [];
  runtimeState.pendingTargetSelectionPath = null;
}
