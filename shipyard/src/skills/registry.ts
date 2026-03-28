import {
  access,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  formatAgentProfilePromptBlock,
  requireAgentProfile,
  type AgentProfile,
  type AgentRoleId,
} from "../agents/profiles.js";
import type { ModelRouteId } from "../engine/model-routing.js";
import {
  registerTool,
  unregisterToolsByOwner,
  validateToolDefinition,
  type ToolDefinition,
} from "../tools/registry.js";
import {
  runtimeSkillManifestSchema,
  type LoadedRuntimeSkill,
  type RuntimeAssistSummary,
  type RuntimeSkillDiscoveryResult,
  type RuntimeSkillManifest,
  type RuntimeSkillSourceKind,
  type RuntimeSkillSummary,
} from "./contracts.js";

const SKILL_MANIFEST_FILENAME = "manifest.json";
const BUILTIN_SKILLS_DIRECTORY_NAME = "skills";
const TARGET_LOCAL_SKILLS_SEGMENTS = [".shipyard", "skills"] as const;

interface RuntimeSkillRegistryOptions {
  builtinSkillDirectory?: string | null;
  staticSkillDirectories?: string[];
}

interface ResolveRuntimeLoadoutOptions {
  registry: RuntimeSkillRegistry;
  targetDirectory: string;
  phaseId: string;
  phaseLabel: string;
  tools?: string[];
  modelRoute?: ModelRouteId;
  agentProfileId?: AgentRoleId | null;
  defaultSkills?: string[];
}

