import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport, TargetProfile } from "../../artifacts/types.js";
import { discoverTarget } from "../../context/discovery.js";
import { ensureShipyardDirectories } from "../../engine/state.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";
import { loadTargetProfile } from "./profile-io.js";

export interface SelectTargetInput {
  targetPath: string;
}

export interface SelectTargetResult {
  path: string;
  discovery: DiscoveryReport;
  profile: TargetProfile | null;
}

const selectTargetInputSchema = {
  type: "object",
  properties: {
    target_path: {
      type: "string",
      description: "Absolute path to the target directory to select.",
    },
  },
  required: ["target_path"],
  additionalProperties: false,
} satisfies ToolInputSchema;

export async function selectTargetTool(
  input: SelectTargetInput,
): Promise<SelectTargetResult> {
  const resolvedTargetPath = path.resolve(input.targetPath);
  await mkdir(resolvedTargetPath, { recursive: true });
  await ensureShipyardDirectories(resolvedTargetPath);

  const discovery = await discoverTarget(resolvedTargetPath);
  const profile = await loadTargetProfile(resolvedTargetPath);

  return {
    path: resolvedTargetPath,
    discovery,
    profile,
  };
}

function formatSelectTargetOutput(result: SelectTargetResult): string {
  return [
    `Selected target: ${result.path}`,
    `Language: ${result.discovery.language ?? "unknown"}`,
    `Framework: ${result.discovery.framework ?? "unknown"}`,
    result.profile
      ? `Profile: ${result.profile.description}`
      : "Profile: not enriched yet",
  ].join("\n");
}

export const selectTargetDefinition: ToolDefinition<{ target_path: string }> = {
  name: "select_target",
  description:
    "Validate a target directory, load its discovery report, and load any saved target profile.",
  inputSchema: selectTargetInputSchema,
  async execute(input) {
    try {
      const result = await selectTargetTool({
        targetPath: input.target_path,
      });
      return createToolSuccessResult(formatSelectTargetOutput(result), result);
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(selectTargetDefinition);
