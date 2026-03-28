import { PLANNER_MODEL_ROUTE } from "../engine/model-routing.js";
import type { PhasePipelineDefinition } from "./contracts.js";

export const DEFAULT_PIPELINE_ID = "spec-driven-foundation";

export function createDefaultPipelineDefinition(): PhasePipelineDefinition {
  return {
    id: DEFAULT_PIPELINE_ID,
    title: "Spec-Driven Foundation",
    description:
      "A lightweight discovery -> feature spec -> technical plan pipeline that pauses for approval at the high-leverage checkpoints.",
    phases: [
      {
        id: "discovery",
        title: "Discovery Brief",
        description:
          "Summarize the initial idea into a product-facing discovery brief with users, goals, scenarios, constraints, and open questions.",
        systemPrompt:
          "You are Shipyard's discovery phase. Return only the final markdown artifact and do not wrap it in code fences.",
        instructions:
          "Produce a discovery brief with sections for Vision, Target Users, Core Scenarios, Constraints, Success Metrics, and Open Questions.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["discovery-brief"],
        output: {
          type: "discovery-brief",
          contentKind: "markdown",
        },
      },
      {
        id: "feature-spec",
        title: "Feature Spec",
        description:
          "Turn the approved discovery brief into a structured feature specification with problem framing and acceptance criteria.",
        systemPrompt:
          "You are Shipyard's feature-spec phase. Return only the final markdown artifact and do not wrap it in code fences.",
        instructions:
          "Produce a feature spec with metadata, problem statement, objectives, user stories, acceptance criteria, edge cases, and done definition.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["discovery-brief"],
        producesArtifacts: ["feature-spec"],
        output: {
          type: "feature-spec",
          contentKind: "markdown",
        },
      },
      {
        id: "technical-plan",
        title: "Technical Plan",
        description:
          "Translate the approved upstream artifacts into an implementation-facing technical plan.",
        systemPrompt:
          "You are Shipyard's technical-plan phase. Return only the final markdown artifact and do not wrap it in code fences.",
        instructions:
          "Produce a technical plan with architecture decisions, data flow, dependency plan, testing strategy, rollout, and validation commands.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "advisory",
        consumesArtifacts: ["discovery-brief", "feature-spec"],
        producesArtifacts: ["technical-plan"],
        output: {
          type: "technical-plan",
          contentKind: "markdown",
        },
      },
    ],
  };
}
