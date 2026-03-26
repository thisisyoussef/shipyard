import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import {
  CODE_PHASE_TOOL_NAMES,
  getCodePhaseToolDefinitions,
} from "../src/phases/code/index.js";
import {
  getTool,
  getTools,
  registerTool,
  type ToolDefinition,
} from "../src/tools/registry.js";
import { projectToolsToAnthropicTools } from "../src/engine/anthropic.js";
import {
  ToolError,
  clearTrackedReadHashes,
  deployTargetTool,
  editBlockTool as editBlock,
  getTrackedReadHash,
  listFilesTool as listFiles,
  readFileTool as readTargetFile,
  resolveWithinTarget,
  runCommandTool as runCommand,
  searchFilesTool as searchFiles,
  writeFileTool as writeTargetFile,
} from "../src/tools/index.js";
import type { DeployInput } from "../src/tools/deploy.js";
import { readFileDefinition } from "../src/tools/read-file.js";

const createdDirectories: string[] = [];

interface RawCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-tools-"));
  createdDirectories.push(directory);
  return directory;
}

async function runRawCommand(
  cwd: string,
  command: string,
): Promise<RawCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

async function expectRawCommandSuccess(
  cwd: string,
  command: string,
): Promise<void> {
  const result = await runRawCommand(cwd, command);

  expect(result.exitCode).toBe(0);
}

async function initializeGitRepository(cwd: string): Promise<void> {
  await expectRawCommandSuccess(cwd, "git init");
  await expectRawCommandSuccess(cwd, "git config user.email shipyard@example.com");
  await expectRawCommandSuccess(cwd, "git config user.name 'Shipyard Tests'");
}

function buildSizedFile(lineCount: number, anchorLabel: string): string {
  const lines: string[] = [];

  for (let index = 1; index <= lineCount; index += 1) {
    lines.push(`line ${index}`);
  }

  const anchorLine = Math.max(2, Math.floor(lineCount / 2));
  lines.splice(anchorLine, 0, `const ${anchorLabel} = "anchor";`);

  return `${lines.join("\n")}\n`;
}

