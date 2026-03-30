import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { resolveMaybeRelative, type MissionPaths } from "./config.js";

interface SessionPayload {
  activeHandoffPath?: string | null;
}

export interface MissionRecoveryOptions {
  targetDirectory: string;
  sessionId: string;
  paths: Pick<
    MissionPaths,
    "sessionBackupsDirectory" | "handoffBackupsDirectory" | "quarantineDirectory"
  >;
}

export interface MissionRecoveryResult {
  sessionPath: string;
  sessionStatus: "valid" | "missing" | "invalid";
  restoredSession: boolean;
  restoredHandoff: boolean;
  sessionBackupFile: string | null;
  handoffBackupFile: string | null;
  activeHandoffPath: string | null;
}

function sessionFilePath(targetDirectory: string, sessionId: string): string {
  return path.join(targetDirectory, ".shipyard", "sessions", `${sessionId}.json`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function listSortedFiles(directory: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(directory)).sort();
  } catch {
    return [];
  }
}

function newestMatchingFile(entries: string[], matcher: (entry: string) => boolean): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && matcher(entry)) {
      return entry;
    }
  }

  return null;
}

async function quarantineCurrentSession(options: {
  sessionPath: string;
  quarantineDirectory: string;
}): Promise<void> {
  if (!(await fileExists(options.sessionPath))) {
    return;
  }

  await mkdir(options.quarantineDirectory, { recursive: true });
  const quarantinePath = path.join(
    options.quarantineDirectory,
    `${new Date().toISOString().replace(/[:.]/gu, "-")}-${path.basename(
      options.sessionPath,
    )}`,
  );
  await copyFile(options.sessionPath, quarantinePath);
}

export async function repairMissionSessionArtifacts(
  options: MissionRecoveryOptions,
): Promise<MissionRecoveryResult> {
  const sessionPath = sessionFilePath(options.targetDirectory, options.sessionId);
  const initialSessionExists = await fileExists(sessionPath);
  let sessionStatus: MissionRecoveryResult["sessionStatus"] = initialSessionExists
    ? "valid"
    : "missing";
  let sessionPayload: SessionPayload | null = initialSessionExists
    ? await readJsonSafe<SessionPayload>(sessionPath)
    : null;

  if (initialSessionExists && sessionPayload === null) {
    sessionStatus = "invalid";
  }

  let restoredSession = false;
  let sessionBackupFile: string | null = null;

  if (sessionStatus !== "valid") {
    const sessionBackups = await listSortedFiles(options.paths.sessionBackupsDirectory);
    const latestSessionBackup = newestMatchingFile(
      sessionBackups,
      (entry) => entry.endsWith(".json"),
    );

    if (latestSessionBackup !== null) {
      await quarantineCurrentSession({
        sessionPath,
        quarantineDirectory: options.paths.quarantineDirectory,
      });
      await mkdir(path.dirname(sessionPath), { recursive: true });
      await copyFile(
        path.join(options.paths.sessionBackupsDirectory, latestSessionBackup),
        sessionPath,
      );
      sessionPayload = await readJsonSafe<SessionPayload>(sessionPath);
      restoredSession = sessionPayload !== null;
      sessionBackupFile = restoredSession ? latestSessionBackup : null;
      if (restoredSession) {
        sessionStatus = "valid";
      }
    }
  }

  const rawHandoffPath =
    typeof sessionPayload?.activeHandoffPath === "string"
      ? sessionPayload.activeHandoffPath
      : null;
  const activeHandoffPath =
    rawHandoffPath === null
      ? null
      : resolveMaybeRelative(options.targetDirectory, rawHandoffPath);
  const handoffMissing =
    activeHandoffPath !== null && !(await fileExists(activeHandoffPath));

  let restoredHandoff = false;
  let handoffBackupFile: string | null = null;

  if (activeHandoffPath !== null && handoffMissing) {
    const handoffBackups = await listSortedFiles(options.paths.handoffBackupsDirectory);
    const sessionStem = sessionBackupFile?.replace(/\.json$/u, "") ?? null;
    const handoffBaseName = path.basename(activeHandoffPath);
    const matchingBackup = newestMatchingFile(
      handoffBackups,
      (entry) =>
        (sessionStem !== null && entry.startsWith(`${sessionStem}-`)) ||
        entry.endsWith(`-${handoffBaseName}`),
    );

    if (matchingBackup !== null) {
      await mkdir(path.dirname(activeHandoffPath), { recursive: true });
      await copyFile(
        path.join(options.paths.handoffBackupsDirectory, matchingBackup),
        activeHandoffPath,
      );
      restoredHandoff = true;
      handoffBackupFile = matchingBackup;
    }
  }

  return {
    sessionPath,
    sessionStatus,
    restoredSession,
    restoredHandoff,
    sessionBackupFile,
    handoffBackupFile,
    activeHandoffPath,
  };
}
