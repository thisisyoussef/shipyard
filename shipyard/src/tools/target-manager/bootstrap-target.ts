import path from "node:path";

import type { DiscoveryReport } from "../../artifacts/types.js";
import { discoverTarget } from "../../context/discovery.js";
import { ensureShipyardDirectories } from "../../engine/state.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";
import {
  deriveTargetNameFromPath,
  materializeScaffold,
  normalizeTargetName,
} from "./scaffold-materializer.js";
import {
  SCAFFOLD_TYPES,
  type ScaffoldType,
} from "./scaffolds.js";

const DEFAULT_BOOTSTRAP_SCAFFOLD_TYPE: ScaffoldType = "ts-pnpm-workspace";

export interface BootstrapTargetInput {
  targetDirectory: string;
  description: string;
  name?: string;
  scaffoldType?: ScaffoldType;
}

export interface BootstrapTargetResult {
  path: string;
  scaffoldType: ScaffoldType;
  createdFiles: string[];
  discovery: DiscoveryReport;
}

const bootstrapTargetInputSchema = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description:
        "Short project description used to fill the generated README and AGENTS.md files.",
    },
    name: {
      type: "string",
      description:
        "Optional project name override. Defaults to the current target directory name.",
    },
    scaffold_type: {
      type: "string",
      description:
        "Shared scaffold preset to materialize for the current empty target.",
      enum: [...SCAFFOLD_TYPES],
    },
  },
  required: ["description"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function formatBootstrapTargetOutput(result: BootstrapTargetResult): string {
  return [
    `Bootstrapped target at ${result.path}`,
    `Scaffold: ${result.scaffoldType}`,
    `Files: ${String(result.createdFiles.length)}`,
    `Language: ${result.discovery.language ?? "unknown"}`,
    `Framework: ${result.discovery.framework ?? "unknown"}`,
  ].join("\n");
}

export async function bootstrapTargetTool(
  input: BootstrapTargetInput,
): Promise<BootstrapTargetResult> {
  const scaffoldType = input.scaffoldType ?? DEFAULT_BOOTSTRAP_SCAFFOLD_TYPE;
  const targetPath = path.resolve(input.targetDirectory);
  const targetName = input.name?.trim()
    ? normalizeTargetName(input.name)
    : deriveTargetNameFromPath(targetPath);
  const { createdFiles } = await materializeScaffold({
    targetPath,
    name: targetName,
    description: input.description,
    scaffoldType,
    allowedExistingEntries: [".shipyard", ".git", "AGENTS.md", "README.md"],
  });

  await ensureShipyardDirectories(targetPath);
  const discovery = await discoverTarget(targetPath);

  return {
    path: targetPath,
    scaffoldType,
    createdFiles,
    discovery,
  };
}

export const bootstrapTargetDefinition: ToolDefinition<{
  description: string;
  name?: string;
  scaffold_type?: ScaffoldType;
}> = {
  name: "bootstrap_target",
  description:
    "Initialize the current empty target with a shared scaffold preset. Rejects non-empty targets except for Shipyard or git metadata.",
  inputSchema: bootstrapTargetInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await bootstrapTargetTool({
        targetDirectory,
        description: input.description,
        name: input.name,
        scaffoldType: input.scaffold_type,
      });

      return createToolSuccessResult(
        formatBootstrapTargetOutput(result),
        result,
      );
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(bootstrapTargetDefinition);
