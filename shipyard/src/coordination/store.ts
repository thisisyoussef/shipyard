import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { getCoordinationDirectory } from "../engine/state.js";
import {
  persistedCoordinationStateSchema,
  type PersistedCoordinationState,
} from "./contracts.js";

export function getCoordinationFilePath(targetDirectory: string): string {
  return path.join(getCoordinationDirectory(targetDirectory), "runtime.json");
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

export async function saveCoordinationState(
  targetDirectory: string,
  state: PersistedCoordinationState,
): Promise<PersistedCoordinationState> {
  const validated = persistedCoordinationStateSchema.parse(
    state,
  ) as PersistedCoordinationState;

  await mkdir(getCoordinationDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getCoordinationFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadCoordinationState(
  targetDirectory: string,
): Promise<PersistedCoordinationState | null> {
  const filePath = getCoordinationFilePath(targetDirectory);

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const contents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedCoordinationStateSchema.parse(
    parsed,
  ) as PersistedCoordinationState;
}
