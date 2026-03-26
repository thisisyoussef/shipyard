import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ActiveTaskContext,
  DiscoveryReport,
  LoadedExecutionHandoff,
} from "../artifacts/types.js";
import {
  normalizeRuntimeFeatureFlags,
  type RuntimeFeatureFlags,
} from "../engine/runtime-flags.js";
import type { ContextEnvelope } from "../engine/state.js";
import { truncateText } from "../engine/turn-summary.js";

export const SERIALIZED_SESSION_HISTORY_CHAR_BUDGET = 1_800;
const SERIALIZED_PROJECT_RULES_CHAR_BUDGET = 1_800;
const SERIALIZED_GIT_DIFF_CHAR_BUDGET = 1_500;
const SERIALIZED_HANDOFF_CHAR_BUDGET = 1_500;
const SERIALIZED_ACTIVE_TASK_CHAR_BUDGET = 1_200;
const SERIALIZED_LIST_ITEM_CHAR_BUDGET = 180;
const SERIALIZED_LIST_CHAR_BUDGET = 900;
const SERIALIZED_INSTRUCTION_CHAR_BUDGET = 500;

export interface BuildContextEnvelopeOptions {
  targetDirectory: string;
  discovery: DiscoveryReport;
  currentInstruction: string;
  rollingSummary: string;
  injectedContext?: string[];
  targetFilePaths?: string[];
  recentToolOutputs?: string[];
  recentErrors?: string[];
  currentGitDiff?: string | null;
  featureFlags?: Partial<RuntimeFeatureFlags>;
  retryCountsByFile?: Record<string, number>;
  blockedFiles?: string[];
  recentTouchedFiles?: string[];
  latestHandoff?: LoadedExecutionHandoff | null;
  activeTask?: ActiveTaskContext | null;
  projectRules?: string;
}

function formatDiscoveryValue(value: string | null): string {
  return value ?? "unknown";
}

function formatTargetType(discovery: DiscoveryReport): string {
  if (discovery.isGreenfield) {
    return "greenfield";
  }

  if (discovery.bootstrapReady) {
    return "bootstrap-ready";
  }

  return "existing";
}

function formatList(items: string[], emptyLabel = "(none)"): string {
  if (items.length === 0) {
    return emptyLabel;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function truncateWithMarker(value: string, limit: number): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "(none)";
  }

  if (trimmed.length <= limit) {
    return trimmed;
  }

  const marker = `[truncated ${String(trimmed.length - limit)} chars to stay within Shipyard context budget]`;
  const sliceLength = Math.max(limit - marker.length - 1, 1);

  return `${trimmed.slice(0, sliceLength).trimEnd()}\n${marker}`;
}

