export interface LangSmithConfig {
  enabled: boolean;
  project: string | null;
  endpoint: string | null;
}

export function getLangSmithConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangSmithConfig {
  const project =
    env.LANGCHAIN_PROJECT ?? env.LANGSMITH_PROJECT ?? null;
  const endpoint =
    env.LANGCHAIN_ENDPOINT ?? env.LANGSMITH_ENDPOINT ?? null;
  const hasApiKey = Boolean(
    env.LANGCHAIN_API_KEY ?? env.LANGSMITH_API_KEY,
  );
  const tracingEnabled =
    env.LANGCHAIN_TRACING_V2 === "true" ||
    env.LANGCHAIN_TRACING_V2 === "1";

  return {
    enabled: tracingEnabled && hasApiKey && project !== null,
    project,
    endpoint,
  };
}
