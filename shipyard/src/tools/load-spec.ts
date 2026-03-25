import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import { resolveWithinTarget } from "./file-state.js";
import { ToolError } from "./read-file.js";

const MAX_DOCUMENT_CHARACTERS = 8_000;
const MAX_DIRECTORY_DOCUMENTS = 12;
const MAX_FILE_BYTES = 256_000;
const NON_TEXT_SAMPLE_BYTES = 4_096;
const NOISY_DIRECTORY_NAMES = new Set([
  ".git",
  ".shipyard",
  "node_modules",
  "dist",
  "coverage",
  "build",
]);
const OBVIOUS_BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bmp",
  ".class",
  ".dll",
  ".doc",
  ".docx",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".pyc",
  ".tar",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

export interface LoadSpecInput {
  targetDirectory: string;
  path: string;
}

export interface LoadedSpecDocument {
  name: string;
  ref: string;
  path: string;
  content: string;
  truncated: boolean;
  originalCharacterCount: number;
}

export interface SkippedSpecDocument {
  path: string;
  reason: string;
}

export interface LoadSpecResult {
  rootPath: string;
  kind: "file" | "directory";
  documents: LoadedSpecDocument[];
  skipped: SkippedSpecDocument[];
}

const loadSpecInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description:
        "Path to a spec file or spec directory, relative to the target directory.",
    },
  },
  required: ["path"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function toLoadSpecToolError(error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return new ToolError(error.message);
  }

  return new ToolError("Failed to load spec documents.");
}

function isIgnorableDirectoryError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" ||
      error.code === "EACCES" ||
      error.code === "EPERM")
  );
}

function sortDirectoryEntries(entries: Dirent[]): Dirent[] {
  return [...entries].sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join("/");
}

function stripFileExtension(relativePath: string): string {
  const parsed = path.posix.parse(relativePath);

  if (!parsed.ext) {
    return relativePath;
  }

  return parsed.dir ? path.posix.join(parsed.dir, parsed.name) : parsed.name;
}

function createSpecRef(relativePath: string): string {
  return `spec:${stripFileExtension(relativePath)}`;
}

function getNameSegments(relativePath: string): string[] {
  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [stripFileExtension(relativePath)];
  }

  const fileName = segments.pop() ?? relativePath;
  const parsed = path.posix.parse(fileName);

  return [...segments, parsed.ext ? parsed.name : parsed.base];
}

function createDocumentNames(paths: string[]): Map<string, string> {
  const segmentsByPath = new Map(
    paths.map((relativePath) => [relativePath, getNameSegments(relativePath)]),
  );
  const depthByPath = new Map(paths.map((relativePath) => [relativePath, 1]));

  while (true) {
    const candidateByPath = new Map(
      paths.map((relativePath) => {
        const segments = segmentsByPath.get(relativePath) ?? [relativePath];
        const depth = depthByPath.get(relativePath) ?? 1;
        return [
          relativePath,
          segments.slice(-depth).join("/"),
        ] as const;
      }),
    );
    const counts = new Map<string, number>();

    for (const candidate of candidateByPath.values()) {
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }

    let shouldContinue = false;

    for (const relativePath of paths) {
      const candidate = candidateByPath.get(relativePath);
      const segments = segmentsByPath.get(relativePath) ?? [relativePath];
      const currentDepth = depthByPath.get(relativePath) ?? 1;

      if (
        candidate &&
        (counts.get(candidate) ?? 0) > 1 &&
        currentDepth < segments.length
      ) {
        depthByPath.set(relativePath, currentDepth + 1);
        shouldContinue = true;
      }
    }

    if (!shouldContinue) {
      return candidateByPath;
    }
  }
}

function truncateContent(
  contents: string,
): {
  content: string;
  truncated: boolean;
} {
  if (contents.length <= MAX_DOCUMENT_CHARACTERS) {
    return {
      content: contents,
      truncated: false,
    };
  }

  const truncatedCount = contents.length - MAX_DOCUMENT_CHARACTERS;

  return {
    content: `${contents.slice(0, MAX_DOCUMENT_CHARACTERS)}\n\n[...truncated ${String(truncatedCount)} characters]`,
    truncated: true,
  };
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, NON_TEXT_SAMPLE_BYTES);

  if (sampleLength === 0) {
    return false;
  }

  let suspiciousBytes = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const value = buffer[index];

    if (value === undefined) {
      continue;
    }

    if (value === 0) {
      return true;
    }

    const isControlCharacter =
      value < 7 ||
      (value > 14 && value < 32) ||
      value === 127;

    if (isControlCharacter) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / sampleLength > 0.2;
}

