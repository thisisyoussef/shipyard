import type { ContextReport, TaskPlan } from "../artifacts/types.js";
import type { ContextEnvelope } from "../engine/state.js";
import { normalizeTargetRelativePath } from "../tools/file-state.js";

const verificationScriptPriority = ["test", "typecheck", "build"] as const;

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function cleanInstructionToken(token: string): string {
  return token.replace(/^[`"'([{<]+|[`"'.,!?;:)\]}>]+$/g, "");
}

function looksLikePathToken(token: string): boolean {
  return token.includes("/") || /\.[a-z0-9_-]+$/i.test(token);
}

function normalizeInstructionPath(candidate: string): string | null {
  if (!candidate || !looksLikePathToken(candidate)) {
    return null;
  }

  try {
    return normalizeTargetRelativePath(candidate);
  } catch {
    return null;
  }
}

function getKnownTargetFilePaths(options: {
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  contextReport?: ContextReport | null;
}): string[] {
  return uniqueStrings([
    ...options.contextEnvelope.task.targetFilePaths,
    ...(options.taskPlan?.targetFilePaths ?? []),
    ...(options.contextReport?.findings.map((finding) => finding.filePath) ?? []),
  ]);
}

function buildPackageManagerScriptCommand(
  packageManager: string | null,
  scriptName: string,
): string {
  if (packageManager === "npm") {
    return scriptName === "test"
      ? "npm test"
      : `npm run ${scriptName}`;
  }

  if (packageManager === "yarn") {
    return `yarn ${scriptName}`;
  }

  if (packageManager === "bun") {
    return scriptName === "test"
      ? "bun test"
      : `bun run ${scriptName}`;
  }

  return `pnpm ${scriptName}`;
}

export function extractInstructionTargetFilePaths(
  instruction: string,
): string[] {
  return uniqueStrings(
    instruction
      .split(/\s+/)
      .map(cleanInstructionToken)
      .map(normalizeInstructionPath)
      .filter((path): path is string => path !== null),
  );
}

export function shouldCoordinatorUseExplorer(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  contextReport?: ContextReport | null;
}): boolean {
  if (options.contextEnvelope.stable.discovery.isGreenfield) {
    return false;
  }

  if (extractInstructionTargetFilePaths(options.instruction).length > 0) {
    return false;
  }

  return getKnownTargetFilePaths(options).length === 0;
}

export function createExplorerQuery(instruction: string): string {
  return `Identify the files most relevant to this request: ${instruction.trim()}`;
}

export function createCoordinatorTaskPlan(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  contextReport?: ContextReport | null;
}): TaskPlan {
  const explicitTargetFilePaths = extractInstructionTargetFilePaths(
    options.instruction,
  );
  const targetFilePaths = uniqueStrings([
    ...explicitTargetFilePaths,
    ...getKnownTargetFilePaths(options),
  ]);
  const plannedSteps = uniqueStrings(
    [
      options.contextReport
        ? "Review the explorer findings before editing."
        : "Read the relevant files before editing.",
      targetFilePaths.length > 0
        ? `Inspect ${targetFilePaths.join(", ")} before editing.`
        : "Search for the most relevant files before editing.",
      "Choose the smallest unique anchor for each change.",
      "Verify the result after the edit.",
    ],
  );

  return {
    instruction: options.instruction,
    goal: options.contextReport?.query ?? options.instruction,
    targetFilePaths,
    plannedSteps,
  };
}

export function createVerificationCommand(
  contextEnvelope: ContextEnvelope,
): string {
  const packageManager = contextEnvelope.stable.discovery.packageManager;

  for (const scriptName of verificationScriptPriority) {
    if (contextEnvelope.stable.availableScripts[scriptName]) {
      return buildPackageManagerScriptCommand(packageManager, scriptName);
    }
  }

  return "git diff --stat";
}

export const coordinatorAgent = {
  name: "coordinator",
  canWrite: true,
  responsibilities: [
    "Own the task plan",
    "Own every write operation",
    "Decide when to delegate discovery and verification",
    "Merge read-only subagent findings into a single execution path",
  ],
};
