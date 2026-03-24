import type { ToolDefinition } from "./registry.js";
import { runCommandTool } from "./run-command.js";

export interface GitDiffInput {
  targetDirectory: string;
  args?: string;
}

export async function gitDiffTool(input: GitDiffInput) {
  const command = input.args?.trim()
    ? `git diff --no-ext-diff ${input.args.trim()}`
    : "git diff --no-ext-diff";

  return runCommandTool({
    targetDirectory: input.targetDirectory,
    command,
  });
}

export const gitDiffDefinition: ToolDefinition<GitDiffInput> = {
  name: "git-diff",
  description: "Run git diff inside the target directory.",
  invoke: gitDiffTool,
};
