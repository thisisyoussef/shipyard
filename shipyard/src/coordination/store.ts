import path from "node:path";

import { getCoordinationDirectory } from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
import {
  persistedCoordinationStateSchema,
  type PersistedCoordinationState,
} from "./contracts.js";

export function getCoordinationFilePath(targetDirectory: string): string {
  return path.join(getCoordinationDirectory(targetDirectory), "runtime.json");
}

export async function saveCoordinationState(
  targetDirectory: string,
  state: PersistedCoordinationState,
): Promise<PersistedCoordinationState> {
  const validated = persistedCoordinationStateSchema.parse(
    state,
  ) as PersistedCoordinationState;

  await writeTextFileAtomically(
    getCoordinationFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadCoordinationState(
  targetDirectory: string,
): Promise<PersistedCoordinationState | null> {
  return await readParsedJsonFileIfPresent(
    getCoordinationFilePath(targetDirectory),
    (parsed) =>
      persistedCoordinationStateSchema.parse(
        parsed,
      ) as PersistedCoordinationState,
  );
}
