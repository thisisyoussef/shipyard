#!/usr/bin/env node

import process from "node:process";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_INTERVAL_MS = 5_000;

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function parsePositiveInteger(value, fallback) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function summarizeHealth(payload) {
  if (!payload || typeof payload !== "object") {
    return "received a non-object health payload";
  }

  if (payload.ok !== true || payload.runtimeMode !== "ui") {
    return "received a health payload that is not a Shipyard UI runtime response";
  }

  if (typeof payload.targetDirectory !== "string" || !payload.runtime) {
    return "runtime details are not available yet";
  }

  const connectionState =
    typeof payload.runtime.connectionState === "string"
      ? payload.runtime.connectionState
      : "unknown";
  const latestError =
    typeof payload.runtime.latestError === "string" && payload.runtime.latestError.length > 0
      ? payload.runtime.latestError
      : null;

  return [
    `target=${payload.targetDirectory}`,
    `connection=${connectionState}`,
    `latestError=${latestError ?? "null"}`,
  ].join(", ");
}

function isHealthyHostedTarget(payload, canonicalTargetPath) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (payload.ok !== true || payload.runtimeMode !== "ui") {
    return false;
  }

  if (typeof payload.targetDirectory !== "string" || !payload.runtime) {
    return false;
  }

  if (payload.targetDirectory !== canonicalTargetPath) {
    return false;
  }

  if (payload.runtime.connectionState === "error") {
    return false;
  }

  return payload.runtime.latestError == null;
}

async function main() {
  const hostedUrl = requireEnv("SHIPYARD_HOSTED_URL");
  const accessToken = requireEnv("SHIPYARD_ACCESS_TOKEN");
  const canonicalTargetPath =
    process.env.SHIPYARD_CANONICAL_TARGET_PATH?.trim() ||
    requireEnv("SHIPYARD_HOSTED_DEFAULT_TARGET_PATH");
  const timeoutMs = parsePositiveInteger(
    process.env.SHIPYARD_HOSTED_VERIFY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const intervalMs = parsePositiveInteger(
    process.env.SHIPYARD_HOSTED_VERIFY_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );
  const deadline = Date.now() + timeoutMs;

  const accessUrl = new URL("/api/access", hostedUrl);
  const healthUrl = new URL("/api/health", hostedUrl);
  let accessCookie = "";

  const accessResponse = await fetch(accessUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ token: accessToken }),
    redirect: "follow",
  });

  if (!accessResponse.ok) {
    throw new Error(
      `Hosted access bootstrap failed with HTTP ${String(accessResponse.status)}.`,
    );
  }

  accessCookie = accessResponse.headers.get("set-cookie") ?? "";

  if (!accessCookie) {
    throw new Error(
      "Hosted access bootstrap did not return a session cookie for /api/health polling.",
    );
  }

  let lastSummary = "no health response received";

  while (Date.now() <= deadline) {
    try {
      const response = await fetch(healthUrl, {
        headers: {
          cookie: accessCookie,
        },
        redirect: "follow",
      });

      if (!response.ok) {
        lastSummary = `health returned HTTP ${String(response.status)}`;
      } else {
        const payload = await response.json();
        lastSummary = summarizeHealth(payload);

        if (isHealthyHostedTarget(payload, canonicalTargetPath)) {
          console.log(
            [
              `Verified hosted Shipyard at ${hostedUrl}.`,
              `Canonical target: ${canonicalTargetPath}`,
              `Runtime: ${lastSummary}`,
            ].join("\n"),
          );
          return;
        }
      }
    } catch (error) {
      lastSummary =
        error instanceof Error ? error.message : "health check request failed";
    }

    await sleep(intervalMs);
  }

  throw new Error(
    [
      `Timed out waiting for hosted Shipyard to report the canonical target.`,
      `Hosted URL: ${hostedUrl}`,
      `Expected target: ${canonicalTargetPath}`,
      `Last observed state: ${lastSummary}`,
    ].join("\n"),
  );
}

await main();
