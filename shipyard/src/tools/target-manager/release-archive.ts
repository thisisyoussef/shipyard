import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  DiscoveryReport,
  PreviewState,
  TargetProfile,
} from "../../artifacts/types.js";
import { normalizeTargetName } from "./scaffold-materializer.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_TARGET_RELEASE_ARCHIVE_DIRECTORY_NAME =
  ".shipyard-target-releases";

const TARGET_ARCHIVE_METADATA_DIRECTORY = ".shipyard-target-archive";
const TARGET_ARCHIVE_RELEASES_DIRECTORY = path.join(
  TARGET_ARCHIVE_METADATA_DIRECTORY,
  "releases",
);

const EXCLUDED_SEGMENT_NAMES = new Set([
  ".git",
  ".shipyard",
  ".DS_Store",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "output",
  ".next",
  ".turbo",
  ".cache",
]);

const ENV_SEGMENT_PATTERN = /^\.env(?:\..+)?$/u;

interface PersistedTargetArchiveDescriptor {
  version: 1;
  targetDirectory: string;
  targetsDirectory: string;
  archiveRepoPath: string;
  archiveRepoName: string;
  latestTag: string;
  latestReleaseAt: string;
  latestDescription: string;
  latestTags: string[];
}

interface PersistedTargetReleaseRecord {
  version: 1;
  tag: string;
  createdAt: string;
  targetDirectory: string;
  targetsDirectory: string;
  archiveRepoPath: string;
  description: string;
  tags: string[];
  sessionId: string;
  turnCount: number;
  trigger: "preview-refresh";
  reason: string;
  previewUrl: string | null;
  discovery: DiscoveryReport;
  targetProfile: TargetProfile | null;
}

interface PersistedTargetReleaseIndex {
  version: 1;
  targets: PersistedTargetArchiveDescriptor[];
}

export interface CaptureTargetReleaseArchiveInput {
  archiveRoot: string;
  targetDirectory: string;
  targetsDirectory: string;
  sessionId: string;
  turnCount: number;
  previewState: PreviewState;
  discovery: DiscoveryReport;
  targetProfile?: TargetProfile;
}

export interface CapturedTargetReleaseArchive {
  archiveRoot: string;
  archiveRepoPath: string;
  archiveRepoName: string;
  description: string;
  tags: string[];
  tag: string;
  createdAt: string;
  reason: string;
  releaseMetadataPath: string;
  commitSha: string;
}

function resolveTargetLabel(
  targetDirectory: string,
  discovery: DiscoveryReport,
  targetProfile?: TargetProfile,
): string {
  return (
    targetProfile?.name ||
    discovery.projectName ||
    path.basename(targetDirectory) ||
    "target"
  );
}

function normalizeArchiveToken(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || null;
}

function buildArchiveDescription(
  targetDirectory: string,
  discovery: DiscoveryReport,
  targetProfile?: TargetProfile,
): string {
  if (targetProfile?.description.trim()) {
    return targetProfile.description.trim();
  }

  const targetLabel = resolveTargetLabel(targetDirectory, discovery, targetProfile);
  const summaryParts = [
    discovery.language,
    discovery.framework,
    discovery.packageManager ? `via ${discovery.packageManager}` : null,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (summaryParts.length === 0) {
    return `${targetLabel} refresh archive`;
  }

  return `${targetLabel} (${summaryParts.join(", ")})`;
}

function buildArchiveTags(
  discovery: DiscoveryReport,
  targetProfile?: TargetProfile,
): string[] {
  const rawValues = [
    "preview-refresh",
    discovery.language,
    discovery.framework,
    discovery.packageManager,
    discovery.previewCapability.kind,
    discovery.previewCapability.autoRefresh,
    targetProfile?.complexity,
    ...(targetProfile?.stack ?? []),
  ];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const normalized = normalizeArchiveToken(rawValue);

    if (!normalized || normalized === "none" || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tags.push(normalized);
  }

  return tags;
}

function createArchiveRepoName(
  targetDirectory: string,
  discovery: DiscoveryReport,
  targetProfile?: TargetProfile,
): string {
  const baseName = normalizeTargetName(
    resolveTargetLabel(targetDirectory, discovery, targetProfile),
  );
  const hash = createHash("sha1")
    .update(path.resolve(targetDirectory))
    .digest("hex")
    .slice(0, 10);

  return `${baseName}-${hash}`;
}

function formatArchiveTimestamp(createdAt: string): string {
  return createdAt
    .replace(/[-:]/gu, "")
    .replace(/\./gu, "")
    .toLowerCase();
}

function createProposedTag(createdAt: string, turnCount: number): string {
  return `refresh-${formatArchiveTimestamp(createdAt)}-turn-${String(turnCount)}`;
}

function getArchiveIndexPath(archiveRoot: string): string {
  return path.join(archiveRoot, "index.json");
}

function getArchiveDescriptorPath(archiveRepoPath: string): string {
  return path.join(
    archiveRepoPath,
    TARGET_ARCHIVE_METADATA_DIRECTORY,
    "target.json",
  );
}

function getReleaseMetadataPath(
  archiveRepoPath: string,
  tag: string,
): string {
  return path.join(
    archiveRepoPath,
    TARGET_ARCHIVE_RELEASES_DIRECTORY,
    `${tag}.json`,
  );
}

async function writeAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryFilePath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );

  await writeFile(temporaryFilePath, contents, "utf8");
  await rename(temporaryFilePath, filePath);
}

