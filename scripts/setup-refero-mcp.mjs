#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const projectMcpPath = path.join(repoRoot, ".mcp.json");

const referoServerConfig = {
  type: "http",
  url: "${REFERO_MCP_URL:-https://api.refero.design/mcp}",
  headers: {
    Authorization: "Bearer ${REFERO_MCP_TOKEN:-}",
  },
};

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/setup-refero-mcp.mjs [--dry-run]",
    "",
    "What it does:",
    "  - creates or updates a local `.mcp.json` at the repo root",
    "  - adds a `refero` HTTP MCP server using env-based auth",
    "  - keeps secrets out of git by relying on `REFERO_MCP_TOKEN`",
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

async function loadProjectMcpConfig() {
  if (!(await pathExists(projectMcpPath))) {
    return { mcpServers: {} };
  }

  try {
    const contents = await readFile(projectMcpPath, "utf8");
    const parsed = JSON.parse(contents);
    return {
      ...parsed,
      mcpServers: typeof parsed.mcpServers === "object" && parsed.mcpServers !== null
        ? parsed.mcpServers
        : {},
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse existing .mcp.json: ${message}`);
  }
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const currentConfig = await loadProjectMcpConfig();
  const nextConfig = {
    ...currentConfig,
    mcpServers: {
      ...currentConfig.mcpServers,
      refero: referoServerConfig,
    },
  };

  if (values["dry-run"]) {
    console.log(JSON.stringify(nextConfig, null, 2));
    return;
  }

  await writeFile(projectMcpPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  console.log([
    `Wrote ${path.relative(repoRoot, projectMcpPath) || ".mcp.json"}.`,
    "Next steps:",
    "1. Ensure REFERO_MCP_TOKEN is set in your shell environment.",
    "2. Restart Claude Code or rerun the design-brief generator.",
    "3. The first live Refero call may prompt you to complete browser auth.",
  ].join("\n"));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
