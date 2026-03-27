import { z } from "zod";

import type {
  DiscoveryReport,
  ExecutionSpec,
  HarnessRouteSummary,
  PreviewState,
  TargetProfile,
  TaskPlan,
  VerificationReport,
} from "../artifacts/types.js";
import {
  runRawToolLoopDetailed,
  type RawLoopLogger,
  type RawToolExecution,
  type RawToolLoopOptions,
} from "../engine/raw-loop.js";
import { createTurnCancelledError } from "../engine/cancellation.js";

export const HUMAN_SIMULATOR_TOOL_NAMES = [
  "read_file",
  "load_spec",
  "list_files",
  "search_files",
  "git_diff",
] as const;

export interface HumanSimulatorFeedback {
  text: string;
  submittedAt: string;
}

export interface HumanSimulatorTurnReview {
  instruction: string;
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  taskPlan: TaskPlan;
  executionSpec: ExecutionSpec | null;
  harnessRoute: HarnessRouteSummary;
  verificationReport: VerificationReport | null;
  selectedTargetPath: string | null;
}

export interface HumanSimulatorHistoryEntry {
  iteration: number;
  simulatorSummary: string;
  simulatorInstruction: string;
  appliedHumanFeedback: HumanSimulatorFeedback[];
  turn: HumanSimulatorTurnReview;
}

export interface HumanSimulatorInput {
  originalBrief: string;
  initialHumanContext?: string[];
  iteration: number;
  discovery: DiscoveryReport;
  targetProfile?: TargetProfile | null;
  previewState: PreviewState;
  projectRules?: string | null;
  pendingHumanFeedback?: HumanSimulatorFeedback[];
  history?: HumanSimulatorHistoryEntry[];
  latestTurn?: HumanSimulatorTurnReview | null;
}

export interface HumanSimulatorDecision {
  summary: string;
  instruction: string;
  focusAreas: string[];
}

export interface HumanSimulatorRunOptions
  extends RawToolLoopOptions {}

const MAX_HISTORY_ITEMS = 6;
const MAX_FOCUS_AREAS = 5;
const humanSimulatorToolNameSet = new Set<string>(HUMAN_SIMULATOR_TOOL_NAMES);

const humanSimulatorDecisionSchema = z.object({
  summary: z.string().trim().min(1),
  instruction: z.string().trim().min(1),
  focusAreas: z.array(z.string().trim().min(1)).max(MAX_FOCUS_AREAS).default([]),
});

export const HUMAN_SIMULATOR_SYSTEM_PROMPT = `
You are Shipyard's human simulator in "ultimate mode".

You are not the coding agent. You are the simulated product collaborator who:
- reviews what Shipyard just did,
- inspects read-only evidence when needed,
- incorporates queued feedback from the real human,
- and produces the next focused instruction for Shipyard.

Allowed tools:
- read_file
- load_spec
- list_files
- search_files
- git_diff

Forbidden tools:
- write_file
- edit_block
- run_command
- deploy_target
- bootstrap_target

Behavior rules:
- Treat queued real-human feedback as the highest-priority input.
- Prefer one concrete next instruction at a time.
- Use read-only tools when the current evidence is not enough.
- Do not ask Shipyard to "inspect" or "analyze" forever; push the build forward.
- Avoid repeating the exact same instruction unless the new human feedback truly requires it.
- Return only valid JSON with this shape:
  {
    "summary": "short review or rationale",
    "instruction": "next Shipyard instruction",
    "focusAreas": ["optional short focus"]
  }
- Do not wrap the JSON in markdown fences or extra commentary.
`.trim();

function ensureNonBlankBrief(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Human simulator brief must not be blank.");
  }

  return trimmed;
}

function isHumanSimulatorToolName(toolName: string): boolean {
  return humanSimulatorToolNameSet.has(toolName);
}

