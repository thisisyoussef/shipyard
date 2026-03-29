import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { getSourceControlDirectory } from "../engine/state.js";
import {
  persistedSourceControlStateSchema,
  type PersistedSourceControlState,
} from "./contracts.js";

export function getSourceControlFilePath(targetDirectory: string): string {
  return path.join(getSourceControlDirectory(targetDirectory), "runtime.json");
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

export async function saveSourceControlState(
  targetDirectory: string,
  state: PersistedSourceControlState,
): Promise<PersistedSourceControlState> {
  const validated = persistedSourceControlStateSchema.parse(
    state,
  ) as PersistedSourceControlState;

  await mkdir(getSourceControlDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getSourceControlFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadSourceControlState(
  targetDirectory: string,
): Promise<PersistedSourceControlState | null> {
  const filePath = getSourceControlFilePath(targetDirectory);

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const contents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedSourceControlStateSchema.parse(
    parsed,
  ) as PersistedSourceControlState;
}