describe("file tools", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);
    clearTrackedReadHashes();

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("reads a file and returns a stable hash", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "notes.txt"), "hello shipyard\n", "utf8");

    const result = await readTargetFile({
      targetDirectory: directory,
      path: "./notes.txt",
    });

    expect(result.path).toBe("notes.txt");
    expect(result.contents).toBe("hello shipyard\n");
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(getTrackedReadHash("notes.txt")).toBe(result.hash);
  });

  it("writes a new file and rejects overwriting by default", async () => {
    const directory = await createTempProject();

    const result = await writeTargetFile({
      targetDirectory: directory,
      path: "docs/output.md",
      content: "# Shipyard\n",
    });

    expect(result.contents).toBe("# Shipyard\n");
    expect(result.path).toBe("docs/output.md");

    await expect(
      writeTargetFile({
        targetDirectory: directory,
        path: "docs/output.md",
        content: "replace me\n",
      }),
    ).rejects.toThrowError(
      "Use edit_block for targeted changes or set overwrite: true for full replacement.",
    );
  });

  it("edits a short file with a unique anchor", async () => {
    await expectSingleEditPass(12, "SHORT_ANCHOR");
  });

  it("edits a medium file with a unique anchor", async () => {
    await expectSingleEditPass(72, "MEDIUM_ANCHOR");
  });

  it("edits a large file with a unique anchor", async () => {
    await expectSingleEditPass(240, "LARGE_ANCHOR");
  });

  it("supports repeated surgical edits to the same file when each change is re-read", async () => {
    const directory = await createTempProject();
    const relativePath = "src/repeated.ts";

    await writeTargetFile({
      targetDirectory: directory,
      path: relativePath,
      content: [
        'export const alpha = "one";',
        'export const beta = "two";',
        'export const gamma = "three";',
        "",
      ].join("\n"),
    });

    await readTargetFile({
      targetDirectory: directory,
      path: relativePath,
    });

    const firstEdit = await editBlock({
      targetDirectory: directory,
      path: relativePath,
      old_string: 'export const alpha = "one";',
      new_string: 'export const alpha = "uno";',
    });

    expect(firstEdit.changed).toBe(true);

    const reread = await readTargetFile({
      targetDirectory: directory,
      path: relativePath,
    });

    expect(reread.contents).toContain('export const alpha = "uno";');

    const secondEdit = await editBlock({
      targetDirectory: directory,
      path: relativePath,
      old_string: 'export const beta = "two";',
      new_string: 'export const beta = "dos";',
    });

    expect(secondEdit.changed).toBe(true);
    await expect(readFile(path.join(directory, relativePath), "utf8")).resolves.toBe(
      [
        'export const alpha = "uno";',
        'export const beta = "dos";',
        'export const gamma = "three";',
        "",
      ].join("\n"),
    );
  });

  it("rejects stale hashes before editing", async () => {
    const directory = await createTempProject();
    const filePath = path.join(directory, "stale.ts");
    await writeFile(filePath, 'const value = "before";\n', "utf8");

    await readTargetFile({
      targetDirectory: directory,
      path: "stale.ts",
    });

    await writeFile(filePath, 'const value = "changed";\n', "utf8");

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "stale.ts",
        old_string: 'const value = "changed";',
        new_string: 'const value = "after";',
      }),
    ).rejects.toThrowError(/File changed since the last read: stale\.ts/);
  });

  it("tells the caller to use write_file when edit_block targets a missing file", async () => {
    const directory = await createTempProject();

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "missing.ts",
        old_string: 'const status = "before";',
        new_string: 'const status = "after";',
      }),
    ).rejects.toThrowError(/Use write_file to create it first/);
  });

  it("fails with a preview when the anchor is missing", async () => {
    const directory = await createTempProject();
    await writeFile(
      path.join(directory, "missing-anchor.ts"),
      [
        "export const first = 1;",
        "export const second = 2;",
        "export function marker() {",
        "  return first + second;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await readTargetFile({
      targetDirectory: directory,
      path: "missing-anchor.ts",
    });

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "missing-anchor.ts",
        old_string: "const doesNotExist = true;",
        new_string: "const doesNotExist = false;",
      }),
    ).rejects.toThrowError(/Anchor not found in missing-anchor\.ts/);

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "missing-anchor.ts",
        old_string: "const doesNotExist = true;",
        new_string: "const doesNotExist = false;",
      }),
    ).rejects.toThrowError(/check whitespace and indentation/i);

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "missing-anchor.ts",
        old_string: "const doesNotExist = true;",
        new_string: "const doesNotExist = false;",
      }),
    ).rejects.toThrowError(/1\| export const first = 1;/);
  });

  it("rejects ambiguous anchors with the exact match count", async () => {
    const directory = await createTempProject();
    await writeFile(
      path.join(directory, "ambiguous.ts"),
      'const value = "same";\nconst value = "same";\n',
      "utf8",
    );
    const current = await readTargetFile({
      targetDirectory: directory,
      path: "ambiguous.ts",
    });

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "ambiguous.ts",
        old_string: 'const value = "same";',
        new_string: 'const value = "new";',
      }),
    ).rejects.toThrowError(/Anchor matched 2 times in ambiguous\.ts/);

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "ambiguous.ts",
        old_string: 'const value = "same";',
        new_string: 'const value = "new";',
      }),
    ).rejects.toThrowError(/more surrounding context/i);
  });

  it("rejects large rewrites on files larger than 500 characters", async () => {
    const directory = await createTempProject();
    const relativePath = "large-rewrite.ts";
    const originalContents = buildSizedFile(180, "OVERSIZED");

    await writeTargetFile({
      targetDirectory: directory,
      path: relativePath,
      content: originalContents,
    });

    await readTargetFile({
      targetDirectory: directory,
      path: relativePath,
    });

    await expect(
      editBlock({
        targetDirectory: directory,
        path: relativePath,
        old_string: originalContents,
        new_string: `${"replacement line\n".repeat(18)}final line\n`,
      }),
    ).rejects.toThrowError(/Break the change into smaller edit_block calls/i);
  });

  it("allows large rewrites for Shipyard scaffold starter files", async () => {
    const directory = await createTempProject();
    const relativePath = "src/App.css";
    const originalContents = [
      "/* shipyard-scaffold: react-ts-app-style */",
      ".app-shell {",
      '  font-family: "Inter", sans-serif;',
      "}",
      "",
      ".app-card {",
      "  padding: 2rem;",
      "}",
      "",
      ".app-eyebrow {",
      "  letter-spacing: 0.18em;",
      "}",
      "",
      ...Array.from({ length: 120 }, (_, index) => `.filler-${index} { color: #111827; }`),
      "",
    ].join("\n");
    const replacementContents = [
      "/* shipyard-scaffold: react-ts-app-style */",
      ".login-shell {",
      "  min-height: 100vh;",
      "  display: grid;",
      "  place-items: center;",
      "}",
      "",
      ...Array.from({ length: 120 }, (_, index) => `.login-filler-${index} { background: #f5f5f4; }`),
      "",
    ].join("\n");

    await writeTargetFile({
      targetDirectory: directory,
      path: relativePath,
      content: originalContents,
    });

    await readTargetFile({
      targetDirectory: directory,
      path: relativePath,
    });

    const result = await editBlock({
      targetDirectory: directory,
      path: relativePath,
      old_string: originalContents,
      new_string: replacementContents,
    });

    expect(result.changed).toBe(true);
    await expect(readFile(path.join(directory, relativePath), "utf8")).resolves.toBe(
      replacementContents,
    );
  });

  it("returns a no-op result when old_string equals new_string", async () => {
    const directory = await createTempProject();
    const relativePath = "no-change.ts";

    await writeTargetFile({
      targetDirectory: directory,
      path: relativePath,
      content: 'const status = "steady";\n',
    });

    const current = await readTargetFile({
      targetDirectory: directory,
      path: relativePath,
    });

    const result = await editBlock({
      targetDirectory: directory,
      path: relativePath,
      old_string: 'const status = "steady";',
      new_string: 'const status = "steady";',
    });

    expect(result.changed).toBe(false);
    expect(result.hash).toBe(current.hash);
    await expect(readFile(path.join(directory, relativePath), "utf8")).resolves.toBe(
      'const status = "steady";\n',
    );
  });

  it("surfaces summary output for successful edits through the tool contract", async () => {
    const directory = await createTempProject();
    const relativePath = "summary.ts";

    await writeTargetFile({
      targetDirectory: directory,
      path: relativePath,
      content: 'const status = "before";\n',
    });

    await readTargetFile({
      targetDirectory: directory,
      path: relativePath,
    });

    const tool = getTool("edit_block") as ToolDefinition<{
      path: string;
      old_string: string;
      new_string: string;
    }>;

    const result = await tool.execute(
      {
        path: relativePath,
        old_string: 'const status = "before";',
        new_string: 'const status = "after";',
      },
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Edited summary.ts");
    expect(result.output).toContain("Removed lines: 1");
    expect(result.output).toContain("Added lines: 1");
    expect(result.output).toContain("Total lines: 1");
    expect(result.output).toContain("Before preview:");
    expect(result.output).toContain('const status = "before";');
    expect(result.output).toContain("After preview:");
    expect(result.output).toContain('const status = "after";');
  });
});

