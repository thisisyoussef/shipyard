import type { Dirent } from "node:fs";
import { access, cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolInputSchema,
  type ToolResult,
} from "./registry.js";
import {
  executeProcess,
  type ExecuteProcessInput,
  type RunCommandResult,
} from "./run-command.js";
import { ToolError } from "./read-file.js";

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1_000;
const TOOL_NAME = "deploy_target";
const MAX_PACKAGE_JSON_SCAN_DEPTH = 3;
const DEPLOY_COPY_EXCLUSIONS = new Set([
  ".git",
  ".shipyard",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  ".vercel",
]);

export interface DeployInput {
  platform: "vercel";
}

export interface DeployResultData {
  platform: "vercel";
  productionUrl: string;
  command: string;
  logExcerpt: string;
  exitCode: number | null;
  timedOut: boolean;
}

interface DeployDependencies {
  env?: NodeJS.ProcessEnv;
  executeProcess?: (
    input: ExecuteProcessInput,
  ) => Promise<RunCommandResult>;
  fetchDeploymentMetadata?: (
    deploymentUrl: string,
    token: string,
    signal?: AbortSignal,
  ) => Promise<VercelDeploymentMetadata | null>;
  vercelBinaryPath?: string;
}

interface VercelDeploymentMetadata {
  alias?: string[];
  aliasFinal?: string | null;
  automaticAliases?: string[];
  userAliases?: string[];
  customEnvironment?: {
    currentDeploymentAliases?: string[];
  } | null;
}

