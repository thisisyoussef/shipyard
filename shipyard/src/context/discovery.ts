import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface DiscoveryReport {
  targetPath: string;
  isEmpty: boolean;
  isGreenfield: boolean;
  packageJsonExists: boolean;
  primaryLanguage: string | null;
  packageManager: string | null;
  scripts: string[];
  hasReadme: boolean;
  readmePath: string | null;
  hasAgents: boolean;
  agentsPath: string | null;
  summary: string;
}

interface PackageManifest {
  packageManager?: string;
  scripts?: Record<string, string>;
}

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkDirectory(
  rootPath: string,
  currentPath = rootPath,
  collected: string[] = [],
): Promise<string[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath);

    collected.push(relativePath);

    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
      await walkDirectory(rootPath, absolutePath, collected);
    }
  }

  return collected;
}

function detectPackageManager(
  packageManifest: PackageManifest | null,
  discoveredFiles: string[],
): string | null {
  const packageManager = packageManifest?.packageManager?.split("@")[0];

  if (packageManager) {
    return packageManager;
  }

  if (discoveredFiles.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (discoveredFiles.includes("package-lock.json")) {
    return "npm";
  }

  if (discoveredFiles.includes("yarn.lock")) {
    return "yarn";
  }

  if (
    discoveredFiles.includes("bun.lock") ||
    discoveredFiles.includes("bun.lockb")
  ) {
    return "bun";
  }

  return null;
}

function detectPrimaryLanguage(discoveredFiles: string[]): string | null {
  const hasFile = (predicate: (filePath: string) => boolean): boolean =>
    discoveredFiles.some(predicate);

  if (
    hasFile((filePath) => /\.(ts|tsx)$/.test(filePath)) ||
    discoveredFiles.includes("tsconfig.json")
  ) {
    return "typescript";
  }

  if (hasFile((filePath) => /\.(js|jsx|mjs|cjs)$/.test(filePath))) {
    return "javascript";
  }

  if (
    hasFile((filePath) => filePath.endsWith(".dart")) ||
    discoveredFiles.includes("pubspec.yaml")
  ) {
    return "dart";
  }

  if (
    hasFile((filePath) => filePath.endsWith(".py")) ||
    discoveredFiles.includes("requirements.txt") ||
    discoveredFiles.includes("pyproject.toml")
  ) {
    return "python";
  }

  if (
    hasFile((filePath) => filePath.endsWith(".java")) ||
    discoveredFiles.includes("pom.xml") ||
    discoveredFiles.includes("build.gradle")
  ) {
    return "java";
  }

  if (
    hasFile((filePath) => filePath.endsWith(".go")) ||
    discoveredFiles.includes("go.mod")
  ) {
    return "go";
  }

  return null;
}

function buildSummary(report: Omit<DiscoveryReport, "summary">): string {
  if (report.isGreenfield) {
    return "greenfield project";
  }

  const parts = [
    report.primaryLanguage ?? "unknown language",
    "project",
    report.packageManager ? `using ${report.packageManager}` : null,
    report.packageJsonExists ? "with package.json" : "without package.json",
  ].filter(Boolean);

  return parts.join(" ");
}

export async function discoverTarget(
  targetPath: string,
): Promise<DiscoveryReport> {
  const discoveredFiles = await walkDirectory(targetPath);
  const isEmpty = discoveredFiles.length === 0;

  if (isEmpty) {
    const reportWithoutSummary: Omit<DiscoveryReport, "summary"> = {
      targetPath,
      isEmpty: true,
      isGreenfield: true,
      packageJsonExists: false,
      primaryLanguage: null,
      packageManager: null,
      scripts: [],
      hasReadme: false,
      readmePath: null,
      hasAgents: false,
      agentsPath: null,
    };

    return {
      ...reportWithoutSummary,
      summary: buildSummary(reportWithoutSummary),
    };
  }

  const packageJsonPath = path.join(targetPath, "package.json");
  const packageJsonExists = await pathExists(packageJsonPath);
  const packageManifest = packageJsonExists
    ? ((JSON.parse(
        await readFile(packageJsonPath, "utf8"),
      ) as PackageManifest) ?? null)
    : null;

  const readmePath =
    discoveredFiles.find((filePath) => /^README(\..+)?$/i.test(filePath)) ??
    null;
  const agentsPath =
    discoveredFiles.find((filePath) => /^AGENTS\.md$/i.test(filePath)) ?? null;

  const reportWithoutSummary: Omit<DiscoveryReport, "summary"> = {
    targetPath,
    isEmpty: false,
    isGreenfield: false,
    packageJsonExists,
    primaryLanguage: detectPrimaryLanguage(discoveredFiles),
    packageManager: detectPackageManager(packageManifest, discoveredFiles),
    scripts: Object.keys(packageManifest?.scripts ?? {}),
    hasReadme: readmePath !== null,
    readmePath,
    hasAgents: agentsPath !== null,
    agentsPath,
  };

  return {
    ...reportWithoutSummary,
    summary: buildSummary(reportWithoutSummary),
  };
}