function createSkippedDocument(
  relativePath: string,
  reason: string,
): SkippedSpecDocument {
  return {
    path: relativePath,
    reason,
  };
}

async function loadSpecDocument(
  absolutePath: string,
  relativePath: string,
  options: {
    allowSkip: boolean;
  },
): Promise<{
  document?: Omit<LoadedSpecDocument, "name">;
  skipped?: SkippedSpecDocument;
}> {
  const extension = path.extname(relativePath).toLowerCase();

  if (OBVIOUS_BINARY_EXTENSIONS.has(extension)) {
    if (options.allowSkip) {
      return {
        skipped: createSkippedDocument(relativePath, "Skipped non-text file."),
      };
    }

    throw new ToolError(`Spec file is not a text document: ${relativePath}`);
  }

  const fileStats = await stat(absolutePath).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new ToolError(`File not found: ${relativePath}`);
    }

    throw error;
  });

  if (fileStats.isDirectory()) {
    throw new ToolError(`Expected a file but found a directory: ${relativePath}`);
  }

  if (fileStats.size > MAX_FILE_BYTES) {
    if (options.allowSkip) {
      return {
        skipped: createSkippedDocument(
          relativePath,
          `Skipped oversized file (${String(fileStats.size)} bytes).`,
        ),
      };
    }

    throw new ToolError(
      `Spec file is too large to load safely: ${relativePath}`,
    );
  }

  const buffer = await readFile(absolutePath);

  if (isProbablyBinary(buffer)) {
    if (options.allowSkip) {
      return {
        skipped: createSkippedDocument(relativePath, "Skipped non-text file."),
      };
    }

    throw new ToolError(`Spec file is not a text document: ${relativePath}`);
  }

  const contents = buffer.toString("utf8");
  const truncated = truncateContent(contents);

  return {
    document: {
      ref: createSpecRef(relativePath),
      path: relativePath,
      content: truncated.content,
      truncated: truncated.truncated,
      originalCharacterCount: contents.length,
    },
  };
}

