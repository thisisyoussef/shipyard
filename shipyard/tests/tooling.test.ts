import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ToolError,
  editBlockTool as editBlock,
  listFilesTool as listFiles,
  readFileTool as readTargetFile,
  runCommandTool as runCommand,
  searchFilesTool as searchFiles,
  writeFileTool as writeTargetFile,
} from "../src/tools/index.js";

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
      path: "notes.txt",
    });

    expect(result.contents).toBe("hello shipyard\n");
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("writes a new file and rejects overwriting by default", async () => {
    const directory = await createTempProject();

    const result = await writeTargetFile({
      targetDirectory: directory,
      path: "docs/output.md",
      contents: "# Shipyard\n",
    });

    expect(result.contents).toBe("# Shipyard\n");

    await expect(
      writeTargetFile({
        targetDirectory: directory,
        path: "docs/output.md",
        contents: "replace me\n",
      }),
    ).rejects.toThrowError(ToolError);
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
    contents: originalContents,
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
