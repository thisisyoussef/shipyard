import { setTimeout as delay } from "node:timers/promises";

import type { RunnableConfig } from "@langchain/core/runnables";
import { Client } from "langsmith";
import { getLangchainCallbacks } from "langsmith/langchain";
import { traceable } from "langsmith/traceable";

export interface LangSmithConfig {
  enabled: boolean;
  project: string | null;
  endpoint: string | null;
  apiKey: string | null;
  workspaceId: string | null;
}

export interface LangSmithTraceReference {
  projectName: string | null;
  runId: string | null;
  traceUrl: string | null;
  projectUrl: string | null;
}

export interface RunWithLangSmithTraceOptions<
  Args extends unknown[],
  Result,
> {
  name: string;
  runType?: string;
  projectName?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  client?: Client;
  env?: NodeJS.ProcessEnv;
  fn: (...args: Args) => Promise<Result> | Result;
  args: Args;
}

export interface RunWithLangSmithTraceResult<Result> {
  result: Result;
  trace: LangSmithTraceReference | null;
}

// LangSmith can acknowledge a finished run before the run URL endpoint is ready.
// Give the trace lookup a few extra seconds before surfacing a false-negative 404.
const TRACE_LOOKUP_ATTEMPTS = 6;
const TRACE_LOOKUP_DELAY_MS = 1_000;

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isTracingEnabled(env: NodeJS.ProcessEnv): boolean {
  return (
    env.LANGCHAIN_TRACING_V2 === "true" ||
    env.LANGCHAIN_TRACING_V2 === "1" ||
    env.LANGSMITH_TRACING === "true" ||
    env.LANGSMITH_TRACING === "1"
  );
}

export function getLangSmithConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangSmithConfig {
  const project = normalizeEnvValue(
    env.LANGCHAIN_PROJECT ?? env.LANGSMITH_PROJECT,
  );
  const endpoint = normalizeEnvValue(
    env.LANGCHAIN_ENDPOINT ?? env.LANGSMITH_ENDPOINT,
  );
  const apiKey = normalizeEnvValue(
    env.LANGCHAIN_API_KEY ?? env.LANGSMITH_API_KEY,
  );
  const workspaceId = normalizeEnvValue(
    env.LANGCHAIN_WORKSPACE_ID ?? env.LANGSMITH_WORKSPACE_ID,
  );

  return {
    enabled: isTracingEnabled(env) && apiKey !== null && project !== null,
    project,
    endpoint,
    apiKey,
    workspaceId,
  };
}

export function createLangSmithClient(
  env: NodeJS.ProcessEnv = process.env,
): Client {
  const config = getLangSmithConfig(env);

  return new Client({
    apiKey: config.apiKey ?? undefined,
    apiUrl: config.endpoint ?? undefined,
    workspaceId: config.workspaceId ?? undefined,
  });
}

export function ensureLangSmithTracingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): LangSmithConfig {
  const config = getLangSmithConfig(env);

  if (!config.enabled) {
    throw new Error(
      [
        "LangSmith tracing is not fully configured.",
        "Set LANGCHAIN_TRACING_V2=true, LANGCHAIN_API_KEY, and LANGCHAIN_PROJECT before running live verification.",
      ].join(" "),
    );
  }

  return config;
}

export async function getLangSmithCallbacksForCurrentTrace(): Promise<
  RunnableConfig["callbacks"] | undefined
> {
  return getLangchainCallbacks();
}

export async function resolveLangSmithTraceReference(
  client: Client,
  projectName: string | null,
  runId: string | null,
): Promise<LangSmithTraceReference | null> {
  if (!runId) {
    return null;
  }

  let traceUrl: string | null = null;
  let projectUrl: string | null = null;

  for (let attempt = 1; attempt <= TRACE_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      traceUrl = await client.getRunUrl({ runId });

      if (projectName) {
        projectUrl = await client.getProjectUrl({
          projectName,
        });
      }

      return {
        projectName,
        runId,
        traceUrl,
        projectUrl,
      };
    } catch (error) {
      if (attempt === TRACE_LOOKUP_ATTEMPTS) {
        throw error;
      }

      await delay(TRACE_LOOKUP_DELAY_MS);
    }
  }

  return null;
}

export async function runWithLangSmithTrace<
  Args extends unknown[],
  Result,
>(
  options: RunWithLangSmithTraceOptions<Args, Result>,
): Promise<RunWithLangSmithTraceResult<Result>> {
  const config = getLangSmithConfig(options.env);

  if (!config.enabled) {
    return {
      result: await options.fn(...options.args),
      trace: null,
    };
  }

  const client = options.client ?? createLangSmithClient(options.env);
  const projectName = options.projectName ?? config.project;
  let runId: string | null = null;
  const tracedFunction = traceable(options.fn, {
    name: options.name,
    run_type: options.runType ?? "chain",
    project_name: projectName ?? undefined,
    tags: options.tags,
    metadata: options.metadata,
    client,
    on_end(runTree) {
      runId = runTree.id;
    },
  }) as (...args: Args) => Promise<Result>;
  const result = await tracedFunction(...options.args);

  await client.awaitPendingTraceBatches();

  return {
    result,
    trace: await resolveLangSmithTraceReference(client, projectName, runId),
  };
}
