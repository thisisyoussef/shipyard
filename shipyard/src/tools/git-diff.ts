import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { normalizeTargetRelativePath } from "./file-state.js";
import { ToolError } from "./read-file.js";
import {
  executeProcess,
  type RunCommandResult,
} from "./run-command.js";

export interface GitDiffInput {
  targetDirectory: string;
  staged?: boolean;
  path?: string;
}

const gitDiffInputSchema = {
  type: "object",
  properties: {
    staged: {
      type: "boolean",
      description: "Whether to diff staged changes instead of the working tree.",
    },
    path: {
      type: "string",
      description: "Optional path, relative to the target directory, that scopes the diff.",
    },
  },
  additionalProperties: false,
} satisfies ToolInputSchema;

function formatGitDiffOutput(result: RunCommandResult): string {
  const lines = [
    `Command: ${result.command}`,
    `Exit code: ${String(result.exitCode)}`,
    `Timed out: ${result.timedOut ? "yes" : "no"}`,
  ];

  if (result.signal) {
    lines.push(`Signal: ${result.signal}`);
  }

  if (result.truncated) {
    lines.push("Output truncated to 5000 characters.");
  }

  if (result.combinedOutput) {
    lines.push("", result.combinedOutput);
  }

  return lines.join("\n");
}

async function ensureGitRepository(targetDirectory: string): Promise<void> {
  const result = await executeProcess({
    cwd: targetDirectory,
    command: "git",
    args: ["rev-parse", "--is-inside-work-tree"],
    timeoutMs: 5_000,
  });

  if (result.exitCode !== 0 || result.stdout.trim() !== "true") {
    throw new ToolError("Target directory is not a git repository.");
  }
}

export async function gitDiffTool(input: GitDiffInput): Promise<RunCommandResult> {
  await ensureGitRepository(input.targetDirectory);

  const args = ["diff", "--no-ext-diff"];

  if (input.staged) {
    args.push("--staged");
  }

  if (input.path?.trim()) {
    args.push("--", normalizeTargetRelativePath(input.path));
  }

  return executeProcess({
    cwd: input.targetDirectory,
    command: "git",
    args,
    timeoutMs: 30_000,
  });
}

export const gitDiffDefinition: ToolDefinition<
  Omit<GitDiffInput, "targetDirectory">
> = {
  name: "git_diff",
  description:
    "Run git diff inside the target directory, optionally staged or path-scoped.",
  inputSchema: gitDiffInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await gitDiffTool({
        targetDirectory,
        ...input,
      });

      if (result.exitCode !== 0 || result.timedOut) {
        return {
          success: false,
          output: "",
          error: formatGitDiffOutput(result),
        };
      }

      return createToolSuccessResult(formatGitDiffOutput(result));
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(gitDiffDefinition);
