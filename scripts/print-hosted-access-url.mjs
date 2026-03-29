#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_HOSTED_URL = "https://shipyard-production-7d07.up.railway.app";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const defaultEnvPath = path.join(repoRoot, "shipyard", ".env");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .reduce((values, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return values;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        return values;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();

      if (!key) {
        return values;
      }

      values[key] = rawValue.replace(/^['"]|['"]$/gu, "");
      return values;
    }, {});
}

const fileEnv = parseEnvFile(defaultEnvPath);
const hostedUrl =
  process.env.SHIPYARD_HOSTED_URL?.trim() ||
  fileEnv.SHIPYARD_HOSTED_URL?.trim() ||
  DEFAULT_HOSTED_URL;
const accessToken =
  process.env.SHIPYARD_ACCESS_TOKEN?.trim() ||
  fileEnv.SHIPYARD_ACCESS_TOKEN?.trim() ||
  "";

if (!accessToken) {
  console.error(
    `Missing SHIPYARD_ACCESS_TOKEN. Add it to ${defaultEnvPath} or export it before running this helper.`,
  );
  process.exitCode = 1;
} else {
  const url = new URL(hostedUrl);
  url.searchParams.set("access_token", accessToken);
  console.log(url.toString());
}
