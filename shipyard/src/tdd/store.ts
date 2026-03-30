import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  getTddDirectory,
} from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
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

export async function saveTddLane(
  targetDirectory: string,
  lane: PersistedTddLane,
): Promise<PersistedTddLane> {
  const validated = persistedTddLaneSchema.parse(lane) as PersistedTddLane;
  await writeTextFileAtomically(
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

  return await readParsedJsonFileIfPresent(
    getTddLaneFilePath(targetDirectory, laneId),
    (parsed) => persistedTddLaneSchema.parse(parsed) as PersistedTddLane,
  );
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
