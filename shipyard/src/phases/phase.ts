import type { ModelRouteId } from "../engine/model-routing.js";

export interface Phase {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  modelRoute?: ModelRouteId;
  approvalRequired: boolean;
  inputArtifact: string;
  outputArtifact: string;
}