async function readArchiveIndex(
  archiveRoot: string,
): Promise<PersistedTargetReleaseIndex> {
  const indexPath = getArchiveIndexPath(archiveRoot);

  try {
    await access(indexPath);
  } catch {
    return {
      version: 1,
      targets: [],
    };
  }

  const contents = await readFile(indexPath, "utf8");
  return JSON.parse(contents) as PersistedTargetReleaseIndex;
}

async function saveArchiveIndex(
  archiveRoot: string,
  index: PersistedTargetReleaseIndex,
): Promise<void> {
  await writeAtomically(
    getArchiveIndexPath(archiveRoot),
    `${JSON.stringify(index, null, 2)}\n`,
  );
}

function shouldExcludeRelativePath(relativePath: string): boolean {
  const segments = relativePath.split(path.sep).filter(Boolean);

  return segments.some((segment) =>
    EXCLUDED_SEGMENT_NAMES.has(segment) || ENV_SEGMENT_PATTERN.test(segment)
  );
}

async function clearArchiveWorkingTree(archiveRepoPath: string): Promise<void> {
  const entries = await readdir(archiveRepoPath, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git")
      .map((entry) =>
        rm(path.join(archiveRepoPath, entry.name), {
          recursive: true,
          force: true,
        })
      ),
  );
}

async function copyTargetIntoArchive(
  targetDirectory: string,
  archiveRepoPath: string,
): Promise<void> {
  const entries = await readdir(targetDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldExcludeRelativePath(entry.name)) {
      continue;
    }

    await cp(
      path.join(targetDirectory, entry.name),
      path.join(archiveRepoPath, entry.name),
      {
        recursive: true,
        force: true,
        filter(sourcePath) {
          const relativePath = path.relative(targetDirectory, sourcePath);
          return !relativePath || !shouldExcludeRelativePath(relativePath);
        },
      },
    );
  }
}

async function git(
  archiveRepoPath: string,
  args: string[],
): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: archiveRepoPath,
  });

  return result.stdout.trim();
}

async function ensureArchiveRepository(
  archiveRepoPath: string,
): Promise<void> {
  await mkdir(archiveRepoPath, { recursive: true });

  try {
    await access(path.join(archiveRepoPath, ".git"));
    return;
  } catch {
    // Initialize below.
  }

  try {
    await git(archiveRepoPath, ["init", "--initial-branch=main"]);
  } catch {
    await git(archiveRepoPath, ["init"]);
  }

  await git(archiveRepoPath, ["config", "user.email", "shipyard-archive@local"]);
  await git(archiveRepoPath, ["config", "user.name", "Shipyard Archive"]);
}

async function ensureUniqueTag(
  archiveRepoPath: string,
  proposedTag: string,
): Promise<string> {
  let candidateTag = proposedTag;
  let suffix = 2;

  while (true) {
    try {
      await git(archiveRepoPath, [
        "rev-parse",
        "--verify",
        "--quiet",
        `refs/tags/${candidateTag}`,
      ]);
      candidateTag = `${proposedTag}-${String(suffix)}`;
      suffix += 1;
    } catch {
      return candidateTag;
    }
  }
}

