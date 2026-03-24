import { writeFile } from "node:fs/promises";

import type { ToolDefinition } from "./registry.js";
import { ToolError, readFileTool } from "./read-file.js";

export interface EditBlockInput {
  targetDirectory: string;
  path: string;
  oldString: string;
  newString: string;
  expectedHash: string;
}

export interface EditBlockResult {
  path: string;
  absolutePath: string;
  contents: string;
  hash: string;
  replacements: number;
}

function countOccurrences(contents: string, needle: string): number {
  if (!needle) {
    throw new ToolError("oldString must not be empty.");
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

export async function editBlockTool(
  input: EditBlockInput,
): Promise<EditBlockResult> {
  const current = await readFileTool({
    targetDirectory: input.targetDirectory,
    path: input.path,
  });

  if (current.hash !== input.expectedHash) {
    throw new ToolError(`File changed since last read: ${input.path}`);
  }

  const replacements = countOccurrences(current.contents, input.oldString);

  if (replacements !== 1) {
    throw new ToolError(
      `Anchor must match exactly once. Found ${replacements} matches in ${input.path}.`,
    );
  }

  const nextContents = current.contents.replace(input.oldString, input.newString);
  await writeFile(current.absolutePath, nextContents, "utf8");

  const next = await readFileTool({
    targetDirectory: input.targetDirectory,
    path: input.path,
  });

  return {
    ...next,
    replacements,
  };
}

export const editBlockDefinition: ToolDefinition<EditBlockInput, EditBlockResult> =
  {
    name: "edit_block",
    description:
      "Replace exactly one anchored block in a file and reject stale or ambiguous edits.",
    invoke: editBlockTool,
  };
