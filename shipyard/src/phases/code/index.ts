import type { TaskPlan } from "../../artifacts/types.js";
import { editBlockDefinition } from "../../tools/edit-block.js";
import { gitDiffDefinition } from "../../tools/git-diff.js";
import { listFilesDefinition } from "../../tools/list-files.js";
import { readFileDefinition } from "../../tools/read-file.js";
import { runCommandDefinition } from "../../tools/run-command.js";
import { searchFilesDefinition } from "../../tools/search-files.js";
import { writeFileDefinition } from "../../tools/write-file.js";
import type { Phase } from "../phase.js";
import { CODE_PHASE_SYSTEM_PROMPT } from "./prompts.js";

const CODE_PHASE_TOOLS = [
  readFileDefinition,
  writeFileDefinition,
  editBlockDefinition,
  listFilesDefinition,
  searchFilesDefinition,
  runCommandDefinition,
  gitDiffDefinition,
];

export function createCodePhase(): Phase {
  return {
    name: "code",
    tools: CODE_PHASE_TOOLS,
    systemPrompt: CODE_PHASE_SYSTEM_PROMPT,
    approvalRequired: false,
    inputArtifact: "instruction",
    outputArtifact: "task-plan",
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
