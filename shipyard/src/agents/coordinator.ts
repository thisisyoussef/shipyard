import type {
  BrowserEvaluationPlan,
  BrowserEvaluationReport,
  ContextReport,
  EvaluationPlan,
  ExecutionSpec,
  HarnessTaskComplexity,
  PlanningMode,
  PreviewState,
  TaskPlan,
  VerificationReport,
} from "../artifacts/types.js";
import { createBrowserEvaluationTargetFromPreviewState } from "./browser-evaluator.js";
import type { ContextEnvelope } from "../engine/state.js";
import { normalizeTargetRelativePath } from "../tools/file-state.js";

const verificationScriptPriority = ["test", "typecheck", "build"] as const;
const dependencyInstallMarkerDirectories = new Set(["node_modules", ".yarn"]);
const dependencyInstallMarkerFiles = new Set([".pnp.cjs", ".pnp.js"]);
const dependencyBootstrapTouchFiles = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
]);
const browserEvaluationKeywordPatterns = [
  /\bui\b/i,
  /\bux\b/i,
  /\bvisual\b/i,
  /\bstyle\b/i,
  /\bcss\b/i,
  /\bcomponent\b/i,
  /\bpage\b/i,
  /\bscreen\b/i,
  /\blayout\b/i,
  /\bmodal\b/i,
  /\bbutton\b/i,
  /\bpreview\b/i,
  /\bbrowser\b/i,
  /\bform\b/i,
  /\breact\b/i,
] as const;
const lightweightInstructionPrefixes = [
  "inspect ",
  "read ",
  "show ",
  "list ",
  "search ",
  "find ",
  "grep ",
  "run ",
  "test ",
  "typecheck",
  "build",
] as const;
const broadInstructionKeywordPatterns = [
  /\bacross\b/i,
  /\ball\b/i,
  /\bmultiple\b/i,
  /\bseveral\b/i,
  /\bworkflow\b/i,
  /\bflow\b/i,
  /\barchitecture\b/i,
  /\bgraph\b/i,
  /\brout(?:e|ing)\b/i,
  /\bmode\b/i,
  /\bcomplexity\b/i,
  /\bphase\b/i,
  /\brefactor\b/i,
  /\boverhaul\b/i,
  /\brebuild\b/i,
  /\bmigrate\b/i,
  /\bsystem\b/i,
  /\bmulti(?:-|\s)?step\b/i,
  /\bend-to-end\b/i,
] as const;
const targetedChangeVerbPattern =
  /\b(change|update|set|rename|fix|remove|add|adjust|tweak|swap|replace|move|align|simplify|polish)\b/i;
const targetedScopeKeywordPatterns = [
  /\bbackground\b/i,
  /\bcolor\b/i,
  /\bcopy\b/i,
  /\btext\b/i,
  /\blabel\b/i,
  /\btitle\b/i,
  /\bheading\b/i,
  /\bbutton\b/i,
  /\bicon\b/i,
  /\bpadding\b/i,
  /\bmargin\b/i,
  /\bspacing\b/i,
  /\bfont\b/i,
  /\bborder\b/i,
  /\bshadow\b/i,
  /\bexport\b/i,
  /\bprop\b/i,
  /\bclass(?:name)?\b/i,
  /\bstyle\b/i,
  /\bcss\b/i,
  /\bplaceholder\b/i,
  /\bpreview\b/i,
] as const;
const explicitBrowserEvaluationPatterns = [
  /\bverify\b/i,
  /\bevaluate\b/i,
  /\bcheck\b/i,
  /\bqa\b/i,
  /\bbrowser\b/i,
  /\bpreview\b/i,
  /\bscreenshot\b/i,
] as const;
const targetedInstructionWordCeiling = 18;
const uiFilePathPattern =
  /(^|\/)(app|components|pages|routes|ui)\//i;
const uiFileExtensionPattern = /\.(?:tsx|jsx|css|scss|sass|less|html)$/i;

export type CoordinatorRouteComplexity = Exclude<
  HarnessTaskComplexity,
  "unclassified"
>;

