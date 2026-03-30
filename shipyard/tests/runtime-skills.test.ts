import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createRuntimeSkillRegistry,
  resolveRuntimeLoadout,
} from "../src/skills/registry.js";
import { getTool } from "../src/tools/registry.js";
import { createCodePhase } from "../src/phases/code/index.js";
import { createTargetManagerPhase } from "../src/phases/target-manager/index.js";
import {
  getAgentProfile,
  resolveAgentProfileId,
} from "../src/agents/profiles.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function writeRuntimeSkill(
  parentDirectory: string,
  options: {
    directoryName: string;
    manifestName?: string;
    description?: string;
    compatiblePhases?: string[];
    tags?: string[];
    prompt?: string;
    tools?: Array<{
      relativePath: string;
      contents: string;
    }>;
    validators?: Array<{
      relativePath: string;
      contents: string;
    }>;
    references?: Array<{
      relativePath: string;
      contents: string;
    }>;
  },
): Promise<string> {
  const skillDirectory = path.join(parentDirectory, options.directoryName);
  await mkdir(skillDirectory, { recursive: true });

  const references = options.references ?? [];
  const tools = options.tools ?? [];
  const validators = options.validators ?? [];

  await writeFile(
    path.join(skillDirectory, "manifest.json"),
    JSON.stringify(
      {
        name: options.manifestName ?? options.directoryName,
        version: "1.0.0",
        description:
          options.description ?? `Runtime skill ${options.directoryName}.`,
        tags: options.tags ?? ["test"],
        compatiblePhases: options.compatiblePhases ?? ["code"],
        promptFile: "SKILL.md",
        references: references.map((entry) => entry.relativePath),
        tools: tools.map((entry) => entry.relativePath),
        validators: validators.map((entry) => entry.relativePath),
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(skillDirectory, "SKILL.md"),
    options.prompt ?? `Prompt for ${options.directoryName}.`,
    "utf8",
  );

  for (const reference of references) {
    const referencePath = path.join(skillDirectory, reference.relativePath);
    await mkdir(path.dirname(referencePath), { recursive: true });
    await writeFile(referencePath, reference.contents, "utf8");
  }

  for (const tool of tools) {
    const toolPath = path.join(skillDirectory, tool.relativePath);
    await mkdir(path.dirname(toolPath), { recursive: true });
    await writeFile(toolPath, tool.contents, "utf8");
  }

  for (const validator of validators) {
    const validatorPath = path.join(skillDirectory, validator.relativePath);
    await mkdir(path.dirname(validatorPath), { recursive: true });
    await writeFile(validatorPath, validator.contents, "utf8");
  }

  return skillDirectory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("runtime skills", () => {
  it("discovers runtime skills from configured directories", async () => {
    const skillRoot = await createTempDirectory("shipyard-runtime-skills-discover-");
    await writeRuntimeSkill(skillRoot, {
      directoryName: "artifact-writing",
      compatiblePhases: ["discovery", "feature-spec"],
      prompt: "Write clean runtime artifacts with crisp headings.",
      references: [
        {
          relativePath: "references/checklist.md",
          contents: "- Keep assumptions explicit.\n",
        },
      ],
    });

    const registry = createRuntimeSkillRegistry({
      builtinSkillDirectory: null,
      staticSkillDirectories: [skillRoot],
    });
    const discovery = await registry.discoverSkills();

    expect(discovery.errors).toEqual([]);
    expect(discovery.skills).toHaveLength(1);
    expect(discovery.skills[0]).toMatchObject({
      name: "artifact-writing",
      compatiblePhases: ["discovery", "feature-spec"],
      sourceKind: "custom",
    });
    expect(discovery.skills[0]?.referencePaths[0]).toContain(
      "references/checklist.md",
    );
  });

  it("rejects invalid manifests and duplicate skill names", async () => {
    const skillRootOne = await createTempDirectory("shipyard-runtime-skills-duplicate-a-");
    const skillRootTwo = await createTempDirectory("shipyard-runtime-skills-duplicate-b-");
    const invalidRoot = await createTempDirectory("shipyard-runtime-skills-invalid-");

    await writeRuntimeSkill(skillRootOne, {
      directoryName: "duplicate-one",
      manifestName: "shared-skill",
      prompt: "First copy.",
    });
    await writeRuntimeSkill(skillRootTwo, {
      directoryName: "duplicate-two",
      manifestName: "shared-skill",
      prompt: "Second copy.",
    });
    await writeRuntimeSkill(invalidRoot, {
      directoryName: "bad-validator",
      validators: [
        {
          relativePath: "validators/bad-validator.mjs",
          contents: "export const nope = 1;\n",
        },
      ],
    });

    const registry = createRuntimeSkillRegistry({
      builtinSkillDirectory: null,
      staticSkillDirectories: [skillRootOne, skillRootTwo, invalidRoot],
    });
    const discovery = await registry.discoverSkills();

    expect(discovery.skills).toEqual([]);
    expect(discovery.errors).toHaveLength(2);
    expect(discovery.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/duplicate runtime skill name "shared-skill"/i),
        expect.stringMatching(/bad-validator/i),
      ]),
    );
    expect(discovery.errors.join("\n")).toMatch(/validator/i);
  });

  it("loads and unloads skills without corrupting phase state", async () => {
    const skillRoot = await createTempDirectory("shipyard-runtime-skills-load-");
    await writeRuntimeSkill(skillRoot, {
      directoryName: "tool-bearing-skill",
      prompt: "Use the skill-owned tool only when the phase requests it.",
      tools: [
        {
          relativePath: "tools/runtime-skill-echo.mjs",
          contents: [
            "export default {",
            '  name: "runtime_skill_echo",',
            '  description: "Echoes a short runtime string.",',
            "  inputSchema: {",
            '    type: "object",',
            '    properties: { text: { type: "string" } },',
            '    required: ["text"],',
            "    additionalProperties: false,",
            "  },",
            "  async execute(input) {",
            "    return { success: true, output: String(input.text ?? \"\") };",
            "  },",
            "};",
            "",
          ].join("\n"),
        },
      ],
      validators: [
        {
          relativePath: "validators/validate-artifact.mjs",
          contents: "export default async function validateArtifact() { return { valid: true }; }\n",
        },
      ],
    });

    const registry = createRuntimeSkillRegistry({
      builtinSkillDirectory: null,
      staticSkillDirectories: [skillRoot],
    });

    const loaded = await registry.loadSkill("tool-bearing-skill", {
      phaseName: "code",
    });

    expect(loaded.toolNames).toEqual(["runtime_skill_echo"]);
    expect(getTool("runtime_skill_echo")).toBeDefined();
    expect(registry.getLoadedSkills().map((skill) => skill.name)).toEqual([
      "tool-bearing-skill",
    ]);

    const removed = registry.unloadSkill("tool-bearing-skill");

    expect(removed).toBe(true);
    expect(getTool("runtime_skill_echo")).toBeUndefined();
    expect(registry.getLoadedSkills()).toEqual([]);
  });

  it("builds one ordered prompt block from loaded skills", async () => {
    const skillRoot = await createTempDirectory("shipyard-runtime-skills-prompt-");
    await writeRuntimeSkill(skillRoot, {
      directoryName: "alpha-skill",
      prompt: "Alpha guidance.",
    });
    await writeRuntimeSkill(skillRoot, {
      directoryName: "beta-skill",
      prompt: "Beta guidance.",
    });

    const registry = createRuntimeSkillRegistry({
      builtinSkillDirectory: null,
      staticSkillDirectories: [skillRoot],
    });

    await registry.loadSkill("alpha-skill", { phaseName: "code" });
    await registry.loadSkill("beta-skill", { phaseName: "code" });

    const promptBlock = registry.buildPromptBlock();

    expect(promptBlock).toContain("alpha-skill");
    expect(promptBlock).toContain("Alpha guidance.");
    expect(promptBlock).toContain("beta-skill");
    expect(promptBlock).toContain("Beta guidance.");
    expect(promptBlock.indexOf("alpha-skill")).toBeLessThan(
      promptBlock.indexOf("beta-skill"),
    );
  });
});

