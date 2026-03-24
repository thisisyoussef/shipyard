export interface LangSmithConfig {
  enabled: boolean;
  project: string | null;
  endpoint: string | null;
}

export function getLangSmithConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangSmithConfig {
  const project = env.LANGSMITH_PROJECT ?? null;
  const endpoint = env.LANGSMITH_ENDPOINT ?? null;
  const hasApiKey = Boolean(env.LANGSMITH_API_KEY);

  return {
    enabled: hasApiKey && project !== null,
    project,
    endpoint,
  };
}
