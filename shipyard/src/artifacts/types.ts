export interface TaskPlan {
  instruction: string;
  goal: string;
  targetFilePaths: string[];
  plannedSteps: string[];
}

export interface ExecutionSpec {
  instruction: string;
  goal: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  verificationIntent: string[];
  targetFilePaths: string[];
  risks: string[];
}

export type PlanningMode = "lightweight" | "planner";

export interface ContextFinding {
  filePath: string;
  excerpt: string;
  relevanceNote: string;
}

export interface ContextReport {
  query: string;
  findings: ContextFinding[];
}

export interface EditIntent {
  filePath: string;
  oldString: string;
  newString: string;
  reason: string;
}

export interface EvaluationCheck {
  id: string;
  label: string;
  kind: "command";
  command: string;
  required: boolean;
}

export interface EvaluationPlan {
  summary: string;
  checks: EvaluationCheck[];
}

export type VerificationCheckStatus = "passed" | "failed" | "skipped";

export interface VerificationCheckResult {
  checkId: string;
  label: string;
  kind: "command";
  command: string;
  required: boolean;
  status: VerificationCheckStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  summary: string;
}

export interface VerificationHardFailure {
  checkId: string;
  label: string;
  command: string;
}

export interface VerificationReport {
  command: string;
  exitCode: number | null;
  passed: boolean;
  stdout: string;
  stderr: string;
  summary: string;
  evaluationPlan?: EvaluationPlan;
  checks?: VerificationCheckResult[];
  firstHardFailure?: VerificationHardFailure | null;
}

export type PreviewCapabilityStatus = "available" | "unavailable";
export type PreviewKind = "dev-server" | "watch-build" | "static-output";
export type PreviewRunner = "npm" | "pnpm" | "yarn" | "bun";
export type PreviewAutoRefreshMode = "native-hmr" | "restart" | "none";

export interface PreviewCapabilityReport {
  status: PreviewCapabilityStatus;
  kind: PreviewKind | null;
  runner: PreviewRunner | null;
  scriptName: string | null;
  command: string | null;
  reason: string;
  autoRefresh: PreviewAutoRefreshMode;
}

export type PreviewStatus =
  | "idle"
  | "starting"
  | "running"
  | "refreshing"
  | "error"
  | "exited"
  | "unavailable";

export interface PreviewState {
  status: PreviewStatus;
  summary: string;
  url: string | null;
  logTail: string[];
  lastRestartReason: string | null;
}

export interface DiscoveryReport {
  isGreenfield: boolean;
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  scripts: Record<string, string>;
  hasReadme: boolean;
  hasAgentsMd: boolean;
  topLevelFiles: string[];
  topLevelDirectories: string[];
  projectName: string | null;
  previewCapability: PreviewCapabilityReport;
}

export interface TargetProfile {
  name: string;
  description: string;
  purpose: string;
  stack: string[];
  architecture: string;
  keyPatterns: string[];
  complexity: "trivial" | "small" | "medium" | "large";
  suggestedAgentsRules: string;
  suggestedScripts: Record<string, string>;
  taskSuggestions: string[];
  enrichedAt: string;
  enrichmentModel: string;
  discoverySnapshot: DiscoveryReport;
}
