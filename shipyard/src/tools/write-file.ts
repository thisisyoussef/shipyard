import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { countLines, resolveWithinTarget } from "./file-state.js";
import { ToolError, readFileTool } from "./read-file.js";

export interface WriteFileInput {
  targetDirectory: string;
  path: string;
  content: string;
  overwrite?: boolean;
}

const writeFileInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to create, relative to the target directory.",
    },
    content: {
      type: "string",
      description: "UTF-8 file contents to write.",
    },
    overwrite: {
      type: "boolean",
      description: "Whether Shipyard may replace an existing file.",
    },
  },
  required: ["path", "content"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function formatWriteFileOutput(
  pathLabel: string,
  lineCount: number,
  overwrite: boolean,
): string {
  return [
    `${overwrite ? "Replaced" : "Created"} ${pathLabel}`,
    `Lines: ${lineCount}`,
  ].join("\n");
}

function toWriteToolError(pathLabel: string, error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return new ToolError(error.message);
  }

  return new ToolError(`Failed to write ${pathLabel}.`);
}

export async function writeFileTool(
  input: WriteFileInput,
) {
  let resolvedPath: {
    canonicalPath: string;
    absolutePath: string;
  };

  try {
    resolvedPath = resolveWithinTarget(input.targetDirectory, input.path);
  } catch (error) {
    throw toWriteToolError("path", error);
  }

  try {
    const existing = await stat(resolvedPath.absolutePath);

    if (existing.isDirectory()) {
      throw new ToolError(
        `Cannot write to a directory path: ${resolvedPath.canonicalPath}`,
      );
    }

    if (!input.overwrite) {
      throw new ToolError(
        `File already exists: ${resolvedPath.canonicalPath}. Use edit_block for targeted changes or set overwrite: true for full replacement.`,
      );
    }
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }

    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw toWriteToolError(resolvedPath.canonicalPath, error);
    }
  }

  try {
    await mkdir(path.dirname(resolvedPath.absolutePath), { recursive: true });
    await writeFile(resolvedPath.absolutePath, input.content, "utf8");
  } catch (error) {
    throw toWriteToolError(resolvedPath.canonicalPath, error);
  }

  return readFileTool({
    targetDirectory: input.targetDirectory,
    path: resolvedPath.canonicalPath,
  });
}

export const writeFileDefinition: ToolDefinition<Omit<WriteFileInput, "targetDirectory">> = {
  name: "write_file",
  description:
    "Create a file relative to the target directory. Rejects overwrites by default.",
  inputSchema: writeFileInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await writeFileTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(
        formatWriteFileOutput(
          result.path,
          countLines(result.contents),
          input.overwrite ?? false,
        ),
      );
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(writeFileDefinition);
