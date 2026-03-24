import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport } from "../artifacts/types.js";
import type { ContextEnvelope } from "../engine/state.js";

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
  retryCountsByFile?: Record<string, number>;
  blockedFiles?: string[];
  projectRules?: string;
}

function formatDiscoveryValue(value: string | null): string {
  return value ?? "unknown";
}

function formatList(items: string[], emptyLabel = "(none)"): string {
  if (items.length === 0) {
    return emptyLabel;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatScriptList(scripts: Record<string, string>): string {
  const scriptEntries = Object.entries(scripts).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (scriptEntries.length === 0) {
    return "(none)";
  }

  return scriptEntries
    .map(([name, command]) => `- ${name}: ${command}`)
    .join("\n");
}

function formatRetryList(retryCountsByFile: Record<string, number>): string {
  const retryEntries = Object.entries(retryCountsByFile)
    .sort(([left], [right]) => left.localeCompare(right));

  if (retryEntries.length === 0) {
    return "(none)";
  }

  return retryEntries
    .map(([filePath, retryCount]) => `- ${filePath}: ${String(retryCount)}`)
    .join("\n");
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
    },
    session: {
      rollingSummary: options.rollingSummary,
      retryCountsByFile: { ...(options.retryCountsByFile ?? {}) },
      blockedFiles: [...(options.blockedFiles ?? [])],
    },
  };
}

export function serializeContextEnvelope(
  envelope: ContextEnvelope,
): string {
  const projectContextLines = [
    `Instruction: ${envelope.task.currentInstruction}`,
    `Project: ${envelope.stable.discovery.projectName ?? "unknown"}`,
    `Target Type: ${envelope.stable.discovery.isGreenfield ? "greenfield" : "existing"}`,
    `Language: ${formatDiscoveryValue(envelope.stable.discovery.language)}`,
    `Framework: ${formatDiscoveryValue(envelope.stable.discovery.framework)}`,
    `Package Manager: ${formatDiscoveryValue(envelope.stable.discovery.packageManager)}`,
    "Available Scripts:",
    formatScriptList(envelope.stable.availableScripts),
    "Target Files:",
    formatList(envelope.task.targetFilePaths),
    "Recent Tool Outputs:",
    formatList(envelope.runtime.recentToolOutputs),
  ];

  if (envelope.runtime.currentGitDiff?.trim()) {
    projectContextLines.push(
      "Current Git Diff:",
      envelope.runtime.currentGitDiff.trim(),
    );
  } else {
    projectContextLines.push("Current Git Diff:", "(none)");
  }

  const projectRulesBody = envelope.stable.projectRules.trim() || "(none)";
  const injectedContextBody = formatList(envelope.task.injectedContext);
  const sessionHistoryBody = [
    `Rolling Summary: ${envelope.session.rollingSummary.trim() || "(none)"}`,
    "Retry Counts:",
    formatRetryList(envelope.session.retryCountsByFile),
  ].join("\n");
  const recentErrorsBody = formatList(envelope.runtime.recentErrors);
  const blockedFilesBody = formatList(envelope.session.blockedFiles);

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
