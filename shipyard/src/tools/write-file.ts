import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ToolDefinition } from "./registry.js";
import { ToolError, readFileTool, resolveWithinTarget } from "./read-file.js";

export interface WriteFileInput {
  targetDirectory: string;
  path: string;
  contents: string;
  overwrite?: boolean;
}

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

export const writeFileDefinition: ToolDefinition<WriteFileInput> = {
  name: "write-file",
  description:
    "Create a file relative to the target directory. Rejects overwrites by default.",
  invoke: writeFileTool,
};
