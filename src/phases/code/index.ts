import type { TaskPlan } from "../../artifacts/types.js";
import type { Phase } from "../phase.js";
import { CODE_PHASE_SYSTEM_PROMPT } from "./prompts.js";

const CODE_PHASE_TOOLS = [
  "read-file",
  "write-file",
  "edit-block",
  "list-files",
  "search-files",
  "run-command",
  "git-diff",
];

export function createCodePhase(): Phase {
  return {
    name: "code",
    tools: CODE_PHASE_TOOLS,
    systemPrompt: CODE_PHASE_SYSTEM_PROMPT,
    async execute(input) {
      const taskPlan: TaskPlan = {
        goal: input.instruction,
        steps: [
          "Inspect the target repository state",
          "Choose the smallest safe edit set",
          "Verify the change with targeted commands",
        ],
      };

      return {
        notes: [
          "Code phase scaffold is in place.",
          "Prompt, tools, and typed artifacts can now evolve independently.",
        ],
        artifacts: [taskPlan],
      };
    },
  };
}
