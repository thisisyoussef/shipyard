import type { Dirent } from "node:fs";
import { lstat, open, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  CodeBrowserReadResponse,
  CodeBrowserTreeNode,
  CodeBrowserTreeResponse,
} from "./contracts.js";
import { resolveWithinTarget } from "../tools/file-state.js";

const NOISY_ENTRY_NAMES = new Set([
  ".git",
  ".shipyard",
  "node_modules",
  "dist",
  "coverage",
  "build",
]);
const DEFAULT_TREE_DEPTH = 4;
const MAX_TREE_DEPTH = 4;
const MAX_CODE_BROWSER_FILE_BYTES = 256_000;
const MAX_CODE_BROWSER_CHARACTERS = 8_000;
const NON_TEXT_SAMPLE_BYTES = 2_048;

type CodeBrowserErrorCode =
  | "access_denied"
  | "not_found"
  | "not_directory"
  | "not_file"
  | "read_failed";

export class CodeBrowserError extends Error {
  readonly statusCode: number;
  readonly code: CodeBrowserErrorCode;

  constructor(
    message: string,
    statusCode: number,
    code: CodeBrowserErrorCode,
  ) {
    super(message);
    this.name = "CodeBrowserError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ListCodeBrowserTreeInput {
  targetDirectory: string;
  projectId: string;
  rootPath?: string;
  depth?: number;
}

interface ReadCodeBrowserFileInput {
  targetDirectory: string;
  projectId: string;
  filePath: string;
}

function clampTreeDepth(depth: number | undefined): number {
  if (typeof depth !== "number" || Number.isNaN(depth)) {
    return DEFAULT_TREE_DEPTH;
  }

  return Math.min(Math.max(Math.floor(depth), 0), MAX_TREE_DEPTH);
}

function sortDirectoryEntries(entries: Dirent[]): Dirent[] {
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

function createCodeBrowserError(
  error: unknown,
  fallbackMessage: string,
): CodeBrowserError {
  if (error instanceof CodeBrowserError) {
    return error;
  }

  if (
    error instanceof Error &&
    error.message.includes("Access denied: path must stay within the target directory.")
  ) {
    return new CodeBrowserError(error.message, 403, "access_denied");
  }

  return new CodeBrowserError(fallbackMessage, 500, "read_failed");
}

function createNotFoundError(canonicalPath: string): CodeBrowserError {
  return new CodeBrowserError(
    `File not found: ${canonicalPath}`,
    404,
    "not_found",
  );
}

function createSymlinkDeniedError(canonicalPath: string): CodeBrowserError {
  return new CodeBrowserError(
    `Access denied: symbolic links are not available in the code browser (${canonicalPath}).`,
    403,
    "access_denied",
  );
}

function truncateContents(contents: string): {
  contents: string;
  truncated: boolean;
} {
  if (contents.length <= MAX_CODE_BROWSER_CHARACTERS) {
    return {
      contents,
      truncated: false,
    };
  }

  const truncatedCount = contents.length - MAX_CODE_BROWSER_CHARACTERS;

  return {
    contents:
      `${contents.slice(0, MAX_CODE_BROWSER_CHARACTERS)}\n\n[...truncated ${String(truncatedCount)} characters]`,
    truncated: true,
  };
}

function detectBinaryContents(contents: Buffer): boolean {
  const sample = contents.subarray(0, Math.min(contents.length, NON_TEXT_SAMPLE_BYTES));
  let suspiciousByteCount = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isControlByte = byte < 7 || (byte > 14 && byte < 32);

    if (isControlByte) {
      suspiciousByteCount += 1;
    }
  }

  return sample.length > 0 && (suspiciousByteCount / sample.length) > 0.1;
}

async function readFileHead(
  absolutePath: string,
  sizeBytes: number,
): Promise<Buffer> {
  const bytesToRead = Math.min(sizeBytes, MAX_CODE_BROWSER_FILE_BYTES);
  const fileHandle = await open(absolutePath, "r");

  try {
    if (bytesToRead === 0) {
      return Buffer.alloc(0);
    }

    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

async function collectTreeNodes(
  absoluteDirectoryPath: string,
  targetDirectory: string,
  currentDepth: number,
  maxDepth: number,
): Promise<CodeBrowserTreeNode[]> {
  const directoryEntries = sortDirectoryEntries(
    await readdir(absoluteDirectoryPath, {
      withFileTypes: true,
      encoding: "utf8",
    }),
  );
  const visibleEntries = directoryEntries.filter(
    (entry) => !shouldSkipEntry(entry.name),
  );
  const collectedNodes: CodeBrowserTreeNode[] = [];

  for (const entry of visibleEntries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectoryPath, entry.name);
    const canonicalPath = path.relative(targetDirectory, absolutePath)
      .split(path.sep)
      .join("/");
    const nextNode: CodeBrowserTreeNode = {
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      path: canonicalPath,
    };

    if (entry.isDirectory() && currentDepth < maxDepth) {
      const children = await collectTreeNodes(
        absolutePath,
        targetDirectory,
        currentDepth + 1,
        maxDepth,
      );

      if (children.length > 0) {
        nextNode.children = children;
      }
    }

    collectedNodes.push(nextNode);
  }

  return collectedNodes;
}

export async function listCodeBrowserTree(
  input: ListCodeBrowserTreeInput,
): Promise<CodeBrowserTreeResponse> {
  let resolvedPath: {
    canonicalPath: string;
    absolutePath: string;
  };

  try {
    resolvedPath = resolveWithinTarget(
      input.targetDirectory,
      input.rootPath?.trim() || ".",
    );
  } catch (error) {
    throw createCodeBrowserError(
      error,
      "Access denied: path must stay within the target directory.",
    );
  }

  let pathStats;
  let pathMetadata;

  try {
    pathMetadata = await lstat(resolvedPath.absolutePath);
    pathStats = await stat(resolvedPath.absolutePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw createNotFoundError(resolvedPath.canonicalPath);
    }

    throw createCodeBrowserError(
      error,
      `Failed to inspect ${resolvedPath.canonicalPath}.`,
    );
  }

  if (pathMetadata.isSymbolicLink()) {
    throw createSymlinkDeniedError(resolvedPath.canonicalPath);
  }

  if (!pathStats.isDirectory()) {
    throw new CodeBrowserError(
      `Expected a directory but found a file: ${resolvedPath.canonicalPath}`,
      400,
      "not_directory",
    );
  }

  return {
    projectId: input.projectId,
    root: {
      path: resolvedPath.canonicalPath,
      name: resolvedPath.canonicalPath === "."
        ? path.basename(input.targetDirectory)
        : path.basename(resolvedPath.absolutePath),
    },
    nodes: await collectTreeNodes(
      resolvedPath.absolutePath,
      input.targetDirectory,
      0,
      clampTreeDepth(input.depth),
    ),
  };
}

export async function readCodeBrowserFile(
  input: ReadCodeBrowserFileInput,
): Promise<CodeBrowserReadResponse> {
  let resolvedPath: {
    canonicalPath: string;
    absolutePath: string;
  };

  try {
    resolvedPath = resolveWithinTarget(input.targetDirectory, input.filePath);
  } catch (error) {
    throw createCodeBrowserError(
      error,
      "Access denied: path must stay within the target directory.",
    );
  }

  let fileStats;
  let fileMetadata;

  try {
    fileMetadata = await lstat(resolvedPath.absolutePath);
    fileStats = await stat(resolvedPath.absolutePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw createNotFoundError(resolvedPath.canonicalPath);
    }

    throw createCodeBrowserError(
      error,
      `Failed to inspect ${resolvedPath.canonicalPath}.`,
    );
  }

  if (fileMetadata.isSymbolicLink()) {
    throw createSymlinkDeniedError(resolvedPath.canonicalPath);
  }

  if (!fileStats.isFile()) {
    throw new CodeBrowserError(
      `Expected a file but found a directory: ${resolvedPath.canonicalPath}`,
      400,
      "not_file",
    );
  }

  try {
    const contentsBuffer = await readFileHead(
      resolvedPath.absolutePath,
      fileStats.size,
    );
    const binary = detectBinaryContents(contentsBuffer);

    if (binary) {
      return {
        projectId: input.projectId,
        path: resolvedPath.canonicalPath,
        sizeBytes: fileStats.size,
        contents: null,
        truncated: false,
        binary: true,
      };
    }

    const truncatedByBytes = fileStats.size > MAX_CODE_BROWSER_FILE_BYTES;
    const textContents = contentsBuffer.toString("utf8");
    const truncatedText = truncateContents(textContents);

    return {
      projectId: input.projectId,
      path: resolvedPath.canonicalPath,
      sizeBytes: fileStats.size,
      contents: truncatedText.contents,
      truncated: truncatedByBytes || truncatedText.truncated,
      binary: false,
    };
  } catch (error) {
    throw createCodeBrowserError(
      error,
      `Failed to read ${resolvedPath.canonicalPath}.`,
    );
  }
}