const deployInputSchema = {
  type: "object",
  properties: {
    platform: {
      type: "string",
      enum: ["vercel"],
      description: "Deployment provider. The first supported platform is vercel.",
    },
  },
  required: ["platform"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function readVercelToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const token = env.VERCEL_TOKEN?.trim();
  return token ? token : null;
}

function redactDeploySecrets(value: string, token: string | null): string {
  if (!token) {
    return value;
  }

  return value.split(token).join("[redacted]");
}

function sanitizeCandidateUrl(
  rawUrl: string,
  options: {
    allowHostnames?: boolean;
  } = {},
): string | null {
  const trimmedUrl = rawUrl.trim().replace(/[),.;]+$/u, "");
  const normalizedUrl = options.allowHostnames &&
      !/^[a-z]+:\/\//iu.test(trimmedUrl)
    ? `https://${trimmedUrl}`
    : trimmedUrl;

  try {
    const parsed = new URL(normalizedUrl);

    if (parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
      return parsed.origin;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function extractUrls(output: string): string[] {
  return [...output.matchAll(/https:\/\/[^\s"'`]+/gu)]
    .map((match) => sanitizeCandidateUrl(match[0]))
    .filter((candidateUrl): candidateUrl is string => candidateUrl !== null);
}

function isVercelAppUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function parseVercelDeploymentUrl(output: string): string | null {
  const candidates = extractUrls(output);

  if (candidates.length === 0) {
    return null;
  }

  const vercelCandidates = candidates.filter((candidate) =>
    isVercelAppUrl(candidate),
  );

  return vercelCandidates.at(-1) ?? candidates.at(-1) ?? null;
}

function parseLabeledVercelProductionUrl(output: string): string | null {
  const match = output.match(
    /\bProduction(?:\s+URL)?\s*:\s*(https:\/\/[^\s"'`]+)/iu,
  );

  if (!match) {
    return null;
  }

  const rawUrl = match[1];

  if (!rawUrl) {
    return null;
  }

  return sanitizeCandidateUrl(rawUrl);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseVercelDeploymentMetadata(
  value: unknown,
): VercelDeploymentMetadata | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const customEnvironment =
    typeof record.customEnvironment === "object" &&
      record.customEnvironment !== null
    ? (record.customEnvironment as Record<string, unknown>)
    : null;

  return {
    alias: isStringArray(record.alias) ? record.alias : undefined,
    aliasFinal:
      typeof record.aliasFinal === "string" ? record.aliasFinal : undefined,
    automaticAliases: isStringArray(record.automaticAliases)
      ? record.automaticAliases
      : undefined,
    userAliases: isStringArray(record.userAliases)
      ? record.userAliases
      : undefined,
    customEnvironment: customEnvironment
      ? {
          currentDeploymentAliases: isStringArray(
            customEnvironment.currentDeploymentAliases,
          )
            ? customEnvironment.currentDeploymentAliases
            : undefined,
        }
      : undefined,
  };
}

function dedupeUrls(candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    ordered.push(candidate);
  }

  return ordered;
}

function prioritizeAliasCandidates(candidates: string[]): string[] {
  const customDomains: string[] = [];
  const vercelDomains: string[] = [];

  for (const candidate of candidates) {
    if (isVercelAppUrl(candidate)) {
      vercelDomains.push(candidate);
      continue;
    }

    customDomains.push(candidate);
  }

  return [...customDomains, ...vercelDomains];
}

function normalizeAliasCandidates(candidates: string[] | undefined): string[] {
  if (!candidates) {
    return [];
  }

  return candidates
    .map((candidate) =>
      sanitizeCandidateUrl(candidate, {
        allowHostnames: true,
      }),
    )
    .filter((candidate): candidate is string => candidate !== null);
}

function collectShareableAliasUrls(
  metadata: VercelDeploymentMetadata,
): string[] {
  const aliasFinal = metadata.aliasFinal
    ? sanitizeCandidateUrl(metadata.aliasFinal, {
        allowHostnames: true,
      })
    : null;
  const customEnvironmentAliases = prioritizeAliasCandidates(
    normalizeAliasCandidates(metadata.customEnvironment?.currentDeploymentAliases),
  );
  const automaticAliases = prioritizeAliasCandidates(
    normalizeAliasCandidates(metadata.automaticAliases),
  );
  const assignedAliases = prioritizeAliasCandidates(
    normalizeAliasCandidates(metadata.alias),
  );
  const userAliases = prioritizeAliasCandidates(
    normalizeAliasCandidates(metadata.userAliases),
  );

  return dedupeUrls([
    aliasFinal,
    ...customEnvironmentAliases,
    ...automaticAliases,
    ...assignedAliases,
    ...userAliases,
  ]);
}

async function fetchVercelDeploymentMetadata(
  deploymentUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<VercelDeploymentMetadata | null> {
  let hostname: string;

  try {
    hostname = new URL(deploymentUrl).hostname;
  } catch {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: signal ?? AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      return null;
    }

    return parseVercelDeploymentMetadata(await response.json());
  } catch {
    return null;
  }
}

async function resolveShareableVercelUrl(
  deploymentUrl: string,
  token: string,
  signal: AbortSignal | undefined,
  dependencies: DeployDependencies,
  loggedProductionUrl: string | null,
): Promise<string> {
  const fetchMetadata =
    dependencies.fetchDeploymentMetadata ?? fetchVercelDeploymentMetadata;

  let metadataCandidates: string[] = [];

  try {
    const metadata = await fetchMetadata(deploymentUrl, token, signal);
    if (metadata) {
      metadataCandidates = collectShareableAliasUrls(metadata);
    }
  } catch {
    metadataCandidates = [];
  }

  return (
    dedupeUrls([
      ...metadataCandidates,
      loggedProductionUrl,
      deploymentUrl,
    ])[0] ?? deploymentUrl
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveVercelBinaryPath(
  overridePath: string | undefined,
): Promise<string> {
  if (overridePath?.trim()) {
    return overridePath.trim();
  }

  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const localBinary = path.join(
    packageRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vercel.cmd" : "vercel",
  );

  if (await fileExists(localBinary)) {
    return localBinary;
  }

  return "vercel";
}

function createDisplayCommand(): string {
  return "vercel deploy --prod --yes --token [redacted]";
}

function formatDeploySuccess(data: DeployResultData): string {
  return [
    `Platform: ${data.platform}`,
    `Production URL: ${data.productionUrl}`,
    `Command: ${data.command}`,
  ].join("\n");
}

function formatDeployFailure(options: {
  platform: string;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  logExcerpt: string;
}): string {
  const lines = [
    `Platform: ${options.platform}`,
    `Command: ${options.command}`,
    options.timedOut
      ? `Timed out after ${String(Math.floor(DEPLOY_TIMEOUT_MS / 1_000))} seconds.`
      : `Exit code: ${String(options.exitCode)}`,
  ];

  if (options.logExcerpt.trim()) {
    lines.push("", options.logExcerpt.trim());
  }

  return lines.join("\n");
}

function isErrnoError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function collectPackageJsonCandidates(
  root: string,
  depth: number,
  results: string[],
): Promise<void> {
  if (depth < 0) {
    return;
  }

  let entries: Dirent[] = [];

  try {
    entries = await readdir(root, {
      withFileTypes: true,
      encoding: "utf8",
    }) as Dirent[];
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryName = String(entry.name);

    if (entry.isFile() && entryName === "package.json") {
      results.push(root);
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    if (DEPLOY_COPY_EXCLUSIONS.has(entryName)) {
      continue;
    }

    await collectPackageJsonCandidates(
      path.join(root, entryName),
      depth - 1,
      results,
    );
  }
}

function scorePackageJsonCandidate(candidate: string): number {
  const normalized = candidate.replace(/\\/gu, "/");

  if (normalized.endsWith("/apps/web")) {
    return 5;
  }
  if (normalized.endsWith("/app")) {
    return 4;
  }
  if (normalized.endsWith("/web")) {
    return 4;
  }
  if (normalized.endsWith("/frontend")) {
    return 3;
  }
  if (normalized.endsWith("/client")) {
    return 3;
  }
  if (normalized.endsWith("/site")) {
    return 2;
  }

  return 1;
}

function pickBestCandidate(candidates: string[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates.map((candidate) => ({
    candidate,
    score: scorePackageJsonCandidate(candidate),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.candidate.length - b.candidate.length;
  });

  const [top, second] = scored;

  if (!top) {
    return null;
  }

  if (second && second.score === top.score && second.candidate.length === top.candidate.length) {
    return null;
  }

  return top.candidate;
}

async function stageDeployDirectory(
  source: string,
): Promise<{ deployDirectory: string; cleanup: () => Promise<void> }> {
  const stagingRoot = await mkdtemp(
    path.join(tmpdir(), "shipyard-vercel-deploy-"),
  );
  await cp(source, stagingRoot, {
    recursive: true,
    filter: (entryPath) => {
      const relative = path.relative(source, entryPath);
      const firstSegment = relative.split(path.sep)[0] ?? relative;

      if (!firstSegment) {
        return true;
      }

      return !DEPLOY_COPY_EXCLUSIONS.has(firstSegment);
    },
  });

  const packageJsonPath = path.join(stagingRoot, "package.json");

  if (!(await pathExists(packageJsonPath))) {
    await writeFile(
      packageJsonPath,
      JSON.stringify(
        {
          name: "shipyard-deploy",
          private: true,
          scripts: {
            build: "echo \"No build step\"",
          },
        },
        null,
        2,
      ),
    );
  }

  return {
    deployDirectory: stagingRoot,
    cleanup: async () => {
      await rm(stagingRoot, { recursive: true, force: true });
    },
  };
}

async function resolveDeployDirectory(
  targetDirectory: string,
): Promise<{ deployDirectory: string; cleanup?: () => Promise<void> }> {
  const rootPackagePath = path.join(targetDirectory, "package.json");

  if (await pathExists(rootPackagePath)) {
    return {
      deployDirectory: targetDirectory,
    };
  }

  const candidates: string[] = [];
  await collectPackageJsonCandidates(
    targetDirectory,
    MAX_PACKAGE_JSON_SCAN_DEPTH,
    candidates,
  );

  const bestCandidate = pickBestCandidate(candidates);

  if (bestCandidate) {
    return {
      deployDirectory: bestCandidate,
    };
  }

  return await stageDeployDirectory(targetDirectory);
}

export async function deployTargetTool(
  input: DeployInput,
  targetDirectory: string,
  context?: ToolExecutionContext,
  dependencies: DeployDependencies = {},
): Promise<ToolResult> {
  if (input.platform !== "vercel") {
    return createToolErrorResult(
      new ToolError(
        `Unsupported deploy platform: ${input.platform}. Supported platforms: vercel.`,
      ),
    );
  }

  const env = dependencies.env ?? process.env;
  const token = readVercelToken(env);

  if (token === null) {
    return createToolErrorResult(
      new ToolError("VERCEL_TOKEN is required to deploy to Vercel."),
    );
  }

  const binaryPath = await resolveVercelBinaryPath(dependencies.vercelBinaryPath);
  const displayCommand = createDisplayCommand();
  const runProcess = dependencies.executeProcess ?? executeProcess;
  const resolvedDeployDirectory = await resolveDeployDirectory(targetDirectory);

  try {
    const result = await runProcess({
      cwd: resolvedDeployDirectory.deployDirectory,
      command: binaryPath,
      args: ["deploy", "--prod", "--yes", "--token", token],
      timeoutMs: DEPLOY_TIMEOUT_MS,
      signal: context?.signal,
      displayCommand,
    });
    const redactedLogExcerpt = redactDeploySecrets(result.combinedOutput, token);
    const deploymentUrl = parseVercelDeploymentUrl(
      result.stdout.trim() || redactedLogExcerpt,
    );
    const loggedProductionUrl = parseLabeledVercelProductionUrl(
      redactedLogExcerpt,
    );
    const productionUrl = deploymentUrl
      ? await resolveShareableVercelUrl(
          deploymentUrl,
          token,
          context?.signal,
          dependencies,
          loggedProductionUrl,
        )
      : null;

    if (result.timedOut || result.exitCode !== 0 || productionUrl === null) {
      const failureReason = productionUrl === null && result.exitCode === 0 && !result.timedOut
        ? `${redactedLogExcerpt}\n\nShipyard could not parse a production URL from the Vercel CLI output.`
        : redactedLogExcerpt;

      return {
        success: false,
        output: "",
        error: formatDeployFailure({
          platform: "vercel",
          command: displayCommand,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          logExcerpt: failureReason,
        }),
        data: {
          platform: "vercel",
          productionUrl: productionUrl ?? "",
          command: displayCommand,
          logExcerpt: redactedLogExcerpt,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        } satisfies DeployResultData,
      };
    }

    const data = {
      platform: "vercel",
      productionUrl,
      command: displayCommand,
      logExcerpt: redactedLogExcerpt,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    } satisfies DeployResultData;

    return createToolSuccessResult(formatDeploySuccess(data), data);
  } catch (error) {
    if (isErrnoError(error) && error.code === "ENOENT") {
      return createToolErrorResult(
        new ToolError(
          "Vercel CLI is unavailable. Reinstall Shipyard dependencies or ensure the bundled Vercel binary is present.",
        ),
      );
    }

    const message = error instanceof Error
      ? redactDeploySecrets(error.message, token)
      : "Vercel deploy failed.";

    return createToolErrorResult(new ToolError(message));
  } finally {
    if (resolvedDeployDirectory.cleanup) {
      await resolvedDeployDirectory.cleanup();
    }
  }
}

export const deployTargetDefinition: ToolDefinition<DeployInput> = {
  name: TOOL_NAME,
  description:
    "Deploy the current target to a supported production platform. The first supported platform is Vercel.",
  inputSchema: deployInputSchema,
  async execute(input, targetDirectory, context) {
    return await deployTargetTool(input, targetDirectory, context);
  },
};

registerTool(deployTargetDefinition);