describe("search and command tools", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);
    clearTrackedReadHashes();

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("list_files returns a tree-style view with directories before files", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await mkdir(path.join(directory, "src/nested/deeper"), { recursive: true });
    await mkdir(path.join(directory, "node_modules/pkg"), { recursive: true });
    await writeFile(path.join(directory, ".env"), "SECRET=true\n", "utf8");
    await writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 1;\n", "utf8");
    await writeFile(
      path.join(directory, "src/nested/deeper/too-deep.ts"),
      "export const hidden = true;\n",
      "utf8",
    );
    await writeFile(path.join(directory, "README.md"), "# demo\n", "utf8");
    const tool = getTool("list_files") as ToolDefinition<{
      path?: string;
      depth?: number;
    }>;

    const result = await tool.execute(
      {
        path: ".",
        depth: 2,
      },
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("./");
    expect(result.output).toContain("src/");
    expect(result.output).toContain("README.md");
    expect(result.output.indexOf("src/")).toBeLessThan(result.output.indexOf("README.md"));
    expect(result.output).toContain("nested/");
    expect(result.output).not.toContain("node_modules");
    expect(result.output).not.toContain(".env");
    expect(result.output).not.toContain("too-deep.ts");
  });

  it("search_files treats no matches as a successful result", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "src/search.ts"), "export const alpha = true;\n", "utf8");
    const tool = getTool("search_files") as ToolDefinition<{
      pattern: string;
      file_pattern?: string;
      limit?: number;
    }>;

    const result = await tool.execute(
      {
        pattern: "SHIPYARD_NOT_FOUND",
      },
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches found for pattern "SHIPYARD_NOT_FOUND".');
  });

  it("search_files limits results and rewrites paths relative to the target", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await mkdir(path.join(directory, "docs"), { recursive: true });

    for (let index = 1; index <= 5; index += 1) {
      await writeFile(
        path.join(directory, "src", `match-${String(index)}.ts`),
        `export const MATCH_TOKEN_${String(index)} = "SHIPYARD_LIMIT";\n`,
        "utf8",
      );
    }

    await writeFile(
      path.join(directory, "docs/search.md"),
      "SHIPYARD_LIMIT in docs should be filtered out.\n",
      "utf8",
    );

    const matches = await searchFiles({
      targetDirectory: directory,
      pattern: "SHIPYARD_LIMIT",
      file_pattern: "src/*.ts",
      limit: 3,
    });

    expect(matches.matches).toHaveLength(3);
    expect(matches.truncated).toBe(true);
    expect(matches.matches.every((match) => match.path.startsWith("src/"))).toBe(true);
    expect(matches.matches.every((match) => !path.isAbsolute(match.path))).toBe(true);
  });

  it("run_command returns failing command diagnostics without ANSI color noise", async () => {
    const directory = await createTempProject();
    const tool = getTool("run_command") as ToolDefinition<{
      command: string;
      timeout_seconds?: number;
    }>;

    const result = await tool.execute(
      {
        command: "node -e \"process.stdout.write('\\u001b[31mRED\\u001b[0m\\n'); process.stderr.write('bad\\n'); process.exit(2)\"",
      },
      directory,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Exit code: 2");
    expect(result.error).toContain("RED");
    expect(result.error).toContain("bad");
    expect(result.error).not.toContain("\u001b[31m");
  });

  it("run_command executes in the target directory", async () => {
    const directory = await createTempProject();
    const result = await runCommand({
      targetDirectory: directory,
      command: "pwd",
      timeout_seconds: 2,
    });

    const canonicalDirectory = await realpath(directory);
    const canonicalStdout = await realpath(result.stdout.trim());

    expect(result.exitCode).toBe(0);
    expect(canonicalStdout).toBe(canonicalDirectory);
    expect(result.timedOut).toBe(false);
  });

  it("run_command clips combined output at 5000 characters", async () => {
    const directory = await createTempProject();
    const result = await runCommand({
      targetDirectory: directory,
      command: "node -e \"process.stdout.write('x'.repeat(6000));\"",
      timeout_seconds: 2,
    });

    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.combinedOutput.length).toBeLessThanOrEqual(5_000);
  });

  it("times out long-running commands", async () => {
    const directory = await createTempProject();
    const result = await runCommand({
      targetDirectory: directory,
      command: "node -e \"setTimeout(() => console.log('done'), 2000)\"",
      timeout_seconds: 1,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it("aborts long-running commands when the active turn signal is cancelled", async () => {
    const directory = await createTempProject();
    const controller = new AbortController();
    const pendingResult = runCommand({
      targetDirectory: directory,
      command: "node -e \"setTimeout(() => console.log('done'), 5000)\"",
      timeout_seconds: 10,
      signal: controller.signal,
    });

    setTimeout(() => {
      controller.abort("Operator interrupted the active turn.");
    }, 50).unref();

    await expect(pendingResult).rejects.toThrow(/interrupted|cancelled|aborted/i);
  });

  it("deploy_target parses a successful Vercel production URL into structured output", async () => {
    const directory = await createTempProject();
    const result = await deployTargetTool(
      {
        platform: "vercel",
      },
      directory,
      undefined,
      {
        env: {
          ...process.env,
          VERCEL_TOKEN: "phase-nine-secret",
        },
        vercelBinaryPath: "vercel",
        async executeProcess() {
          return {
            command: "vercel deploy --prod --yes --token [redacted]",
            cwd: directory,
            stdout: "https://shipyard-demo.vercel.app\n",
            stderr: "",
            exitCode: 0,
            timedOut: false,
            signal: null,
            timeoutMs: 600_000,
            combinedOutput: "https://shipyard-demo.vercel.app\n",
            truncated: false,
          };
        },
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        platform: "vercel",
        productionUrl: "https://shipyard-demo.vercel.app",
      },
    });
    expect(result.output).toContain("Production URL: https://shipyard-demo.vercel.app");
  });

  it("deploy_target returns an actionable error when VERCEL_TOKEN is missing", async () => {
    const directory = await createTempProject();
    const result = await deployTargetTool(
      {
        platform: "vercel",
      },
      directory,
      undefined,
      {
        env: {},
        vercelBinaryPath: "vercel",
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("VERCEL_TOKEN is required");
  });

  it("deploy_target rejects unsupported platforms", async () => {
    const directory = await createTempProject();
    const result = await deployTargetTool(
      {
        platform: "railway",
      } as unknown as DeployInput,
      directory,
      undefined,
      {
        env: {
          ...process.env,
          VERCEL_TOKEN: "phase-nine-secret",
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported deploy platform");
  });

  it("deploy_target reports timeouts with bounded redacted logs", async () => {
    const directory = await createTempProject();
    const result = await deployTargetTool(
      {
        platform: "vercel",
      },
      directory,
      undefined,
      {
        env: {
          ...process.env,
          VERCEL_TOKEN: "phase-nine-secret",
        },
        vercelBinaryPath: "vercel",
        async executeProcess() {
          return {
            command: "vercel deploy --prod --yes --token [redacted]",
            cwd: directory,
            stdout: "",
            stderr: "Build logs are still streaming...",
            exitCode: null,
            timedOut: true,
            signal: "SIGTERM",
            timeoutMs: 600_000,
            combinedOutput: "Build logs are still streaming...",
            truncated: false,
          };
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Timed out after 600 seconds.");
    expect(result.error).toContain("Build logs are still streaming...");
  });

  it("deploy_target redacts provider secrets from failure output", async () => {
    const directory = await createTempProject();
    const result = await deployTargetTool(
      {
        platform: "vercel",
      },
      directory,
      undefined,
      {
        env: {
          ...process.env,
          VERCEL_TOKEN: "phase-nine-secret",
        },
        vercelBinaryPath: "vercel",
        async executeProcess() {
          return {
            command: "vercel deploy --prod --yes --token [redacted]",
            cwd: directory,
            stdout: "",
            stderr: "Deploy failed for token phase-nine-secret",
            exitCode: 1,
            timedOut: false,
            signal: null,
            timeoutMs: 600_000,
            combinedOutput: "Deploy failed for token phase-nine-secret",
            truncated: false,
          };
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).not.toContain("phase-nine-secret");
    expect(result.error).toContain("[redacted]");
  });

  it("deploy_target reports a missing bundled CLI clearly", async () => {
    const directory = await createTempProject();
    const missingCliError = Object.assign(
      new Error("spawn vercel ENOENT"),
      {
        code: "ENOENT",
      },
    );
    const result = await deployTargetTool(
      {
        platform: "vercel",
      },
      directory,
      undefined,
      {
        env: {
          ...process.env,
          VERCEL_TOKEN: "phase-nine-secret",
        },
        vercelBinaryPath: "vercel",
        async executeProcess() {
          throw missingCliError;
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Vercel CLI is unavailable");
  });

  it("git_diff reports a non-git directory clearly", async () => {
    const directory = await createTempProject();
    const tool = getTool("git_diff") as ToolDefinition<{
      staged?: boolean;
      path?: string;
    }>;

    const result = await tool.execute({}, directory);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Target directory is not a git repository.");
  });

  it("git_diff supports staged and path-scoped calls", async () => {
    const directory = await createTempProject();
    await initializeGitRepository(directory);
    await writeFile(path.join(directory, "alpha.ts"), "export const alpha = 1;\n", "utf8");
    await writeFile(path.join(directory, "beta.ts"), "export const beta = 1;\n", "utf8");
    await expectRawCommandSuccess(directory, "git add .");
    await expectRawCommandSuccess(directory, "git commit -m 'initial'");

    await writeFile(path.join(directory, "alpha.ts"), "export const alpha = 2;\n", "utf8");
    await writeFile(path.join(directory, "beta.ts"), "export const beta = 2;\n", "utf8");
    await expectRawCommandSuccess(directory, "git add alpha.ts");

    const result = await (await import("../src/tools/git-diff.js")).gitDiffTool({
      targetDirectory: directory,
      staged: true,
      path: "alpha.ts",
    });

    expect(result.exitCode).toBe(0);
    expect(result.command).toContain("git diff --no-ext-diff --staged -- alpha.ts");
    expect(result.stdout).toContain("diff --git a/alpha.ts b/alpha.ts");
    expect(result.stdout).not.toContain("beta.ts");
  });

  it("searches files with relative line matches", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(
      path.join(directory, "src/search.ts"),
      "export const SHIPYARD_MARKER = true;\n",
      "utf8",
    );

    const matches = await searchFiles({
      targetDirectory: directory,
      pattern: "SHIPYARD_MARKER",
    });

    expect(matches.matches).toHaveLength(1);
    expect(matches.matches[0]?.path).toBe("src/search.ts");
    expect(matches.matches[0]?.lineNumber).toBe(1);
  });

  it("lists files through the internal helper with bounded depth", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src/nested/deeper"), { recursive: true });
    await writeFile(path.join(directory, "src/index.ts"), "export {};\n", "utf8");
    await writeFile(path.join(directory, "src/nested/deeper/deep.ts"), "export {};\n", "utf8");

    const files = await listFiles({
      targetDirectory: directory,
      path: ".",
      depth: 2,
    });

    expect(files.entries.some((entry) => entry.path === "src/index.ts")).toBe(true);
    expect(files.entries.some((entry) => entry.path === "src/nested/deeper/deep.ts")).toBe(false);
  });

  it("runs search with file pattern filtering through the tool result contract", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await mkdir(path.join(directory, "docs"), { recursive: true });
    await writeFile(
      path.join(directory, "src/search.ts"),
      "export const SHIPYARD_MARKER = true;\n",
      "utf8",
    );
    await writeFile(
      path.join(directory, "docs/search.md"),
      "SHIPYARD_MARKER in docs\n",
      "utf8",
    );

    const tool = getTool("search_files") as ToolDefinition<{
      pattern: string;
      file_pattern?: string;
      limit?: number;
    }>;
    const result = await tool.execute(
      {
        pattern: "SHIPYARD_MARKER",
        file_pattern: "src/*.ts",
      },
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("src/search.ts:1:");
    expect(result.output).not.toContain("docs/search.md");
  });

  it("supports a manual phase 2 smoke script entrypoint", async () => {
    await expect(
      readFile(path.join(process.cwd(), "tests/manual/phase2-tools-smoke.ts"), "utf8"),
    ).resolves.toContain("Phase 2 tool smoke passed.");
  });
});

describe("tool registry", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);
    clearTrackedReadHashes();

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("registers the full code-phase tool surface through the barrel import", () => {
    const tools = getCodePhaseToolDefinitions();

    expect(tools.map((tool) => tool.name)).toEqual(CODE_PHASE_TOOL_NAMES);
  });

  it("rejects duplicate tool names", () => {
    expect(() => registerTool(readFileDefinition)).toThrowError(
      'Failed to register tool "read_file": duplicate tool name.',
    );
  });

  it("preserves requested ordering while skipping unknown names", () => {
    const tools = getTools(["search_files", "missing_tool", "read_file"]);

    expect(tools.map((tool) => tool.name)).toEqual([
      "search_files",
      "read_file",
    ]);
  });

  it("keeps provider-specific tool projection out of the registry", async () => {
    const registryModule = await import("../src/tools/registry.js");

    expect("getAnthropicTools" in registryModule).toBe(false);
    expect("AnthropicToolDefinition" in registryModule).toBe(false);
  });

  it("projects Anthropic-ready schemas from generic tool definitions", () => {
    const tools = projectToolsToAnthropicTools(
      getTools(["read_file", "write_file"]),
    );

    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({
      name: "read_file",
      input_schema: {
        type: "object",
      },
    });
    expect(tools[0]).toHaveProperty("input_schema.properties.path");
    expect(Object.keys(tools[1]?.input_schema.properties ?? {})).toContain("content");
  });

  it("executes read_file through the shared ToolResult contract", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "notes.txt"), "hello registry\n", "utf8");

    const tool = getTool("read_file") as ToolDefinition<{ path: string }>;
    const result = await tool.execute({ path: "notes.txt" }, directory);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Path: notes.txt");
    expect(result.output).toContain("Lines: 1");
    expect(result.output).toContain("Hash: ");
    expect(result.output).toContain("hello registry\n");
  });

  it("resolves paths safely within the target directory", async () => {
    const directory = await createTempProject();

    expect(resolveWithinTarget(directory, "src/../notes.txt")).toMatchObject({
      canonicalPath: "notes.txt",
    });
    expect(() => resolveWithinTarget(directory, "../notes.txt")).toThrowError(
      "Access denied: path must stay within the target directory.",
    );
    expect(() => resolveWithinTarget(directory, "/tmp/notes.txt")).toThrowError(
      "Access denied: path must stay within the target directory.",
    );
  });

  it("returns helpful read_file errors for missing files and directories", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    const tool = getTool("read_file") as ToolDefinition<{ path: string }>;

    await expect(tool.execute({ path: "missing.ts" }, directory)).resolves.toMatchObject({
      success: false,
      error: "File not found: missing.ts",
    });

    await expect(tool.execute({ path: "src" }, directory)).resolves.toMatchObject({
      success: false,
      error: "Expected a file but found a directory: src",
    });
  });

  it("records the latest read hash for later stale-read checks", async () => {
    const directory = await createTempProject();
    await writeFile(path.join(directory, "notes.txt"), "before\n", "utf8");
    const tool = getTool("read_file") as ToolDefinition<{ path: string }>;

    const firstRead = await tool.execute({ path: "notes.txt" }, directory);
    expect(firstRead.success).toBe(true);
    const firstHash = getTrackedReadHash("notes.txt");
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);

    await writeFile(path.join(directory, "notes.txt"), "after\n", "utf8");
    const secondRead = await tool.execute({ path: "notes.txt" }, directory);
    expect(secondRead.success).toBe(true);
    expect(getTrackedReadHash("notes.txt")).not.toBe(firstHash);
  });

  it("creates missing parent directories and reports line counts through write_file", async () => {
    const directory = await createTempProject();
    const tool = getTool("write_file") as ToolDefinition<{
      path: string;
      content: string;
      overwrite?: boolean;
    }>;

    const result = await tool.execute(
      {
        path: "docs/nested/output.md",
        content: "# Shipyard\n",
      },
      directory,
    );

    expect(result).toMatchObject({
      success: true,
    });
    expect(result.output).toContain("Created docs/nested/output.md");
    expect(result.output).toContain("Lines: 1");
    await expect(
      readFile(path.join(directory, "docs/nested/output.md"), "utf8"),
    ).resolves.toBe("# Shipyard\n");
  });

  it("rejects write_file overwrites by default and keeps errors relative-only", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "docs"), { recursive: true });
    await writeFile(path.join(directory, "docs/output.md"), "original\n", "utf8");
    const tool = getTool("write_file") as ToolDefinition<{
      path: string;
      content: string;
      overwrite?: boolean;
    }>;

    const result = await tool.execute(
      {
        path: "docs/output.md",
        content: "updated\n",
      },
      directory,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("File already exists: docs/output.md");
    expect(result.error).toContain("Use edit_block");
    expect(result.error).not.toContain(directory);
  });

  it("allows full replacement only when overwrite is explicitly true", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "docs"), { recursive: true });
    await writeFile(path.join(directory, "docs/output.md"), "original\n", "utf8");
    const tool = getTool("write_file") as ToolDefinition<{
      path: string;
      content: string;
      overwrite?: boolean;
    }>;

    const result = await tool.execute(
      {
        path: "docs/output.md",
        content: "updated\n",
        overwrite: true,
      },
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Replaced docs/output.md");
    expect(result.output).toContain("Lines: 1");
    await expect(readFile(path.join(directory, "docs/output.md"), "utf8")).resolves.toBe(
      "updated\n",
    );
  });
});

async function expectSingleEditPass(
  lineCount: number,
  anchorLabel: string,
): Promise<void> {
  const directory = await createTempProject();
  const relativePath = `${anchorLabel.toLowerCase()}.ts`;
  const originalContents = buildSizedFile(lineCount, anchorLabel);

  await writeTargetFile({
    targetDirectory: directory,
    path: relativePath,
    content: originalContents,
  });

  const current = await readTargetFile({
    targetDirectory: directory,
    path: relativePath,
  });

  const next = await editBlock({
    targetDirectory: directory,
    path: relativePath,
    old_string: `const ${anchorLabel} = "anchor";`,
    new_string: `const ${anchorLabel} = "updated";`,
  });

  expect(next.replacements).toBe(1);
  expect(next.changed).toBe(true);
  expect(next.contents).toContain(`const ${anchorLabel} = "updated";`);
  expect(next.hash).not.toBe(current.hash);
  expect(getTrackedReadHash(relativePath)).toBe(next.hash);

  const fileOnDisk = await readFile(path.join(directory, relativePath), "utf8");
  expect(fileOnDisk).toContain(`const ${anchorLabel} = "updated";`);
}