export interface CoordinatorRouteDecision {
  complexity: CoordinatorRouteComplexity;
  useExplorer: boolean;
  usePlanner: boolean;
  reason: string;
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function isBootstrapReadyContext(
  contextEnvelope: ContextEnvelope,
): boolean {
  return Boolean(
    contextEnvelope.stable.discovery.bootstrapReady
    || contextEnvelope.stable.discovery.isGreenfield,
  );
}

function cleanInstructionToken(token: string): string {
  return token.replace(/^[`"'([{<]+|[`"'.,!?;:)\]}>]+$/g, "");
}

function looksLikePathToken(token: string): boolean {
  return token.includes("/") || /\.[a-z0-9_-]+$/i.test(token);
}

function normalizeInstructionPath(candidate: string): string | null {
  if (!candidate || !looksLikePathToken(candidate)) {
    return null;
  }

  try {
    return normalizeTargetRelativePath(candidate);
  } catch {
    return null;
  }
}

function getKnownTargetFilePaths(options: {
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): string[] {
  return uniqueStrings([
    ...options.contextEnvelope.task.targetFilePaths,
    ...(options.contextEnvelope.session.recentTouchedFiles ?? []),
    ...(options.taskPlan?.targetFilePaths ?? []),
    ...(options.executionSpec?.targetFilePaths ?? []),
    ...(options.contextReport?.findings.map((finding) => finding.filePath) ?? []),
  ]);
}

function getContinuationTargetFilePaths(options: {
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
}): string[] {
  return uniqueStrings([
    ...options.contextEnvelope.task.targetFilePaths,
    ...(options.contextEnvelope.session.recentTouchedFiles ?? []),
    ...(options.taskPlan?.targetFilePaths ?? []),
  ]);
}

function buildPackageManagerScriptCommand(
  packageManager: string | null,
  scriptName: string,
): string {
  if (packageManager === "npm") {
    return scriptName === "test"
      ? "npm test"
      : `npm run ${scriptName}`;
  }

  if (packageManager === "yarn") {
    return `yarn ${scriptName}`;
  }

  if (packageManager === "bun") {
    return scriptName === "test"
      ? "bun test"
      : `bun run ${scriptName}`;
  }

  return `pnpm ${scriptName}`;
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function hasDependencyInstallMarkers(
  contextEnvelope: ContextEnvelope,
): boolean {
  const { topLevelDirectories, topLevelFiles } = contextEnvelope.stable.discovery;

  return topLevelDirectories.some((directory) =>
    dependencyInstallMarkerDirectories.has(directory)
  ) || topLevelFiles.some((fileName) => dependencyInstallMarkerFiles.has(fileName));
}

function hasRecentBootstrapTouch(
  contextEnvelope: ContextEnvelope,
): boolean {
  return (contextEnvelope.session.recentTouchedFiles ?? []).some((filePath) => {
    const fileName = filePath.split("/").at(-1) ?? filePath;

    return dependencyBootstrapTouchFiles.has(fileName);
  });
}

function createFilePresenceVerificationCheck(
  filePath: string,
): EvaluationPlan["checks"][number] {
  const normalizedFilePath = normalizeTargetRelativePath(filePath);
  const command =
    `test -f ${quoteForShell(normalizedFilePath)} && ` +
    `echo ${quoteForShell(`Edited file exists: ${normalizedFilePath}`)}`;

  return {
    id: "check-1",
    label: `Confirm ${normalizedFilePath} still exists`,
    kind: "command",
    command,
    required: true,
  };
}

function shouldUseNoInstallVerificationFallback(options: {
  contextEnvelope: ContextEnvelope;
  editedFilePath?: string | null;
}): boolean {
  const editedFilePath = options.editedFilePath?.trim();

  if (!editedFilePath) {
    return false;
  }

  if (hasDependencyInstallMarkers(options.contextEnvelope)) {
    return false;
  }

  if (isBootstrapReadyContext(options.contextEnvelope)) {
    return true;
  }

  return hasRecentBootstrapTouch(options.contextEnvelope);
}

export function extractInstructionTargetFilePaths(
  instruction: string,
): string[] {
  return uniqueStrings(
    instruction
      .split(/\s+/)
      .map(cleanInstructionToken)
      .map(normalizeInstructionPath)
      .filter((path): path is string => path !== null),
  );
}

export function shouldCoordinatorUseExplorer(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  planningMode?: PlanningMode;
  taskComplexityHint?: CoordinatorRouteComplexity | null;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): boolean {
  return createCoordinatorRouteDecision(options).useExplorer;
}

export function isClearlyLightweightInstruction(instruction: string): boolean {
  const normalizedInstruction = instruction.trim().toLowerCase();

  return lightweightInstructionPrefixes.some((prefix) =>
    normalizedInstruction.startsWith(prefix)
  );
}

function looksLikeBroadInstruction(instruction: string): boolean {
  return broadInstructionKeywordPatterns.some((pattern) =>
    pattern.test(instruction)
  );
}

function countInstructionWords(instruction: string): number {
  return instruction
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function looksLikeTargetedChangeInstruction(instruction: string): boolean {
  return targetedChangeVerbPattern.test(instruction)
    && targetedScopeKeywordPatterns.some((pattern) => pattern.test(instruction))
    && countInstructionWords(instruction) <= targetedInstructionWordCeiling;
}

function requestsExplicitBrowserEvaluation(instruction: string): boolean {
  return explicitBrowserEvaluationPatterns.some((pattern) =>
    pattern.test(instruction)
  );
}

export function createCoordinatorRouteDecision(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  planningMode?: PlanningMode;
  taskComplexityHint?: CoordinatorRouteComplexity | null;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): CoordinatorRouteDecision {
  const explicitTargetFilePaths = extractInstructionTargetFilePaths(
    options.instruction,
  );
  const knownTargetFilePaths = getKnownTargetFilePaths(options);
  const continuationTargetFilePaths = getContinuationTargetFilePaths({
    contextEnvelope: options.contextEnvelope,
    taskPlan: options.taskPlan,
  });
  const hasKnownTargetFilePaths =
    explicitTargetFilePaths.length > 0 || knownTargetFilePaths.length > 0;
  const useExplorerForBroad =
    !isBootstrapReadyContext(options.contextEnvelope)
    && !hasKnownTargetFilePaths;

  if (options.taskComplexityHint) {
    return {
      complexity: options.taskComplexityHint,
      useExplorer: options.taskComplexityHint === "broad" && useExplorerForBroad,
      usePlanner: options.taskComplexityHint === "broad",
      reason: "Graph triage already classified this instruction.",
    };
  }

  if (options.planningMode === "planner") {
    return {
      complexity: "broad",
      useExplorer: false,
      usePlanner: true,
      reason: "Planner-backed execution was already selected for this turn.",
    };
  }

  if (isClearlyLightweightInstruction(options.instruction)) {
    return {
      complexity: "direct",
      useExplorer: false,
      usePlanner: false,
      reason: "Instruction is an explicit lightweight operator command.",
    };
  }

  if (isBootstrapReadyContext(options.contextEnvelope)) {
    return {
      complexity: "direct",
      useExplorer: false,
      usePlanner: false,
      reason: "Bootstrap-ready targets stay on the lightweight path.",
    };
  }

  if (
    hasKnownTargetFilePaths
    || continuationTargetFilePaths.length > 0
  ) {
    return {
      complexity: "direct",
      useExplorer: false,
      usePlanner: false,
      reason: "Instruction already has enough file context for the lightweight path.",
    };
  }

  if (looksLikeBroadInstruction(options.instruction)) {
    return {
      complexity: "broad",
      useExplorer: useExplorerForBroad,
      usePlanner: true,
      reason: "Instruction reads as architectural, cross-cutting, or multi-step work.",
    };
  }

  if (looksLikeTargetedChangeInstruction(options.instruction)) {
    return {
      complexity: "targeted",
      useExplorer: false,
      usePlanner: false,
      reason: "Instruction looks like a narrow change that the lightweight loop can handle directly.",
    };
  }

  return {
    complexity: "broad",
    useExplorer: useExplorerForBroad,
    usePlanner: true,
    reason: "Instruction is ambiguous enough to keep the heavier planning path.",
  };
}

export function shouldCoordinatorUsePlanner(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  planningMode?: PlanningMode;
  taskComplexityHint?: CoordinatorRouteComplexity | null;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): boolean {
  return createCoordinatorRouteDecision(options).usePlanner;
}

export function createExplorerQuery(instruction: string): string {
  return `Identify the files most relevant to this request: ${instruction.trim()}`;
}

export function createLightweightExecutionSpec(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): ExecutionSpec {
  const explicitTargetFilePaths = extractInstructionTargetFilePaths(
    options.instruction,
  );
  const targetFilePaths = uniqueStrings([
    ...explicitTargetFilePaths,
    ...getKnownTargetFilePaths(options),
  ]);
  const targetLabel = targetFilePaths.length > 0
    ? targetFilePaths.join(", ")
    : "the relevant files";

  return {
    instruction: options.instruction,
    goal: options.contextReport?.query ?? options.instruction,
    deliverables: [
      `Address the request within ${targetLabel}.`,
    ],
    acceptanceCriteria: [
      `The requested change is applied within ${targetLabel}.`,
      "The resulting change stays aligned with the original instruction.",
    ],
    verificationIntent: [
      "Run the most relevant verification command after the change.",
    ],
    targetFilePaths,
    risks: [],
  };
}

export function createCoordinatorTaskPlan(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): TaskPlan {
  const explicitTargetFilePaths = extractInstructionTargetFilePaths(
    options.instruction,
  );
  const targetFilePaths = uniqueStrings([
    ...explicitTargetFilePaths,
    ...getKnownTargetFilePaths(options),
  ]);
  const plannedSteps = uniqueStrings(
    [
      options.contextReport
        ? "Review the explorer findings before editing."
        : "Read the relevant files before editing.",
      targetFilePaths.length > 0
        ? `Inspect ${targetFilePaths.join(", ")} before editing.`
        : "Search for the most relevant files before editing.",
      ...(options.executionSpec?.deliverables.map((deliverable) =>
        `Deliver: ${deliverable}`
      ) ?? []),
      "Choose the smallest unique anchor for each change.",
      ...(options.executionSpec?.verificationIntent.map((intent) =>
        `Verify: ${intent}`
      ) ?? []),
      "Leave command-based verification to the verifier after the edit unless shell output is required now.",
    ],
  );

  return {
    instruction: options.instruction,
    goal:
      options.executionSpec?.goal
      ?? options.contextReport?.query
      ?? options.instruction,
    targetFilePaths,
    plannedSteps,
  };
}

export function createVerificationCommand(
  contextEnvelope: ContextEnvelope,
): string {
  const packageManager = contextEnvelope.stable.discovery.packageManager;

  for (const scriptName of verificationScriptPriority) {
    if (contextEnvelope.stable.availableScripts[scriptName]) {
      return buildPackageManagerScriptCommand(packageManager, scriptName);
    }
  }

  return "git diff --stat";
}

function createVerificationChecks(
  contextEnvelope: ContextEnvelope,
  editedFilePath?: string | null,
): EvaluationPlan["checks"] {
  const packageManager = contextEnvelope.stable.discovery.packageManager;
  const checks = verificationScriptPriority
    .filter((scriptName) => contextEnvelope.stable.availableScripts[scriptName])
    .map((scriptName, index) => ({
      id: `check-${String(index + 1)}`,
      label: `Run ${buildPackageManagerScriptCommand(packageManager, scriptName)}`,
      kind: "command" as const,
      command: buildPackageManagerScriptCommand(packageManager, scriptName),
      required: true,
    }));

  if (
    shouldUseNoInstallVerificationFallback({
      contextEnvelope,
      editedFilePath,
    })
  ) {
    return [createFilePresenceVerificationCheck(editedFilePath!)];
  }

  if (checks.length > 0) {
    return checks;
  }

  return [
    {
      id: "check-1",
      label: "Run git diff --stat",
      kind: "command",
      command: "git diff --stat",
      required: true,
    },
  ];
}

export function createVerificationPlan(options: {
  contextEnvelope: ContextEnvelope;
  executionSpec?: ExecutionSpec | null;
  editedFilePath?: string | null;
}): EvaluationPlan {
  const checks = createVerificationChecks(
    options.contextEnvelope,
    options.editedFilePath,
  );

  return {
    summary: options.executionSpec?.verificationIntent[0]
      ?? `Run ${checks.length === 1 ? "the verification command" : "the verification checks"}.`,
    checks,
  };
}

function looksLikeUiRelevantInstruction(instruction: string): boolean {
  return browserEvaluationKeywordPatterns.some((pattern) =>
    pattern.test(instruction)
  );
}

function looksLikeUiRelevantFilePath(filePath: string): boolean {
  return uiFilePathPattern.test(filePath) || uiFileExtensionPattern.test(filePath);
}

export function shouldCoordinatorUseBrowserEvaluator(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  previewState: PreviewState;
  planningMode?: PlanningMode;
  taskComplexityHint?: CoordinatorRouteComplexity | null;
  routeDecision?: CoordinatorRouteDecision | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): boolean {
  if (
    options.previewState.status !== "running"
    || options.previewState.url === null
  ) {
    return false;
  }

  const routeDecision = options.routeDecision
    ?? createCoordinatorRouteDecision({
      instruction: options.instruction,
      contextEnvelope: options.contextEnvelope,
      planningMode: options.planningMode,
      taskComplexityHint: options.taskComplexityHint,
      executionSpec: options.executionSpec,
      contextReport: options.contextReport,
    });

  const targetFilePaths = getKnownTargetFilePaths({
    contextEnvelope: options.contextEnvelope,
    executionSpec: options.executionSpec,
    contextReport: options.contextReport,
  });
  const explicitFilePaths = extractInstructionTargetFilePaths(options.instruction);

  if (
    [...targetFilePaths, ...explicitFilePaths].some((filePath) =>
      looksLikeUiRelevantFilePath(filePath)
    )
  ) {
    return routeDecision.complexity === "broad"
      || requestsExplicitBrowserEvaluation(options.instruction);
  }

  if (!looksLikeUiRelevantInstruction(options.instruction)) {
    return false;
  }

  return routeDecision.complexity === "broad"
    || requestsExplicitBrowserEvaluation(options.instruction);
}

export function createBrowserEvaluationPlan(options: {
  instruction: string;
  previewState: PreviewState;
  executionSpec?: ExecutionSpec | null;
}): BrowserEvaluationPlan {
  return {
    summary: options.executionSpec?.goal ?? options.instruction.trim(),
    target: createBrowserEvaluationTargetFromPreviewState(options.previewState),
    steps: [
      {
        id: "load-preview",
        label: "Load the current preview",
        kind: "load",
      },
      {
        id: "check-console",
        label: "Check browser console health",
        kind: "console",
        failOn: ["error"],
        includePageErrors: true,
      },
    ],
    captureArtifacts: "on-failure",
  };
}

export function mergeBrowserEvaluationIntoVerificationReport(options: {
  verificationReport: VerificationReport;
  browserEvaluationReport: BrowserEvaluationReport | null;
}): VerificationReport {
  const { verificationReport, browserEvaluationReport } = options;

  if (
    browserEvaluationReport === null
    || browserEvaluationReport.status === "not_applicable"
  ) {
    return {
      ...verificationReport,
      browserEvaluationReport,
    };
  }

  if (browserEvaluationReport.status === "passed") {
    return {
      ...verificationReport,
      browserEvaluationReport,
    };
  }

  if (browserEvaluationReport.status === "infrastructure_failed") {
    return {
      ...verificationReport,
      summary: verificationReport.passed
        ? `${verificationReport.summary} Browser evaluation degraded: ${browserEvaluationReport.summary}`
        : verificationReport.summary,
      browserEvaluationReport,
    };
  }

  return {
    ...verificationReport,
    passed: false,
    summary: `Browser evaluation failed: ${browserEvaluationReport.summary}`,
    browserEvaluationReport,
  };
}

export const coordinatorAgent = {
  name: "coordinator",
  canWrite: true,
  responsibilities: [
    "Own the task plan",
    "Own every write operation",
    "Decide when to delegate discovery and verification",
    "Merge read-only subagent findings into a single execution path",
  ],
};
