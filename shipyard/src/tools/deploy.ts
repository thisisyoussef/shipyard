import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
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
import { deriveTargetNameFromPath } from "./target-manager/scaffold-materializer.js";

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1_000;
const TOOL_NAME = "deploy_target";
const VERCEL_API_TIMEOUT_MS = 10_000;
const VERCEL_PROJECT_LINK_DIRECTORY = ".vercel";
const VERCEL_PROJECT_LINK_FILENAME = "project.json";
const VERCEL_PROJECT_LINK_IGNORE_PATTERN = ".vercel";
const DEFAULT_PUBLIC_DEPLOYS_ENABLED = true;
const PUBLIC_DEPLOY_OVERRIDE_HINT =
  "Set SHIPYARD_VERCEL_PUBLIC_DEPLOYS=0 to preserve the existing Vercel Authentication settings.";

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
  fetchImpl?: FetchLike;
  fetchDeploymentMetadata?: (
    deploymentUrl: string,
    token: string,
    signal?: AbortSignal,
    fetchImpl?: FetchLike,
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

interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

interface VercelApiScope {
  teamId: string | null;
  slug: string | null;
}

interface VercelProjectLink {
  orgId: string;
  projectId: string;
}

interface VercelSsoProtection {
  deploymentType: string;
  cve55182MigrationAppliedFrom?: string;
}

interface VercelProjectRecord {
  id: string;
  name: string;
  accountId: string | null;
  ssoProtection: VercelSsoProtection | null;
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

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBooleanEnv(
  value: string | null | undefined,
  defaultValue: boolean,
): boolean {
  const normalized = trimToNull(value)?.toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  return defaultValue;
}

function shouldPreferPublicVercelDeploys(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readBooleanEnv(
    env.SHIPYARD_VERCEL_PUBLIC_DEPLOYS,
    DEFAULT_PUBLIC_DEPLOYS_ENABLED,
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseVercelDeploymentMetadata(
  value: unknown,
): VercelDeploymentMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const record = value;
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

function parseVercelProjectLink(value: unknown): VercelProjectLink | null {
  if (!isRecord(value)) {
    return null;
  }

  const orgId = trimToNull(
    typeof value.orgId === "string" ? value.orgId : null,
  );
  const projectId = trimToNull(
    typeof value.projectId === "string" ? value.projectId : null,
  );

  if (!orgId || !projectId) {
    return null;
  }

  return {
    orgId,
    projectId,
  };
}

function parseVercelProjectRecord(value: unknown): VercelProjectRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = trimToNull(typeof value.id === "string" ? value.id : null);
  const name = trimToNull(typeof value.name === "string" ? value.name : null);
  const accountId = trimToNull(
    typeof value.accountId === "string" ? value.accountId : null,
  );
  const ssoProtection = isRecord(value.ssoProtection) &&
      typeof value.ssoProtection.deploymentType === "string"
    ? {
        deploymentType: value.ssoProtection.deploymentType,
        cve55182MigrationAppliedFrom:
          typeof value.ssoProtection.cve55182MigrationAppliedFrom === "string"
            ? value.ssoProtection.cve55182MigrationAppliedFrom
            : undefined,
      }
    : null;

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    accountId,
    ssoProtection,
  };
}

function createManagedVercelProjectName(targetDirectory: string): string {
  const normalizedTargetName = deriveTargetNameFromPath(targetDirectory)
    .replace(/[^a-z0-9-]/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "");
  const baseName = normalizedTargetName || "shipyard-target";
  const stableHash = createHash("sha256")
    .update(path.resolve(targetDirectory))
    .digest("hex")
    .slice(0, 8);
  const truncatedBase = baseName.slice(0, 40).replace(/-+$/u, "") || "shipyard";

  return `${truncatedBase}-${stableHash}`;
}

function resolveTeamIdFromOrgId(orgId: string | null | undefined): string | null {
  const trimmedOrgId = trimToNull(orgId);

  if (!trimmedOrgId || !trimmedOrgId.startsWith("team_")) {
    return null;
  }

  return trimmedOrgId;
}

function resolveVercelApiScope(
  env: NodeJS.ProcessEnv,
  options: {
    preferredOrgId?: string | null;
  } = {},
): VercelApiScope {
  if (options.preferredOrgId !== undefined) {
    return {
      teamId: resolveTeamIdFromOrgId(options.preferredOrgId),
      slug: null,
    };
  }

  const configuredOrgId = trimToNull(env.VERCEL_ORG_ID);

  return {
    teamId:
      trimToNull(env.VERCEL_TEAM_ID) ?? resolveTeamIdFromOrgId(configuredOrgId),
    slug: trimToNull(env.VERCEL_TEAM_SLUG) ?? trimToNull(env.VERCEL_SCOPE),
  };
}

function buildVercelApiUrl(pathname: string, scope: VercelApiScope): URL {
  const url = new URL(pathname, "https://api.vercel.com");

  if (scope.teamId) {
    url.searchParams.set("teamId", scope.teamId);
  }

  if (scope.slug) {
    url.searchParams.set("slug", scope.slug);
  }

  return url;
}

function extractVercelApiErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (typeof payload === "string") {
    return trimToNull(payload) ?? fallback;
  }

  if (isRecord(payload)) {
    const directMessage = trimToNull(
      typeof payload.message === "string" ? payload.message : null,
    );

    if (directMessage) {
      return directMessage;
    }

    if (isRecord(payload.error)) {
      const nestedMessage = trimToNull(
        typeof payload.error.message === "string"
          ? payload.error.message
          : null,
      );

      if (nestedMessage) {
        return nestedMessage;
      }

      const nestedCode = trimToNull(
        typeof payload.error.code === "string" ? payload.error.code : null,
      );

      if (nestedCode) {
        return nestedCode;
      }
    }
  }

  return fallback;
}

async function callVercelApi(
  pathname: string,
  token: string,
  options: {
    scope: VercelApiScope;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    method?: string;
    body?: unknown;
  },
): Promise<{
  ok: boolean;
  status: number;
  payload: unknown;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildVercelApiUrl(pathname, options.scope),
    {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
            }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? AbortSignal.timeout(VERCEL_API_TIMEOUT_MS),
    },
  );
  const text = await response.text();
  let payload: unknown = null;

  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function isProjectAlreadyExistsFailure(
  status: number,
  payload: unknown,
): boolean {
  if (status === 409) {
    return true;
  }

  return /already exists|taken/i.test(
    extractVercelApiErrorMessage(payload, ""),
  );
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

async function readVercelProjectLink(
  targetDirectory: string,
): Promise<VercelProjectLink | null> {
  const projectLinkPath = path.join(
    targetDirectory,
    VERCEL_PROJECT_LINK_DIRECTORY,
    VERCEL_PROJECT_LINK_FILENAME,
  );

  if (!(await fileExists(projectLinkPath))) {
    return null;
  }

  try {
    return parseVercelProjectLink(
      JSON.parse(await readFile(projectLinkPath, "utf8")),
    );
  } catch {
    return null;
  }
}

async function writeVercelProjectLink(
  targetDirectory: string,
  link: VercelProjectLink,
): Promise<void> {
  const vercelDirectory = path.join(targetDirectory, VERCEL_PROJECT_LINK_DIRECTORY);
  await mkdir(vercelDirectory, { recursive: true });
  await writeFile(
    path.join(vercelDirectory, VERCEL_PROJECT_LINK_FILENAME),
    `${JSON.stringify(link, null, 2)}\n`,
    "utf8",
  );
}

async function ensureVercelProjectLinkIgnored(
  targetDirectory: string,
): Promise<void> {
  const gitExcludePath = path.join(targetDirectory, ".git", "info", "exclude");

  if (!(await fileExists(gitExcludePath))) {
    return;
  }

  const existingContents = await readFile(gitExcludePath, "utf8");
  const existingPatterns = existingContents
    .split(/\r?\n/gu)
    .map((line) => line.trim());

  if (
    existingPatterns.includes(VERCEL_PROJECT_LINK_IGNORE_PATTERN) ||
    existingPatterns.includes(`/${VERCEL_PROJECT_LINK_IGNORE_PATTERN}`)
  ) {
    return;
  }

  const prefix = existingContents.endsWith("\n") || existingContents.length === 0
    ? ""
    : "\n";
  const nextContents = [
    `${existingContents}${prefix}# Shipyard managed Vercel link state`,
    VERCEL_PROJECT_LINK_IGNORE_PATTERN,
    "",
  ].join("\n");

  await writeFile(gitExcludePath, nextContents, "utf8");
}

async function getVercelProject(
  idOrName: string,
  token: string,
  env: NodeJS.ProcessEnv,
  dependencies: DeployDependencies,
  options: {
    signal?: AbortSignal;
    preferredOrgId?: string | null;
  } = {},
): Promise<VercelProjectRecord | null> {
  const response = await callVercelApi(
    `/v9/projects/${encodeURIComponent(idOrName)}`,
    token,
    {
      scope: resolveVercelApiScope(env, {
        preferredOrgId: options.preferredOrgId,
      }),
      fetchImpl: dependencies.fetchImpl,
      signal: options.signal,
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ToolError(
      `Vercel project lookup failed: ${extractVercelApiErrorMessage(response.payload, "Unexpected Vercel API error.")}`,
    );
  }

  const project = parseVercelProjectRecord(response.payload);

  if (!project) {
    throw new ToolError(
      "Vercel project lookup returned an unexpected response shape.",
    );
  }

  return project;
}

async function createVercelProject(
  projectName: string,
  token: string,
  env: NodeJS.ProcessEnv,
  dependencies: DeployDependencies,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<VercelProjectRecord | null> {
  const response = await callVercelApi("/v11/projects", token, {
    scope: resolveVercelApiScope(env),
    fetchImpl: dependencies.fetchImpl,
    signal: options.signal,
    method: "POST",
    body: {
      name: projectName,
      ssoProtection: null,
    },
  });

  if (!response.ok) {
    if (isProjectAlreadyExistsFailure(response.status, response.payload)) {
      return null;
    }

    throw new ToolError(
      `Shipyard could not create the Vercel project ${projectName}: ${extractVercelApiErrorMessage(response.payload, "Unexpected Vercel API error.")}`,
    );
  }

  const project = parseVercelProjectRecord(response.payload);

  if (!project) {
    throw new ToolError(
      "Vercel project creation returned an unexpected response shape.",
    );
  }

  return project;
}

async function updateVercelProject(
  projectId: string,
  token: string,
  env: NodeJS.ProcessEnv,
  dependencies: DeployDependencies,
  options: {
    signal?: AbortSignal;
    preferredOrgId?: string | null;
    body: unknown;
  },
): Promise<VercelProjectRecord> {
  const response = await callVercelApi(
    `/v9/projects/${encodeURIComponent(projectId)}`,
    token,
    {
      scope: resolveVercelApiScope(env, {
        preferredOrgId: options.preferredOrgId,
      }),
      fetchImpl: dependencies.fetchImpl,
      signal: options.signal,
      method: "PATCH",
      body: options.body,
    },
  );

  if (!response.ok) {
    throw new ToolError(
      extractVercelApiErrorMessage(
        response.payload,
        "Unexpected Vercel API error while updating the project.",
      ),
    );
  }

  const project = parseVercelProjectRecord(response.payload);

  if (!project) {
    throw new ToolError(
      "Vercel project update returned an unexpected response shape.",
    );
  }

  return project;
}

async function ensureVercelProjectForDeploy(
  targetDirectory: string,
  token: string,
  env: NodeJS.ProcessEnv,
  dependencies: DeployDependencies,
  signal?: AbortSignal,
): Promise<VercelProjectRecord> {
  const existingLink = await readVercelProjectLink(targetDirectory);
  let project = existingLink
    ? await getVercelProject(existingLink.projectId, token, env, dependencies, {
        signal,
        preferredOrgId: existingLink.orgId,
      })
    : null;

  if (!project) {
    const managedProjectName = createManagedVercelProjectName(targetDirectory);
    project =
      await createVercelProject(
        managedProjectName,
        token,
        env,
        dependencies,
        { signal },
      ) ??
      await getVercelProject(
        managedProjectName,
        token,
        env,
        dependencies,
        { signal },
      );

    if (!project) {
      throw new ToolError(
        `Shipyard could not create or recover the Vercel project ${managedProjectName}.`,
      );
    }
  }

  if (shouldPreferPublicVercelDeploys(env) && project.ssoProtection) {
    try {
      project = await updateVercelProject(
        project.id,
        token,
        env,
        dependencies,
        {
          signal,
          preferredOrgId: project.accountId,
          body: {
            ssoProtection: null,
          },
        },
      );
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : "Unexpected Vercel API error while disabling Vercel Authentication.";

      throw new ToolError(
        [
          `Shipyard could not disable Vercel Authentication for ${project.name}.`,
          detail,
          PUBLIC_DEPLOY_OVERRIDE_HINT,
        ].join(" "),
      );
    }
  }

  const orgId =
    trimToNull(project.accountId) ??
    existingLink?.orgId ??
    trimToNull(env.VERCEL_ORG_ID);

  if (!orgId) {
    throw new ToolError(
      "Vercel project setup succeeded, but Shipyard could not determine the Vercel account ID needed to write .vercel/project.json.",
    );
  }

  if (
    existingLink?.orgId !== orgId ||
    existingLink?.projectId !== project.id
  ) {
    await writeVercelProjectLink(targetDirectory, {
      orgId,
      projectId: project.id,
    });
  }

  await ensureVercelProjectLinkIgnored(targetDirectory);
  return project;
}

async function fetchVercelDeploymentMetadata(
  deploymentUrl: string,
  token: string,
  signal?: AbortSignal,
  fetchImpl?: FetchLike,
): Promise<VercelDeploymentMetadata | null> {
  let hostname: string;

  try {
    hostname = new URL(deploymentUrl).hostname;
  } catch {
    return null;
  }

  try {
    const response = await (fetchImpl ?? fetch)(
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
    const metadata = await fetchMetadata(
      deploymentUrl,
      token,
      signal,
      dependencies.fetchImpl,
    );
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

  try {
    await ensureVercelProjectForDeploy(
      targetDirectory,
      token,
      env,
      dependencies,
      context?.signal,
    );

    const result = await runProcess({
      cwd: targetDirectory,
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
