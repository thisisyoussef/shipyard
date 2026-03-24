import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ToolDefinition } from "./registry.js";

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

function ensureRelativePath(filePath: string): void {
  if (!filePath || path.isAbsolute(filePath)) {
    throw new ToolError("Paths must be relative to the target directory.");
  }
}

export function resolveWithinTarget(
  targetDirectory: string,
  relativePath: string,
): string {
  ensureRelativePath(relativePath);

  const resolvedTarget = path.resolve(targetDirectory);
  const resolvedPath = path.resolve(resolvedTarget, relativePath);

  if (
    resolvedPath !== resolvedTarget &&
    !resolvedPath.startsWith(`${resolvedTarget}${path.sep}`)
  ) {
    throw new ToolError("Path escapes the target directory.");
  }

  return resolvedPath;
}

export function hashContents(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

export async function readFileTool(
  input: ReadFileInput,
): Promise<ReadFileResult> {
  const absolutePath = resolveWithinTarget(input.targetDirectory, input.path);
  const contents = await readFile(absolutePath, "utf8");

  return {
    path: input.path,
    absolutePath,
    contents,
    hash: hashContents(contents),
  };
}

export const readFileDefinition: ToolDefinition<ReadFileInput, ReadFileResult> = {
  name: "read_file",
  description: "Read a file relative to the target directory and return its hash.",
  invoke: readFileTool,
};
