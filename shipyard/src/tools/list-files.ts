import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { resolveWithinTarget } from "./file-state.js";
import { ToolError } from "./read-file.js";

const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 4;
const NOISY_ENTRY_NAMES = new Set([
  ".git",
  ".shipyard",
  "node_modules",
  "dist",
  "coverage",
  "build",
]);

export interface ListFilesInput {
  targetDirectory: string;
  path?: string;
  depth?: number;
}

export interface ListFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
}

export interface ListFilesResult {
  path: string;
  depth: number;
  entries: ListFileEntry[];
  tree: string;
}

const listFilesInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Optional path, relative to the target directory, to list from.",
    },
    depth: {
      type: "integer",
      description: "Optional tree depth. Defaults to 2 and caps at 4.",
    },
  },
  additionalProperties: false,
} satisfies ToolInputSchema;

function clampDepth(depth: number | undefined): number {
  if (typeof depth !== "number" || Number.isNaN(depth)) {
    return DEFAULT_DEPTH;
  }

  return Math.min(Math.max(Math.floor(depth), 0), MAX_DEPTH);
}

function sortDirectoryEntries(
  entries: Dirent[],
): Dirent[] {
  return [...entries].sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function shouldSkipEntry(name: string): boolean {
  return name.startsWith(".") || NOISY_ENTRY_NAMES.has(name);
}

function formatTreeLabel(canonicalPath: string, isDirectory: boolean): string {
  if (canonicalPath === ".") {
    return "./";
  }

  return isDirectory ? `${canonicalPath}/` : canonicalPath;
}

function formatListFilesOutput(result: ListFilesResult): string {
  const lines = [formatTreeLabel(result.path, true)];

  if (result.entries.length === 0) {
    lines.push("  (empty)");
    return lines.join("\n");
  }

  for (const entry of result.entries) {
    const indent = "  ".repeat(entry.depth);
    lines.push(`${indent}${entry.isDirectory ? `${entry.name}/` : entry.name}`);
  }

  return lines.join("\n");
}

async function collectEntries(
  absoluteDirectoryPath: string,
  targetDirectory: string,
  currentDepth: number,
  maxDepth: number,
): Promise<ListFileEntry[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const directoryEntries = sortDirectoryEntries(
    await readdir(absoluteDirectoryPath, {
      withFileTypes: true,
      encoding: "utf8",
    }),
  );
  const visibleEntries = directoryEntries.filter(
    (entry) => !shouldSkipEntry(entry.name),
  );
  const collectedEntries: ListFileEntry[] = [];

  for (const entry of visibleEntries) {
    const absolutePath = path.join(absoluteDirectoryPath, entry.name);
    const canonicalPath = path.relative(targetDirectory, absolutePath).split(path.sep).join("/");
    const nextEntry: ListFileEntry = {
      path: canonicalPath,
      name: entry.name,
      isDirectory: entry.isDirectory(),
      depth: currentDepth + 1,
    };

    collectedEntries.push(nextEntry);

    if (entry.isDirectory() && currentDepth < maxDepth) {
      const nestedEntries = await collectEntries(
        absolutePath,
        targetDirectory,
        currentDepth + 1,
        maxDepth,
      );
      collectedEntries.push(...nestedEntries);
    }
  }

  return collectedEntries;
}

export async function listFilesTool(
  input: ListFilesInput,
): Promise<ListFilesResult> {
  const rootPath = input.path?.trim() || ".";
  const resolvedPath = resolveWithinTarget(input.targetDirectory, rootPath);
  const maxDepth = clampDepth(input.depth);
  const pathStats = await stat(resolvedPath.absolutePath).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new ToolError(`Path not found: ${resolvedPath.canonicalPath}`);
    }

    throw error;
  });

  if (!pathStats.isDirectory()) {
    return {
      path: resolvedPath.canonicalPath,
      depth: maxDepth,
      entries: [
        {
          path: resolvedPath.canonicalPath,
          name: path.basename(resolvedPath.canonicalPath),
          isDirectory: false,
          depth: 0,
        },
      ],
      tree: formatTreeLabel(resolvedPath.canonicalPath, false),
    };
  }

  const entries = await collectEntries(
    resolvedPath.absolutePath,
    input.targetDirectory,
    0,
    maxDepth,
  );

  return {
    path: resolvedPath.canonicalPath,
    depth: maxDepth,
    entries,
    tree: formatListFilesOutput({
      path: resolvedPath.canonicalPath,
      depth: maxDepth,
      entries,
      tree: "",
    }),
  };
}

export const listFilesDefinition: ToolDefinition<
  Omit<ListFilesInput, "targetDirectory">
> = {
  name: "list_files",
  description:
    "List visible files within the target directory as a bounded tree view.",
  inputSchema: listFilesInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await listFilesTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(result.tree);
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(listFilesDefinition);
