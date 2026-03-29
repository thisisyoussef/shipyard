export type DashboardScaffoldType =
  | "react-ts"
  | "express-ts"
  | "python"
  | "go"
  | "empty";

export interface DashboardLaunchRequest {
  type: "target:create_request";
  requestId: string;
  name: string;
  description: string;
  scaffoldType: DashboardScaffoldType;
}

export interface DashboardLaunchIntent {
  kind: "hero-create" | "manual-create";
  requestId: string;
  createdName: string;
  promptDraft: string | null;
  scaffoldType: DashboardScaffoldType;
  startedAt: string;
  request: DashboardLaunchRequest;
}

interface DashboardHeroLaunchOptions {
  now?: string | Date;
  requestId?: string;
  scaffoldType?: DashboardScaffoldType;
}

interface DashboardLaunchCompletion {
  requestId?: string | null;
  success?: boolean;
}

const DASHBOARD_NAME_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "build",
  "create",
  "for",
  "it",
  "make",
  "of",
  "project",
  "the",
  "to",
  "tool",
  "with",
]);

function resolveLaunchTimestamp(now?: string | Date): string {
  if (typeof now === "string" && now.trim().length > 0) {
    return now;
  }

  if (now instanceof Date) {
    return now.toISOString();
  }

  return new Date().toISOString();
}

function capitalizeWord(word: string): string {
  if (!word) {
    return word;
  }

  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

function createDashboardRequestId(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && "randomUUID" in cryptoApi) {
    return `dashboard-${cryptoApi.randomUUID()}`;
  }

  return `dashboard-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function deriveDashboardTargetName(prompt: string): string {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const meaningfulTokens = tokens.filter(
    (token) => !DASHBOARD_NAME_STOP_WORDS.has(token),
  );

  if (meaningfulTokens.length === 0) {
    return "Workspace";
  }

  return meaningfulTokens
    .slice(0, 4)
    .map(capitalizeWord)
    .join(" ");
}

export function createDashboardHeroLaunch(
  prompt: string,
  options: DashboardHeroLaunchOptions = {},
): DashboardLaunchIntent {
  const requestId = options.requestId ?? createDashboardRequestId();
  const scaffoldType = options.scaffoldType ?? "react-ts";
  const createdName = deriveDashboardTargetName(prompt);
  const startedAt = resolveLaunchTimestamp(options.now);

  return {
    kind: "hero-create",
    requestId,
    createdName,
    promptDraft: prompt,
    scaffoldType,
    startedAt,
    request: {
      type: "target:create_request",
      requestId,
      name: createdName,
      description: prompt,
      scaffoldType,
    },
  };
}

export function createDashboardManualLaunch(
  input: {
    name: string;
    description: string;
    scaffoldType: DashboardScaffoldType;
  },
  options: DashboardHeroLaunchOptions = {},
): DashboardLaunchIntent {
  const requestId = options.requestId ?? createDashboardRequestId();
  const startedAt = resolveLaunchTimestamp(options.now);

  return {
    kind: "manual-create",
    requestId,
    createdName: input.name,
    promptDraft: null,
    scaffoldType: input.scaffoldType,
    startedAt,
    request: {
      type: "target:create_request",
      requestId,
      name: input.name,
      description: input.description,
      scaffoldType: input.scaffoldType,
    },
  };
}

export function matchesDashboardLaunchCompletion(
  intent: DashboardLaunchIntent,
  completion: DashboardLaunchCompletion,
): boolean {
  return completion.requestId === intent.requestId;
}
