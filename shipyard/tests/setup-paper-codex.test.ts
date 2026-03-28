import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDirectory, "..", "..");
const setupPaperCodexPath = path.join(repoRoot, "scripts", "setup-paper-codex.mjs");
const temporaryDirectories: string[] = [];

async function createTempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shipyard-paper-codex-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function runSetup(extraEnv = {}) {
  return execFile("node", [setupPaperCodexPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PAPER_MCP_SKIP_PROBE: "1",
      ...extraEnv,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe("setup-paper-codex", () => {
  it("creates a new Codex config with the Paper MCP server", async () => {
    const directory = await createTempDir();
    const configPath = path.join(directory, "codex", "config.toml");

    await runSetup({
      CODEX_CONFIG_PATH: configPath,
    });

    const contents = await readFile(configPath, "utf8");
    expect(contents).toBe(
      '[mcp_servers.paper]\nurl = "http://127.0.0.1:29979/mcp"\n',
    );
  });

  it("updates the Paper MCP section without removing existing config", async () => {
    const directory = await createTempDir();
    const configPath = path.join(directory, "codex", "config.toml");

    await mkdir(path.dirname(configPath), { recursive: true });

    await writeFile(
      configPath,
      [
        'model = "gpt-5.4"',
        "",
        "[mcp_servers.openaiDeveloperDocs]",
        'url = "https://developers.openai.com/mcp"',
        "",
        "[mcp_servers.paper]",
        'url = "http://127.0.0.1:39999/mcp"',
        "",
      ].join("\n"),
      "utf8",
    );

    await runSetup({
      CODEX_CONFIG_PATH: configPath,
    });

    const contents = await readFile(configPath, "utf8");
    expect(contents).toContain('model = "gpt-5.4"');
    expect(contents).toContain("[mcp_servers.openaiDeveloperDocs]");
    expect(contents).toContain(
      '[mcp_servers.paper]\nurl = "http://127.0.0.1:29979/mcp"\n',
    );
    expect(contents.match(/\[mcp_servers\.paper\]/gu)).toHaveLength(1);
  });
});
