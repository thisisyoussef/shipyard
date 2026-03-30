import path from "node:path";

import { getTaskGraphDirectory } from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
import {
  persistedTaskGraphStateSchema,
  type PersistedTaskGraphState,
} from "./contracts.js";

export function getTaskGraphFilePath(targetDirectory: string): string {
  return path.join(getTaskGraphDirectory(targetDirectory), "runtime.json");
}

export async function saveTaskGraphState(
  targetDirectory: string,
  state: PersistedTaskGraphState,
): Promise<PersistedTaskGraphState> {
  const validated = persistedTaskGraphStateSchema.parse(
    state,
  ) as PersistedTaskGraphState;

  await writeTextFileAtomically(
    getTaskGraphFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadTaskGraphState(
  targetDirectory: string,
): Promise<PersistedTaskGraphState | null> {
  return await readParsedJsonFileIfPresent(
    getTaskGraphFilePath(targetDirectory),
    (parsed) =>
      persistedTaskGraphStateSchema.parse(
        parsed,
      ) as PersistedTaskGraphState,
  );
}