export interface RuntimeLoadout {
  activeProfile: AgentProfile | null;
  loadedSkills: LoadedRuntimeSkill[];
  toolNames: string[];
  skillPromptBlock: string;
  modelRoute: ModelRouteId | null;
  temperature?: number;
  maxTokens?: number;
  runtimeAssist: RuntimeAssistSummary;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveShipyardAppRoot(): Promise<string> {
  let currentDirectory = path.dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 6; index += 1) {
    if (await pathExists(path.join(currentDirectory, "package.json"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      break;
    }

    currentDirectory = parentDirectory;
  }

  throw new Error("Could not resolve the Shipyard app root for runtime skills.");
}

function createSkillOwnerId(skillName: string): string {
  return `runtime-skill:${skillName}`;
}

function formatSkillPhaseLabel(phaseId: string): string {
  return phaseId.trim() || "unknown-phase";
}

function normalizeSkillPath(skillDirectory: string, relativePath: string): string {
  return path.resolve(skillDirectory, relativePath);
}

function formatDiscoveryError(
  skillDirectory: string,
  message: string,
): string {
  return `${skillDirectory}: ${message}`;
}

function formatRuntimeSkillPromptBlock(skills: LoadedRuntimeSkill[]): string {
  if (skills.length === 0) {
    return "";
  }

  return [
    "Loaded Runtime Skills",
    ...skills.flatMap((skill, index) => {
      const separator = index > 0 ? ["---"] : [];
      return [
        ...separator,
        `Skill: ${skill.name}`,
        skill.promptFragment.trim(),
      ];
    }),
  ]
    .join("\n")
    .trim();
}

function formatSkillCompatibilityError(
  skill: RuntimeSkillSummary,
  phaseId: string,
): string {
  return (
    `Runtime skill "${skill.name}" is not compatible with phase "${phaseId}". ` +
    `Compatible phases: ${skill.compatiblePhases.join(", ")}.`
  );
}

function extractToolDefinitions(
  exportedValue: unknown,
): ToolDefinition[] {
  if (Array.isArray(exportedValue)) {
    return exportedValue as ToolDefinition[];
  }

  if (exportedValue && typeof exportedValue === "object") {
    return [exportedValue as ToolDefinition];
  }

  return [];
}

function resolveToolDefinitionsFromModule(
  moduleValue: Record<string, unknown>,
): ToolDefinition[] {
  const candidates = [
    moduleValue.default,
    moduleValue.tool,
    moduleValue.tools,
    moduleValue.toolDefinitions,
  ];

  const definitions = candidates.flatMap((candidate) =>
    extractToolDefinitions(candidate)
  );

  return definitions;
}

function resolveValidatorFromModule(
  moduleValue: Record<string, unknown>,
): Function | null {
  const candidate = moduleValue.default
    ?? moduleValue.validate
    ?? moduleValue.validator;

  return typeof candidate === "function" ? candidate : null;
}

async function loadToolDefinitionsFromModule(
  modulePath: string,
): Promise<ToolDefinition[]> {
  const moduleValue = await import(pathToFileURL(modulePath).href);
  const definitions = resolveToolDefinitionsFromModule(moduleValue);

  if (definitions.length === 0) {
    throw new Error(
      `Tool module "${modulePath}" must export one ToolDefinition or an array of ToolDefinitions via default, tool, tools, or toolDefinitions.`,
    );
  }

  for (const definition of definitions) {
    validateToolDefinition(definition);
  }

  return definitions;
}

async function validateValidatorModule(modulePath: string): Promise<void> {
  const moduleValue = await import(pathToFileURL(modulePath).href);
  const validator = resolveValidatorFromModule(moduleValue);

  if (!validator) {
    throw new Error(
      `Validator module "${modulePath}" must export a function via default, validate, or validator.`,
    );
  }
}

async function loadRuntimeSkillSummary(
  skillDirectory: string,
  sourceKind: RuntimeSkillSourceKind,
): Promise<RuntimeSkillSummary> {
  const manifestPath = path.join(skillDirectory, SKILL_MANIFEST_FILENAME);
  const manifestJson = await readFile(manifestPath, "utf8");
  const manifest = runtimeSkillManifestSchema.parse(
    JSON.parse(manifestJson),
  ) satisfies RuntimeSkillManifest;
  const promptPath = normalizeSkillPath(skillDirectory, manifest.promptFile);

  if (!(await pathExists(promptPath))) {
    throw new Error(
      `Prompt file "${manifest.promptFile}" is missing for runtime skill "${manifest.name}".`,
    );
  }

  const toolPaths = manifest.tools.map((relativePath) =>
    normalizeSkillPath(skillDirectory, relativePath)
  );
  const validatorPaths = manifest.validators.map((relativePath) =>
    normalizeSkillPath(skillDirectory, relativePath)
  );
  const referencePaths: string[] = [];
  const missingReferencePaths: string[] = [];

  for (const relativePath of manifest.references) {
    const absolutePath = normalizeSkillPath(skillDirectory, relativePath);

    if (await pathExists(absolutePath)) {
      referencePaths.push(absolutePath);
    } else {
      missingReferencePaths.push(absolutePath);
    }
  }

  for (const toolPath of toolPaths) {
    if (!(await pathExists(toolPath))) {
      throw new Error(`Tool module "${toolPath}" is missing.`);
    }

    await loadToolDefinitionsFromModule(toolPath);
  }

  for (const validatorPath of validatorPaths) {
    if (!(await pathExists(validatorPath))) {
      throw new Error(`Validator module "${validatorPath}" is missing.`);
    }

    await validateValidatorModule(validatorPath);
  }

  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    tags: [...manifest.tags],
    compatiblePhases: [...manifest.compatiblePhases],
    promptPath,
    sourceDirectory: skillDirectory,
    sourceKind,
    toolPaths,
    referencePaths,
    missingReferencePaths,
    validatorPaths,
  };
}

async function resolveConfiguredSkillDirectories(options: {
  builtinSkillDirectory?: string | null;
  staticSkillDirectories?: string[];
  targetDirectory?: string | null;
}): Promise<Array<{ directory: string; sourceKind: RuntimeSkillSourceKind }>> {
  const candidates: Array<{ directory: string; sourceKind: RuntimeSkillSourceKind }> = [];

  if (options.builtinSkillDirectory !== null) {
    const builtinRoot = options.builtinSkillDirectory
      ?? path.join(await resolveShipyardAppRoot(), BUILTIN_SKILLS_DIRECTORY_NAME);

    if (await pathExists(builtinRoot)) {
      candidates.push({
        directory: builtinRoot,
        sourceKind: "builtin",
      });
    }
  }

  for (const staticDirectory of options.staticSkillDirectories ?? []) {
    if (await pathExists(staticDirectory)) {
      candidates.push({
        directory: staticDirectory,
        sourceKind: "custom",
      });
    }
  }

  if (options.targetDirectory) {
    const targetSkillDirectory = path.join(
      options.targetDirectory,
      ...TARGET_LOCAL_SKILLS_SEGMENTS,
    );

    if (await pathExists(targetSkillDirectory)) {
      candidates.push({
        directory: targetSkillDirectory,
        sourceKind: "target-local",
      });
    }
  }

  const seenDirectories = new Set<string>();

  return candidates.filter((candidate) => {
    if (seenDirectories.has(candidate.directory)) {
      return false;
    }

    seenDirectories.add(candidate.directory);
    return true;
  });
}

export class RuntimeSkillRegistry {
  private readonly builtinSkillDirectory: string | null | undefined;
  private readonly staticSkillDirectories: string[];
  private readonly loadedByName = new Map<string, LoadedRuntimeSkill>();
  private loadedSkillOrder: string[] = [];

