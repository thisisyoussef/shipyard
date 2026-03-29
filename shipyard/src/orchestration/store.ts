import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { getOrchestrationDirectory } from "../engine/state.js";
import {
  persistedOrchestrationStateSchema,
  type PersistedOrchestrationState,
} from "./contracts.js";

export function getOrchestrationFilePath(targetDirectory: string): string {
  return path.join(getOrchestrationDirectory(targetDirectory), "runtime.json");
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

export async function saveOrchestrationState(
  targetDirectory: string,
  state: PersistedOrchestrationState,
): Promise<PersistedOrchestrationState> {
  const validated = persistedOrchestrationStateSchema.parse(
    state,
  ) as PersistedOrchestrationState;

  await mkdir(getOrchestrationDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getOrchestrationFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadOrchestrationState(
  targetDirectory: string,
): Promise<PersistedOrchestrationState | null> {
  const filePath = getOrchestrationFilePath(targetDirectory);

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const contents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedOrchestrationStateSchema.parse(
    parsed,
  ) as PersistedOrchestrationState;
}
