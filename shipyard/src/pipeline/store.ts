import { readdir } from "node:fs/promises";
import path from "node:path";

import { getPipelineDirectory } from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
import type { PersistedPipelineRun } from "./contracts.js";
import { persistedPipelineRunSchema } from "./contracts.js";

export function getPipelineFilePath(
  targetDirectory: string,
  runId: string,
): string {
  return path.join(getPipelineDirectory(targetDirectory), `${runId}.json`);
}

export async function savePipelineRun(
  targetDirectory: string,
  run: PersistedPipelineRun,
): Promise<PersistedPipelineRun> {
  const validated = persistedPipelineRunSchema.parse(run) as PersistedPipelineRun;
  await writeTextFileAtomically(
    getPipelineFilePath(targetDirectory, validated.runId),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadPipelineRun(
  targetDirectory: string,
  runId: string,
): Promise<PersistedPipelineRun | null> {
  return await readParsedJsonFileIfPresent(
    getPipelineFilePath(targetDirectory, runId),
    (parsed) => persistedPipelineRunSchema.parse(parsed) as PersistedPipelineRun,
  );
}

export async function listPipelineRuns(
  targetDirectory: string,
): Promise<PersistedPipelineRun[]> {
  let entries: string[];

  try {
    entries = await readdir(getPipelineDirectory(targetDirectory));
  } catch {
    return [];
  }

  const loadedRuns = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) =>
        loadPipelineRun(targetDirectory, entry.replace(/\.json$/u, ""))
      ),
  );

  return loadedRuns
    .filter((run): run is PersistedPipelineRun => run !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
