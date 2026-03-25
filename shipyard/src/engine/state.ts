import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import type { DiscoveryReport, TargetProfile } from "../artifacts/types.js";
import { discoverTarget, normalizeDiscoveryReport } from "../context/discovery.js";
import { createInitialPreviewState } from "../preview/contracts.js";
import { loadTargetProfile } from "../tools/target-manager/profile-io.js";
import {
  createInitialDeploySummary,
  createInitialWorkbenchState,
  type WorkbenchViewState,
} from "../ui/workbench-state.js";

export type SessionPhase = "code" | "target-manager";

export interface SessionState {
  sessionId: string;
  targetDirectory: string;
  targetsDirectory: string;
  startedAt: string;
  lastActiveAt: string;
  turnCount: number;
  rollingSummary: string;
  discovery: DiscoveryReport;
  activePhase: SessionPhase;
  targetProfile?: TargetProfile;
  workbenchState: WorkbenchViewState;
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
  targetsDirectory: string;
  startedAt: string;
  lastActiveAt: string;
  turnCount: number;
  rollingSummary: string;
  discovery: DiscoveryReport;
  activePhase: SessionPhase;
  targetProfile?: TargetProfile;
  workbenchState: WorkbenchViewState;
}

export interface SessionRunSummary {
  sessionId: string;
  targetLabel: string;
  targetDirectory: string;
  activePhase: SessionPhase;
  startedAt: string;
  lastActiveAt: string;
  turnCount: number;
  latestInstruction: string | null;
  latestSummary: string | null;
  latestStatus: "working" | "success" | "error" | "cancelled" | "idle" | null;
  isCurrent: boolean;
}

export interface CreateSessionStateOptions {
  sessionId: string;
  targetDirectory: string;
  targetsDirectory?: string;
  discovery: Partial<DiscoveryReport> | DiscoveryReport;
  activePhase?: SessionPhase;
  targetProfile?: TargetProfile;
}

export function createSessionState(
  options: CreateSessionStateOptions,
): SessionState {
  const now = new Date().toISOString();
  const discovery = normalizeDiscoveryReport(options.discovery);
  const workbenchState = createInitialWorkbenchState();
  const activePhase = options.activePhase ?? "code";
  workbenchState.previewState = createInitialPreviewState({
    activePhase,
    discovery,
  });

  return {
    sessionId: options.sessionId,
    targetDirectory: options.targetDirectory,
    targetsDirectory:
      options.targetsDirectory ?? path.dirname(options.targetDirectory),
    startedAt: now,
    lastActiveAt: now,
    turnCount: 0,
    rollingSummary: "",
    discovery,
    activePhase,
    targetProfile: options.targetProfile,
    workbenchState,
  };
}

