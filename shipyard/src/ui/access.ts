import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const ACCESS_COOKIE_NAME = "shipyard_access";
const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MAX_ACCESS_REQUEST_BYTES = 8_192;

export interface UiAccessState {
  required: boolean;
  authenticated: boolean;
}

function readConfiguredAccessToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configuredToken = env.SHIPYARD_ACCESS_TOKEN?.trim();
  return configuredToken ? configuredToken : null;
}

function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader?.trim()) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      if (!name) {
        return cookies;
      }

      cookies[name] = value;
      return cookies;
    }, {});
}

function shouldUseSecureCookies(request: IncomingMessage): boolean {
  const forwardedProtocolHeader = request.headers["x-forwarded-proto"];
  const forwardedProtocol = Array.isArray(forwardedProtocolHeader)
    ? forwardedProtocolHeader[0]
    : forwardedProtocolHeader;

  if (forwardedProtocol?.split(",")[0]?.trim() === "https") {
    return true;
  }

  return "encrypted" in request.socket && Boolean(request.socket.encrypted);
}

function createCookieHeader(
  request: IncomingMessage,
  value: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${ACCESS_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${String(maxAgeSeconds)}`,
  ];

  if (shouldUseSecureCookies(request)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

async function readRequestBody(
  request: IncomingMessage,
  maxBytes = MAX_ACCESS_REQUEST_BYTES,
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error("Access request body exceeded the supported size.");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function isAccessGateEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readConfiguredAccessToken(env) !== null;
}

export function isRequestAuthorized(
  request: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configuredToken = readConfiguredAccessToken(env);

  if (configuredToken === null) {
    return true;
  }

  const cookies = parseCookies(request.headers.cookie);
  const providedCookie = cookies[ACCESS_COOKIE_NAME];

  if (!providedCookie) {
    return false;
  }

  return providedCookie === hashAccessToken(configuredToken);
}

export function getUiAccessState(
  request: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): UiAccessState {
  const required = isAccessGateEnabled(env);

  return {
    required,
    authenticated: required ? isRequestAuthorized(request, env) : true,
  };
}

export function isValidAccessToken(
  providedToken: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configuredToken = readConfiguredAccessToken(env);

  if (configuredToken === null) {
    return true;
  }

  const providedBuffer = Buffer.from(providedToken);
  const configuredBuffer = Buffer.from(configuredToken);

  if (providedBuffer.byteLength !== configuredBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(providedBuffer, configuredBuffer);
}

export function createGrantedAccessCookie(
  request: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredToken = readConfiguredAccessToken(env);

  if (configuredToken === null) {
    throw new Error("Cannot create an access cookie when the gate is disabled.");
  }

  return createCookieHeader(
    request,
    hashAccessToken(configuredToken),
    ACCESS_COOKIE_MAX_AGE_SECONDS,
  );
}

export function createClearedAccessCookie(
  request: IncomingMessage,
): string {
  return createCookieHeader(request, "", 0);
}

export async function readAccessTokenFromRequest(
  request: IncomingMessage,
): Promise<string> {
  const rawBody = await readRequestBody(request);
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid access token payload.");
  }

  if (
    typeof parsedBody !== "object" ||
    parsedBody === null ||
    !("token" in parsedBody) ||
    typeof parsedBody.token !== "string" ||
    parsedBody.token.trim().length === 0
  ) {
    throw new Error("Invalid access token payload.");
  }

  return parsedBody.token.trim();
}

export function redactAccessToken(
  rawValue: string,
  configuredToken: string | null = readConfiguredAccessToken(),
): string {
  let sanitized = rawValue
    .replace(/access_token=([^&\s]+)/giu, "access_token=[redacted]")
    .replace(/"token"\s*:\s*"([^"]*)"/giu, '"token":"[redacted]"');

  if (configuredToken) {
    sanitized = sanitized.split(configuredToken).join("[redacted]");
  }

  return sanitized;
}
