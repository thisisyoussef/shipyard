import type {
  BrowserEvaluationPlan,
  BrowserEvaluationReport,
  ContextReport,
  EvaluationPlan,
  ExecutionSpec,
  PreviewState,
  TaskPlan,
  VerificationReport,
} from "../artifacts/types.js";
import { createBrowserEvaluationTargetFromPreviewState } from "./browser-evaluator.js";
import { normalizeRuntimeFeatureFlags } from "../engine/runtime-flags.js";
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
const uiFilePathPattern =
  /(^|\/)(app|components|pages|routes|ui)\//i;
const uiFileExtensionPattern = /\.(?:tsx|jsx|css|scss|sass|less|html)$/i;
const styleSheetFileExtensionPattern = /\.(?:css|scss|sass|less)$/i;
const singleTurnUiBuildActionPattern =
  /\b(make|create|build|design|implement|craft|polish|restyle)\b/i;
const singleTurnUiBuildSurfacePattern =
  /\b(login|sign[ -]?in|signup|sign[ -]?up|auth(?:entication)?|landing|pricing|checkout|settings|profile|form|page|screen|modal|dialog|component)\b/i;
const continuationInstructionPattern =
  /\b(continue|resume|keep going|finish)\b/i;
const broadScopeInstructionPattern = /\b(app|project|workspace|flow|system)\b/i;

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

function getRuntimeFeatureFlags(contextEnvelope: ContextEnvelope) {
  return normalizeRuntimeFeatureFlags(contextEnvelope.runtime.featureFlags);
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
  const featureFlags = getRuntimeFeatureFlags(options.contextEnvelope);
  const recentTouchedFiles = featureFlags.disableRecentTouchedScopeWidening
    ? []
    : (options.contextEnvelope.session.recentTouchedFiles ?? []);

  return uniqueStrings([
    ...options.contextEnvelope.task.targetFilePaths,
    ...recentTouchedFiles,
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
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): boolean {
  if (isBootstrapReadyContext(options.contextEnvelope)) {
    return false;
  }

  if (extractInstructionTargetFilePaths(options.instruction).length > 0) {
    return false;
  }

  return getKnownTargetFilePaths(options).length === 0;
}

export function isClearlyLightweightInstruction(instruction: string): boolean {
  const normalizedInstruction = instruction.trim().toLowerCase();

  return lightweightInstructionPrefixes.some((prefix) =>
    normalizedInstruction.startsWith(prefix)
  );
}

export function isSingleTurnUiBuildInstruction(instruction: string): boolean {
  const normalizedInstruction = instruction.trim().toLowerCase();

  if (!normalizedInstruction) {
    return false;
  }

  if (continuationInstructionPattern.test(normalizedInstruction)) {
    return false;
  }

  if (!singleTurnUiBuildActionPattern.test(normalizedInstruction)) {
    return false;
  }

  if (!singleTurnUiBuildSurfacePattern.test(normalizedInstruction)) {
    return false;
  }

  return !(
    broadScopeInstructionPattern.test(normalizedInstruction)
    && !/\b(page|screen|form|modal|dialog|component)\b/i.test(normalizedInstruction)
  );
}

export function shouldCoordinatorUsePlanner(options: {
  instruction: string;
  contextEnvelope: ContextEnvelope;
  taskPlan?: TaskPlan | null;
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): boolean {
  if (options.executionSpec) {
    return false;
  }

  if (isBootstrapReadyContext(options.contextEnvelope)) {
    return false;
  }

  if (extractInstructionTargetFilePaths(options.instruction).length > 0) {
    return false;
  }

  if (isClearlyLightweightInstruction(options.instruction)) {
    return false;
  }

  if (
    getContinuationTargetFilePaths({
      contextEnvelope: options.contextEnvelope,
      taskPlan: options.taskPlan,
    }).length > 0
  ) {
    return false;
  }

  return true;
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
  options: {
    editedFilePath?: string | null;
    touchedFiles?: string[];
  } = {},
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
  const editedFilePath = options.editedFilePath;

  if (
    shouldUseNoInstallVerificationFallback({
      contextEnvelope,
      editedFilePath,
    })
  ) {
    const fallbackChecks = [createFilePresenceVerificationCheck(editedFilePath!)];
    const featureFlags = getRuntimeFeatureFlags(contextEnvelope);
    const touchedStyleSheets = uniqueStrings(
      (options.touchedFiles ?? []).filter((filePath) =>
        styleSheetFileExtensionPattern.test(filePath)
      ),
    );
    const shouldRequireStyleSheetReferences =
      featureFlags.enableStrictFreshUiVerification
      && touchedStyleSheets.length > 0
      && (
        looksLikeUiRelevantInstruction(contextEnvelope.task.currentInstruction)
        || looksLikeUiRelevantFilePath(editedFilePath!)
        || touchedStyleSheets.some((filePath) =>
          looksLikeUiRelevantFilePath(filePath)
        )
      );

    if (shouldRequireStyleSheetReferences) {
      fallbackChecks.push(
        ...touchedStyleSheets.map((filePath, index) => {
          const normalizedFilePath = normalizeTargetRelativePath(filePath);
          const fileName =
            normalizedFilePath.split("/").at(-1) ?? normalizedFilePath;
          const successMessage =
            `Stylesheet reference found for ${normalizedFilePath}`;
          const failureMessage =
            `Stylesheet reference missing for ${normalizedFilePath}`;
          const command = [
            "search_paths=''",
            "[ -d src ] && search_paths=\"$search_paths src\"",
            "[ -d app ] && search_paths=\"$search_paths app\"",
            "[ -d pages ] && search_paths=\"$search_paths pages\"",
            "[ -d components ] && search_paths=\"$search_paths components\"",
            "[ -d routes ] && search_paths=\"$search_paths routes\"",
            "[ -f index.html ] && search_paths=\"$search_paths index.html\"",
            "[ -n \"$search_paths\" ] || search_paths='.'",
            `if rg -n --hidden --glob '!node_modules/**' --glob '!.shipyard/**' --glob '!dist/**' --glob '!build/**' --fixed-strings ${quoteForShell(fileName)} $search_paths; then`,
            `  echo ${quoteForShell(successMessage)}`,
            "else",
            `  echo ${quoteForShell(failureMessage)} >&2`,
            "  exit 1",
            "fi",
          ].join("\n");

          return {
            id: `check-${String(index + 2)}`,
            label: `Confirm ${normalizedFilePath} is referenced from source files`,
            kind: "command" as const,
            command,
            required: true,
          };
        }),
      );
    }

    return fallbackChecks;
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
  touchedFiles?: string[];
}): EvaluationPlan {
  const checks = createVerificationChecks(
    options.contextEnvelope,
    {
      editedFilePath: options.editedFilePath,
      touchedFiles: options.touchedFiles,
    },
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
  executionSpec?: ExecutionSpec | null;
  contextReport?: ContextReport | null;
}): boolean {
  if (
    options.previewState.status !== "running"
    || options.previewState.url === null
  ) {
    return false;
  }

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
    return true;
  }

  return looksLikeUiRelevantInstruction(options.instruction);
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
