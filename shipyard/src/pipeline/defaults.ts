import type { PhasePipelineDefinition } from "./contracts.js";
import {
  createDiscoveryPipelinePhase,
  createResearchPipelinePhase,
} from "../phases/discovery/index.js";
import {
  createBacklogPipelinePhase,
  createEpicsPipelinePhase,
  createTechnicalSpecPipelinePhase,
  createUserStoriesPipelinePhase,
} from "../phases/pm/index.js";

export const DEFAULT_PIPELINE_ID = "spec-driven-foundation";

export function createDefaultPipelineDefinition(): PhasePipelineDefinition {
  return {
    id: DEFAULT_PIPELINE_ID,
    title: "Spec-Driven Foundation",
    description:
      "A discovery -> research -> PM pipeline that produces durable artifacts before implementation begins.",
    phases: [
      createDiscoveryPipelinePhase(),
      createResearchPipelinePhase(),
      createEpicsPipelinePhase(),
      createUserStoriesPipelinePhase(),
      createTechnicalSpecPipelinePhase(),
      createBacklogPipelinePhase(),
    ],
  };
}
