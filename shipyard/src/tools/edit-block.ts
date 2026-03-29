import { readFile, stat, writeFile } from "node:fs/promises";

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
  getTrackedReadHash,
  hashContents,
  rememberReadHash,
  resolveWithinTarget,
} from "./file-state.js";
import { ToolError } from "./read-file.js";

const ZERO_MATCH_PREVIEW_LINES = 30;
const BLOCK_PREVIEW_LINES = 12;
const BLOCK_PREVIEW_CHAR_LIMIT = 320;
const LARGE_FILE_CHARACTER_THRESHOLD = 500;
const MAX_REWRITE_RATIO = 0.6;
const SHIPYARD_SCAFFOLD_MARKER = "shipyard-scaffold:";
const STARTER_REWRITE_ALLOWED_PATHS = new Set([
  "src/App.css",
  "src/App.tsx",
  "apps/web/src/App.css",
  "apps/web/src/App.tsx",
]);

export interface EditBlockInput {
  targetDirectory: string;
  path: string;
  old_string: string;
  new_string: string;
}

export interface EditBlockResult {
  path: string;
  absolutePath: string;
  contents: string;
  hash: string;
  replacements: number;
  changed: boolean;
  removedLines: number;
  addedLines: number;
  totalLines: number;
  beforePreview: string;
  afterPreview: string;
}

interface CurrentFileState {
  path: string;
  absolutePath: string;
  contents: string;
  hash: string;
}

const editBlockInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to edit, relative to the target directory.",
    },
    old_string: {
      type: "string",
      description: "Exact anchor text that must match once.",
    },
    new_string: {
      type: "string",
      description: "Replacement text for the matched anchor.",
    },
  },
  required: ["path", "old_string", "new_string"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function countOccurrences(contents: string, needle: string): number {
  if (!needle) {
    throw new ToolError("old_string must not be empty.");
  }

  let count = 0;
  let offset = 0;

  while (true) {
    const nextIndex = contents.indexOf(needle, offset);

    if (nextIndex === -1) {
      return count;
    }

    count += 1;
    offset = nextIndex + needle.length;
  }
}

function normalizePreviewLines(contents: string): string[] {
  const normalized = contents.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function formatLinePreview(contents: string, maxLines: number): string {
  const lines = normalizePreviewLines(contents);

  if (lines.length === 0) {
    return "1| ";
  }

  const previewLines = lines
    .slice(0, maxLines)
    .map((line, index) => `${index + 1}| ${line}`);

  if (lines.length > maxLines) {
    previewLines.push("...");
  }

  return previewLines.join("\n");
}

function truncatePreview(contents: string): string {
  const lines = normalizePreviewLines(contents);

  if (lines.length === 0) {
    return "(empty)";
  }

  let preview = lines.slice(0, BLOCK_PREVIEW_LINES).join("\n");

  if (lines.length > BLOCK_PREVIEW_LINES) {
    preview = `${preview}\n...`;
  }

  if (preview.length > BLOCK_PREVIEW_CHAR_LIMIT) {
    return `${preview.slice(0, BLOCK_PREVIEW_CHAR_LIMIT - 3)}...`;
  }

  return preview;
}

function isStarterScaffoldRewrite(
  relativePath: string,
  currentContents: string,
): boolean {
  return STARTER_REWRITE_ALLOWED_PATHS.has(relativePath)
    && currentContents.includes(SHIPYARD_SCAFFOLD_MARKER);
}

function shouldRejectLargeRewrite(
  relativePath: string,
  currentContents: string,
  oldString: string,
  newString: string,
): boolean {
  if (currentContents.length <= LARGE_FILE_CHARACTER_THRESHOLD) {
    return false;
  }

  if (isStarterScaffoldRewrite(relativePath, currentContents)) {
    return false;
  }

  const affectedCharacterCount = Math.max(oldString.length, newString.length);

  return affectedCharacterCount / currentContents.length > MAX_REWRITE_RATIO;
}

function formatEditBlockOutput(result: EditBlockResult): string {
  if (!result.changed) {
    return [
      `No changes needed for ${result.path}`,
      `Total lines: ${result.totalLines}`,
      `Hash: ${createDisplayHash(result.hash)}`,
      "",
      "Preview:",
      result.afterPreview,
    ].join("\n");
  }

  return [
    `Edited ${result.path}`,
    `Removed lines: ${result.removedLines}`,
    `Added lines: ${result.addedLines}`,
    `Total lines: ${result.totalLines}`,
    `Hash: ${createDisplayHash(result.hash)}`,
    "",
    "Before preview:",
    result.beforePreview,
    "",
    "After preview:",
    result.afterPreview,
  ].join("\n");
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

async function readCurrentFileState(
  targetDirectory: string,
  relativePath: string,
): Promise<CurrentFileState> {
  const resolvedPath = resolveWithinTarget(targetDirectory, relativePath);

  try {
    const fileStats = await stat(resolvedPath.absolutePath);

    if (fileStats.isDirectory()) {
      throw new ToolError(
        `Expected a file but found a directory: ${resolvedPath.canonicalPath}`,
      );
    }

    const contents = await readFile(resolvedPath.absolutePath, "utf8");

    return {
      path: resolvedPath.canonicalPath,
      absolutePath: resolvedPath.absolutePath,
      contents,
      hash: hashContents(contents),
    };
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }

    if (getErrorCode(error) === "ENOENT") {
      throw new ToolError(
        `File not found: ${resolvedPath.canonicalPath}. Use write_file to create it first.`,
      );
    }

    if (getErrorCode(error) === "EISDIR") {
      throw new ToolError(
        `Expected a file but found a directory: ${resolvedPath.canonicalPath}`,
      );
    }

    throw new ToolError(
      `Failed to read ${resolvedPath.canonicalPath}: ${getErrorCode(error) ?? "unknown error"}`,
    );
  }
}

export async function editBlockTool(
  input: EditBlockInput,
): Promise<EditBlockResult> {
  const current = await readCurrentFileState(input.targetDirectory, input.path);
  const trackedHash = getTrackedReadHash(input.targetDirectory, current.path);

  if (!trackedHash) {
    throw new ToolError(
      `Read the file with read_file before editing: ${current.path}`,
    );
  }

  if (current.hash !== trackedHash) {
    throw new ToolError(
      `File changed since the last read: ${current.path}. Re-run read_file before editing.`,
    );
  }

  countOccurrences(current.contents, input.old_string);

  if (input.old_string === input.new_string) {
    rememberReadHash(input.targetDirectory, current.path, current.hash);

    return {
      ...current,
      replacements: 0,
      changed: false,
      removedLines: 0,
      addedLines: 0,
      totalLines: countLines(current.contents),
      beforePreview: truncatePreview(input.old_string),
      afterPreview: truncatePreview(input.new_string),
    };
  }

  const replacements = countOccurrences(current.contents, input.old_string);

  if (replacements === 0) {
    throw new ToolError(
      [
        `Anchor not found in ${current.path}. Re-read the file and check whitespace and indentation.`,
        "First 30 lines:",
        formatLinePreview(current.contents, ZERO_MATCH_PREVIEW_LINES),
      ].join("\n"),
    );
  }

  if (replacements > 1) {
    throw new ToolError(
      `Anchor matched ${replacements} times in ${current.path}. Include more surrounding context so it matches exactly once.`,
    );
  }

  if (
    shouldRejectLargeRewrite(
      current.path,
      current.contents,
      input.old_string,
      input.new_string,
    )
  ) {
    const rewritePercentage = Math.round(
      (Math.max(input.old_string.length, input.new_string.length)
        / current.contents.length)
        * 100,
    );

    throw new ToolError(
      `Edit would rewrite ${rewritePercentage}% of ${current.path}, which exceeds the 60% limit for files larger than 500 characters. Break the change into smaller edit_block calls.`,
    );
  }

  const nextContents = current.contents.replace(
    input.old_string,
    input.new_string,
  );

  try {
    await writeFile(current.absolutePath, nextContents, "utf8");
  } catch (error) {
    throw new ToolError(
      `Failed to write ${current.path}: ${getErrorCode(error) ?? "unknown error"}`,
    );
  }

  const nextHash = hashContents(nextContents);
  rememberReadHash(input.targetDirectory, current.path, nextHash);

  return {
    path: current.path,
    absolutePath: current.absolutePath,
    contents: nextContents,
    hash: nextHash,
    replacements,
    changed: true,
    removedLines: countLines(input.old_string),
    addedLines: countLines(input.new_string),
    totalLines: countLines(nextContents),
    beforePreview: truncatePreview(input.old_string),
    afterPreview: truncatePreview(input.new_string),
  };
}

export const editBlockDefinition: ToolDefinition<
  Omit<EditBlockInput, "targetDirectory">
> = {
  name: "edit_block",
  description:
    "Replace exactly one anchored block in a file and reject stale, ambiguous, or oversized edits.",
  inputSchema: editBlockInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await editBlockTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(formatEditBlockOutput(result), result);
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(editBlockDefinition);
