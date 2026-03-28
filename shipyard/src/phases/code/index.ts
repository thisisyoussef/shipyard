import "../../tools/index.js";
import type { TaskPlan } from "../../artifacts/types.js";
import { CODE_PHASE_MODEL_ROUTE } from "../../engine/model-routing.js";
import {
  getTools,
  type ToolDefinition,
} from "../../tools/registry.js";
import type { Phase } from "../phase.js";
import { CODE_PHASE_SYSTEM_PROMPT } from "./prompts.js";

export const CODE_PHASE_TOOL_NAMES = [
  "read_file",
  "load_spec",
  "write_file",
  "bootstrap_target",
  "edit_block",
  "list_files",
  "search_files",
  "run_command",
  "git_diff",
  "deploy_target",
];

export const codePhase: Phase = {
  name: "code",
  description: "Default autonomous coding phase for repository changes.",
  systemPrompt: CODE_PHASE_SYSTEM_PROMPT,
  tools: CODE_PHASE_TOOL_NAMES,
  modelRoute: CODE_PHASE_MODEL_ROUTE,
  agentProfileId: "implementer",
  defaultSkills: ["runtime-safety"],
  approvalRequired: false,
  approvalGate: "disabled",
  inputArtifact: "instruction",
  outputArtifact: "task_plan",
  consumesArtifacts: ["instruction"],
  producesArtifacts: ["task_plan"],
};

export function createCodePhase(): Phase {
  return codePhase;
}

export function getCodePhaseToolDefinitions(): ToolDefinition[] {
  return getTools(CODE_PHASE_TOOL_NAMES);
}

export function createStubCodeTaskPlan(instruction: string): TaskPlan {
  return {
    instruction,
    goal: instruction,
    targetFilePaths: [],
    plannedSteps: [
      "Read the relevant files before editing.",
      "Choose the smallest unique anchor for each change.",
      "Leave command-based verification to the verifier after the edit unless shell output is required now.",
    ],
  };
}
