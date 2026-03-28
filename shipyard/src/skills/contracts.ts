import { z } from "zod";

export const runtimeSkillManifestSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  description: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  compatiblePhases: z.array(z.string().trim().min(1)).default([]),
  promptFile: z.string().trim().min(1),
  tools: z.array(z.string().trim().min(1)).default([]),
  references: z.array(z.string().trim().min(1)).default([]),
  validators: z.array(z.string().trim().min(1)).default([]),
});

export type RuntimeSkillManifest = z.infer<typeof runtimeSkillManifestSchema>;

export type RuntimeSkillSourceKind = "builtin" | "target-local" | "custom";

export interface RuntimeSkillSummary {
  name: string;
  version: string;
  description: string;
  tags: string[];
  compatiblePhases: string[];
  promptPath: string;
  sourceDirectory: string;
  sourceKind: RuntimeSkillSourceKind;
  toolPaths: string[];
  referencePaths: string[];
  missingReferencePaths: string[];
  validatorPaths: string[];
}

export interface LoadedRuntimeSkill extends RuntimeSkillSummary {
  promptFragment: string;
  toolNames: string[];
}

export interface RuntimeSkillDiscoveryResult {
  skills: RuntimeSkillSummary[];
  errors: string[];
}

export interface RuntimeAssistSummary {
  activeProfileId: string | null;
  activeProfileName: string | null;
  activeProfileRoute: string | null;
  loadedSkills: string[];
}
