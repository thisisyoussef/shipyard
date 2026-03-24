import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { runCommandTool } from "./run-command.js";

export interface GitDiffInput {
  targetDirectory: string;
  args?: string;
}

const gitDiffInputSchema = {
  type: "object",
  properties: {
    args: {
      type: "string",
      description: "Optional arguments to append after git diff --no-ext-diff.",
    },
  },
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function gitDiffTool(input: GitDiffInput) {
  const command = input.args?.trim()
    ? `git diff --no-ext-diff ${input.args.trim()}`
    : "git diff --no-ext-diff";

  return runCommandTool({
    targetDirectory: input.targetDirectory,
    command,
  });
}

export const gitDiffDefinition: ToolDefinition<Omit<GitDiffInput, "targetDirectory">> = {
  name: "git_diff",
  description: "Run git diff inside the target directory.",
  inputSchema: gitDiffInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await gitDiffTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult({
        command: result.command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        signal: result.signal,
      });
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(gitDiffDefinition);
