import { readFile, stat } from "node:fs/promises";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import {
  countLines,
  createDisplayHash,
  hashContents,
  rememberReadHash,
  resolveWithinTarget,
} from "./file-state.js";

export class ToolError extends Error {}

export interface ReadFileInput {
  targetDirectory: string;
  path: string;
}

export interface ReadFileResult {
  path: string;
  absolutePath: string;
  contents: string;
  hash: string;
}

const readFileInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to read, relative to the target directory.",
    },
  },
  required: ["path"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function toReadToolError(pathLabel: string, error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return new ToolError(error.message);
  }

  return new ToolError(`Failed to read ${pathLabel}.`);
}

function formatReadFileOutput(result: ReadFileResult): string {
  return [
    `Path: ${result.path}`,
    `Lines: ${countLines(result.contents)}`,
    `Hash: ${createDisplayHash(result.hash)}`,
    "",
    result.contents,
  ].join("\n");
}

export async function readFileTool(
  input: ReadFileInput,
): Promise<ReadFileResult> {
  let resolvedPath: {
    canonicalPath: string;
    absolutePath: string;
  };

  try {
    resolvedPath = resolveWithinTarget(input.targetDirectory, input.path);
  } catch (error) {
    throw toReadToolError("path", error);
  }

  try {
    const fileStats = await stat(resolvedPath.absolutePath);

    if (fileStats.isDirectory()) {
      throw new ToolError(
        `Expected a file but found a directory: ${resolvedPath.canonicalPath}`,
      );
    }

    const contents = await readFile(resolvedPath.absolutePath, "utf8");
    const hash = hashContents(contents);
    rememberReadHash(resolvedPath.canonicalPath, hash);

    return {
      path: resolvedPath.canonicalPath,
      absolutePath: resolvedPath.absolutePath,
      contents,
      hash,
    };
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new ToolError(`File not found: ${resolvedPath.canonicalPath}`);
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EISDIR"
    ) {
      throw new ToolError(
        `Expected a file but found a directory: ${resolvedPath.canonicalPath}`,
      );
    }

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "unknown error";

    throw new ToolError(
      `Failed to read ${resolvedPath.canonicalPath}: ${errorCode}`,
    );
  }
}

export const readFileDefinition: ToolDefinition<Omit<ReadFileInput, "targetDirectory">> = {
  name: "read_file",
  description:
    "Read a file relative to the target directory, return its contents, and remember its hash for later edits.",
  inputSchema: readFileInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await readFileTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(formatReadFileOutput(result));
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(readFileDefinition);
