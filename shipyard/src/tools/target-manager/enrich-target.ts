import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport, TargetProfile } from "../../artifacts/types.js";
import {
  DEFAULT_ANTHROPIC_MODEL,
  createAnthropicClient,
  createAnthropicMessage,
  createUserTextMessage,
  extractAssistantText,
} from "../../engine/anthropic.js";
import { discoverTarget } from "../../context/discovery.js";
import { ToolError } from "../read-file.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "../registry.js";
import { saveTargetProfile } from "./profile-io.js";

const MAX_FILES_TO_READ = 20;
const MAX_LINES_PER_FILE = 500;
const PRIORITY_FILES = [
  "README.md",
  "readme.md",
  "AGENTS.md",
  "package.json",
  "pyproject.toml",
  "go.mod",
  "tsconfig.json",
  "vite.config.ts",
  "next.config.ts",
  "next.config.js",
];

export interface EnrichmentContext {
  discovery: DiscoveryReport;
  fileContents: Array<{
    path: string;
    content: string;
  }>;
  userDescription?: string;
}

export interface EnrichTargetInput {
  targetPath: string;
  userDescription?: string;
}

export interface EnrichmentProgressEvent {
  status: "started" | "in-progress" | "complete" | "error";
  message: string;
}

export interface EnrichmentInvocationResult {
  text: string;
  model: string;
}

export interface EnrichTargetOptions {
  invokeModel?: (
    prompt: string,
  ) => Promise<EnrichmentInvocationResult>;
  onProgress?: (event: EnrichmentProgressEvent) => Promise<void> | void;
  shouldCancel?: () => boolean;
}

const enrichTargetInputSchema = {
  type: "object",
  properties: {
    target_path: {
      type: "string",
      description: "Absolute path to the target directory to enrich.",
    },
    user_description: {
      type: "string",
      description:
        "Optional human description of the target. Useful for greenfield projects with little source context.",
    },
  },
  required: ["target_path"],
  additionalProperties: false,
} satisfies ToolInputSchema;

let configuredInvokeModel: EnrichTargetOptions["invokeModel"] | null = null;

export function configureTargetManagerEnrichmentInvoker(
  invokeModel: EnrichTargetOptions["invokeModel"] | null,
): void {
  configuredInvokeModel = invokeModel;
}

function truncateFileContents(contents: string): string {
  const lines = contents.split("\n");

  if (lines.length <= MAX_LINES_PER_FILE) {
    return contents;
  }

  return `${lines.slice(0, MAX_LINES_PER_FILE).join("\n")}\n... (truncated)`;
}

async function tryReadCandidateFile(
  targetPath: string,
  relativePath: string,
): Promise<{ path: string; content: string } | null> {
  try {
    const contents = await readFile(path.join(targetPath, relativePath), "utf8");
    return {
      path: relativePath,
      content: truncateFileContents(contents),
    };
  } catch {
    return null;
  }
}

