import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport } from "../artifacts/types.js";

export interface SessionState {
  sessionId: string;
  targetDirectory: string;
  startedAt: string;
  lastActiveAt: string;
  turnCount: number;
  rollingSummary: string;
  discovery: DiscoveryReport;
}

export interface ContextEnvelope {
  stable: {
    discovery: DiscoveryReport;
    projectRules: string;
    availableScripts: Record<string, string>;
  };
  task: {
    currentInstruction: string;
    injectedContext: string[];
    targetFilePaths: string[];
  };
  runtime: {
    recentToolOutputs: string[];
    recentErrors: string[];
    currentGitDiff: string | null;
  };
  session: {
    rollingSummary: string;
    retryCountsByFile: Record<string, number>;
    blockedFiles: string[];
  };
}

export type FileHashMap = Record<string, string>;

export interface SessionSnapshot {
  sessionId: string;
  targetDirectory: string;
  startedAt: string;
  lastActiveAt: string;
  turnCount: number;
  rollingSummary: string;
  discovery: DiscoveryReport;
}

export interface CreateSessionStateOptions {
  sessionId: string;
  targetDirectory: string;
  discovery: DiscoveryReport;
}

export function createSessionState(
  options: CreateSessionStateOptions,
): SessionState {
  const now = new Date().toISOString();

  return {
    sessionId: options.sessionId,
    targetDirectory: options.targetDirectory,
    startedAt: now,
    lastActiveAt: now,
    turnCount: 0,
    rollingSummary: "",
    discovery: options.discovery,
  };
}

export function createSessionSnapshot(state: SessionState): SessionSnapshot {
  return {
    sessionId: state.sessionId,
    targetDirectory: state.targetDirectory,
    startedAt: state.startedAt,
    lastActiveAt: state.lastActiveAt,
    turnCount: state.turnCount,
    rollingSummary: state.rollingSummary,
    discovery: state.discovery,
  };
}

export function getShipyardDirectory(targetDirectory: string): string {
  return path.join(targetDirectory, ".shipyard");
}

export function getSessionDirectory(targetDirectory: string): string {
  return path.join(getShipyardDirectory(targetDirectory), "sessions");
}

export function getCheckpointDirectory(targetDirectory: string): string {
  return path.join(getShipyardDirectory(targetDirectory), "checkpoints");
}

export function getTraceDirectory(targetDirectory: string): string {
  return path.join(getShipyardDirectory(targetDirectory), "traces");
}

export function getSessionFilePath(
  targetDirectory: string,
  sessionId: string,
): string {
  return path.join(getSessionDirectory(targetDirectory), `${sessionId}.json`);
}

export async function ensureShipyardDirectories(
  targetDirectory: string,
): Promise<void> {
  await mkdir(getSessionDirectory(targetDirectory), { recursive: true });
  await mkdir(getCheckpointDirectory(targetDirectory), { recursive: true });
  await mkdir(getTraceDirectory(targetDirectory), { recursive: true });
}

export async function saveSessionState(state: SessionState): Promise<string> {
  await ensureShipyardDirectories(state.targetDirectory);

  const sessionFilePath = getSessionFilePath(
    state.targetDirectory,
    state.sessionId,
  );
  await writeFile(sessionFilePath, JSON.stringify(state, null, 2), "utf8");

  return sessionFilePath;
}

export async function loadSessionState(
  targetDirectory: string,
  sessionId: string,
): Promise<SessionState | null> {
  const sessionFilePath = getSessionFilePath(targetDirectory, sessionId);

  try {
    await access(sessionFilePath);
  } catch {
    return null;
  }

  const contents = await readFile(sessionFilePath, "utf8");
  return JSON.parse(contents) as SessionState;
}
