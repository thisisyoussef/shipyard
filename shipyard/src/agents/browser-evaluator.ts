import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { ConsoleMessage, Page } from "playwright";
import { chromium } from "playwright";
import { z } from "zod";

import type {
  BrowserConsoleMessageType,
  BrowserEvaluationArtifact,
  BrowserEvaluationConsoleMessage,
  BrowserEvaluationFailure,
  BrowserEvaluationPlan,
  BrowserEvaluationReport,
  BrowserEvaluationStep,
  BrowserEvaluationStepResult,
  BrowserEvaluationTarget,
  PreviewState,
} from "../artifacts/types.js";

const MAX_BROWSER_EVALUATION_STEPS = 8;
const DEFAULT_LOAD_TIMEOUT_MS = 5_000;
const DEFAULT_STEP_TIMEOUT_MS = 2_000;
const DEFAULT_CAPTURE_ARTIFACTS = "on-failure" as const;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const browserConsoleMessageTypeSchema = z.enum([
  "log",
  "debug",
  "info",
  "warning",
  "error",
]);

const browserEvaluationTargetSchema = z.object({
  status: z.enum(["available", "unavailable", "not_applicable"]),
  previewUrl: z.string().url().nullable(),
  reason: z.string().trim().min(1),
}).superRefine((target, context) => {
  if (target.status === "available" && !target.previewUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Available browser evaluation targets require a preview URL.",
    });
    return;
  }

  if (target.status !== "available" && target.previewUrl !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unavailable browser evaluation targets cannot include a preview URL.",
    });
  }

  if (target.previewUrl && !isLoopbackUrl(target.previewUrl)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Browser evaluation preview URLs must stay on loopback.",
    });
  }
});

const loadStepSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.literal("load"),
  path: z.string().trim().min(1).optional(),
  waitUntil: z.enum(["load", "domcontentloaded"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const consoleStepSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.literal("console"),
  failOn: z.array(browserConsoleMessageTypeSchema).min(1).optional(),
  includePageErrors: z.boolean().optional(),
});

const waitForSelectorStepSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.literal("wait_for_selector"),
  selector: z.string().trim().min(1),
  timeoutMs: z.number().int().positive().optional(),
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
});

const clickStepSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.literal("click"),
  selector: z.string().trim().min(1),
  timeoutMs: z.number().int().positive().optional(),
});

const browserEvaluationStepSchema = z.discriminatedUnion("kind", [
  loadStepSchema,
  consoleStepSchema,
  waitForSelectorStepSchema,
  clickStepSchema,
]);

