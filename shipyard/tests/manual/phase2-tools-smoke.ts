import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import "../../src/tools/index.js";
import { clearTrackedReadHashes } from "../../src/tools/index.js";
import {
  getTool,
  type ToolDefinition,
} from "../../src/tools/registry.js";

interface RawCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
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

  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
}

async function main(): Promise<void> {
  clearTrackedReadHashes();

  const targetDirectory = await mkdtemp(
    path.join(tmpdir(), "shipyard-phase2-smoke-"),
  );

  try {
    await expectRawCommandSuccess(targetDirectory, "git init");
    await expectRawCommandSuccess(
      targetDirectory,
      "git config user.email shipyard@example.com",
    );
    await expectRawCommandSuccess(
      targetDirectory,
      "git config user.name 'Shipyard Smoke'",
    );

    const writeFileTool = getTool("write_file") as ToolDefinition<{
      path: string;
      content: string;
      overwrite?: boolean;
    }>;
    const readFileTool = getTool("read_file") as ToolDefinition<{
      path: string;
    }>;
    const editBlockTool = getTool("edit_block") as ToolDefinition<{
      path: string;
      old_string: string;
      new_string: string;
    }>;
    const listFilesTool = getTool("list_files") as ToolDefinition<{
      path?: string;
      depth?: number;
    }>;
    const searchFilesTool = getTool("search_files") as ToolDefinition<{
      pattern: string;
      file_pattern?: string;
      limit?: number;
    }>;
    const runCommandTool = getTool("run_command") as ToolDefinition<{
      command: string;
      timeout_seconds?: number;
    }>;
    const gitDiffTool = getTool("git_diff") as ToolDefinition<{
      staged?: boolean;
      path?: string;
    }>;

    assert((await writeFileTool.execute(
      {
        path: "package.json",
        content: JSON.stringify({ name: "phase2-smoke" }, null, 2),
      },
      targetDirectory,
    )).success);
    assert((await writeFileTool.execute(
      {
        path: "src/app.ts",
        content: 'export const value = "before";\n',
      },
      targetDirectory,
    )).success);
    assert((await writeFileTool.execute(
      {
        path: "src/stale.ts",
        content: 'export const stale = "before";\n',
      },
      targetDirectory,
    )).success);
    assert((await writeFileTool.execute(
      {
        path: "src/ambiguous.ts",
        content: 'const duplicate = "same";\nconst duplicate = "same";\n',
      },
      targetDirectory,
    )).success);

    await expectRawCommandSuccess(targetDirectory, "git add .");
    await expectRawCommandSuccess(targetDirectory, "git commit -m 'phase2 baseline'");

    const listing = await listFilesTool.execute(
      {
        path: ".",
        depth: 2,
      },
      targetDirectory,
    );
    assert.equal(listing.success, true);
    assert.match(listing.output, /src\//);

    const readResult = await readFileTool.execute(
      {
        path: "src/app.ts",
      },
      targetDirectory,
    );
    assert.equal(readResult.success, true);
    assert.match(readResult.output, /Hash:/);

    const searchResult = await searchFilesTool.execute(
      {
        pattern: "before",
        file_pattern: "src/*.ts",
      },
      targetDirectory,
    );
    assert.equal(searchResult.success, true);
    assert.match(searchResult.output, /src\/app\.ts:1:/);

    const editSuccess = await editBlockTool.execute(
      {
        path: "src/app.ts",
        old_string: 'export const value = "before";',
        new_string: 'export const value = "after";',
      },
      targetDirectory,
    );
    assert.equal(editSuccess.success, true);
    assert.match(editSuccess.output, /Edited src\/app\.ts/);

    const missingAnchor = await editBlockTool.execute(
      {
        path: "src/app.ts",
        old_string: 'export const missing = true;',
        new_string: 'export const missing = false;',
      },
      targetDirectory,
    );
    assert.equal(missingAnchor.success, false);
    assert.match(missingAnchor.error ?? "", /Anchor not found/);

    await readFileTool.execute(
      {
        path: "src/ambiguous.ts",
      },
      targetDirectory,
    );
    const ambiguousEdit = await editBlockTool.execute(
      {
        path: "src/ambiguous.ts",
        old_string: 'const duplicate = "same";',
        new_string: 'const duplicate = "new";',
      },
      targetDirectory,
    );
    assert.equal(ambiguousEdit.success, false);
    assert.match(ambiguousEdit.error ?? "", /Include more surrounding context/);

    await readFileTool.execute(
      {
        path: "src/stale.ts",
      },
      targetDirectory,
    );
    await writeFile(
      path.join(targetDirectory, "src/stale.ts"),
      'export const stale = "changed";\n',
      "utf8",
    );
    const staleEdit = await editBlockTool.execute(
      {
        path: "src/stale.ts",
        old_string: 'export const stale = "changed";',
        new_string: 'export const stale = "after";',
      },
      targetDirectory,
    );
    assert.equal(staleEdit.success, false);
    assert.match(staleEdit.error ?? "", /Re-run read_file/);

    const commandSuccess = await runCommandTool.execute(
      {
        command: "pwd",
      },
      targetDirectory,
    );
    assert.equal(commandSuccess.success, true);
    assert.match(commandSuccess.output, /Command: pwd/);

    const commandFailure = await runCommandTool.execute(
      {
        command: "node -e \"process.stderr.write('smoke fail\\n'); process.exit(3)\"",
      },
      targetDirectory,
    );
    assert.equal(commandFailure.success, false);
    assert.match(commandFailure.error ?? "", /Exit code: 3/);

    const commandTimeout = await runCommandTool.execute(
      {
        command: "node -e \"setTimeout(() => console.log('done'), 2000)\"",
        timeout_seconds: 1,
      },
      targetDirectory,
    );
    assert.equal(commandTimeout.success, false);
    assert.match(commandTimeout.error ?? "", /Timed out: yes/);

    const diffUnstaged = await gitDiffTool.execute(
      {
        path: "src/app.ts",
      },
      targetDirectory,
    );
    assert.equal(diffUnstaged.success, true);
    assert.match(diffUnstaged.output, /diff --git a\/src\/app\.ts b\/src\/app\.ts/);

    await expectRawCommandSuccess(targetDirectory, "git add src/app.ts");
    const diffStaged = await gitDiffTool.execute(
      {
        staged: true,
        path: "src/app.ts",
      },
      targetDirectory,
    );
    assert.equal(diffStaged.success, true);
    assert.match(diffStaged.output, /--staged/);

    const fileOnDisk = await readFile(path.join(targetDirectory, "src/app.ts"), "utf8");
    assert.match(fileOnDisk, /after/);

    console.log("Phase 2 tool smoke passed.");
  } finally {
    clearTrackedReadHashes();
    await rm(targetDirectory, { recursive: true, force: true });
  }
}

await main();
