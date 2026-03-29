import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { getTaskGraphDirectory } from "../engine/state.js";
import {
  persistedTaskGraphStateSchema,
  type PersistedTaskGraphState,
} from "./contracts.js";

export function getTaskGraphFilePath(targetDirectory: string): string {
  return path.join(getTaskGraphDirectory(targetDirectory), "runtime.json");
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

export async function saveTaskGraphState(
  targetDirectory: string,
  state: PersistedTaskGraphState,
): Promise<PersistedTaskGraphState> {
  const validated = persistedTaskGraphStateSchema.parse(
    state,
  ) as PersistedTaskGraphState;

  await mkdir(getTaskGraphDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getTaskGraphFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadTaskGraphState(
  targetDirectory: string,
): Promise<PersistedTaskGraphState | null> {
  const filePath = getTaskGraphFilePath(targetDirectory);

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const contents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedTaskGraphStateSchema.parse(
    parsed,
  ) as PersistedTaskGraphState;
}
