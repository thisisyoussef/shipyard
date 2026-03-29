import path from "node:path";

import { getOrchestrationDirectory } from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
import {
  persistedOrchestrationStateSchema,
  type PersistedOrchestrationState,
} from "./contracts.js";

export function getOrchestrationFilePath(targetDirectory: string): string {
  return path.join(getOrchestrationDirectory(targetDirectory), "runtime.json");
}

export async function saveOrchestrationState(
  targetDirectory: string,
  state: PersistedOrchestrationState,
): Promise<PersistedOrchestrationState> {
  const validated = persistedOrchestrationStateSchema.parse(
    state,
  ) as PersistedOrchestrationState;

  await writeTextFileAtomically(
    getOrchestrationFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadOrchestrationState(
  targetDirectory: string,
): Promise<PersistedOrchestrationState | null> {
  return await readParsedJsonFileIfPresent(
    getOrchestrationFilePath(targetDirectory),
    (parsed) =>
      persistedOrchestrationStateSchema.parse(
        parsed,
      ) as PersistedOrchestrationState,
  );
}
