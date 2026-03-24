import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { ToolError } from "./read-file.js";
import { executeProcess } from "./run-command.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface SearchFilesInput {
  targetDirectory: string;
  pattern: string;
  file_pattern?: string;
  limit?: number;
}

export interface SearchMatch {
  path: string;
  lineNumber: number;
  lineText: string;
}

export interface SearchFilesResult {
  pattern: string;
  filePattern?: string;
  limit: number;
  matches: SearchMatch[];
  truncated: boolean;
}

const searchFilesInputSchema = {
  type: "object",
  properties: {
    pattern: {
      type: "string",
      description: "Literal or regex search pattern to find with ripgrep.",
    },
    file_pattern: {
      type: "string",
      description: "Optional glob pattern that narrows the file search scope.",
    },
    limit: {
      type: "integer",
      description: "Optional maximum number of matches to return. Defaults to 30.",
    },
  },
  required: ["pattern"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function parseRipgrepLine(line: string): SearchMatch | null {
  const match = line.match(/^(.+?):(\d+):(.*)$/);

  if (!match) {
    return null;
  }

  return {
    path: match[1]?.replace(/^\.\//, "") ?? "",
    lineNumber: Number.parseInt(match[2] ?? "0", 10),
    lineText: match[3] ?? "",
  };
}

function formatSearchFilesOutput(result: SearchFilesResult): string {
  if (result.matches.length === 0) {
    return `No matches found for pattern "${result.pattern}".`;
  }

  const lines = [
    `Pattern: ${result.pattern}`,
    `Matches: ${String(result.matches.length)}`,
  ];

  if (result.filePattern) {
    lines.push(`File pattern: ${result.filePattern}`);
  }

  if (result.truncated) {
    lines.push(`Results truncated to ${String(result.limit)} matches.`);
  }

  lines.push("");

  for (const match of result.matches) {
    lines.push(`${match.path}:${String(match.lineNumber)}: ${match.lineText}`);
  }

  return lines.join("\n");
}

export async function searchFilesTool(
  input: SearchFilesInput,
): Promise<SearchFilesResult> {
  const pattern = input.pattern.trim();

  if (!pattern) {
    throw new ToolError("pattern must not be empty.");
  }

  const limit = clampLimit(input.limit);
  const args = ["--line-number", "--color", "never"];

  if (input.file_pattern?.trim()) {
    args.push("--glob", input.file_pattern.trim());
  }

  args.push(pattern, ".");

  const result = await executeProcess({
    cwd: input.targetDirectory,
    command: "rg",
    args,
    timeoutMs: 30_000,
  });

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new ToolError(result.stderr.trim() || "search_files failed.");
  }

  const matches = result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => parseRipgrepLine(line))
    .filter((match): match is SearchMatch => match !== null);

  return {
    pattern,
    filePattern: input.file_pattern?.trim() || undefined,
    limit,
    matches: matches.slice(0, limit),
    truncated: matches.length > limit,
  };
}

export const searchFilesDefinition: ToolDefinition<
  Omit<SearchFilesInput, "targetDirectory">
> = {
  name: "search_files",
  description:
    "Search the target directory with ripgrep and return bounded relative matches.",
  inputSchema: searchFilesInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await searchFilesTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(formatSearchFilesOutput(result));
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(searchFilesDefinition);
