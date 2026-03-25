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

export type PlanTaskStatus = "pending" | "in_progress" | "done" | "failed";

export interface LoadedPlanSpec {
  ref: string;
  path: string;
}

export interface PlanTask {
  id: string;
  description: string;
  status: PlanTaskStatus;
  targetFilePaths?: string[];
  specRefs?: string[];
  summary?: string;
  updatedAt?: string;
}

export interface PersistedTaskQueue {
  planId: string;
  instruction: string;
  goal: string;
  planningMode: PlanningMode;
  createdAt: string;
  updatedAt: string;
  executionSpec: ExecutionSpec;
  loadedSpecRefs: string[];
  loadedSpecs?: LoadedPlanSpec[];
  tasks: PlanTask[];
}

export interface ExecutionHandoffEvaluation {
  command: string;
  exitCode: number | null;
  passed: boolean;
  summary: string;
}

export type ExecutionHandoffResetKind =
  | "iteration-threshold"
  | "recovery-threshold"
  | "blocked-file";

export interface ExecutionHandoffResetThresholds {
  actingIterations: number;
  recoveryAttempts: number;
}

export interface ExecutionHandoffResetMetrics {
  actingIterations: number;
  recoveryAttempts: number;
  blockedFileCount: number;
}

export interface ExecutionHandoffResetReason {
  kind: ExecutionHandoffResetKind;
  summary: string;
  thresholds: ExecutionHandoffResetThresholds;
  metrics: ExecutionHandoffResetMetrics;
}

export interface ExecutionHandoff {
  version: 1;
  sessionId: string;
  turnCount: number;
  createdAt: string;
  instruction: string;
  phaseName: string;
  runtimeMode: "graph" | "fallback";
  status: "success" | "error" | "cancelled";
  summary: string;
  goal: string;
  completedWork: string[];
  remainingWork: string[];
  touchedFiles: string[];
  blockedFiles: string[];
  latestEvaluation: ExecutionHandoffEvaluation | null;
  nextRecommendedAction: string;
  resetReason: ExecutionHandoffResetReason;
  taskPlan: TaskPlan;
}

export interface LoadedExecutionHandoff {
  artifactPath: string;
  handoff: ExecutionHandoff;
}

export interface ActiveTaskContext {
  planId: string;
  taskId: string;
  title: string;
  instruction: string;
  goal: string;
  checklist: string[];
  targetFilePaths: string[];
  specRefs: string[];
  status: PlanTaskStatus;
  startedAt: string;
  updatedAt: string;
  summary?: string;
}

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
  browserEvaluationReport?: BrowserEvaluationReport | null;
}

export type HarnessSelectedPath = "lightweight" | "planner-backed";
export type HarnessVerificationMode = "none" | "command" | "command+browser";

export interface HarnessRouteSummary {
  selectedPath: HarnessSelectedPath;
  usedExplorer: boolean;
  usedPlanner: boolean;
  usedVerifier: boolean;
  verificationMode: HarnessVerificationMode;
  verificationCheckCount: number;
  usedBrowserEvaluator: boolean;
  browserEvaluationStatus: BrowserEvaluationStatus | "not_run";
  handoffLoaded: boolean;
  handoffEmitted: boolean;
  handoffReason: ExecutionHandoffResetKind | null;
  firstHardFailure: VerificationHardFailure | null;
}

export type BrowserEvaluationTargetStatus =
  | "available"
  | "unavailable"
  | "not_applicable";

export interface BrowserEvaluationTarget {
  status: BrowserEvaluationTargetStatus;
  previewUrl: string | null;
  reason: string;
}

export type BrowserNavigationWaitUntil = "load" | "domcontentloaded";
export type BrowserConsoleMessageType =
  | "log"
  | "debug"
  | "info"
  | "warning"
  | "error";

export interface BrowserEvaluationLoadStep {
  id: string;
  label: string;
  kind: "load";
  path?: string;
  waitUntil?: BrowserNavigationWaitUntil;
  timeoutMs?: number;
}

export interface BrowserEvaluationConsoleStep {
  id: string;
  label: string;
  kind: "console";
  failOn?: BrowserConsoleMessageType[];
  includePageErrors?: boolean;
}

export interface BrowserEvaluationWaitForSelectorStep {
  id: string;
  label: string;
  kind: "wait_for_selector";
  selector: string;
  timeoutMs?: number;
  state?: "attached" | "detached" | "visible" | "hidden";
}

export interface BrowserEvaluationClickStep {
  id: string;
  label: string;
  kind: "click";
  selector: string;
  timeoutMs?: number;
}

export type BrowserEvaluationStep =
  | BrowserEvaluationLoadStep
  | BrowserEvaluationConsoleStep
  | BrowserEvaluationWaitForSelectorStep
  | BrowserEvaluationClickStep;

export interface BrowserEvaluationPlan {
  summary: string;
  target: BrowserEvaluationTarget;
  steps: BrowserEvaluationStep[];
  captureArtifacts?: "none" | "on-failure";
}

export type BrowserEvaluationStatus = "passed" | "failed" | "not_applicable";
export type BrowserEvaluationStepStatus = "passed" | "failed" | "skipped";

export interface BrowserEvaluationConsoleMessage {
  type: BrowserConsoleMessageType;
  text: string;
  location: string | null;
}

export interface BrowserEvaluationStepResult {
  stepId: string;
  label: string;
  kind: BrowserEvaluationStep["kind"];
  status: BrowserEvaluationStepStatus;
  summary: string;
  error: string | null;
  elapsedMs: number;
}

export interface BrowserEvaluationFailure {
  stepId: string | null;
  label: string | null;
  kind: "target" | "console" | "pageerror" | "step";
  message: string;
}

export interface BrowserEvaluationArtifact {
  kind: "screenshot";
  stepId: string;
  path: string;
}

export interface BrowserEvaluationReport {
  status: BrowserEvaluationStatus;
  summary: string;
  previewUrl: string | null;
  browserEvaluationPlan: BrowserEvaluationPlan;
  steps: BrowserEvaluationStepResult[];
  consoleMessages: BrowserEvaluationConsoleMessage[];
  pageErrors: string[];
  artifacts: BrowserEvaluationArtifact[];
  failure: BrowserEvaluationFailure | null;
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
