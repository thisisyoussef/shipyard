import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { DiscoveryReport } from "../../artifacts/types.js";
import { discoverTarget } from "../../context/discovery.js";
import { ensureShipyardDirectories } from "../../engine/state.js";
import { ToolError } from "../read-file.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";
import {
  getScaffoldFiles,
  SCAFFOLD_TYPES,
  type ScaffoldType,
} from "./scaffolds.js";

const execFileAsync = promisify(execFile);

export interface CreateTargetInput {
  name: string;
  description: string;
  targetsDir: string;
  scaffoldType?: ScaffoldType;
}

export interface CreateTargetResult {
  path: string;
  discovery: DiscoveryReport;
}

const createTargetInputSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name for the new target directory.",
    },
    description: {
      type: "string",
      description: "Short human description of the project being created.",
    },
    targets_dir: {
      type: "string",
      description: "Absolute path to the directory where the target should be created.",
    },
    scaffold_type: {
      type: "string",
      description: "Minimal scaffold type to generate for the new target.",
      enum: SCAFFOLD_TYPES,
    },
  },
  required: ["name", "description", "targets_dir"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function normalizeTargetName(name: string): string {
  return name.trim().replace(/\s+/gu, "-");
}

async function ensureCreatableTargetDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
  const entries = await readdir(targetPath);

  if (entries.length > 0) {
    throw new ToolError(`Target already exists and is not empty: ${targetPath}`);
  }
}

async function initializeGitRepository(targetPath: string): Promise<void> {
  try {
    await execFileAsync("git", ["init"], { cwd: targetPath });
  } catch {
    // A target without git is still usable. The runtime can initialize later.
  }
}

export async function createTargetTool(
  input: CreateTargetInput,
): Promise<CreateTargetResult> {
  const targetName = normalizeTargetName(input.name);
  const scaffoldType = input.scaffoldType ?? "empty";
  const targetPath = path.join(input.targetsDir, targetName);

  await mkdir(input.targetsDir, { recursive: true });
  await ensureCreatableTargetDirectory(targetPath);

  const scaffoldFiles = getScaffoldFiles(scaffoldType, targetName, input.description);

  for (const scaffoldFile of scaffoldFiles) {
    const absolutePath = path.join(targetPath, scaffoldFile.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, scaffoldFile.content, "utf8");
  }

  await initializeGitRepository(targetPath);
  await ensureShipyardDirectories(targetPath);

  const discovery = await discoverTarget(targetPath);

  return {
    path: targetPath,
    discovery,
  };
}

function formatCreateTargetOutput(
  result: CreateTargetResult,
  scaffoldType: ScaffoldType,
): string {
  return [
    `Created target at ${result.path}`,
    `Scaffold: ${scaffoldType}`,
    `Language: ${result.discovery.language ?? "unknown"}`,
    `Framework: ${result.discovery.framework ?? "unknown"}`,
  ].join("\n");
}

export const createTargetDefinition: ToolDefinition<{
  name: string;
  description: string;
  targets_dir: string;
  scaffold_type?: ScaffoldType;
}> = {
  name: "create_target",
  description:
    "Create a new target directory with minimal scaffold files, README.md, AGENTS.md, and git initialization.",
  inputSchema: createTargetInputSchema,
  async execute(input) {
    try {
      const scaffoldType = input.scaffold_type ?? "empty";
      const result = await createTargetTool({
        name: input.name,
        description: input.description,
        targetsDir: input.targets_dir,
        scaffoldType,
      });

      return createToolSuccessResult(
        formatCreateTargetOutput(result, scaffoldType),
        result,
      );
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(createTargetDefinition);
