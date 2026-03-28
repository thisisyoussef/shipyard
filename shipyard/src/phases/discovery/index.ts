import { PLANNER_MODEL_ROUTE } from "../../engine/model-routing.js";
import type { PipelinePhaseDefinition } from "../../pipeline/contracts.js";

export function createDiscoveryPipelinePhase(): PipelinePhaseDefinition {
  return {
    id: "discovery",
    title: "Discovery Brief",
    description:
      "Summarize the initial idea into a product-facing discovery brief with users, goals, scenarios, constraints, and open questions.",
    systemPrompt:
      "You are Shipyard's discovery phase. Return only the final markdown artifact and do not wrap it in code fences.",
    instructions:
      "Produce a discovery brief with sections for Vision, Target Users, Core Scenarios, Constraints, Success Metrics, and Open Questions.",
    modelRoute: PLANNER_MODEL_ROUTE,
    agentProfileId: "discovery",
    defaultSkills: ["artifact-writing"],
    approvalGate: "required",
    consumesArtifacts: ["pipeline-brief"],
    producesArtifacts: ["discovery-brief"],
    output: {
      type: "discovery-brief",
      contentKind: "markdown",
    },
  };
}

export function createResearchPipelinePhase(): PipelinePhaseDefinition {
  return {
    id: "research",
    title: "Research Brief",
    description:
      "Collect a bounded, read-only research brief that prefers official docs and falls back clearly to repo-local context when external lookup is unavailable.",
    systemPrompt:
      "You are Shipyard's research phase. Return only the final JSON artifact and do not wrap it in code fences.",
    instructions:
      "Create a compact research brief with attributed sources, ranked by authority, plus distilled planning takeaways.",
    modelRoute: PLANNER_MODEL_ROUTE,
    agentProfileId: "discovery",
    defaultSkills: ["artifact-writing"],
    approvalGate: "disabled",
    consumesArtifacts: ["discovery-brief|pipeline-brief"],
    producesArtifacts: ["research-brief"],
    output: {
      type: "research-brief",
      contentKind: "json",
    },
  };
}