async function collectDirectoryFilePaths(
  targetDirectory: string,
  absoluteDirectoryPath: string,
): Promise<{
  paths: string[];
  skipped: SkippedSpecDocument[];
}> {
  let directoryEntries: Dirent[];

  try {
    directoryEntries = sortDirectoryEntries(
      await readdir(absoluteDirectoryPath, {
        withFileTypes: true,
        encoding: "utf8",
      }),
    );
  } catch (error) {
    if (isIgnorableDirectoryError(error)) {
      const relativePath = toPortablePath(
        path.relative(targetDirectory, absoluteDirectoryPath),
      );

      return {
        paths: [],
        skipped: [
          createSkippedDocument(
            relativePath,
            `Skipped unreadable directory (${error.code ?? "unknown"}).`,
          ),
        ],
      };
    }

    throw error;
  }

  const paths: string[] = [];
  const skipped: SkippedSpecDocument[] = [];

  for (const entry of directoryEntries) {
    const absolutePath = path.join(absoluteDirectoryPath, entry.name);
    const relativePath = toPortablePath(
      path.relative(targetDirectory, absolutePath),
    );

    if (entry.isDirectory()) {
      if (NOISY_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const nested = await collectDirectoryFilePaths(
        targetDirectory,
        absolutePath,
      );
      paths.push(...nested.paths);
      skipped.push(...nested.skipped);
      continue;
    }

    paths.push(relativePath);
  }

  return {
    paths,
    skipped,
  };
}

function formatDocumentSummary(document: LoadedSpecDocument): string {
  return [
    `Ref: ${document.ref}`,
    `Name: ${document.name}`,
    `Path: ${document.path}`,
    `Truncated: ${document.truncated ? "yes" : "no"}`,
  ].join("\n");
}

function formatSkippedSummary(skipped: SkippedSpecDocument): string {
  return `- ${skipped.path}: ${skipped.reason}`;
}

function formatLoadSpecOutput(result: LoadSpecResult): string {
  if (result.documents.length === 0) {
    const lines = [`No spec documents found under ${result.rootPath}.`];

    if (result.skipped.length > 0) {
      lines.push("", "Skipped:");
      lines.push(...result.skipped.map((entry) => formatSkippedSummary(entry)));
    }

    return lines.join("\n");
  }

  const lines = [
    `Loaded ${String(result.documents.length)} spec document${result.documents.length === 1 ? "" : "s"} from ${result.rootPath}`,
    "",
    "Documents:",
  ];

  for (const document of result.documents) {
    lines.push(formatDocumentSummary(document), "");
  }

  if (result.skipped.length > 0) {
    lines.push("Skipped:");
    lines.push(...result.skipped.map((entry) => formatSkippedSummary(entry)));
    lines.push("");
  }

  for (const document of result.documents) {
    lines.push(`[${document.ref}]`, document.content, "");
  }

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines.join("\n");
}

export async function loadSpecTool(
  input: LoadSpecInput,
): Promise<LoadSpecResult> {
  const resolvedPath = resolveWithinTarget(input.targetDirectory, input.path);
  const pathStats = await stat(resolvedPath.absolutePath).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new ToolError(`Path not found: ${resolvedPath.canonicalPath}`);
    }

    throw error;
  });

  if (!pathStats.isDirectory()) {
    const loadedDocument = await loadSpecDocument(
      resolvedPath.absolutePath,
      resolvedPath.canonicalPath,
      {
        allowSkip: false,
      },
    );

    if (!loadedDocument.document) {
      throw new ToolError(`No spec documents found at ${resolvedPath.canonicalPath}.`);
    }

    return {
      rootPath: resolvedPath.canonicalPath,
      kind: "file",
      documents: [
        {
          ...loadedDocument.document,
          name: getNameSegments(loadedDocument.document.path).at(-1)
            ?? loadedDocument.document.path,
        },
      ],
      skipped: [],
    };
  }

  const collectedPaths = await collectDirectoryFilePaths(
    input.targetDirectory,
    resolvedPath.absolutePath,
  );
  const limitedPaths = collectedPaths.paths.slice(0, MAX_DIRECTORY_DOCUMENTS);
  const skipped = [...collectedPaths.skipped];

  if (collectedPaths.paths.length > MAX_DIRECTORY_DOCUMENTS) {
    for (const relativePath of collectedPaths.paths.slice(MAX_DIRECTORY_DOCUMENTS)) {
      skipped.push(
        createSkippedDocument(
          relativePath,
          `Skipped because directory loads are capped at ${String(MAX_DIRECTORY_DOCUMENTS)} documents.`,
        ),
      );
    }
  }

  const loadedDocuments: Array<Omit<LoadedSpecDocument, "name">> = [];

  for (const relativePath of limitedPaths) {
    const loadedDocument = await loadSpecDocument(
      path.join(input.targetDirectory, relativePath),
      relativePath,
      {
        allowSkip: true,
      },
    );

    if (loadedDocument.document) {
      loadedDocuments.push(loadedDocument.document);
      continue;
    }

    if (loadedDocument.skipped) {
      skipped.push(loadedDocument.skipped);
    }
  }

  const namesByPath = createDocumentNames(
    loadedDocuments.map((document) => document.path),
  );

  return {
    rootPath: resolvedPath.canonicalPath,
    kind: "directory",
    documents: loadedDocuments.map((document) => ({
      ...document,
      name: namesByPath.get(document.path) ?? document.path,
    })),
    skipped,
  };
}

export const loadSpecDefinition: ToolDefinition<
  Omit<LoadSpecInput, "targetDirectory">
> = {
  name: "load_spec",
  description:
    "Load a spec file or small spec directory relative to the target and return named, bounded text content.",
  inputSchema: loadSpecInputSchema,
  async execute(input, targetDirectory) {
    try {
      const result = await loadSpecTool({
        targetDirectory,
        ...input,
      });

      return createToolSuccessResult(formatLoadSpecOutput(result), result);
    } catch (error) {
      return createToolErrorResult(toLoadSpecToolError(error));
    }
  },
};

registerTool(loadSpecDefinition);
