import { readdir } from "node:fs/promises";
import path from "node:path";

import { formatDiscoverySummary, discoverTarget } from "../../context/discovery.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";
import { loadTargetProfile } from "./profile-io.js";

const NOISY_DIRECTORY_NAMES = new Set([
  ".git",
  ".shipyard",
  "node_modules",
  "dist",
  "coverage",
  "build",
]);

export interface TargetListEntry {
  name: string;
  path: string;
  language: string | null;
  framework: string | null;
  discoverySummary: string;
  hasProfile: boolean;
  profileSummary: string | null;
}

export interface ListTargetsInput {
  targetsDir: string;
}

const listTargetsInputSchema = {
  type: "object",
  properties: {
    targets_dir: {
      type: "string",
      description: "Absolute path to the directory containing target repos.",
    },
  },
  required: ["targets_dir"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function looksLikeTarget(discovery: Awaited<ReturnType<typeof discoverTarget>>): boolean {
  return !(
    discovery.isGreenfield &&
    discovery.topLevelFiles.length === 0 &&
    discovery.topLevelDirectories.length === 0
  );
}

export async function listTargetsTool(
  input: ListTargetsInput,
): Promise<TargetListEntry[]> {
  const directoryEntries = await readdir(input.targetsDir, { withFileTypes: true });
  const targets: TargetListEntry[] = [];

  for (const entry of directoryEntries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      NOISY_DIRECTORY_NAMES.has(entry.name)
    ) {
      continue;
    }

    const targetPath = path.join(input.targetsDir, entry.name);
    const discovery = await discoverTarget(targetPath);

    if (!looksLikeTarget(discovery)) {
      continue;
    }

    const targetProfile = await loadTargetProfile(targetPath);
    targets.push({
      name: entry.name,
      path: targetPath,
      language: discovery.language,
      framework: discovery.framework,
      discoverySummary: formatDiscoverySummary(discovery),
      hasProfile: targetProfile !== null,
      profileSummary: targetProfile?.description ?? null,
    });
  }

  return targets.sort((left, right) => left.name.localeCompare(right.name));
}

function formatListTargetsOutput(targets: TargetListEntry[]): string {
  if (targets.length === 0) {
    return "No targets found in the selected directory.";
  }

  return targets.map((target, index) =>
    `${String(index + 1)}. ${target.name} (${target.discoverySummary})${target.hasProfile ? " [enriched]" : ""}`
  ).join("\n");
}

export const listTargetsDefinition: ToolDefinition<{ targets_dir: string }> = {
  name: "list_targets",
  description:
    "Scan a directory for existing project targets and return discovery metadata for each one.",
  inputSchema: listTargetsInputSchema,
  async execute(input) {
    try {
      const targets = await listTargetsTool({
        targetsDir: input.targets_dir,
      });
      return createToolSuccessResult(formatListTargetsOutput(targets), targets);
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(listTargetsDefinition);
