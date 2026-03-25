import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { DiscoveryReport } from "../artifacts/types.js";
import {
  createUnavailablePreviewCapability,
  formatPreviewCommand,
  resolvePreviewRunner,
} from "../preview/contracts.js";

interface PackageManifest {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const IGNORED_TOP_LEVEL_NAMES = new Set([".git", ".shipyard", ".DS_Store"]);

function createEmptyDiscoveryReport(): DiscoveryReport {
  return {
    isGreenfield: true,
    language: null,
    framework: null,
    packageManager: null,
    scripts: {},
    hasReadme: false,
    hasAgentsMd: false,
    topLevelFiles: [],
    topLevelDirectories: [],
    projectName: null,
    previewCapability: createUnavailablePreviewCapability(
      "Greenfield target; no supported local preview has been detected yet.",
    ),
  };
}

function inferPreviewCapability(
  packageManifest: PackageManifest | null,
  packageManager: string | null,
): DiscoveryReport["previewCapability"] {
  if (packageManifest === null) {
    return createUnavailablePreviewCapability(
      "No package.json was found, so Shipyard cannot infer a supported local preview command.",
    );
  }

  const scripts = packageManifest.scripts ?? {};
  const dependencies = {
    ...(packageManifest.dependencies ?? {}),
    ...(packageManifest.devDependencies ?? {}),
  };

  if (
    typeof scripts.dev === "string" &&
    /\bvite(?:\s|$)/.test(scripts.dev) &&
    "vite" in dependencies
  ) {
    const runner = resolvePreviewRunner(packageManager);

    return {
      status: "available",
      kind: "dev-server",
      runner,
      scriptName: "dev",
      command: formatPreviewCommand(runner, "dev"),
      reason: "Detected a Vite dev script and dependency signal.",
      autoRefresh: "native-hmr",
    };
  }

  return createUnavailablePreviewCapability(
    "No supported local preview signal was detected for this target.",
  );
}

export function normalizeDiscoveryReport(
  report: Partial<DiscoveryReport> | null | undefined,
): DiscoveryReport {
  if (!report) {
    return createEmptyDiscoveryReport();
  }

  return {
    isGreenfield: report.isGreenfield ?? true,
    language: report.language ?? null,
    framework: report.framework ?? null,
    packageManager: report.packageManager ?? null,
    scripts: { ...(report.scripts ?? {}) },
    hasReadme: report.hasReadme ?? false,
    hasAgentsMd: report.hasAgentsMd ?? false,
    topLevelFiles: [...(report.topLevelFiles ?? [])],
    topLevelDirectories: [...(report.topLevelDirectories ?? [])],
    projectName: report.projectName ?? null,
    previewCapability:
      report.previewCapability ??
      createUnavailablePreviewCapability(
        report.isGreenfield
          ? "Greenfield target; no supported local preview has been detected yet."
          : "No supported local preview signal was detected for this target.",
      ),
  };
}

function detectPackageManager(
  topLevelFiles: string[],
  packageManifest: PackageManifest | null,
): string | null {
  const manifestPackageManager = packageManifest?.packageManager?.split("@")[0];

  if (manifestPackageManager) {
    return manifestPackageManager;
  }

  if (topLevelFiles.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (topLevelFiles.includes("yarn.lock")) {
    return "yarn";
  }

  if (topLevelFiles.includes("package-lock.json")) {
    return "npm";
  }

  if (
    topLevelFiles.includes("bun.lock") ||
    topLevelFiles.includes("bun.lockb")
  ) {
    return "bun";
  }

  if (topLevelFiles.includes("poetry.lock")) {
    return "poetry";
  }

  if (topLevelFiles.includes("Pipfile")) {
    return "pipenv";
  }

  if (
    topLevelFiles.includes("pyproject.toml") ||
    topLevelFiles.includes("requirements.txt")
  ) {
    return "pip";
  }

  if (topLevelFiles.includes("go.mod")) {
    return "go modules";
  }

  return null;
}

function detectLanguage(
  topLevelFiles: string[],
  packageManifest: PackageManifest | null,
): string | null {
  if (
    topLevelFiles.includes("pyproject.toml") ||
    topLevelFiles.includes("requirements.txt") ||
    topLevelFiles.includes("Pipfile")
  ) {
    return "python";
  }

  if (topLevelFiles.includes("go.mod")) {
    return "go";
  }

  if (topLevelFiles.includes("tsconfig.json")) {
    return "typescript";
  }

  if (
    packageManifest !== null ||
    topLevelFiles.some((filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath))
  ) {
    if (topLevelFiles.some((filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath))) {
      return "typescript";
    }

    if (topLevelFiles.some((filePath) => /\.(js|jsx|mjs|cjs)$/.test(filePath))) {
      return "javascript";
    }

    return "javascript";
  }

  return null;
}

function detectFramework(packageManifest: PackageManifest | null): string | null {
  const dependencies = {
    ...(packageManifest?.dependencies ?? {}),
    ...(packageManifest?.devDependencies ?? {}),
  };

  if ("next" in dependencies) {
    return "Next.js";
  }

  if ("nuxt" in dependencies || "nuxt3" in dependencies) {
    return "Nuxt";
  }

  if ("@angular/core" in dependencies) {
    return "Angular";
  }

  if ("vue" in dependencies) {
    return "Vue";
  }

  if ("react" in dependencies) {
    return "React";
  }

  if ("fastify" in dependencies) {
    return "Fastify";
  }

  if ("hono" in dependencies) {
    return "Hono";
  }

  if ("express" in dependencies) {
    return "Express";
  }

  return null;
}

function detectHasReadme(topLevelFiles: string[]): boolean {
  return topLevelFiles.some((filePath) => filePath.toLowerCase().startsWith("readme"));
}

async function readPackageManifest(
  targetPath: string,
  topLevelFiles: string[],
): Promise<PackageManifest | null> {
  if (!topLevelFiles.includes("package.json")) {
    return null;
  }

  const packageJsonPath = path.join(targetPath, "package.json");
  const packageJsonContents = await readFile(packageJsonPath, "utf8");

  return JSON.parse(packageJsonContents) as PackageManifest;
}

export function formatDiscoverySummary(report: DiscoveryReport): string {
  if (report.isGreenfield) {
    return "greenfield target";
  }

  const parts = [
    report.language ?? "unknown language",
    report.framework ? `(${report.framework})` : null,
    report.packageManager ? `via ${report.packageManager}` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

export async function discoverTarget(
  targetPath: string,
): Promise<DiscoveryReport> {
  const entries = await readdir(targetPath, { withFileTypes: true });
  const relevantEntries = entries.filter(
    (entry) => !IGNORED_TOP_LEVEL_NAMES.has(entry.name),
  );

  const topLevelFiles = relevantEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const topLevelDirectories = relevantEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (topLevelFiles.length === 0 && topLevelDirectories.length === 0) {
    return createEmptyDiscoveryReport();
  }

  const packageManifest = await readPackageManifest(targetPath, topLevelFiles);
  const packageManager = detectPackageManager(topLevelFiles, packageManifest);

  return normalizeDiscoveryReport({
    isGreenfield: false,
    language: detectLanguage(topLevelFiles, packageManifest),
    framework: detectFramework(packageManifest),
    packageManager,
    scripts: { ...(packageManifest?.scripts ?? {}) },
    hasReadme: detectHasReadme(topLevelFiles),
    hasAgentsMd: topLevelFiles.includes("AGENTS.md"),
    topLevelFiles,
    topLevelDirectories,
    projectName: packageManifest?.name ?? null,
    previewCapability: inferPreviewCapability(packageManifest, packageManager),
  });
}
