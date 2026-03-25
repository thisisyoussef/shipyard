import { access } from "node:fs/promises";
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
  vercelBinaryPath?: string;
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

function sanitizeCandidateUrl(rawUrl: string): string | null {
  const trimmedUrl = rawUrl.replace(/[),.;]+$/u, "");

  try {
    const parsed = new URL(trimmedUrl);

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

export function parseVercelDeploymentUrl(output: string): string | null {
  const candidates = extractUrls(output);

  if (candidates.length === 0) {
    return null;
  }

  const vercelCandidates = candidates.filter((candidate) => {
    try {
      return new URL(candidate).hostname.endsWith(".vercel.app");
    } catch {
      return false;
    }
  });

  return vercelCandidates.at(-1) ?? candidates.at(-1) ?? null;
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
    const result = await runProcess({
      cwd: targetDirectory,
      command: binaryPath,
      args: ["deploy", "--prod", "--yes", "--token", token],
      timeoutMs: DEPLOY_TIMEOUT_MS,
      signal: context?.signal,
      displayCommand,
    });
    const redactedLogExcerpt = redactDeploySecrets(result.combinedOutput, token);
    const productionUrl = parseVercelDeploymentUrl(
      result.stdout.trim() || redactedLogExcerpt,
    );

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
