import { spawn } from "node:child_process";

import type { ToolDefinition } from "./registry.js";
import { ToolError } from "./read-file.js";

export interface SearchFilesInput {
  targetDirectory: string;
  query: string;
  glob?: string | string[];
}

export interface SearchMatch {
  path: string;
  lineNumber: number;
  lineText: string;
  submatches: string[];
}

function normalizeGlobs(glob: string | string[] | undefined): string[] {
  if (!glob) {
    return [];
  }

  return Array.isArray(glob) ? glob : [glob];
}

function collectProcessOutput(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export async function searchFilesTool(
  input: SearchFilesInput,
): Promise<SearchMatch[]> {
  if (!input.query) {
    throw new ToolError("query must not be empty.");
  }

  const globArgs = normalizeGlobs(input.glob).flatMap((pattern) => ["-g", pattern]);
  const result = await collectProcessOutput(
    "rg",
    ["--json", "--line-number", ...globArgs, input.query, "."],
    input.targetDirectory,
  );

  if (result.code !== 0 && result.code !== 1) {
    throw new ToolError(result.stderr || "rg search failed.");
  }

  if (!result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((record) => record.type === "match")
    .map((record) => {
      const data = record.data as {
        path: { text: string };
        line_number: number;
        lines: { text?: string };
        submatches: Array<{ match: { text: string } }>;
      };

      return {
        path: data.path.text.replace(/^\.\//, ""),
        lineNumber: data.line_number,
        lineText: data.lines.text?.trimEnd() ?? "",
        submatches: data.submatches.map((submatch) => submatch.match.text),
      };
    });
}

export const searchFilesDefinition: ToolDefinition<
  SearchFilesInput,
  SearchMatch[]
> = {
  name: "search_files",
  description: "Search the target directory with ripgrep and return structured matches.",
  invoke: searchFilesTool,
};
