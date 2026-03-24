export interface Phase {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  approvalRequired: boolean;
  inputArtifact: string;
  outputArtifact: string;
}
