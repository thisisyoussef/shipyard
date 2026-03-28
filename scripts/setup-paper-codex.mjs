#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const defaultPaperUrl =
  process.env.PAPER_MCP_URL?.trim() || "http://127.0.0.1:29979/mcp";
const defaultCodexConfigPath =
  process.env.CODEX_CONFIG_PATH?.trim() ||
  path.join(os.homedir(), ".codex", "config.toml");
const probeTimeoutMs = 2_000;

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/setup-paper-codex.mjs [--dry-run] [--skip-probe]",
    "",
    "What it does:",
    "  - creates or updates the user Codex config at ~/.codex/config.toml",
    "  - adds a `paper` MCP server pointing at the local Paper Desktop endpoint",
    "  - keeps the later scripted UI phase bridges Codex-first unless you opt into Claude",
    "",
    "Options:",
    "  --codex-config-path  Override the Codex config path (defaults to ~/.codex/config.toml)",
    "  --paper-url          Override the Paper MCP URL (defaults to http://127.0.0.1:29979/mcp)",
    "  --dry-run            Print the next config without writing it",
    "  --skip-probe         Skip probing the local Paper endpoint",
    "  --help, -h           Show this help",
  ].join("\n"));
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isSectionHeader(line) {
  return /^\[[^\]]+\]$/u.test(line.trim());
}

export function upsertPaperSection(contents, paperUrl) {
  const lines = contents ? contents.split(/\r?\n/u) : [];
  const output = [];
  let index = 0;
  let replaced = false;

  while (index < lines.length) {
    const currentLine = lines[index];

    if (currentLine.trim() === "[mcp_servers.paper]") {
      if (output.length > 0 && output.at(-1) !== "") {
        output.push("");
      }

      output.push("[mcp_servers.paper]");
      output.push(`url = "${paperUrl}"`);
      replaced = true;
      index += 1;

      while (index < lines.length && !isSectionHeader(lines[index])) {
        index += 1;
      }

      if (index < lines.length && output.at(-1) !== "") {
        output.push("");
      }

      continue;
    }

    output.push(currentLine);
    index += 1;
  }

  while (output.length > 0 && output.at(-1) === "") {
    output.pop();
  }

  if (!replaced) {
    if (output.length > 0) {
      output.push("");
    }

    output.push("[mcp_servers.paper]");
    output.push(`url = "${paperUrl}"`);
  }

  return `${output.join("\n")}\n`;
}

async function loadExistingConfig(configPath) {
  if (!(await pathExists(configPath))) {
    return "";
  }

  return readFile(configPath, "utf8");
}

async function probePaperEndpoint(paperUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), probeTimeoutMs);

  try {
    const response = await fetch(paperUrl, {
      method: "GET",
      signal: controller.signal,
    });

    return {
      reachable: true,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reachable: false,
      detail: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "codex-config-path": { type: "string" },
      "paper-url": { type: "string" },
      "dry-run": { type: "boolean" },
      "skip-probe": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const codexConfigPath = path.resolve(
    values["codex-config-path"]?.trim() || defaultCodexConfigPath,
  );
  const paperUrl = values["paper-url"]?.trim() || defaultPaperUrl;
  const existingConfig = await loadExistingConfig(codexConfigPath);
  const nextConfig = upsertPaperSection(existingConfig, paperUrl);
  const shouldProbe =
    !values["skip-probe"] && process.env.PAPER_MCP_SKIP_PROBE !== "1";
  const probeResult = shouldProbe ? await probePaperEndpoint(paperUrl) : null;

  if (values["dry-run"]) {
    console.log(nextConfig);

    if (probeResult) {
      console.log(
        `Probe: ${probeResult.reachable ? "reachable" : "unreachable"} (${probeResult.detail})`,
      );
    }

    return;
  }

  await mkdir(path.dirname(codexConfigPath), { recursive: true });
  await writeFile(codexConfigPath, nextConfig, "utf8");

  const lines = [
    `Wrote ${codexConfigPath}.`,
    `Configured Codex Paper MCP server at ${paperUrl}.`,
  ];

  if (probeResult) {
    lines.push(
      probeResult.reachable
        ? `Paper endpoint responded (${probeResult.detail}).`
        : `Paper endpoint probe failed (${probeResult.detail}).`,
    );
  }

  lines.push("Next steps:");
  lines.push("1. Keep a Paper file open so the local MCP server stays available.");
  lines.push("2. Start a fresh Codex session or restart Codex if the app was already open.");
  lines.push('3. Verify with: "create a red rectangle in Paper".');

  console.log(lines.join("\n"));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
