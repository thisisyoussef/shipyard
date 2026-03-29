import path from "node:path";

import { getSourceControlDirectory } from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
import {
  persistedSourceControlStateSchema,
  type PersistedSourceControlState,
} from "./contracts.js";

export function getSourceControlFilePath(targetDirectory: string): string {
  return path.join(getSourceControlDirectory(targetDirectory), "runtime.json");
}

export async function saveSourceControlState(
  targetDirectory: string,
  state: PersistedSourceControlState,
): Promise<PersistedSourceControlState> {
  const validated = persistedSourceControlStateSchema.parse(
    state,
  ) as PersistedSourceControlState;

  await writeTextFileAtomically(
    getSourceControlFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadSourceControlState(
  targetDirectory: string,
): Promise<PersistedSourceControlState | null> {
  return await readParsedJsonFileIfPresent(
    getSourceControlFilePath(targetDirectory),
    (parsed) =>
      persistedSourceControlStateSchema.parse(
        parsed,
      ) as PersistedSourceControlState,
  );
}
