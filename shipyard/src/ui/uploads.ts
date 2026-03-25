import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { getUploadDirectory } from "../engine/state.js";
import type { UploadReceipt } from "./contracts.js";

const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".mdx",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".xml",
  ".sh",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".php",
  ".sql",
  ".graphql",
  ".gql",
]);
const SUPPORTED_TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  ".env",
  ".env.example",
]);
const PREVIEW_CHAR_LIMIT = 600;

export const MAX_PENDING_UPLOADS = 4;
export const MAX_UPLOAD_FILE_BYTES = 256 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES =
  (MAX_PENDING_UPLOADS * MAX_UPLOAD_FILE_BYTES) + (64 * 1024);

export interface UploadCandidate {
  originalName: string;
  mediaType: string;
  contents: Buffer;
}

export class UploadValidationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "UploadValidationError";
    this.statusCode = statusCode;
  }
}

function createDuplicateKey(originalName: string): string {
  return path.basename(originalName).trim().toLowerCase();
}

function sanitizeOriginalName(originalName: string): string {
  const trimmedName = originalName.trim();

  if (!trimmedName) {
    throw new UploadValidationError("Uploaded files must include a filename.", 400);
  }

  const normalizedName = path.basename(trimmedName);

  if (normalizedName !== trimmedName) {
    throw new UploadValidationError(
      "Uploaded filenames cannot include directory paths.",
      400,
    );
  }

  if (normalizedName === "." || normalizedName === "..") {
    throw new UploadValidationError("Uploaded filenames are invalid.", 400);
  }

  return normalizedName;
}

function isSupportedTextFilename(filename: string): boolean {
  const normalizedName = filename.toLowerCase();

  if (SUPPORTED_TEXT_FILENAMES.has(normalizedName)) {
    return true;
  }

  return SUPPORTED_TEXT_EXTENSIONS.has(path.extname(normalizedName));
}

function detectBinaryContents(contents: Buffer): boolean {
  const sample = contents.subarray(0, Math.min(contents.length, 2_048));
  let suspiciousByteCount = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isControlByte = byte < 7 || (byte > 14 && byte < 32);

    if (isControlByte) {
      suspiciousByteCount += 1;
    }
  }

  return sample.length > 0 && (suspiciousByteCount / sample.length) > 0.1;
}

function slugifyFilename(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  const stem = path.basename(originalName, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${stem || "upload"}-${nanoid(8)}${extension}`;
}

function createPreviewText(contents: Buffer): {
  previewText: string;
  isTruncated: boolean;
} {
  const fullText = contents.toString("utf8").trim();

  if (fullText.length <= PREVIEW_CHAR_LIMIT) {
    return {
      previewText: fullText,
      isTruncated: false,
    };
  }

  return {
    previewText: `${fullText.slice(0, PREVIEW_CHAR_LIMIT).trimEnd()}…`,
    isTruncated: true,
  };
}

function createPreviewSummary(
  originalName: string,
  isTruncated: boolean,
): string {
  const extension = path.extname(originalName).toLowerCase();
  const baseSummary = extension === ".md" || extension === ".mdx"
    ? "Markdown preview available."
    : extension === ".json"
      ? "JSON preview available."
      : "Text preview available.";

  return isTruncated
    ? `${baseSummary.replace(/\.$/u, "")} Truncated for context.`
    : baseSummary;
}

function validateUploadCandidate(candidate: UploadCandidate): UploadCandidate {
  const originalName = sanitizeOriginalName(candidate.originalName);

  if (!isSupportedTextFilename(originalName)) {
    throw new UploadValidationError(
      `Unsupported upload type for "${originalName}". Attach a supported text-based file instead.`,
      415,
    );
  }

  if (candidate.contents.length === 0) {
    throw new UploadValidationError(
      `Uploaded file "${originalName}" is empty.`,
      400,
    );
  }

  if (candidate.contents.length > MAX_UPLOAD_FILE_BYTES) {
    throw new UploadValidationError(
      `Uploaded file "${originalName}" exceeds the ${String(MAX_UPLOAD_FILE_BYTES)} byte limit.`,
      413,
    );
  }

  if (detectBinaryContents(candidate.contents)) {
    throw new UploadValidationError(
      `Unsupported binary content for "${originalName}". Attach a supported text-based file instead.`,
      415,
    );
  }

  return {
    ...candidate,
    originalName,
  };
}

export async function readRequestBodyWithLimit(
  request: AsyncIterable<string | Buffer>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBytes) {
      throw new UploadValidationError(
        `Upload request exceeds the ${String(maxBytes)} byte limit.`,
        413,
      );
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export async function storeUploadCandidates(options: {
  sessionId: string;
  targetDirectory: string;
  existingReceipts: UploadReceipt[];
  candidates: UploadCandidate[];
}): Promise<UploadReceipt[]> {
  if (options.candidates.length === 0) {
    throw new UploadValidationError("Attach at least one file before uploading.", 400);
  }

  if (
    options.existingReceipts.length + options.candidates.length >
      MAX_PENDING_UPLOADS
  ) {
    throw new UploadValidationError(
      `Shipyard only keeps ${String(MAX_PENDING_UPLOADS)} pending uploads at a time.`,
      400,
    );
  }

  const validatedCandidates = options.candidates.map(validateUploadCandidate);
  const duplicateKeys = new Set(
    options.existingReceipts.map((receipt) => createDuplicateKey(receipt.originalName)),
  );

  for (const candidate of validatedCandidates) {
    const duplicateKey = createDuplicateKey(candidate.originalName);

    if (duplicateKeys.has(duplicateKey)) {
      throw new UploadValidationError(
        `"${candidate.originalName}" is already attached for this session.`,
        409,
      );
    }

    duplicateKeys.add(duplicateKey);
  }

  const uploadDirectory = getUploadDirectory(
    options.targetDirectory,
    options.sessionId,
  );
  await mkdir(uploadDirectory, { recursive: true });

  const receipts: UploadReceipt[] = [];

  for (const candidate of validatedCandidates) {
    const storedFilename = slugifyFilename(candidate.originalName);
    const storedRelativePath = path.posix.join(
      ".shipyard",
      "uploads",
      options.sessionId,
      storedFilename,
    );
    const storedAbsolutePath = path.join(uploadDirectory, storedFilename);
    const { previewText, isTruncated } = createPreviewText(candidate.contents);

    await writeFile(storedAbsolutePath, candidate.contents);
    receipts.push({
      id: `upload-${nanoid(10)}`,
      originalName: candidate.originalName,
      storedRelativePath,
      sizeBytes: candidate.contents.length,
      mediaType: candidate.mediaType || "text/plain",
      previewText,
      previewSummary: createPreviewSummary(candidate.originalName, isTruncated),
      uploadedAt: new Date().toISOString(),
    });
  }

  return receipts;
}

export async function deleteStoredUpload(options: {
  sessionId: string;
  targetDirectory: string;
  receipt: UploadReceipt;
}): Promise<void> {
  const expectedPrefix = path.posix.join(
    ".shipyard",
    "uploads",
    options.sessionId,
  );

  if (!options.receipt.storedRelativePath.startsWith(`${expectedPrefix}/`)) {
    throw new UploadValidationError(
      "Stored upload path does not belong to the active session.",
      400,
    );
  }

  await rm(
    path.join(options.targetDirectory, options.receipt.storedRelativePath),
    { force: true },
  );
}