  constructor(options: RuntimeSkillRegistryOptions = {}) {
    this.builtinSkillDirectory = options.builtinSkillDirectory;
    this.staticSkillDirectories = [...(options.staticSkillDirectories ?? [])];
  }

  async discoverSkills(options: {
    targetDirectory?: string | null;
  } = {}): Promise<RuntimeSkillDiscoveryResult> {
    const configuredDirectories = await resolveConfiguredSkillDirectories({
      builtinSkillDirectory: this.builtinSkillDirectory,
      staticSkillDirectories: this.staticSkillDirectories,
      targetDirectory: options.targetDirectory,
    });
    const errors: string[] = [];
    const discovered: RuntimeSkillSummary[] = [];

    for (const configuredDirectory of configuredDirectories) {
      const entries = await readdir(configuredDirectory.directory, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillDirectory = path.join(configuredDirectory.directory, entry.name);
        const manifestPath = path.join(skillDirectory, SKILL_MANIFEST_FILENAME);

        if (!(await pathExists(manifestPath))) {
          continue;
        }

        try {
          discovered.push(
            await loadRuntimeSkillSummary(
              skillDirectory,
              configuredDirectory.sourceKind,
            ),
          );
        } catch (error) {
          errors.push(
            formatDiscoveryError(
              skillDirectory,
              error instanceof Error ? error.message : String(error),
            ),
          );
        }
      }
    }

    const duplicates = new Map<string, RuntimeSkillSummary[]>();

    for (const skill of discovered) {
      const bucket = duplicates.get(skill.name) ?? [];
      bucket.push(skill);
      duplicates.set(skill.name, bucket);
    }

    const filteredSkills = discovered.filter((skill) => {
      const bucket = duplicates.get(skill.name) ?? [];

      if (bucket.length <= 1) {
        return true;
      }

      if (bucket[0] === skill) {
        errors.push(
          `Duplicate runtime skill name "${skill.name}" discovered in: ${bucket
            .map((entry) => entry.sourceDirectory)
            .join(", ")}`,
        );
      }

      return false;
    });

    return {
      skills: filteredSkills.sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
      errors,
    };
  }

  async listAvailableSkills(options: {
    targetDirectory?: string | null;
  } = {}): Promise<RuntimeSkillSummary[]> {
    const discovery = await this.discoverSkills(options);
    return discovery.skills;
  }

