import { createHash } from "node:crypto";
import path from "node:path";

const trackedReadHashes = new Map<string, string>();

export interface ResolvedTargetPath {
  canonicalPath: string;
  absolutePath: string;
}

function toPortableRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export function normalizeTargetRelativePath(relativePath: string): string {
  const trimmedPath = relativePath.trim();

  if (!trimmedPath) {
    throw new Error("Path must not be empty.");
  }

  if (path.isAbsolute(trimmedPath)) {
    throw new Error("Access denied: path must stay within the target directory.");
  }

  const normalizedPath = path.normalize(trimmedPath);

  if (
    normalizedPath === ".." ||
    normalizedPath.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Access denied: path must stay within the target directory.");
  }

  return toPortableRelativePath(normalizedPath);
}

export function resolveWithinTarget(
  targetDirectory: string,
  relativePath: string,
): ResolvedTargetPath {
  const canonicalPath = normalizeTargetRelativePath(relativePath);
  const resolvedTargetDirectory = path.resolve(targetDirectory);
  const absolutePath = path.resolve(resolvedTargetDirectory, canonicalPath);

  if (
    absolutePath !== resolvedTargetDirectory &&
    !absolutePath.startsWith(`${resolvedTargetDirectory}${path.sep}`)
  ) {
    throw new Error("Access denied: path must stay within the target directory.");
  }

  const canonicalRelativePath = path.relative(
    resolvedTargetDirectory,
    absolutePath,
  );

  return {
    canonicalPath: canonicalRelativePath
      ? toPortableRelativePath(canonicalRelativePath)
      : ".",
    absolutePath,
  };
}

export function hashContents(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

export function createDisplayHash(fullHash: string): string {
  return fullHash.slice(0, 16);
}

export function countLines(contents: string): number {
  if (contents.length === 0) {
    return 0;
  }

  const normalized = contents.replace(/\r\n/g, "\n");
  const withoutTrailingNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;

  if (withoutTrailingNewline.length === 0) {
    return 0;
  }

  return withoutTrailingNewline.split("\n").length;
}

export function rememberReadHash(
  canonicalRelativePath: string,
  fullHash: string,
): void {
  trackedReadHashes.set(
    normalizeTargetRelativePath(canonicalRelativePath),
    fullHash,
  );
}

export function getTrackedReadHash(
  canonicalRelativePath: string,
): string | undefined {
  return trackedReadHashes.get(
    normalizeTargetRelativePath(canonicalRelativePath),
  );
}

export function clearTrackedReadHashes(): void {
  trackedReadHashes.clear();
}
