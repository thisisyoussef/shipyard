import type { ModelRouteId } from "../engine/model-routing.js";
import type { AgentRoleId } from "../agents/profiles.js";

export type ApprovalGateMode = "required" | "advisory" | "disabled";

export interface Phase {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  modelRoute?: ModelRouteId;
  agentProfileId?: AgentRoleId;
  defaultSkills?: string[];
  approvalRequired: boolean;
  inputArtifact: string;
  outputArtifact: string;
  approvalGate?: ApprovalGateMode;
  consumesArtifacts?: string[];
  producesArtifacts?: string[];
}

export function getPhaseApprovalGateMode(phase: Phase): ApprovalGateMode {
  if (phase.approvalGate) {
    return phase.approvalGate;
  }

  return phase.approvalRequired ? "required" : "disabled";
}

export function getPhaseArtifactContract(
  phase: Phase,
): {
  consumes: string[];
  produces: string[];
} {
  return {
    consumes: phase.consumesArtifacts ?? [phase.inputArtifact],
    produces: phase.producesArtifacts ?? [phase.outputArtifact],
  };
}

export function getPhaseDefaultSkills(phase: Phase): string[] {
  return [...(phase.defaultSkills ?? [])];
}
