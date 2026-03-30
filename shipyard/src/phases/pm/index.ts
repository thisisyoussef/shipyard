import { PLANNER_MODEL_ROUTE } from "../../engine/model-routing.js";
import type { PipelinePhaseDefinition } from "../../pipeline/contracts.js";

export function createEpicsPipelinePhase(): PipelinePhaseDefinition {
  return {
    id: "epics",
    title: "Epic Artifact",
    description:
      "Turn the approved brief and research context into structured epics with value statements, scope boundaries, and acceptance criteria.",
    systemPrompt:
      "You are Shipyard's PM epic phase. Return only valid JSON matching the requested artifact structure.",
    instructions:
      "Return a JSON object with title, summary, and an epics array. Each epic needs title, valueStatement, scope, acceptanceCriteria, dependencies, and estimatedComplexity.",
    modelRoute: PLANNER_MODEL_ROUTE,
    agentProfileId: "pm",
    defaultSkills: ["artifact-writing"],
    approvalGate: "disabled",
    consumesArtifacts: ["discovery-brief|pipeline-brief", "research-brief?"],
    producesArtifacts: ["epic-artifact"],
    output: {
      type: "epic-artifact",
      contentKind: "json",
    },
  };
}

export function createUserStoriesPipelinePhase(): PipelinePhaseDefinition {
  return {
    id: "user-stories",
    title: "User Story Artifact",
    description:
      "Break approved epics into implementable user stories with acceptance criteria, edge cases, and deterministic priority.",
    systemPrompt:
      "You are Shipyard's PM user-story phase. Return only valid JSON matching the requested artifact structure.",
    instructions:
      "Return a JSON object with title, summary, and a stories array. Each story needs epicId, title, userStory, acceptanceCriteria, edgeCases, dependencies, estimatedComplexity, and priority.",
    modelRoute: PLANNER_MODEL_ROUTE,
    agentProfileId: "pm",
    defaultSkills: ["artifact-writing"],
    approvalGate: "disabled",
    consumesArtifacts: ["epic-artifact", "research-brief?"],
    producesArtifacts: ["user-story-artifact"],
    output: {
      type: "user-story-artifact",
      contentKind: "json",
    },
  };
}

export function createTechnicalSpecPipelinePhase(): PipelinePhaseDefinition {
  return {
    id: "technical-spec",
    title: "Technical Spec Artifact",
    description:
      "Translate approved stories into implementation-facing technical specs with modules, APIs, data model notes, and tests.",
    systemPrompt:
      "You are Shipyard's PM technical-spec phase. Return only valid JSON matching the requested artifact structure.",
    instructions:
      "Return a JSON object with title, summary, and a specs array. Each spec needs storyId, title, overview, dataModel, apiContract, componentStructure, stateManagement, errorHandling, testExpectations, implementationOrder, and designReferences.",
    modelRoute: PLANNER_MODEL_ROUTE,
    agentProfileId: "pm",
    defaultSkills: ["artifact-writing", "spec-writing"],
    approvalGate: "required",
    consumesArtifacts: ["user-story-artifact", "research-brief?"],
    producesArtifacts: ["technical-spec-artifact"],
    output: {
      type: "technical-spec-artifact",
      contentKind: "json",
    },
  };
}

export function createBacklogPipelinePhase(): PipelinePhaseDefinition {
  return {
    id: "backlog",
    title: "Backlog Artifact",
    description:
      "Produce the durable ordered backlog artifact consumed by later TDD and coordination phases.",
    systemPrompt:
      "You are Shipyard's backlog phase. Return only the final JSON artifact and do not wrap it in code fences.",
    instructions:
      "Create a deterministic backlog ordering from approved stories and specs.",
    modelRoute: PLANNER_MODEL_ROUTE,
    agentProfileId: "pm",
    defaultSkills: ["artifact-writing"],
    approvalGate: "disabled",
    consumesArtifacts: ["epic-artifact", "user-story-artifact", "technical-spec-artifact?"],
    producesArtifacts: ["backlog-artifact"],
    output: {
      type: "backlog-artifact",
      contentKind: "json",
    },
  };
}