async function collectSourceFiles(
  targetPath: string,
  currentFiles: Array<{ path: string; content: string }>,
): Promise<Array<{ path: string; content: string }>> {
  const collected = [...currentFiles];
  const seenPaths = new Set(collected.map((file) => file.path));
  const candidateDirectories = ["src", "app", "lib"];

  for (const directoryName of candidateDirectories) {
    if (collected.length >= MAX_FILES_TO_READ) {
      break;
    }

    try {
      const entries = await readdir(path.join(targetPath, directoryName), {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (
          collected.length >= MAX_FILES_TO_READ ||
          !entry.isFile() ||
          !/\.(ts|tsx|js|jsx|py|go|rs|md)$/u.test(entry.name)
        ) {
          continue;
        }

        const relativePath = `${directoryName}/${entry.name}`;

        if (seenPaths.has(relativePath)) {
          continue;
        }

        const nextFile = await tryReadCandidateFile(targetPath, relativePath);

        if (!nextFile) {
          continue;
        }

        seenPaths.add(relativePath);
        collected.push(nextFile);
      }
    } catch {
      continue;
    }
  }

  return collected;
}

export async function buildEnrichmentContext(
  targetPath: string,
  userDescription?: string,
): Promise<EnrichmentContext> {
  const discovery = await discoverTarget(targetPath);
  const fileContents: Array<{ path: string; content: string }> = [];

  for (const priorityFile of PRIORITY_FILES) {
    if (fileContents.length >= MAX_FILES_TO_READ) {
      break;
    }

    const nextFile = await tryReadCandidateFile(targetPath, priorityFile);

    if (nextFile) {
      fileContents.push(nextFile);
    }
  }

  const filesWithSources = await collectSourceFiles(targetPath, fileContents);

  if (filesWithSources.length === 0 && !userDescription?.trim()) {
    throw new ToolError(
      "Greenfield enrichment needs a user description when the target has no readable files yet.",
    );
  }

  return {
    discovery,
    fileContents: filesWithSources.slice(0, MAX_FILES_TO_READ),
    userDescription: userDescription?.trim() || undefined,
  };
}

export function buildEnrichmentPrompt(context: EnrichmentContext): string {
  const discovery = context.discovery;
  const fileSections = context.fileContents
    .map((file) => `--- ${file.path} ---\n${file.content}`)
    .join("\n\n");
  const userDescriptionSection = context.userDescription
    ? `User description: ${context.userDescription}\n`
    : "";

  return `Analyze this project and return only a JSON object matching the TargetProfile schema.

Discovery facts:
- Project name: ${discovery.projectName ?? "unknown"}
- Language: ${discovery.language ?? "unknown"}
- Framework: ${discovery.framework ?? "unknown"}
- Package manager: ${discovery.packageManager ?? "unknown"}
- Greenfield: ${String(discovery.isGreenfield)}
${userDescriptionSection}
Files:
${fileSections || "(no readable files)"}

Return JSON with these exact keys:
{
  "name": "string",
  "description": "string",
  "purpose": "string",
  "stack": ["string"],
  "architecture": "string",
  "keyPatterns": ["string"],
  "complexity": "trivial | small | medium | large",
  "suggestedAgentsRules": "string",
  "suggestedScripts": { "script": "command" },
  "taskSuggestions": ["string"]
}`;
}

export function parseEnrichmentResponse(
  responseText: string,
  discovery: DiscoveryReport,
  model: string,
): TargetProfile {
  const cleanedResponse = responseText
    .replace(/^```json\s*/u, "")
    .replace(/^```\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
  const parsed = JSON.parse(cleanedResponse) as Omit<
    TargetProfile,
    "enrichedAt" | "enrichmentModel" | "discoverySnapshot"
  >;

  if (
    typeof parsed.name !== "string" ||
    typeof parsed.description !== "string" ||
    typeof parsed.purpose !== "string" ||
    !Array.isArray(parsed.stack) ||
    typeof parsed.architecture !== "string" ||
    !Array.isArray(parsed.keyPatterns) ||
    !["trivial", "small", "medium", "large"].includes(parsed.complexity) ||
    typeof parsed.suggestedAgentsRules !== "string" ||
    typeof parsed.suggestedScripts !== "object" ||
    parsed.suggestedScripts === null ||
    !Array.isArray(parsed.taskSuggestions)
  ) {
    throw new ToolError("Model returned malformed TargetProfile JSON.");
  }

  return {
    ...parsed,
    enrichedAt: new Date().toISOString(),
    enrichmentModel: model,
    discoverySnapshot: discovery,
  };
}

async function defaultInvokeModel(
  prompt: string,
): Promise<EnrichmentInvocationResult> {
  const client = createAnthropicClient();
  const response = await createAnthropicMessage(client, {
    systemPrompt:
      "You analyze software projects. Return only valid JSON that matches the requested schema.",
    messages: [createUserTextMessage(prompt)],
    model: DEFAULT_ANTHROPIC_MODEL,
    temperature: 0,
  });

  return {
    text: extractAssistantText(response),
    model: response.model,
  };
}

export async function enrichTargetTool(
  input: EnrichTargetInput,
  options: EnrichTargetOptions = {},
): Promise<TargetProfile> {
  const onProgress = options.onProgress;
  const shouldCancel = options.shouldCancel;
  const invokeModel =
    options.invokeModel ??
    configuredInvokeModel ??
    defaultInvokeModel;

  await onProgress?.({
    status: "started",
    message: "Collecting target context.",
  });

  try {
    const context = await buildEnrichmentContext(
      input.targetPath,
      input.userDescription,
    );
    await onProgress?.({
      status: "in-progress",
      message: "Analyzing project structure.",
    });

    const response = await invokeModel(buildEnrichmentPrompt(context));
    const profile = parseEnrichmentResponse(
      response.text,
      context.discovery,
      response.model,
    );

    if (shouldCancel?.()) {
      return profile;
    }

    await saveTargetProfile(input.targetPath, profile);
    await onProgress?.({
      status: "complete",
      message: "Target profile saved.",
    });
    return profile;
  } catch (error) {
    await onProgress?.({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function formatEnrichTargetOutput(profile: TargetProfile): string {
  return [
    `Enriched target: ${profile.name}`,
    `Description: ${profile.description}`,
    `Complexity: ${profile.complexity}`,
    `Stack: ${profile.stack.join(", ") || "unknown"}`,
  ].join("\n");
}

export const enrichTargetDefinition: ToolDefinition<{
  target_path: string;
  user_description?: string;
}> = {
  name: "enrich_target",
  description:
    "Analyze a target and generate an AI-authored profile with stack, architecture, rules, and suggested next tasks.",
  inputSchema: enrichTargetInputSchema,
  async execute(input) {
    try {
      const profile = await enrichTargetTool({
        targetPath: input.target_path,
        userDescription: input.user_description,
      });
      return createToolSuccessResult(formatEnrichTargetOutput(profile), profile);
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(enrichTargetDefinition);
