import { spawn } from "node:child_process";

import type { ToolDefinition } from "./registry.js";

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
  RunCommandInput,
  RunCommandResult
> = {
  name: "run_command",
  description: "Run a shell command inside the target directory with a timeout.",
  invoke: runCommandTool,
};
