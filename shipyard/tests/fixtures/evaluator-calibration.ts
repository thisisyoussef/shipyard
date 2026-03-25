import type {
  BrowserEvaluationReport,
  VerificationReport,
} from "../../src/artifacts/types.js";

export interface EvaluatorCalibrationScenario {
  id: string;
  description: string;
  verificationReport: VerificationReport;
  browserEvaluationReport: BrowserEvaluationReport | null;
  expectedPassed: boolean;
  expectedSummaryFragment: string;
}

function createVerificationReport(
  overrides: Partial<VerificationReport>,
): VerificationReport {
  return {
    command: "pnpm test",
    exitCode: 0,
    passed: true,
    stdout: "",
    stderr: "",
    summary: "All 2 evaluation checks passed.",
    evaluationPlan: {
      summary: "Run the verification checks.",
      checks: [
        {
          id: "check-1",
          label: "Run pnpm test",
          kind: "command",
          command: "pnpm test",
          required: true,
        },
        {
          id: "check-2",
          label: "Run pnpm typecheck",
          kind: "command",
          command: "pnpm typecheck",
          required: true,
        },
      ],
    },
    checks: [],
    firstHardFailure: null,
    browserEvaluationReport: null,
    ...overrides,
  };
}

function createBrowserEvaluationReport(
  overrides: Partial<BrowserEvaluationReport>,
): BrowserEvaluationReport {
  return {
    status: "passed",
    summary: "Browser evaluation passed.",
    previewUrl: "http://127.0.0.1:4173/",
    browserEvaluationPlan: {
      summary: "Inspect the preview.",
      target: {
        status: "available",
        previewUrl: "http://127.0.0.1:4173/",
        reason: "Preview running.",
      },
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
    },
    steps: [],
    consoleMessages: [],
    pageErrors: [],
    artifacts: [],
    failure: null,
    ...overrides,
  };
}

export const evaluatorCalibrationScenarios = [
  {
    id: "command-hard-failure",
    description: "required verifier failures must still fail the overall evaluation",
    verificationReport: createVerificationReport({
      exitCode: 1,
      passed: false,
      stderr: "tests failed",
      summary: 'Required check "Run pnpm test" failed: tests failed.',
      firstHardFailure: {
        checkId: "check-1",
        label: "Run pnpm test",
        command: "pnpm test",
      },
    }),
    browserEvaluationReport: null,
    expectedPassed: false,
    expectedSummaryFragment: 'Required check "Run pnpm test" failed',
  },
  {
    id: "browser-console-failure",
    description: "preview-backed runs become strict when browser QA reports a failure",
    verificationReport: createVerificationReport({}),
    browserEvaluationReport: createBrowserEvaluationReport({
      status: "failed",
      summary: "Console errors were detected in the preview.",
      failure: {
        stepId: "check-console",
        label: "Check browser console health",
        kind: "console",
        message: "Console errors were detected in the preview.",
      },
    }),
    expectedPassed: false,
    expectedSummaryFragment: "Browser evaluation failed: Console errors were detected",
  },
  {
    id: "browser-not-applicable",
    description: "preview-unavailable browser evidence must not fail a passing command evaluation",
    verificationReport: createVerificationReport({}),
    browserEvaluationReport: createBrowserEvaluationReport({
      status: "not_applicable",
      summary: "Skipped because no preview is available.",
      previewUrl: null,
      browserEvaluationPlan: {
        summary: "Inspect the preview.",
        target: {
          status: "not_applicable",
          previewUrl: null,
          reason: "No preview is available.",
        },
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
          },
        ],
        captureArtifacts: "on-failure",
      },
    }),
    expectedPassed: true,
    expectedSummaryFragment: "All 2 evaluation checks passed.",
  },
] satisfies EvaluatorCalibrationScenario[];
