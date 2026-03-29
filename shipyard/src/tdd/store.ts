import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  getTddDirectory,
} from "../engine/state.js";
import {
  persistedTddLaneSchema,
  type PersistedTddLane,
} from "./contracts.js";

export function getTddLaneFilePath(
  targetDirectory: string,
  laneId: string,
): string {
  return path.join(getTddDirectory(targetDirectory), `${laneId}.json`);
}

async function writeAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );

  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, filePath);
}

export async function saveTddLane(
  targetDirectory: string,
  lane: PersistedTddLane,
): Promise<PersistedTddLane> {
  const validated = persistedTddLaneSchema.parse(lane) as PersistedTddLane;
  await mkdir(getTddDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getTddLaneFilePath(targetDirectory, validated.laneId),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadTddLane(
  targetDirectory: string,
  laneId: string,
): Promise<PersistedTddLane | null> {
  if (!laneId.trim()) {
    return null;
  }

  const laneFilePath = getTddLaneFilePath(targetDirectory, laneId);

  try {
    await access(laneFilePath);
  } catch {
    return null;
  }

  const contents = await readFile(laneFilePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedTddLaneSchema.parse(parsed) as PersistedTddLane;
}

export async function listTddLanes(
  targetDirectory: string,
): Promise<PersistedTddLane[]> {
  let entries: string[];

  try {
    entries = await readdir(getTddDirectory(targetDirectory));
  } catch {
    return [];
  }

  const loaded = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => loadTddLane(targetDirectory, entry.replace(/\.json$/u, ""))),
  );

  return loaded
    .filter((lane): lane is PersistedTddLane => lane !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
