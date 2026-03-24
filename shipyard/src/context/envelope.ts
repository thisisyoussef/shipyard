import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport } from "../artifacts/types.js";
import type { ContextEnvelope } from "../engine/state.js";

export interface CreateContextEnvelopeOptions {
  targetDirectory: string;
  discovery: DiscoveryReport;
  projectRules: string;
  currentInstruction: string;
  injectedContext?: string[];
  targetFilePaths?: string[];
  recentToolOutputs?: string[];
  recentErrors?: string[];
  currentGitDiff?: string | null;
  rollingSummary: string;
  retryCountsByFile?: Record<string, number>;
  blockedFiles?: string[];
}

export async function loadProjectRules(targetDirectory: string): Promise<string> {
  const agentsPath = path.join(targetDirectory, "AGENTS.md");

  try {
    return await readFile(agentsPath, "utf8");
  } catch {
    return "";
  }
}

export function createContextEnvelope(
  options: CreateContextEnvelopeOptions,
): ContextEnvelope {
  return {
    stable: {
      discovery: options.discovery,
      projectRules: options.projectRules,
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