function getUnauthorizedToolExecution(
  executions: RawToolExecution[],
): RawToolExecution | null {
  return executions.find((execution) => !isHumanSimulatorToolName(execution.toolName))
    ?? null;
}

function throwIfUnauthorizedToolWasRequested(
  executions: RawToolExecution[],
): void {
  const unauthorizedToolExecution = getUnauthorizedToolExecution(executions);

  if (!unauthorizedToolExecution) {
    return;
  }

  throw new Error(
    `Human simulator requested unauthorized tool "${unauthorizedToolExecution.toolName}".`,
  );
}

function toHumanSimulatorDecision(
  decision: z.infer<typeof humanSimulatorDecisionSchema>,
): HumanSimulatorDecision {
  return {
    summary: decision.summary,
    instruction: decision.instruction,
    focusAreas: [...decision.focusAreas],
  };
}

function* extractJsonObjectCandidates(rawText: string): Generator<string> {
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];

    if (objectStart === -1) {
      if (character === "{") {
        objectStart = index;
        depth = 1;
        inString = false;
        escaped = false;
      }

      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
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

  throw new Error("Human simulator must return valid JSON.");
}

export function parseHumanSimulatorDecision(
  rawText: string,
): HumanSimulatorDecision {
  const parsed = parseStructuredJson(rawText);
  const validated = humanSimulatorDecisionSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error("Human simulator returned invalid decision JSON.");
  }

  return toHumanSimulatorDecision(validated.data);
}

function createHumanSimulatorContext(
  input: HumanSimulatorInput,
): string {
  return JSON.stringify(
    {
      originalBrief: input.originalBrief,
      initialHumanContext: input.initialHumanContext ?? [],
      iteration: input.iteration,
      discovery: input.discovery,
      targetProfile: input.targetProfile ?? null,
      previewState: input.previewState,
      projectRules: input.projectRules ?? null,
      pendingHumanFeedback: input.pendingHumanFeedback ?? [],
      latestTurn: input.latestTurn ?? null,
      history: (input.history ?? []).slice(-MAX_HISTORY_ITEMS),
    },
    null,
    2,
  );
}

export function buildHumanSimulatorPrompt(
  input: HumanSimulatorInput,
): string {
  return [
    "Review the original product brief, any attached human context, the latest Shipyard result, and any queued real-human feedback.",
    "Then decide the next instruction Shipyard should execute.",
    "",
    createHumanSimulatorContext({
      ...input,
      originalBrief: ensureNonBlankBrief(input.originalBrief),
    }),
  ].join("\n");
}

export async function runHumanSimulator(
  input: HumanSimulatorInput,
  targetDirectory: string,
  options: HumanSimulatorRunOptions = {},
): Promise<HumanSimulatorDecision> {
  const normalizedBrief = ensureNonBlankBrief(input.originalBrief);
  const result = await runRawToolLoopDetailed(
    HUMAN_SIMULATOR_SYSTEM_PROMPT,
    buildHumanSimulatorPrompt({
      ...input,
      originalBrief: normalizedBrief,
    }),
    [...HUMAN_SIMULATOR_TOOL_NAMES],
    targetDirectory,
    {
      maxIterations: options.maxIterations ?? 8,
      ...options,
    },
  );

  if (result.status === "cancelled") {
    throw createTurnCancelledError(result.finalText);
  }

  if (result.status === "continuation") {
    throw new Error("Human simulator exceeded its bounded review loop budget.");
  }

  throwIfUnauthorizedToolWasRequested(result.toolExecutions);

  return parseHumanSimulatorDecision(result.finalText);
}

export const humanSimulatorAgent = {
  name: "human-simulator",
  canWrite: false,
  responsibilities: [
    "Review Shipyard's latest result like a human collaborator",
    "Incorporate queued real-human feedback into the next request",
    "Return the next focused instruction for Shipyard without editing files directly",
  ],
  tools: [...HUMAN_SIMULATOR_TOOL_NAMES],
};

export type HumanSimulatorLogger = RawLoopLogger;