export function createSessionSnapshot(state: SessionState): SessionSnapshot {
  return {
    sessionId: state.sessionId,
    targetDirectory: state.targetDirectory,
    targetsDirectory: state.targetsDirectory,
    startedAt: state.startedAt,
    lastActiveAt: state.lastActiveAt,
    turnCount: state.turnCount,
    rollingSummary: state.rollingSummary,
    discovery: state.discovery,
    activePhase: state.activePhase,
    targetProfile: state.targetProfile,
    workbenchState: state.workbenchState,
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

export function getPlanDirectory(targetDirectory: string): string {
  return path.join(getShipyardDirectory(targetDirectory), "plans");
}

export function getSessionFilePath(
  targetDirectory: string,
  sessionId: string,
): string {
  return path.join(getSessionDirectory(targetDirectory), `${sessionId}.json`);
}

function createTargetLabel(state: SessionState): string {
  const projectName = state.discovery.projectName?.trim();

  if (projectName) {
    return projectName;
  }

  return path.basename(state.targetDirectory) || state.targetDirectory;
}

function createSessionRunSummary(
  state: SessionState,
  currentSessionId: string | null,
): SessionRunSummary {
  const latestTurn = state.workbenchState.turns[0];

  return {
    sessionId: state.sessionId,
    targetLabel: createTargetLabel(state),
    targetDirectory: state.targetDirectory,
    activePhase: state.activePhase,
    startedAt: state.startedAt,
    lastActiveAt: state.lastActiveAt,
    turnCount: state.turnCount,
    latestInstruction: latestTurn?.instruction ?? null,
    latestSummary: latestTurn?.summary ?? null,
    latestStatus: latestTurn?.status ?? null,
    isCurrent: currentSessionId === state.sessionId,
  };
}

export async function ensureShipyardDirectories(
  targetDirectory: string,
): Promise<void> {
  await mkdir(getSessionDirectory(targetDirectory), { recursive: true });
  await mkdir(getCheckpointDirectory(targetDirectory), { recursive: true });
  await mkdir(getTraceDirectory(targetDirectory), { recursive: true });
  await mkdir(getPlanDirectory(targetDirectory), { recursive: true });
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
  const parsed = JSON.parse(contents) as Partial<SessionState> &
    Omit<SessionState, "workbenchState">;
  const discovery = normalizeDiscoveryReport(parsed.discovery);
  const workbenchState = parsed.workbenchState ?? createInitialWorkbenchState();
  const activePhase = parsed.activePhase ?? "code";

  if (!workbenchState.previewState) {
    workbenchState.previewState = createInitialPreviewState({
      activePhase,
      discovery,
    });
  }

  if (!Array.isArray(workbenchState.pendingUploads)) {
    workbenchState.pendingUploads = [];
  }

  if (!workbenchState.latestDeploy) {
    workbenchState.latestDeploy = createInitialDeploySummary();
  }

  return {
    ...parsed,
    discovery,
    targetsDirectory:
      parsed.targetsDirectory ?? path.dirname(targetDirectory),
    activePhase,
    targetProfile: parsed.targetProfile,
    workbenchState,
  } as SessionState;
}

export async function loadLatestSessionState(
  targetDirectory: string,
): Promise<SessionState | null> {
  let entries: string[];

  try {
    entries = await readdir(getSessionDirectory(targetDirectory));
  } catch {
    return null;
  }

  const sessionIds = entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/u, ""))
    .filter(Boolean);

  const sessions = (
    await Promise.all(
      sessionIds.map((sessionId) => loadSessionState(targetDirectory, sessionId)),
    )
  ).filter((session): session is SessionState => session !== null);

  if (sessions.length === 0) {
    return null;
  }

  return [...sessions].sort((left, right) =>
    Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt)
  )[0] ?? null;
}

export async function listSessionRunSummaries(
  targetDirectory: string,
  currentSessionId: string | null = null,
): Promise<SessionRunSummary[]> {
  let entries: string[];

  try {
    entries = await readdir(getSessionDirectory(targetDirectory));
  } catch {
    return [];
  }

  const sessionIds = entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/u, ""))
    .filter(Boolean);

  const sessions = (
    await Promise.all(
      sessionIds.map((sessionId) => loadSessionState(targetDirectory, sessionId)),
    )
  ).filter((session): session is SessionState => session !== null);

  return [...sessions]
    .sort((left, right) =>
      Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt)
    )
    .map((session) => createSessionRunSummary(session, currentSessionId));
}

export async function switchTarget(
  currentState: SessionState,
  newTargetPath: string,
): Promise<SessionState> {
  const resolvedTargetPath = path.resolve(newTargetPath);
  const sameTarget = resolvedTargetPath === currentState.targetDirectory;

  if (sameTarget && currentState.activePhase === "code") {
    currentState.lastActiveAt = new Date().toISOString();
    await saveSessionState(currentState);
    return currentState;
  }

  await saveSessionState(currentState);
  await mkdir(resolvedTargetPath, { recursive: true });
  await ensureShipyardDirectories(resolvedTargetPath);

  const discovery = await discoverTarget(resolvedTargetPath);
  const targetProfile = await loadTargetProfile(resolvedTargetPath);
  const resumedSession = await loadLatestSessionState(resolvedTargetPath);

  const nextState =
    resumedSession ??
    createSessionState({
      sessionId: nanoid(),
      targetDirectory: resolvedTargetPath,
      targetsDirectory: currentState.targetsDirectory,
      discovery,
      activePhase: "code",
      targetProfile: targetProfile ?? undefined,
    });

  nextState.targetDirectory = resolvedTargetPath;
  nextState.targetsDirectory = currentState.targetsDirectory;
  nextState.discovery = discovery;
  nextState.activePhase = "code";
  nextState.targetProfile = targetProfile ?? nextState.targetProfile;
  nextState.lastActiveAt = new Date().toISOString();

  if (!nextState.workbenchState.previewState) {
    nextState.workbenchState.previewState = createInitialPreviewState({
      activePhase: nextState.activePhase,
      discovery,
    });
  }

  if (!nextState.workbenchState.latestDeploy) {
    nextState.workbenchState.latestDeploy = createInitialDeploySummary();
  }

  await saveSessionState(nextState);
  return nextState;
}
