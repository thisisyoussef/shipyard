export const AGENT_ROLE_IDS = [
  "coordinator",
  "target-manager",
  "discovery",
  "pm",
  "pr-ops",
  "test-author",
  "implementer",
  "reviewer",
  "qa",
  "deploy",
  "explorer",
  "planner",
  "verifier",
  "browser-evaluator",
  "human-simulator",
  "target-enrichment",
] as const;

export type AgentRoleId = (typeof AGENT_ROLE_IDS)[number];
