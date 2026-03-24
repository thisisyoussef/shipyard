import type { ContextEnvelope } from "../artifacts/types.js";
import type { ToolDefinition } from "../tools/registry.js";

export interface PhaseResult {
  notes: string[];
  artifacts: unknown[];
}

export interface PhaseExecutionInput {
  instruction: string;
  context: ContextEnvelope;
}

export interface Phase {
  name: string;
  tools: ToolDefinition[];
  systemPrompt: string;
  approvalRequired: boolean;
  inputArtifact: string;
  outputArtifact: string;
  execute: (input: PhaseExecutionInput) => Promise<PhaseResult>;
}
