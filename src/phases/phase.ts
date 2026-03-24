import type { ContextEnvelope } from "../artifacts/types.js";

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
  tools: string[];
  systemPrompt: string;
  execute: (input: PhaseExecutionInput) => Promise<PhaseResult>;
}
