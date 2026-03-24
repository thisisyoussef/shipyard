import { z } from "zod";

import type { ContextReport } from "../artifacts/types.js";
import {
  runRawToolLoopDetailed,
  type RawLoopLogger,
  type RawToolExecution,
  type RawToolLoopOptions,
} from "../engine/raw-loop.js";

export const EXPLORER_TOOL_NAMES = [
  "read_file",
  "list_files",
  "search_files",
] as const;

const contextFindingSchema = z.object({
  filePath: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  relevanceNote: z.string().trim().min(1),
});

const contextReportSchema = z.object({
  query: z.string().trim().min(1),
  findings: z.array(contextFindingSchema),
});

const explorerToolNameSet = new Set<string>(EXPLORER_TOOL_NAMES);

export const EXPLORER_SYSTEM_PROMPT = `
You are Shipyard's explorer subagent.

Your job is to gather read-only evidence for a focused codebase question.
You must stay isolated from any coordinator history and reason only from:
- the user's current query
- the repository contents you inspect through tools

Allowed tools:
- read_file
- list_files
- search_files

Forbidden tools:
- write_file
- edit_block
- run_command
- git_diff

Rules:
- Never request a forbidden tool.
- Search broadly first when the query is vague, then read only the most relevant files.
- Return only valid JSON that matches this shape:
  {
    "query": "the original query",
    "findings": [
      {
        "filePath": "path/to/file.ts",
        "excerpt": "small relevant excerpt",
        "relevanceNote": "why this file matters"
      }
    ]
  }
- Keep findings concise and directly useful for follow-up edits.
- If nothing relevant is found, return {"query":"<original query>","findings":[]}.
- Do not wrap the JSON in markdown fences or extra commentary.
`.trim();

export interface ExplorerRunOptions
  extends Pick<RawToolLoopOptions, "client" | "logger" | "maxIterations"> {}

function ensureNonBlankQuery(query: string): string {
  const trimmed = query.trim();

  if (!trimmed) {
    throw new Error("Explorer query must not be blank.");
  }

  return trimmed;
}

function isExplorerToolName(toolName: string): boolean {
  return explorerToolNameSet.has(toolName);
}

function getUnauthorizedToolExecution(
  executions: RawToolExecution[],
): RawToolExecution | null {
  return executions.find((execution) => !isExplorerToolName(execution.toolName))
    ?? null;
}

function toContextReport(
  report: z.infer<typeof contextReportSchema>,
  expectedQuery?: string,
): ContextReport {
  return {
    query: expectedQuery ?? report.query,
    findings: report.findings.map((finding) => ({
      filePath: finding.filePath,
      excerpt: finding.excerpt,
      relevanceNote: finding.relevanceNote,
    })),
  };
}

export function parseContextReport(
  rawText: string,
  expectedQuery?: string,
): ContextReport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Explorer must return valid JSON matching ContextReport.");
  }

  const validated = contextReportSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error("Explorer returned invalid ContextReport JSON.");
  }

  return toContextReport(validated.data, expectedQuery?.trim() || undefined);
}

function throwIfUnauthorizedToolWasRequested(
  executions: RawToolExecution[],
): void {
  const unauthorizedToolExecution = getUnauthorizedToolExecution(executions);

  if (!unauthorizedToolExecution) {
    return;
  }

  throw new Error(
    `Explorer requested unauthorized tool "${unauthorizedToolExecution.toolName}".`,
  );
}

export async function runExplorerSubagent(
  query: string,
  targetDirectory: string,
  options: ExplorerRunOptions = {},
): Promise<ContextReport> {
  const normalizedQuery = ensureNonBlankQuery(query);
  const result = await runRawToolLoopDetailed(
    EXPLORER_SYSTEM_PROMPT,
    normalizedQuery,
    [...EXPLORER_TOOL_NAMES],
    targetDirectory,
    {
      client: options.client,
      logger: options.logger,
      maxIterations: options.maxIterations,
    },
  );

  throwIfUnauthorizedToolWasRequested(result.toolExecutions);

  return parseContextReport(result.finalText, normalizedQuery);
}

export const explorerAgent = {
  name: "explorer",
  canWrite: false,
  responsibilities: [
    "Search the target repository",
    "Read files and summarize findings",
    "Return read-only evidence to the coordinator",
  ],
  tools: [...EXPLORER_TOOL_NAMES],
};

export type ExplorerLogger = RawLoopLogger;