  async loadSkill(
    skillName: string,
    options: {
      targetDirectory?: string | null;
      phaseName?: string | null;
    } = {},
  ): Promise<LoadedRuntimeSkill> {
    const existing = this.loadedByName.get(skillName);

    if (existing) {
      return existing;
    }

    const discovery = await this.discoverSkills({
      targetDirectory: options.targetDirectory,
    });
    const skill = discovery.skills.find((entry) => entry.name === skillName);

    if (!skill) {
      const discoveryErrors = discovery.errors.length > 0
        ? ` Discovery errors: ${discovery.errors.join(" | ")}`
        : "";
      throw new Error(`Unknown runtime skill "${skillName}".${discoveryErrors}`);
    }

    if (
      options.phaseName
      && skill.compatiblePhases.length > 0
      && !skill.compatiblePhases.includes(options.phaseName)
    ) {
      throw new Error(formatSkillCompatibilityError(skill, options.phaseName));
    }

    const promptFragment = await readFile(skill.promptPath, "utf8");
    const ownerId = createSkillOwnerId(skill.name);
    const toolNames: string[] = [];

    try {
      for (const toolPath of skill.toolPaths) {
        const definitions = await loadToolDefinitionsFromModule(toolPath);

        for (const definition of definitions) {
          registerTool(definition, { ownerId });
          toolNames.push(definition.name);
        }
      }
    } catch (error) {
      unregisterToolsByOwner(ownerId);
      throw error;
    }

    const loadedSkill: LoadedRuntimeSkill = {
      ...skill,
      promptFragment,
      toolNames,
    };

    this.loadedByName.set(skill.name, loadedSkill);
    this.loadedSkillOrder = [...this.loadedSkillOrder, skill.name];
    return loadedSkill;
  }

  unloadSkill(skillName: string): boolean {
    const loadedSkill = this.loadedByName.get(skillName);

    if (!loadedSkill) {
      return false;
    }

    unregisterToolsByOwner(createSkillOwnerId(skillName));
    this.loadedByName.delete(skillName);
    this.loadedSkillOrder = this.loadedSkillOrder.filter((entry) =>
      entry !== skillName
    );
    return true;
  }

  getLoadedSkills(): LoadedRuntimeSkill[] {
    return this.loadedSkillOrder
      .map((skillName) => this.loadedByName.get(skillName))
      .filter((skill): skill is LoadedRuntimeSkill => skill !== undefined);
  }

  buildPromptBlock(skillNames?: string[]): string {
    const selectedSkillNames = skillNames ?? this.loadedSkillOrder;
    const skills = selectedSkillNames
      .map((skillName) => this.loadedByName.get(skillName))
      .filter((skill): skill is LoadedRuntimeSkill => skill !== undefined);

    return formatRuntimeSkillPromptBlock(skills);
  }
}

export function createRuntimeSkillRegistry(
  options: RuntimeSkillRegistryOptions = {},
): RuntimeSkillRegistry {
  return new RuntimeSkillRegistry(options);
}

export async function resolveRuntimeLoadout(
  options: ResolveRuntimeLoadoutOptions,
): Promise<RuntimeLoadout> {
  const activeProfile = options.agentProfileId
    ? requireAgentProfile(options.agentProfileId)
    : null;
  const loadedSkills: LoadedRuntimeSkill[] = [];

  for (const skillName of options.defaultSkills ?? []) {
    loadedSkills.push(
      await options.registry.loadSkill(skillName, {
        targetDirectory: options.targetDirectory,
        phaseName: formatSkillPhaseLabel(options.phaseId),
      }),
    );
  }

  const modelRoute = options.modelRoute ?? activeProfile?.modelRoute ?? null;
  const toolNames = uniqueStrings([
    ...(options.tools ?? []),
    ...loadedSkills.flatMap((skill) => skill.toolNames),
  ]);
  const runtimeAssist: RuntimeAssistSummary = {
    activeProfileId: activeProfile?.id ?? null,
    activeProfileName: activeProfile?.name ?? null,
    activeProfileRoute: modelRoute,
    loadedSkills: loadedSkills.map((skill) => skill.name),
  };

  return {
    activeProfile,
    loadedSkills,
    toolNames,
    skillPromptBlock: options.registry.buildPromptBlock(
      loadedSkills.map((skill) => skill.name),
    ),
    modelRoute,
    temperature: activeProfile?.temperature,
    maxTokens: activeProfile?.maxTokens,
    runtimeAssist,
  };
}

export function composeRuntimeLoadoutPrompt(options: {
  activeProfile: AgentProfile | null;
  skillPromptBlock: string;
}): string {
  const sections = [
    formatAgentProfilePromptBlock(options.activeProfile).trim(),
    options.skillPromptBlock.trim(),
  ]
    .filter((section) => section.length > 0);

  return sections.join("\n\n").trim();
}
