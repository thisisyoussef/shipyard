import { execFileSync } from "node:child_process";

export const RUNTIME_SECRET_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LANGSMITH_API_KEY",
  "LANGCHAIN_API_KEY",
  "LANGCHAIN_PROJECT",
  "LANGCHAIN_TRACING_V2",
] as const;

function safeExecFile(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function findEnvironmentValue(
  name: string,
  envFallback: Record<string, string>,
): string | null {
  const directValue = process.env[name]?.trim();
  if (directValue) {
    return directValue;
  }

  const fallbackValue = envFallback[name]?.trim();
  if (fallbackValue) {
    return fallbackValue;
  }

  const processList = safeExecFile("ps", ["eww", "-A"]);
  if (!processList) {
    return null;
  }

  const match = processList.match(new RegExp(`${name}=([^\\s]+)`));
  return match?.[1] ?? null;
}

export function collectRecoveredRuntimeEnv(
  envFallback: Record<string, string> = {},
): Record<string, string> {
  const recoveredEntries = RUNTIME_SECRET_NAMES.flatMap((name) => {
    const value = findEnvironmentValue(name, envFallback);
    return value ? [[name, value] as const] : [];
  });

  return Object.fromEntries(recoveredEntries);
}

export function summarizeRecoveredRuntimeEnv(
  env: Record<string, string>,
): string {
  return (
    `openai=${env.OPENAI_API_KEY ? "yes" : "no"} ` +
    `anthropic=${env.ANTHROPIC_API_KEY ? "yes" : "no"} ` +
    `langsmith=${env.LANGSMITH_API_KEY ? "yes" : "no"}`
  );
}