const browserEvaluationPlanSchema = z.object({
  summary: z.string().trim().min(1),
  target: browserEvaluationTargetSchema,
  steps: z.array(browserEvaluationStepSchema)
    .min(1)
    .max(MAX_BROWSER_EVALUATION_STEPS),
  captureArtifacts: z.enum(["none", "on-failure"]).default(
    DEFAULT_CAPTURE_ARTIFACTS,
  ),
}).superRefine((plan, context) => {
  const firstStep = plan.steps[0];

  if (firstStep?.kind !== "load") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Browser evaluation plans must start with a load step.",
    });
  }

  if (!plan.steps.some((step) => step.kind === "console")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Browser evaluation plans must include at least one console step.",
    });
  }

  const seenIds = new Set<string>();

  for (const step of plan.steps) {
    if (seenIds.has(step.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Browser evaluation step ids must be unique. Duplicate id: ${step.id}`,
      });
      continue;
    }

    seenIds.add(step.id);
  }
});

export interface BrowserEvaluatorRunOptions {
  artifactsDirectory?: string;
}

class BrowserEvaluationStepFailure extends Error {
  kind: BrowserEvaluationFailure["kind"];

  constructor(kind: BrowserEvaluationFailure["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

export function normalizeBrowserEvaluationPlan(
  input: BrowserEvaluationPlan,
): BrowserEvaluationPlan {
  const validated = browserEvaluationPlanSchema.safeParse(input);

  if (!validated.success) {
    throw new Error("Browser evaluation plan is invalid.");
  }

  return {
    summary: validated.data.summary,
    target: { ...validated.data.target },
    steps: validated.data.steps.map((step) => ({ ...step })),
    captureArtifacts: validated.data.captureArtifacts,
  };
}

export function createBrowserEvaluationTargetFromPreviewState(
  previewState: PreviewState,
): BrowserEvaluationTarget {
  if (previewState.status === "running" && previewState.url) {
    return {
      status: "available",
      previewUrl: previewState.url,
      reason: previewState.summary,
    };
  }

  if (
    previewState.status === "idle"
    || previewState.status === "unavailable"
  ) {
    return {
      status: "not_applicable",
      previewUrl: null,
      reason: previewState.summary,
    };
  }

  return {
    status: "unavailable",
    previewUrl: null,
    reason: previewState.lastRestartReason ?? previewState.summary,
  };
}

export async function runBrowserEvaluator(
  input: BrowserEvaluationPlan,
  options: BrowserEvaluatorRunOptions = {},
): Promise<BrowserEvaluationReport> {
  const plan = normalizeBrowserEvaluationPlan(input);

  if (plan.target.status === "not_applicable") {
    return createTargetOnlyReport(plan, "not_applicable");
  }

  if (plan.target.status === "unavailable") {
    return createTargetOnlyReport(plan, "failed");
  }

  let browser;

  try {
    browser = await chromium.launch();
  } catch (error) {
    return createInfrastructureFailureReport(
      plan,
      `Browser launch failed: ${toErrorMessage(error)}`,
    );
  }

  const context = await browser.newContext();
  const consoleMessages: BrowserEvaluationConsoleMessage[] = [];
  const pageErrors: string[] = [];
  const artifacts: BrowserEvaluationArtifact[] = [];
  let consoleCursor = 0;
  let pageErrorCursor = 0;

  context.on("weberror", (webError) => {
    pageErrors.push(String(webError.error()));
  });

  await context.route("**/*", async (route) => {
    if (isAllowedBrowserRequestUrl(route.request().url())) {
      await route.continue();
      return;
    }

    await route.abort();
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    consoleMessages.push(toBrowserConsoleMessage(message));
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  const results: BrowserEvaluationStepResult[] = [];
  let failure: BrowserEvaluationFailure | null = null;

  try {
    for (const step of plan.steps) {
      if (failure) {
        results.push(createSkippedStepResult(step, failure));
        continue;
      }

      const startedAt = Date.now();

      try {
        if (step.kind === "load") {
          const targetUrl = resolveTargetUrl(plan.target.previewUrl, step.path);
          await page.goto(targetUrl, {
            waitUntil: step.waitUntil ?? "load",
            timeout: step.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
          });

          results.push({
            stepId: step.id,
            label: step.label,
            kind: step.kind,
            status: "passed",
            summary: `Loaded ${targetUrl}.`,
            error: null,
            elapsedMs: Date.now() - startedAt,
          });
          continue;
        }

        if (step.kind === "wait_for_selector") {
          await page.locator(step.selector).waitFor({
            state: step.state ?? "visible",
            timeout: step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
          });

          results.push({
            stepId: step.id,
            label: step.label,
            kind: step.kind,
            status: "passed",
            summary: `Found selector ${step.selector}.`,
            error: null,
            elapsedMs: Date.now() - startedAt,
          });
          continue;
        }

        if (step.kind === "click") {
          await page.locator(step.selector).click({
            timeout: step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
          });

          results.push({
            stepId: step.id,
            label: step.label,
            kind: step.kind,
            status: "passed",
            summary: `Clicked selector ${step.selector}.`,
            error: null,
            elapsedMs: Date.now() - startedAt,
          });
          continue;
        }

        const nextConsoleMessages = consoleMessages.slice(consoleCursor);
        const nextPageErrors = pageErrors.slice(pageErrorCursor);
        consoleCursor = consoleMessages.length;
        pageErrorCursor = pageErrors.length;
        const failOn = new Set(step.failOn ?? ["error"]);
        const relevantConsoleErrors = nextConsoleMessages.filter((message) =>
          failOn.has(message.type)
        );

        if (relevantConsoleErrors.length > 0) {
          throw new BrowserEvaluationStepFailure(
            "console",
            relevantConsoleErrors.map((message) => message.text).join(" | "),
          );
        }

        if ((step.includePageErrors ?? true) && nextPageErrors.length > 0) {
          throw new BrowserEvaluationStepFailure(
            "pageerror",
            nextPageErrors.join(" | "),
          );
        }

        results.push({
          stepId: step.id,
          label: step.label,
          kind: step.kind,
          status: "passed",
          summary: "No new browser console or page errors were detected.",
          error: null,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        failure = {
          stepId: step.id,
          label: step.label,
          kind: error instanceof BrowserEvaluationStepFailure
            ? error.kind
            : "step",
          message: toErrorMessage(error),
        };

        results.push({
          stepId: step.id,
          label: step.label,
          kind: step.kind,
          status: "failed",
          summary: `Step "${step.label}" failed.`,
          error: failure.message,
          elapsedMs: Date.now() - startedAt,
        });

        const artifact = await maybeCaptureFailureArtifact(
          page,
          plan,
          step.id,
          artifacts.length,
          options,
        );

        if (artifact) {
          artifacts.push(artifact);
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    status: failure ? "failed" : "passed",
    summary: failure
      ? `Browser evaluation failed at step "${failure.label ?? failure.stepId ?? "unknown"}": ${failure.message}`
      : `Browser evaluation passed across ${String(results.length)} steps.`,
    previewUrl: plan.target.previewUrl,
    browserEvaluationPlan: plan,
    steps: results,
    consoleMessages,
    pageErrors,
    artifacts,
    failure,
  };
}

function createTargetOnlyReport(
  plan: BrowserEvaluationPlan,
  status: BrowserEvaluationReport["status"],
): BrowserEvaluationReport {
  const failure = status === "failed"
    ? {
        stepId: null,
        label: null,
        kind: "target" as const,
        message: plan.target.reason,
      }
    : null;

  return {
    status,
    summary: plan.target.reason,
    previewUrl: plan.target.previewUrl,
    browserEvaluationPlan: plan,
    steps: plan.steps.map((step) => ({
      stepId: step.id,
      label: step.label,
      kind: step.kind,
      status: "skipped",
      summary: `Skipped because preview is ${plan.target.status.replaceAll("_", " ")}.`,
      error: null,
      elapsedMs: 0,
    })),
    consoleMessages: [],
    pageErrors: [],
    artifacts: [],
    failure,
  };
}

function createInfrastructureFailureReport(
  plan: BrowserEvaluationPlan,
  message: string,
): BrowserEvaluationReport {
  return {
    status: "infrastructure_failed",
    summary: message,
    previewUrl: plan.target.previewUrl,
    browserEvaluationPlan: plan,
    steps: plan.steps.map((step) => ({
      stepId: step.id,
      label: step.label,
      kind: step.kind,
      status: "skipped",
      summary: "Skipped because the browser could not be launched.",
      error: null,
      elapsedMs: 0,
    })),
    consoleMessages: [],
    pageErrors: [],
    artifacts: [],
    failure: {
      stepId: null,
      label: null,
      kind: "infrastructure",
      message,
    },
  };
}

function createSkippedStepResult(
  step: BrowserEvaluationStep,
  failure: BrowserEvaluationFailure,
): BrowserEvaluationStepResult {
  return {
    stepId: step.id,
    label: step.label,
    kind: step.kind,
    status: "skipped",
    summary: `Skipped after "${failure.label ?? failure.stepId ?? "a prior step"}" failed.`,
    error: null,
    elapsedMs: 0,
  };
}

function resolveTargetUrl(previewUrl: string | null, stepPath?: string): string {
  if (!previewUrl) {
    throw new Error("Browser evaluation requires an available preview URL.");
  }

  const resolved = stepPath
    ? new URL(stepPath, previewUrl).toString()
    : previewUrl;

  if (!isLoopbackUrl(resolved)) {
    throw new Error("Browser evaluation may only navigate to loopback URLs.");
  }

  return resolved;
}

function normalizeConsoleMessageType(type: string): BrowserConsoleMessageType {
  switch (type) {
    case "debug":
    case "info":
    case "warning":
    case "error":
      return type;
    default:
      return "log";
  }
}

function toBrowserConsoleMessage(
  message: ConsoleMessage,
): BrowserEvaluationConsoleMessage {
  const location = message.location();
  const parts = [location.url, location.lineNumber, location.columnNumber]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part) => String(part));

  return {
    type: normalizeConsoleMessageType(message.type()),
    text: message.text(),
    location: parts.length > 0 ? parts.join(":") : null,
  };
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "http:"
      && url.protocol !== "https:"
    ) {
      return false;
    }

    return LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedBrowserRequestUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (
      url.protocol === "data:"
      || url.protocol === "about:"
      || url.protocol === "blob:"
    ) {
      return true;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

async function maybeCaptureFailureArtifact(
  page: Page,
  plan: BrowserEvaluationPlan,
  stepId: string,
  artifactIndex: number,
  options: BrowserEvaluatorRunOptions,
): Promise<BrowserEvaluationArtifact | null> {
  if (
    plan.captureArtifacts !== "on-failure"
    || !options.artifactsDirectory
  ) {
    return null;
  }

  await mkdir(options.artifactsDirectory, { recursive: true });
  const fileName = `${String(artifactIndex + 1).padStart(2, "0")}-${sanitizeArtifactName(stepId)}.png`;
  const filePath = path.join(options.artifactsDirectory, fileName);

  await page.screenshot({
    path: filePath,
    fullPage: true,
  });

  return {
    kind: "screenshot",
    stepId,
    path: filePath,
  };
}

function sanitizeArtifactName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "artifact";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const browserEvaluatorAgent = {
  name: "browser-evaluator",
  canWrite: false,
  responsibilities: [
    "Inspect loopback previews through a real browser",
    "Return structured browser-side evidence and failures",
    "Stay read-only and bounded while validating UI-facing work",
  ],
  tools: [],
};