describe("agent profiles and phase loadouts", () => {
  it("resolves phase default skills and the active role profile", async () => {
    const registry = createRuntimeSkillRegistry();
    const loadout = await resolveRuntimeLoadout({
      registry,
      targetDirectory: await createTempDirectory("shipyard-runtime-loadout-"),
      phaseId: createCodePhase().name,
      phaseLabel: createCodePhase().description,
      modelRoute: createCodePhase().modelRoute,
      tools: createCodePhase().tools,
      agentProfileId: createCodePhase().agentProfileId,
      defaultSkills: createCodePhase().defaultSkills,
    });

    expect(loadout.activeProfile).toMatchObject({
      id: "implementer",
      modelRoute: createCodePhase().modelRoute,
    });
    expect(loadout.loadedSkills.map((skill) => skill.name)).toEqual(
      createCodePhase().defaultSkills,
    );
    expect(loadout.toolNames).toEqual(createCodePhase().tools);
  });

  it("keeps provider routing declarative and profile-aware", () => {
    expect(resolveAgentProfileId(createCodePhase())).toBe("implementer");
    expect(resolveAgentProfileId(createTargetManagerPhase())).toBe(
      "target-manager",
    );
    expect(getAgentProfile("pm")).toMatchObject({
      id: "pm",
      modelRoute: "subagent:planner",
    });
    expect(getAgentProfile("reviewer")).toMatchObject({
      id: "reviewer",
      modelRoute: "subagent:verifier",
    });
  });
});
