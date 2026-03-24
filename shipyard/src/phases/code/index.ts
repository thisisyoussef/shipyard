import type { TaskPlan } from "../../artifacts/types.js";
import type { Phase } from "../phase.js";
import { CODE_PHASE_SYSTEM_PROMPT } from "./prompts.js";

export const CODE_PHASE_TOOL_NAMES = [
  "read_file",
  "write_file",
  "edit_block",
  "list_files",
  "search_files",
  "run_command",
  "git_diff",
];

export const codePhase: Phase = {
  name: "code",
  description: "Default autonomous coding phase for repository changes.",
  systemPrompt: CODE_PHASE_SYSTEM_PROMPT,
  tools: CODE_PHASE_TOOL_NAMES,
  approvalRequired: false,
  inputArtifact: "instruction",
  outputArtifact: "task_plan",
};

export function createCodePhase(): Phase {
  return codePhase;
}

export function createStubCodeTaskPlan(instruction: string): TaskPlan {
  return {
    instruction,
    goal: instruction,
    targetFilePaths: [],
    plannedSteps: [
      "Read the relevant files before editing.",
      "Choose the smallest unique anchor for each change.",
      "Verify the result after the edit.",
    ],
  };
}
