import { z } from "zod";

import type {
  ContextReport,
  DiscoveryReport,
  ExecutionSpec,
  TargetProfile,
} from "../artifacts/types.js";
import {
  runRawToolLoopDetailed,
  type RawLoopLogger,
  type RawToolExecution,
  type RawToolLoopOptions,
} from "../engine/raw-loop.js";
import { createTurnCancelledError } from "../engine/cancellation.js";

export const PLANNER_TOOL_NAMES = [
  "read_file",
  "load_spec",
  "list_files",
  "search_files",
] as const;

const executionSpecSchema = z.object({
  instruction: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  deliverables: z.array(z.string().trim().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().trim().min(1)).min(1),
  verificationIntent: z.array(z.string().trim().min(1)).min(1),
  targetFilePaths: z.array(z.string().trim().min(1)),
  risks: z.array(z.string().trim().min(1)),
});

const plannerToolNameSet = new Set<string>(PLANNER_TOOL_NAMES);

export const PLANNER_SYSTEM_PROMPT = `
You are Shipyard's planner subagent.

Your job is to turn a coding request into a compact ExecutionSpec artifact.
You must stay isolated from any coordinator history and reason only from:
- the current planning request
- the stable repo context embedded in that request
- any read-only evidence you gather through tools

Allowed tools:
- read_file
- load_spec
- list_files
- search_files

Forbidden tools:
- write_file
- edit_block
- run_command
- git_diff

Rules:
- Never request a forbidden tool.
- Keep the plan artifact-focused. Do not write step-by-step patch instructions.
- Favor concrete deliverables, acceptance criteria, verification intent, and risks.
- Use targetFilePaths only when you have good evidence from the prompt or tools.
- If repo context is incomplete, still return a best-effort plan and record the uncertainty in risks.
- Return only valid JSON that matches this shape:
  {
    "instruction": "original instruction",
    "goal": "plain-language outcome",
    "deliverables": ["short deliverable"],
    "acceptanceCriteria": ["clear success check"],
    "verificationIntent": ["how to validate the change"],
    "targetFilePaths": ["path/when/known.ts"],
    "risks": ["main uncertainty or regression risk"]
  }
- Do not wrap the JSON in markdown fences or extra commentary.
`.trim();

export interface PlannerInput {
  instruction: string;
  discovery: DiscoveryReport;
  targetProfile?: TargetProfile | null;
  contextReport?: ContextReport | null;
  projectRules?: string | null;
  injectedContext?: string[];
  planMode?: boolean;
}

export interface PlannerRunOptions
  extends Pick<
    RawToolLoopOptions,
    | "client"
    | "logger"
    | "maxIterations"
    | "signal"
    | "beforeToolExecution"
    | "afterToolExecution"
  > {}

function ensureNonBlankInstruction(instruction: string): string {
  const trimmed = instruction.trim();

  if (!trimmed) {
    throw new Error("Planner instruction must not be blank.");
  }

  return trimmed;
}

function isPlannerToolName(toolName: string): boolean {
  return plannerToolNameSet.has(toolName);
}

function getUnauthorizedToolExecution(
  executions: RawToolExecution[],
): RawToolExecution | null {
  return executions.find((execution) => !isPlannerToolName(execution.toolName))
    ?? null;
}

function toExecutionSpec(
  report: z.infer<typeof executionSpecSchema>,
  expectedInstruction?: string,
): ExecutionSpec {
  return {
    instruction: expectedInstruction ?? report.instruction,
    goal: report.goal,
    deliverables: [...report.deliverables],
    acceptanceCriteria: [...report.acceptanceCriteria],
    verificationIntent: [...report.verificationIntent],
    targetFilePaths: [...report.targetFilePaths],
    risks: [...report.risks],
  };
}

function* extractJsonObjectCandidates(rawText: string): Generator<string> {
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];

    if (objectStart === -1) {
      if (character === "{") {
        objectStart = index;
        depth = 1;
        inString = false;
        isEscaped = false;
      }

      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character !== "}") {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      yield rawText.slice(objectStart, index + 1);
      objectStart = -1;
    }
  }
}

function parseStructuredJson(rawText: string): unknown {
  const candidates = [rawText.trim()];

  for (const candidate of extractJsonObjectCandidates(rawText)) {
    const trimmedCandidate = candidate.trim();

    if (!trimmedCandidate || candidates.includes(trimmedCandidate)) {
      continue;
    }

    candidates.push(trimmedCandidate);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Planner must return valid JSON matching ExecutionSpec.");
}

export function parseExecutionSpec(
  rawText: string,
  expectedInstruction?: string,
): ExecutionSpec {
  const parsed = parseStructuredJson(rawText);
  const validated = executionSpecSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error("Planner returned invalid ExecutionSpec JSON.");
  }

  return toExecutionSpec(
    validated.data,
    expectedInstruction?.trim() || undefined,
  );
}

function throwIfUnauthorizedToolWasRequested(
  executions: RawToolExecution[],
): void {
  const unauthorizedToolExecution = getUnauthorizedToolExecution(executions);

  if (!unauthorizedToolExecution) {
    return;
  }

  throw new Error(
    `Planner requested unauthorized tool "${unauthorizedToolExecution.toolName}".`,
  );
}

function createPlannerContext(input: PlannerInput): string {
  return JSON.stringify(
    {
      instruction: input.instruction,
      discovery: input.discovery,
      targetProfile: input.targetProfile ?? null,
      contextReport: input.contextReport ?? null,
      projectRules: input.projectRules ?? null,
      injectedContext: input.injectedContext ?? [],
      planMode: input.planMode ?? false,
    },
    null,
    2,
  );
}

export function buildPlannerPrompt(input: PlannerInput): string {
  return [
    input.planMode
      ? "Create an ExecutionSpec for an operator-facing persisted task queue."
      : "Create an ExecutionSpec for this request.",
    ...(input.planMode
      ? [
          "Deliverables must be ordered, reviewable tasks that fit one instruction cycle each.",
          "If the request mentions or depends on specs, prefer load_spec before planning.",
        ]
      : []),
    "",
    createPlannerContext({
      ...input,
      instruction: ensureNonBlankInstruction(input.instruction),
    }),
  ].join("\n");
}

export async function runPlannerSubagent(
  input: PlannerInput,
  targetDirectory: string,
  options: PlannerRunOptions = {},
): Promise<ExecutionSpec> {
  const normalizedInstruction = ensureNonBlankInstruction(input.instruction);
  const result = await runRawToolLoopDetailed(
    PLANNER_SYSTEM_PROMPT,
    buildPlannerPrompt({
      ...input,
      instruction: normalizedInstruction,
    }),
    [...PLANNER_TOOL_NAMES],
    targetDirectory,
    {
      client: options.client,
      logger: options.logger,
      maxIterations: options.maxIterations,
      signal: options.signal,
      beforeToolExecution: options.beforeToolExecution,
      afterToolExecution: options.afterToolExecution,
    },
  );

  if (result.status === "cancelled") {
    throw createTurnCancelledError(result.finalText);
  }

  throwIfUnauthorizedToolWasRequested(result.toolExecutions);

  return parseExecutionSpec(result.finalText, normalizedInstruction);
}

export const plannerAgent = {
  name: "planner",
  canWrite: false,
  responsibilities: [
    "Turn broad requests into ExecutionSpec artifacts",
    "Gather only read-only planning evidence",
    "Keep deliverables, acceptance criteria, and risks explicit before edits",
  ],
  tools: [...PLANNER_TOOL_NAMES],
};

export type PlannerLogger = RawLoopLogger;
