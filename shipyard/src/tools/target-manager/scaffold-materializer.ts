import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ToolError } from "../read-file.js";
import { getScaffoldFiles, type ScaffoldType } from "./scaffolds.js";

const DEFAULT_ALLOWED_EXISTING_ENTRIES = new Set([".DS_Store"]);

export interface MaterializeScaffoldInput {
  targetPath: string;
  name: string;
  description: string;
  scaffoldType: ScaffoldType;
  allowedExistingEntries?: string[];
}

export interface MaterializeScaffoldResult {
  createdFiles: string[];
}

export function normalizeTargetName(name: string): string {
  const normalized = name.trim().replace(/\s+/gu, "-").toLowerCase();
  return normalized || "workspace";
}

export function deriveTargetNameFromPath(targetPath: string): string {
  const basename = path.basename(targetPath).trim();
  return normalizeTargetName(basename || "workspace");
}

async function ensureScaffoldTargetReady(
  targetPath: string,
  allowedExistingEntries: string[] = [],
): Promise<void> {
  await mkdir(targetPath, { recursive: true });

  const allowedEntries = new Set([
    ...DEFAULT_ALLOWED_EXISTING_ENTRIES,
    ...allowedExistingEntries,
  ]);
  const existingEntries = await readdir(targetPath);
  const blockedEntries = existingEntries.filter((entry) => !allowedEntries.has(entry));

  if (blockedEntries.length === 0) {
    return;
  }

  const preview = blockedEntries.slice(0, 5).join(", ");
  throw new ToolError(
    `Target is not empty and cannot be bootstrapped: ${targetPath}. Found: ${preview}`,
  );
}

export async function materializeScaffold(
  input: MaterializeScaffoldInput,
): Promise<MaterializeScaffoldResult> {
  await ensureScaffoldTargetReady(
    input.targetPath,
    input.allowedExistingEntries,
  );

  const normalizedName = normalizeTargetName(input.name);
  const scaffoldFiles = getScaffoldFiles(
    input.scaffoldType,
    normalizedName,
    input.description,
  );

  for (const scaffoldFile of scaffoldFiles) {
    const absolutePath = path.join(input.targetPath, scaffoldFile.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, scaffoldFile.content, "utf8");
  }

  return {
    createdFiles: scaffoldFiles.map((file) => file.path),
  };
}
