import { spawn } from "node:child_process";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";

export interface RunCommandInput {
  targetDirectory: string;
  command: string;
  timeoutMs?: number;
}

export interface RunCommandResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
}

const runCommandInputSchema = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description: "Shell command to run inside the target directory.",
    },
    timeoutMs: {
      type: "integer",
      description: "Optional timeout in milliseconds.",
    },
  },
  required: ["command"],
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function runCommandTool(
  input: RunCommandInput,
): Promise<RunCommandResult> {
  const timeoutMs = input.timeoutMs ?? 15_000;

  return new Promise((resolve, reject) => {
    const child = spawn(input.command, {
      cwd: input.targetDirectory,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timeoutHandle);
      resolve({
        command: input.command,
        cwd: input.targetDirectory,
        stdout,
        stderr,
        exitCode,
        timedOut,
        signal,
      });
    });
  });
}

export const runCommandDefinition: ToolDefinition<
  Omit<RunCommandInput, "targetDirectory">
> = {
  name: "run_command",
  description: "Run a shell command inside the target directory with a timeout.",
  inputSchema: runCommandInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await runCommandTool({
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

registerTool(runCommandDefinition);