function formatBoundedList(
  items: string[],
  options: {
    emptyLabel?: string;
    itemLimit?: number;
    listLimit?: number;
  } = {},
): string {
  if (items.length === 0) {
    return options.emptyLabel ?? "(none)";
  }

  const itemLimit = options.itemLimit ?? SERIALIZED_LIST_ITEM_CHAR_BUDGET;
  const listLimit = options.listLimit ?? SERIALIZED_LIST_CHAR_BUDGET;
  const lines = items.map((item) => `- ${truncateText(item, itemLimit)}`);
  let omittedCount = 0;

  while (lines.length > 1) {
    const omissionLine = omittedCount > 0
      ? `- ${String(omittedCount)} earlier item(s) were omitted to stay within budget.`
      : null;
    const body = [
      omissionLine,
      ...lines,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    if (body.length <= listLimit) {
      return body;
    }

    lines.shift();
    omittedCount += 1;
  }

  return truncateWithMarker(lines.join("\n"), listLimit);
}

function formatScriptList(scripts: Record<string, string>): string {
  const scriptEntries = Object.entries(scripts).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (scriptEntries.length === 0) {
    return "(none)";
  }

  return scriptEntries
    .map(([name, command]) =>
      `- ${truncateText(name, 80)}: ${truncateText(command, 140)}`
    )
    .join("\n");
}

function formatRetryList(retryCountsByFile: Record<string, number>): string {
  const retryEntries = Object.entries(retryCountsByFile)
    .sort(([left], [right]) => left.localeCompare(right));

  if (retryEntries.length === 0) {
    return "(none)";
  }

  return retryEntries
    .map(([filePath, retryCount]) =>
      `- ${truncateText(filePath, 140)}: ${String(retryCount)}`
    )
    .join("\n");
}

function formatLatestHandoff(handoff: LoadedExecutionHandoff | null): string {
  if (!handoff) {
    return "(none)";
  }

  const latestEvaluation = handoff.handoff.latestEvaluation
    ? `${handoff.handoff.latestEvaluation.passed ? "passed" : "failed"}: ${handoff.handoff.latestEvaluation.summary}`
    : "(none)";
  const touchedFiles = formatBoundedList(handoff.handoff.touchedFiles, {
    itemLimit: 140,
    listLimit: 420,
  });
  const remainingWork = formatBoundedList(handoff.handoff.remainingWork, {
    itemLimit: 180,
    listLimit: 280,
  });
  const completedWork = formatBoundedList(handoff.handoff.completedWork, {
    itemLimit: 140,
    listLimit: 220,
  });

  return [
    `Path: ${handoff.artifactPath}`,
    `Created At: ${handoff.handoff.createdAt}`,
    `Trigger: ${handoff.handoff.resetReason.kind}`,
    `Reason: ${truncateText(handoff.handoff.resetReason.summary, 220)}`,
    "Touched Files:",
    touchedFiles,
    "Remaining Work:",
    remainingWork,
    `Latest Evaluation: ${latestEvaluation}`,
    `Next Recommended Action: ${truncateText(handoff.handoff.nextRecommendedAction, 220)}`,
    "Completed Work:",
    completedWork,
  ].join("\n");
}

function formatActiveTask(activeTask: ActiveTaskContext | null): string {
  if (activeTask === null) {
    return "(none)";
  }

  const lines = [
    `Plan: ${activeTask.planId}`,
    `Task: ${activeTask.taskId} [${activeTask.status}] ${activeTask.title}`,
    `Instruction: ${activeTask.instruction}`,
  ];

  if (activeTask.targetFilePaths.length > 0) {
    lines.push(`Target Files: ${activeTask.targetFilePaths.join(", ")}`);
  }

  if (activeTask.specRefs.length > 0) {
    lines.push(`Spec Refs: ${activeTask.specRefs.join(", ")}`);
  }

  if (activeTask.summary?.trim()) {
    lines.push(`Summary: ${activeTask.summary.trim()}`);
  }

  if (activeTask.checklist.length > 0) {
    lines.push(
      "Checklist:",
      ...activeTask.checklist.map((item) => `- ${item}`),
    );
  }

  return lines.join("\n");
}

export async function loadProjectRules(targetDirectory: string): Promise<string> {
  const agentsPath = path.join(targetDirectory, "AGENTS.md");

  try {
    return await readFile(agentsPath, "utf8");
  } catch {
    return "";
  }
}

export async function buildContextEnvelope(
  options: BuildContextEnvelopeOptions,
): Promise<ContextEnvelope> {
  const projectRules = options.projectRules
    ?? await loadProjectRules(options.targetDirectory);

  return {
    stable: {
      discovery: options.discovery,
      projectRules,
      availableScripts: { ...options.discovery.scripts },
    },
    task: {
      currentInstruction: options.currentInstruction,
      injectedContext: [...(options.injectedContext ?? [])],
      targetFilePaths: [...(options.targetFilePaths ?? [])],
    },
    runtime: {
      recentToolOutputs: [...(options.recentToolOutputs ?? [])],
      recentErrors: [...(options.recentErrors ?? [])],
      currentGitDiff: options.currentGitDiff ?? null,
      featureFlags: normalizeRuntimeFeatureFlags(options.featureFlags),
    },
    session: {
      rollingSummary: options.rollingSummary,
      retryCountsByFile: { ...(options.retryCountsByFile ?? {}) },
      blockedFiles: [...(options.blockedFiles ?? [])],
      recentTouchedFiles: [...(options.recentTouchedFiles ?? [])],
      latestHandoff: options.latestHandoff ?? null,
      activeTask: options.activeTask ?? null,
    },
  };
}

export function serializeContextEnvelope(
  envelope: ContextEnvelope,
): string {
  const projectContextLines = [
    `Instruction: ${truncateText(envelope.task.currentInstruction, SERIALIZED_INSTRUCTION_CHAR_BUDGET)}`,
    `Project: ${envelope.stable.discovery.projectName ?? "unknown"}`,
    `Target Type: ${formatTargetType(envelope.stable.discovery)}`,
    `Language: ${formatDiscoveryValue(envelope.stable.discovery.language)}`,
    `Framework: ${formatDiscoveryValue(envelope.stable.discovery.framework)}`,
    `Package Manager: ${formatDiscoveryValue(envelope.stable.discovery.packageManager)}`,
    "Available Scripts:",
    formatScriptList(envelope.stable.availableScripts),
    "Target Files:",
    formatBoundedList(envelope.task.targetFilePaths),
    "Recent Touched Files:",
    formatBoundedList(envelope.session.recentTouchedFiles ?? []),
    "Recent Tool Outputs:",
    formatBoundedList(envelope.runtime.recentToolOutputs),
  ];

  if (envelope.runtime.currentGitDiff?.trim()) {
    projectContextLines.push(
      "Current Git Diff:",
      truncateWithMarker(
        envelope.runtime.currentGitDiff.trim(),
        SERIALIZED_GIT_DIFF_CHAR_BUDGET,
      ),
    );
  } else {
    projectContextLines.push("Current Git Diff:", "(none)");
  }

  const projectRulesBody = truncateWithMarker(
    envelope.stable.projectRules,
    SERIALIZED_PROJECT_RULES_CHAR_BUDGET,
  );
  const injectedContextBody = formatBoundedList(envelope.task.injectedContext);
  const sessionHistoryBody = truncateWithMarker(
    [
    `Rolling Summary: ${envelope.session.rollingSummary.trim() || "(none)"}`,
    "Retry Counts:",
    formatRetryList(envelope.session.retryCountsByFile),
    ]
      .join("\n"),
    SERIALIZED_SESSION_HISTORY_CHAR_BUDGET,
  );
  const latestHandoffBody = truncateWithMarker(
    formatLatestHandoff(envelope.session.latestHandoff),
    SERIALIZED_HANDOFF_CHAR_BUDGET,
  );
  const activeTaskBody = truncateWithMarker(
    formatActiveTask(envelope.session.activeTask),
    SERIALIZED_ACTIVE_TASK_CHAR_BUDGET,
  );
  const recentErrorsBody = formatBoundedList(envelope.runtime.recentErrors);
  const blockedFilesBody = formatBoundedList(envelope.session.blockedFiles);

  return [
    "Project Context",
    projectContextLines.join("\n"),
    "",
    "Project Rules",
    projectRulesBody,
    "",
    "Injected Context",
    injectedContextBody,
    "",
    "Session History",
    sessionHistoryBody,
    "",
    "Latest Handoff",
    latestHandoffBody,
    "Active Task",
    activeTaskBody,
    "",
    "Recent Errors",
    recentErrorsBody,
    "",
    "Blocked Files",
    blockedFilesBody,
  ].join("\n");
}

export function composeSystemPrompt(
  baseSystemPrompt: string,
  envelope: ContextEnvelope,
): string {
  const serializedEnvelope = serializeContextEnvelope(envelope).trim();

  if (!serializedEnvelope) {
    return baseSystemPrompt.trim();
  }

  return `${baseSystemPrompt.trim()}\n\n${serializedEnvelope}`;
}
