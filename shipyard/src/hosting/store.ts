import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { getHostingDirectory } from "../engine/state.js";
import {
  persistedHostedRuntimeStateSchema,
  type PersistedHostedRuntimeState,
} from "./contracts.js";

export function getHostedRuntimeFilePath(targetDirectory: string): string {
  return path.join(getHostingDirectory(targetDirectory), "runtime.json");
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

export async function saveHostedRuntimeState(
  targetDirectory: string,
  state: PersistedHostedRuntimeState,
): Promise<PersistedHostedRuntimeState> {
  const validated = persistedHostedRuntimeStateSchema.parse(
    state,
  ) as PersistedHostedRuntimeState;

  await mkdir(getHostingDirectory(targetDirectory), { recursive: true });
  await writeAtomically(
    getHostedRuntimeFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadHostedRuntimeState(
  targetDirectory: string,
): Promise<PersistedHostedRuntimeState | null> {
  const filePath = getHostedRuntimeFilePath(targetDirectory);

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const contents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  return persistedHostedRuntimeStateSchema.parse(
    parsed,
  ) as PersistedHostedRuntimeState;
}
