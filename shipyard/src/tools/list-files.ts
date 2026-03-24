import { spawn } from "node:child_process";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { ToolError } from "./read-file.js";

export interface ListFilesInput {
  targetDirectory: string;
  glob?: string | string[];
}

const listFilesInputSchema = {
  type: "object",
  properties: {
    glob: {
      description: "Optional glob patterns to filter the file listing.",
      anyOf: [
        {
          type: "string",
        },
        {
          type: "array",
          items: {
            type: "string",
          },
        },
      ],
    },
  },
  additionalProperties: false,
} satisfies ToolInputSchema;

function normalizeGlobs(glob: string | string[] | undefined): string[] {
  if (!glob) {
    return [];
  }

  return Array.isArray(glob) ? glob : [glob];
}

function collectProcessOutput(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export async function listFilesTool(input: ListFilesInput): Promise<string[]> {
  const globArgs = normalizeGlobs(input.glob).flatMap((pattern) => ["-g", pattern]);
  const result = await collectProcessOutput(
    "rg",
    ["--files", ...globArgs],
    input.targetDirectory,
  );

  if (result.code !== 0 && result.code !== 1) {
    throw new ToolError(result.stderr || "rg --files failed.");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export const listFilesDefinition: ToolDefinition<
  Omit<ListFilesInput, "targetDirectory">
> = {
  name: "list_files",
  description: "List files within the target directory, optionally filtered by glob.",
  inputSchema: listFilesInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await listFilesTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(result);
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(listFilesDefinition);
