import path from "node:path";

import { getHostingDirectory } from "../engine/state.js";
import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../persistence/json-file.js";
import {
  persistedHostedRuntimeStateSchema,
  type PersistedHostedRuntimeState,
} from "./contracts.js";

export function getHostedRuntimeFilePath(targetDirectory: string): string {
  return path.join(getHostingDirectory(targetDirectory), "runtime.json");
}

export async function saveHostedRuntimeState(
  targetDirectory: string,
  state: PersistedHostedRuntimeState,
): Promise<PersistedHostedRuntimeState> {
  const validated = persistedHostedRuntimeStateSchema.parse(
    state,
  ) as PersistedHostedRuntimeState;

  await writeTextFileAtomically(
    getHostedRuntimeFilePath(targetDirectory),
    `${JSON.stringify(validated, null, 2)}\n`,
  );

  return validated;
}

export async function loadHostedRuntimeState(
  targetDirectory: string,
): Promise<PersistedHostedRuntimeState | null> {
  return await readParsedJsonFileIfPresent(
    getHostedRuntimeFilePath(targetDirectory),
    (parsed) =>
      persistedHostedRuntimeStateSchema.parse(
        parsed,
      ) as PersistedHostedRuntimeState,
  );
}
