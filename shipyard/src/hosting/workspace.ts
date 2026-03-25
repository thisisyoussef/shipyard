import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface HostedWorkspaceInfo {
  rootPath: string;
  volumeMountPath: string | null;
  persistentRequired: boolean;
  mode: "hosted" | "persistent";
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeEnvPath(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return path.resolve(value.trim());
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function assertWritableDirectory(directoryPath: string): Promise<void> {
  try {
    await mkdir(directoryPath, { recursive: true });
  } catch (error) {
    throw new Error(
      `Hosted workspace could not be created at ${directoryPath}: ${formatErrorMessage(error)}`,
    );
  }

  const probePath = path.join(
    directoryPath,
    `.shipyard-hosted-write-check-${String(process.pid)}-${String(Date.now())}`,
  );

  try {
    await writeFile(probePath, "ok\n", "utf8");
  } catch (error) {
    throw new Error(
      `Hosted workspace is not writable at ${directoryPath}: ${formatErrorMessage(error)}`,
    );
  } finally {
    await rm(probePath, { force: true });
  }
}

export function hasHostedWorkspaceContract(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.SHIPYARD_TARGETS_DIR?.trim() ||
      env.RAILWAY_VOLUME_MOUNT_PATH?.trim() ||
      parseBooleanEnv(env.SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE),
  );
}

export async function prepareHostedWorkspace(
  rootPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HostedWorkspaceInfo> {
  const normalizedRootPath = path.resolve(rootPath);
  const persistentRequired = parseBooleanEnv(
    env.SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE,
  );
  const volumeMountPath = normalizeEnvPath(env.RAILWAY_VOLUME_MOUNT_PATH);

  if (persistentRequired && volumeMountPath === null) {
    throw new Error(
      `Persistent hosted workspace requires a Railway volume mount at ${normalizedRootPath}.`,
    );
  }

  if (persistentRequired && volumeMountPath !== normalizedRootPath) {
    throw new Error(
      `Persistent hosted workspace expected a Railway volume at ${normalizedRootPath}, but Railway mounted ${volumeMountPath}.`,
    );
  }

  await assertWritableDirectory(normalizedRootPath);

  return {
    rootPath: normalizedRootPath,
    volumeMountPath,
    persistentRequired,
    mode: persistentRequired ? "persistent" : "hosted",
  };
}
