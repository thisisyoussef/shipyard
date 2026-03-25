import { spawn } from "node:child_process";

import {
  createTurnCancelledError,
  toTurnCancelledError,
  throwIfTurnCancelled,
} from "../engine/cancellation.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { ToolError } from "./read-file.js";

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const MAX_COMBINED_OUTPUT_CHARS = 5_000;
const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m/g;

export interface RunCommandInput {
  targetDirectory: string;
  command: string;
  timeout_seconds?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RunCommandResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
  timeoutMs: number;
  combinedOutput: string;
  truncated: boolean;
}

export interface ExecuteProcessInput {
  cwd: string;
  command: string;
  args?: string[];
  shell?: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  displayCommand?: string;
  env?: NodeJS.ProcessEnv;
}

const runCommandInputSchema = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description: "Shell command to run inside the target directory.",
    },
    timeout_seconds: {
      type: "integer",
      description: "Optional timeout in seconds. Defaults to 30 and caps at 120.",
    },
  },
  required: ["command"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}

function clampTimeoutMs(
  timeoutSeconds: number | undefined,
  legacyTimeoutMs: number | undefined,
): number {
  if (typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds)) {
    const boundedSeconds = Math.min(
      Math.max(Math.floor(timeoutSeconds), 1),
      MAX_TIMEOUT_SECONDS,
    );

    return boundedSeconds * 1_000;
  }

  if (typeof legacyTimeoutMs === "number" && Number.isFinite(legacyTimeoutMs)) {
    return Math.min(
      Math.max(Math.floor(legacyTimeoutMs), 1_000),
      MAX_TIMEOUT_SECONDS * 1_000,
    );
  }

  return DEFAULT_TIMEOUT_SECONDS * 1_000;
}

function clipText(value: string, limit: number): {
  clipped: string;
  truncated: boolean;
} {
  if (value.length <= limit) {
    return {
      clipped: value,
      truncated: false,
    };
  }

  const suffix = `\n...[truncated to ${String(limit)} chars]`;
  const clipped = `${value.slice(0, limit - suffix.length)}${suffix}`;

  return {
    clipped,
    truncated: true,
  };
}

function buildCombinedOutput(stdout: string, stderr: string): string {
  const sections = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean);

  return sections.join(sections.length === 2 ? "\n" : "");
}

function formatRunCommandOutput(result: RunCommandResult): string {
  const lines = [
    `Command: ${result.command}`,
    `Exit code: ${String(result.exitCode)}`,
    `Timed out: ${result.timedOut ? "yes" : "no"}`,
  ];

  if (result.signal) {
    lines.push(`Signal: ${result.signal}`);
  }

  if (result.truncated) {
    lines.push(`Output truncated to ${String(MAX_COMBINED_OUTPUT_CHARS)} characters.`);
  }

  if (result.combinedOutput) {
    lines.push("", result.combinedOutput);
  }

  return lines.join("\n");
}

function terminateProcessTree(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to killing the direct child below.
    }
  }

  child.kill(signal);
}

export async function executeProcess(
  input: ExecuteProcessInput,
): Promise<RunCommandResult> {
  throwIfTurnCancelled(input.signal);

  return new Promise((resolve, reject) => {
    const child = input.shell
      ? spawn(input.command, {
          cwd: input.cwd,
          shell: true,
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            ...input.env,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
            TERM: "dumb",
          },
        })
      : spawn(input.command, input.args ?? [], {
          cwd: input.cwd,
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            ...input.env,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
            TERM: "dumb",
          },
        });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let closed = false;
    let abortEscalationHandle: NodeJS.Timeout | null = null;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, "SIGTERM");

      setTimeout(() => {
        if (!closed) {
          terminateProcessTree(child, "SIGKILL");
        }
      }, 250).unref();
    }, input.timeoutMs);

    const handleAbortSignal = () => {
      if (closed || cancelled) {
        return;
      }

      cancelled = true;
      terminateProcessTree(child, "SIGTERM");
      abortEscalationHandle = setTimeout(() => {
        if (!closed) {
          terminateProcessTree(child, "SIGKILL");
        }
      }, 250);
      abortEscalationHandle.unref();
    };

    const cleanupListeners = () => {
      clearTimeout(timeoutHandle);

      if (abortEscalationHandle) {
        clearTimeout(abortEscalationHandle);
      }

      input.signal?.removeEventListener("abort", handleAbortSignal);
    };

    if (input.signal?.aborted) {
      handleAbortSignal();
    } else {
      input.signal?.addEventListener("abort", handleAbortSignal, {
        once: true,
      });
    }

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      cleanupListeners();
      const cancelledError = toTurnCancelledError(error, input.signal);

      if (cancelled || cancelledError) {
        reject(cancelledError ?? createTurnCancelledError(input.signal?.reason));
        return;
      }

      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      closed = true;
      cleanupListeners();

      if (cancelled || input.signal?.aborted) {
        reject(createTurnCancelledError(input.signal?.reason));
        return;
      }

      const sanitizedStdout = stripAnsi(stdout);
      const sanitizedStderr = stripAnsi(stderr);
      const combined = buildCombinedOutput(sanitizedStdout, sanitizedStderr);
      const clipped = clipText(combined, MAX_COMBINED_OUTPUT_CHARS);

      resolve({
        command:
          input.displayCommand ??
          (input.shell
            ? input.command
            : [input.command, ...(input.args ?? [])].join(" ")),
        cwd: input.cwd,
        stdout: sanitizedStdout,
        stderr: sanitizedStderr,
        exitCode,
        timedOut,
        signal,
        timeoutMs: input.timeoutMs,
        combinedOutput: clipped.clipped,
        truncated: clipped.truncated,
      });
    });
  });
}

export async function runCommandTool(
  input: RunCommandInput,
): Promise<RunCommandResult> {
  const command = input.command.trim();

  if (!command) {
    throw new ToolError("command must not be empty.");
  }

  const timeoutMs = clampTimeoutMs(input.timeout_seconds, input.timeoutMs);

  return executeProcess({
    cwd: input.targetDirectory,
    command,
    shell: true,
    timeoutMs,
    signal: input.signal,
  });
}

export const runCommandDefinition: ToolDefinition<
  Omit<RunCommandInput, "targetDirectory" | "timeoutMs">
> = {
  name: "run_command",
  description:
    "Run a shell command inside the target directory with bounded output and timeout handling.",
  inputSchema: runCommandInputSchema,
  async execute(input, targetDirectory, context) {
    try {
      const result = await runCommandTool({
        targetDirectory,
        ...input,
        signal: context?.signal,
      });
      const formattedOutput = formatRunCommandOutput(result);

      if (result.exitCode !== 0 || result.timedOut) {
        return {
          success: false,
          output: "",
          error: formattedOutput,
        };
      }

      return createToolSuccessResult(formattedOutput);
    } catch (error) {
      const cancelledError = toTurnCancelledError(error, context?.signal);

      if (cancelledError) {
        throw cancelledError;
      }

      return createToolErrorResult(error);
    }
  },
};

registerTool(runCommandDefinition);