async function updateArchiveIndex(
  archiveRoot: string,
  descriptor: PersistedTargetArchiveDescriptor,
): Promise<void> {
  const index = await readArchiveIndex(archiveRoot);
  const nextTargets = [
    descriptor,
    ...index.targets.filter((entry) => entry.targetDirectory !== descriptor.targetDirectory),
  ].sort((left, right) => left.archiveRepoName.localeCompare(right.archiveRepoName));

  await saveArchiveIndex(archiveRoot, {
    version: 1,
    targets: nextTargets,
  });
}

export function resolveTargetReleaseArchiveRoot(
  targetsDirectory: string,
  overrideRoot?: string | null,
): string {
  if (overrideRoot?.trim()) {
    return path.resolve(overrideRoot);
  }

  return path.join(
    path.resolve(targetsDirectory),
    DEFAULT_TARGET_RELEASE_ARCHIVE_DIRECTORY_NAME,
  );
}

export async function captureTargetReleaseArchive(
  input: CaptureTargetReleaseArchiveInput,
): Promise<CapturedTargetReleaseArchive> {
  const createdAt = new Date().toISOString();
  const archiveRoot = path.resolve(input.archiveRoot);
  const archiveRepoName = createArchiveRepoName(
    input.targetDirectory,
    input.discovery,
    input.targetProfile,
  );
  const archiveRepoPath = path.join(archiveRoot, archiveRepoName);
  const description = buildArchiveDescription(
    input.targetDirectory,
    input.discovery,
    input.targetProfile,
  );
  const tags = buildArchiveTags(input.discovery, input.targetProfile);
  const reason =
    input.previewState.lastRestartReason?.trim() || "Refresh requested.";

  await ensureArchiveRepository(archiveRepoPath);
  await clearArchiveWorkingTree(archiveRepoPath);
  await copyTargetIntoArchive(input.targetDirectory, archiveRepoPath);

  const proposedTag = createProposedTag(createdAt, input.turnCount);
  const tag = await ensureUniqueTag(archiveRepoPath, proposedTag);

  const releaseRecord: PersistedTargetReleaseRecord = {
    version: 1,
    tag,
    createdAt,
    targetDirectory: input.targetDirectory,
    targetsDirectory: input.targetsDirectory,
    archiveRepoPath,
    description,
    tags,
    sessionId: input.sessionId,
    turnCount: input.turnCount,
    trigger: "preview-refresh",
    reason,
    previewUrl: input.previewState.url,
    discovery: input.discovery,
    targetProfile: input.targetProfile ?? null,
  };

  const targetDescriptor: PersistedTargetArchiveDescriptor = {
    version: 1,
    targetDirectory: input.targetDirectory,
    targetsDirectory: input.targetsDirectory,
    archiveRepoPath,
    archiveRepoName,
    latestTag: tag,
    latestReleaseAt: createdAt,
    latestDescription: description,
    latestTags: tags,
  };

  await writeAtomically(
    getArchiveDescriptorPath(archiveRepoPath),
    `${JSON.stringify(targetDescriptor, null, 2)}\n`,
  );
  const releaseMetadataPath = getReleaseMetadataPath(archiveRepoPath, tag);
  await writeAtomically(
    releaseMetadataPath,
    `${JSON.stringify(releaseRecord, null, 2)}\n`,
  );

  const commitMessage = [
    `chore(archive): ${tag}`,
    "",
    `Reason: ${reason}`,
    `Description: ${description}`,
    `Tags: ${tags.join(", ") || "none"}`,
    `Source: ${input.targetDirectory}`,
    `Session: ${input.sessionId}`,
    `Turn: ${String(input.turnCount)}`,
  ].join("\n");

  await git(archiveRepoPath, ["add", "-A"]);
  await git(archiveRepoPath, ["commit", "-m", commitMessage]);
  const commitSha = await git(archiveRepoPath, ["rev-parse", "HEAD"]);
  await git(archiveRepoPath, [
    "tag",
    "-a",
    tag,
    "-m",
    commitMessage,
  ]);

  await updateArchiveIndex(archiveRoot, targetDescriptor);

  return {
    archiveRoot,
    archiveRepoPath,
    archiveRepoName,
    description,
    tags,
    tag,
    createdAt,
    reason,
    releaseMetadataPath,
    commitSha,
  };
}
