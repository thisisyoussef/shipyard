import { access, readFile } from "node:fs/promises";

function stripMatchingQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value.at(-1);

  if ((first === "\"" || first === "'") && last === first) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      continue;
    }

    const rawValue = normalized.slice(separatorIndex + 1).trim();
    const withoutComment =
      rawValue.startsWith("\"") || rawValue.startsWith("'")
        ? rawValue
        : rawValue.replace(/\s+#.*$/u, "").trim();
    env[key] = stripMatchingQuotes(withoutComment);
  }

  return env;
}

export interface LoadedEnvironmentFiles {
  env: Record<string, string>;
  loadedFiles: string[];
  missingFiles: string[];
}

export async function loadEnvironmentFiles(
  envFiles: string[],
): Promise<LoadedEnvironmentFiles> {
  const env: Record<string, string> = {};
  const loadedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const envFile of envFiles) {
    try {
      await access(envFile);
    } catch {
      missingFiles.push(envFile);
      continue;
    }

    const payload = await readFile(envFile, "utf8");
    Object.assign(env, parseEnvFile(payload));
    loadedFiles.push(envFile);
  }

  return {
    env,
    loadedFiles,
    missingFiles,
  };
}

export function formatEnvFile(entries: Record<string, string>): string {
  const lines = Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const escaped = value
        .replace(/\\/gu, "\\\\")
        .replace(/\n/gu, "\\n")
        .replace(/"/gu, "\\\"");
      return `${key}="${escaped}"`;
    });

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
