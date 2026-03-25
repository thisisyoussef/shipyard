import { mkdir, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { nanoid } from "nanoid";

import { getShipyardDirectory } from "../engine/state.js";
import type { UploadReceipt } from "./contracts.js";

const MAX_UPLOAD_BYTES = 256 * 1024;
const MAX_PREVIEW_CHARS = 1_200;
const MAX_INJECTED_CONTEXT_PREVIEW_CHARS = 600;
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".env",
  ".gitignore",
  ".go",
  ".graphql",
  ".h",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mdx",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const TEXT_MEDIA_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/sql",
  "application/xml",
  "application/x-sh",
  "application/x-yaml",
  "image/svg+xml",
]);

interface ParsedUploadRequest {
  sessionId: string;
  files: File[];
}

function clipText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 16))}\n...[truncated]`;
}

function createRejectedReceipt(
  originalName: string,
  sizeBytes: number,
  mediaType: string,
  uploadedAt: string,
  errorMessage: string,
): UploadReceipt {
  return {
    id: nanoid(),
    originalName,
    targetRelativePath: null,
    mediaType,
    sizeBytes,
    previewText: null,
    uploadedAt,
    status: "rejected",
    errorMessage,
  };
}

function normalizeOriginalName(rawName: string): string {
  const normalizedName = path.basename(rawName.trim());
  return normalizedName || "uploaded-file";
}

function inferMediaType(file: File, extension: string): string {
  if (file.type.trim()) {
    return file.type.trim();
  }

  switch (extension) {
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".md":
    case ".mdx":
      return "text/markdown";
    case ".svg":
      return "image/svg+xml";
    case ".yaml":
    case ".yml":
      return "application/x-yaml";
    default:
      return "text/plain";
  }
}

function isSupportedTextUpload(
  originalName: string,
  mediaType: string,
): boolean {
  const extension = path.extname(originalName).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  if (mediaType.startsWith("text/")) {
    return true;
  }

  return TEXT_MEDIA_TYPES.has(mediaType);
}

async function parseUploadRequest(
  request: IncomingMessage,
): Promise<ParsedUploadRequest> {
  const uploadRequest = new Request(
    "http://shipyard.local/api/uploads",
    {
      method: request.method ?? "POST",
      headers: request.headers as HeadersInit,
      body: request as unknown as BodyInit,
      duplex: "half",
    } as RequestInit & { duplex: "half" },
  );
  const formData = await uploadRequest.formData();
  const sessionIdValue = formData.get("sessionId");

  if (typeof sessionIdValue !== "string" || sessionIdValue.trim().length === 0) {
    throw new Error("Upload requests must include the active session id.");
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    throw new Error("Select at least one supported text file to upload.");
  }

  return {
    sessionId: sessionIdValue.trim(),
    files,
  };
}

export async function storeUploadedFiles(
  options: {
    request: IncomingMessage;
    targetDirectory: string;
  },
): Promise<{
  sessionId: string;
  receipts: UploadReceipt[];
}> {
  const parsedRequest = await parseUploadRequest(options.request);
  const uploadedAt = new Date().toISOString();
  const receipts: UploadReceipt[] = [];

  for (const file of parsedRequest.files) {
    const originalName = normalizeOriginalName(file.name);
    const extension = path.extname(originalName).toLowerCase();
    const mediaType = inferMediaType(file, extension);

    if (!isSupportedTextUpload(originalName, mediaType)) {
      receipts.push(
        createRejectedReceipt(
          originalName,
          file.size,
          mediaType,
          uploadedAt,
          "This first pass only supports text-based reference files.",
        ),
      );
      continue;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      receipts.push(
        createRejectedReceipt(
          originalName,
          file.size,
          mediaType,
          uploadedAt,
          `Uploads must stay under ${String(MAX_UPLOAD_BYTES)} bytes for the first hosted pass.`,
        ),
      );
      continue;
    }

    const contents = await file.text();
    const storedName = `${nanoid()}${extension || ".txt"}`;
    const targetRelativePath = path.join(
      ".shipyard",
      "uploads",
      parsedRequest.sessionId,
      storedName,
    );
    const absolutePath = path.join(options.targetDirectory, targetRelativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");

    receipts.push({
      id: nanoid(),
      originalName,
      targetRelativePath,
      mediaType,
      sizeBytes: file.size,
      previewText: clipText(contents, MAX_PREVIEW_CHARS),
      uploadedAt,
      status: "ready",
      errorMessage: null,
    });
  }

  return {
    sessionId: parsedRequest.sessionId,
    receipts,
  };
}

export async function deleteUploadedFile(
  targetDirectory: string,
  upload: UploadReceipt,
): Promise<void> {
  if (!upload.targetRelativePath) {
    return;
  }

  await rm(path.join(targetDirectory, upload.targetRelativePath), {
    force: true,
  });
}

export function createUploadInjectedContext(
  uploads: UploadReceipt[],
): string[] {
  return uploads
    .filter(
      (upload) => upload.status === "ready" && upload.targetRelativePath !== null,
    )
    .map((upload) =>
      [
        `Uploaded reference file: ${upload.originalName}`,
        `Stored path: ${upload.targetRelativePath}`,
        `Media type: ${upload.mediaType}`,
        `Size: ${String(upload.sizeBytes)} bytes`,
        "Preview:",
        clipText(upload.previewText ?? "(no preview available)", MAX_INJECTED_CONTEXT_PREVIEW_CHARS),
        "Use read_file against the stored path if the full contents are needed.",
      ].join("\n"),
    );
}

export function getUploadStorageDirectory(
  targetDirectory: string,
  sessionId: string,
): string {
  return path.join(getShipyardDirectory(targetDirectory), "uploads", sessionId);
}
