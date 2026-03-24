import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { ToolError, readFileTool, resolveWithinTarget } from "./read-file.js";

export interface WriteFileInput {
  targetDirectory: string;
  path: string;
  contents: string;
  overwrite?: boolean;
}

const writeFileInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to create, relative to the target directory.",
    },
    contents: {
      type: "string",
      description: "UTF-8 file contents to write.",
    },
    overwrite: {
      type: "boolean",
      description: "Whether Shipyard may replace an existing file.",
    },
  },
  required: ["path", "contents"],
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function writeFileTool(input: WriteFileInput) {
  const absolutePath = resolveWithinTarget(input.targetDirectory, input.path);
  const fileExists = await readFileTool({
    targetDirectory: input.targetDirectory,
    path: input.path,
  })
    .then(() => true)
    .catch(() => false);

  if (fileExists && !input.overwrite) {
    throw new ToolError(`File already exists: ${input.path}`);
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.contents, "utf8");

  return readFileTool({
    targetDirectory: input.targetDirectory,
    path: input.path,
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

      return createToolSuccessResult({
        path: result.path,
        contents: result.contents,
        hash: result.hash,
      });
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(writeFileDefinition);
