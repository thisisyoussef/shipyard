import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { PersistedPipelineRun } from "./contracts.js";
import { persistedPipelineRunSchema } from "./contracts.js";
import { getPipelineDirectory } from "../engine/state.js";

export function getPipelineFilePath(
  targetDirectory: string,
  runId: string,
): string {
  return path.join(getPipelineDirectory(targetDirectory), `${runId}.json`);
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

export async function savePipelineRun(
  targetDirectory: string,
  run: PersistedPipelineRun,
): Promise<PersistedPipelineRun> {
  const validated = persistedPipelineRunSchema.parse(run) as PersistedPipelineRun;
  await mkdir(getPipelineDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getPipelineFilePath(targetDirectory, validated.runId),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadPipelineRun(
  targetDirectory: string,
  runId: string,
): Promise<PersistedPipelineRun | null> {
  const pipelineFilePath = getPipelineFilePath(targetDirectory, runId);

  try {
    await access(pipelineFilePath);
  } catch {
    return null;
  }

  const contents = await readFile(pipelineFilePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedPipelineRunSchema.parse(parsed) as PersistedPipelineRun;
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
