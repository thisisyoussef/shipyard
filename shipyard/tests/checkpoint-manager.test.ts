import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CheckpointManager } from "../src/checkpoints/manager.js";

const createdDirectories: string[] = [];

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-checkpoints-"));
  createdDirectories.push(directory);
  return directory;
}

describe("CheckpointManager", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("stores a copy under the session checkpoint directory", async () => {
    const directory = await createTempProject();
    const filePath = path.join(directory, "src", "app.ts");

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "export const version = 1;\n", "utf8");

    const manager = new CheckpointManager(directory, "session-123");
    const checkpointPath = await manager.checkpoint("src/app.ts");

    expect(checkpointPath).toContain(
      path.join(directory, ".shipyard", "checkpoints", "session-123"),
    );
    expect(path.basename(checkpointPath)).toMatch(
      /^\d{8}T\d{9}Z-\d{4}--.+\.checkpoint$/,
    );
    expect(await readFile(checkpointPath, "utf8")).toBe(
      "export const version = 1;\n",
    );
  });

  it("returns false when no checkpoint exists for the file", async () => {
    const directory = await createTempProject();
    const manager = new CheckpointManager(directory, "session-123");

    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "src", "app.ts"), "unchanged\n", "utf8");

    await expect(manager.revert("src/app.ts")).resolves.toBe(false);
  });

  it("restores the newest checkpoint for the requested relative path", async () => {
    const directory = await createTempProject();
    const sourceFilePath = path.join(directory, "src", "app.ts");
    const siblingFilePath = path.join(directory, "docs", "app.ts");

    await mkdir(path.dirname(sourceFilePath), { recursive: true });
    await mkdir(path.dirname(siblingFilePath), { recursive: true });
    await writeFile(sourceFilePath, "export const version = 1;\n", "utf8");
    await writeFile(siblingFilePath, "docs version 1\n", "utf8");

    const manager = new CheckpointManager(directory, "session-123");
    await manager.checkpoint("src/app.ts");
    await manager.checkpoint("docs/app.ts");

    await writeFile(sourceFilePath, "export const version = 2;\n", "utf8");
    await manager.checkpoint("src/app.ts");

    await writeFile(sourceFilePath, "broken change\n", "utf8");
    await writeFile(siblingFilePath, "docs broken\n", "utf8");

    await expect(manager.revert("src/app.ts")).resolves.toBe(true);

    expect(await readFile(sourceFilePath, "utf8")).toBe(
      "export const version = 2;\n",
    );
    expect(await readFile(siblingFilePath, "utf8")).toBe("docs broken\n");
  });
});
