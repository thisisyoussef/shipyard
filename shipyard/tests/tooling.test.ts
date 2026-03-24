import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CODE_PHASE_TOOL_NAMES,
  getCodePhaseToolDefinitions,
} from "../src/phases/code/index.js";
import {
  getAnthropicTools,
  getTool,
  getTools,
  registerTool,
  type ToolDefinition,
} from "../src/tools/registry.js";
import {
  ToolError,
  clearTrackedReadHashes,
  editBlockTool as editBlock,
  getTrackedReadHash,
  listFilesTool as listFiles,
  readFileTool as readTargetFile,
  resolveWithinTarget,
  runCommandTool as runCommand,
  searchFilesTool as searchFiles,
  writeFileTool as writeTargetFile,
} from "../src/tools/index.js";
import { readFileDefinition } from "../src/tools/read-file.js";

const createdDirectories: string[] = [];

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-tools-"));
  createdDirectories.push(directory);
  return directory;
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

  it("rejects stale hashes before editing", async () => {
    const directory = await createTempProject();
    const filePath = path.join(directory, "stale.ts");
    await writeFile(filePath, 'const value = "before";\n', "utf8");

    const initial = await readTargetFile({
      targetDirectory: directory,
      path: "stale.ts",
    });

    await writeFile(filePath, 'const value = "changed";\n', "utf8");

    await expect(
      editBlock({
        targetDirectory: directory,
        path: "stale.ts",
        oldString: 'const value = "changed";',
        newString: 'const value = "after";',
        expectedHash: initial.hash,
      }),
    ).rejects.toThrowError("File changed since last read");
  });

  it("rejects ambiguous anchors", async () => {
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
        oldString: 'const value = "same";',
        newString: 'const value = "new";',
        expectedHash: current.hash,
      }),
    ).rejects.toThrowError("Anchor must match exactly once");
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

  it("lists files with glob support", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 1;\n", {
      encoding: "utf8",
      flag: "w",
    });
    await writeFile(path.join(directory, "src/beta.ts"), "export const beta = 2;\n", {
      encoding: "utf8",
      flag: "w",
    });
    await writeFile(path.join(directory, "README.md"), "# demo\n", "utf8");

    const files = await listFiles({
      targetDirectory: directory,
      glob: "src/*.ts",
    });

    expect(files).toEqual(["src/alpha.ts", "src/beta.ts"]);
  });

  it("searches files with ripgrep", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(
      path.join(directory, "src/search.ts"),
      "export const SHIPYARD_MARKER = true;\n",
      "utf8",
    );

    const matches = await searchFiles({
      targetDirectory: directory,
      query: "SHIPYARD_MARKER",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.path).toBe("src/search.ts");
    expect(matches[0]?.lineNumber).toBe(1);
  });

  it("runs shell commands in the target directory", async () => {
    const directory = await createTempProject();
    const result = await runCommand({
      targetDirectory: directory,
      command: "pwd",
      timeoutMs: 2_000,
    });
    const canonicalDirectory = await realpath(directory);
    const canonicalStdout = await realpath(result.stdout.trim());

    expect(result.exitCode).toBe(0);
    expect(canonicalStdout).toBe(canonicalDirectory);
    expect(result.timedOut).toBe(false);
  });

  it("times out long-running commands", async () => {
    const directory = await createTempProject();
    const result = await runCommand({
      targetDirectory: directory,
      command: "node -e \"setTimeout(() => console.log('done'), 2000)\"",
      timeoutMs: 100,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
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

  it("exports Anthropic-ready schemas for requested tools", () => {
    const tools = getAnthropicTools(["read_file", "write_file"]);

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
    oldString: `const ${anchorLabel} = "anchor";`,
    newString: `const ${anchorLabel} = "updated";`,
    expectedHash: current.hash,
  });

  expect(next.replacements).toBe(1);
  expect(next.contents).toContain(`const ${anchorLabel} = "updated";`);
  expect(next.hash).not.toBe(current.hash);

  const fileOnDisk = await readFile(path.join(directory, relativePath), "utf8");
  expect(fileOnDisk).toContain(`const ${anchorLabel} = "updated";`);
}
