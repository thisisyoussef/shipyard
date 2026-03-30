import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { discoverTarget } from "../src/context/discovery.js";
import {
  captureTargetReleaseArchive,
  resolveTargetReleaseArchiveRoot,
} from "../src/tools/target-manager/release-archive.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
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

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("target release archive", () => {
  it("captures a target into a standalone archive repo with release metadata", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-target-archives-");
    const targetDirectory = path.join(targetsDirectory, "demo-target");

    await mkdir(path.join(targetDirectory, "src"), { recursive: true });
    await mkdir(path.join(targetDirectory, "node_modules", "left-pad"), {
      recursive: true,
    });
    await mkdir(path.join(targetDirectory, ".shipyard", "sessions"), {
      recursive: true,
    });
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({
        name: "demo-target",
        packageManager: "pnpm@10.33.0",
        scripts: {
          dev: "vite",
        },
        dependencies: {
          react: "^19.2.4",
        },
        devDependencies: {
          vite: "^8.0.2",
        },
      }, null, 2),
      "utf8",
    );
    await writeFile(path.join(targetDirectory, "tsconfig.json"), "{ }\n", "utf8");
    await writeFile(
      path.join(targetDirectory, "src", "main.ts"),
      "export const ready = true;\n",
      "utf8",
    );
    await writeFile(path.join(targetDirectory, ".env"), "SECRET_TOKEN=demo\n", "utf8");
    await writeFile(
      path.join(targetDirectory, "node_modules", "left-pad", "index.js"),
      "module.exports = () => 0;\n",
      "utf8",
    );
    await writeFile(
      path.join(targetDirectory, ".shipyard", "sessions", "demo.json"),
      "{ }\n",
      "utf8",
    );

    const discovery = await discoverTarget(targetDirectory);
    const archiveRoot = resolveTargetReleaseArchiveRoot(targetsDirectory);

    const captured = await captureTargetReleaseArchive({
      archiveRoot,
      targetDirectory,
      targetsDirectory,
      sessionId: "session-demo",
      turnCount: 12,
      previewState: {
        status: "running",
        summary: "Preview is running on loopback.",
        url: "http://127.0.0.1:4174/",
        logTail: [],
        lastRestartReason: "Refresh requested: src/main.ts",
      },
      discovery,
      targetProfile: {
        name: "demo-target",
        description: "Standalone archive demo target.",
        purpose: "Verify snapshot persistence after preview refresh.",
        stack: ["TypeScript", "React"],
        architecture: "Single package workspace",
        keyPatterns: ["preview refresh", "archive tags"],
        complexity: "small",
        suggestedAgentsRules: "# AGENTS.md\nKeep archive writes asynchronous.",
        suggestedScripts: {
          test: "vitest run",
        },
        taskSuggestions: ["Add richer UI coverage"],
        enrichedAt: "2026-03-28T00:00:00.000Z",
        enrichmentModel: "test-model",
        discoverySnapshot: discovery,
      },
    });

    expect(captured.archiveRoot).toBe(archiveRoot);
    expect(captured.archiveRepoPath).toContain(archiveRoot);
    expect(captured.description).toBe("Standalone archive demo target.");
    expect(captured.tags).toEqual(
      expect.arrayContaining(["preview-refresh", "typescript", "react", "pnpm"]),
    );

    await expect(
      readFile(path.join(captured.archiveRepoPath, "src", "main.ts"), "utf8"),
    ).resolves.toContain("ready = true");
    await expect(
      readFile(path.join(captured.archiveRepoPath, ".env"), "utf8"),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(captured.archiveRepoPath, ".shipyard", "sessions", "demo.json"), "utf8"),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(captured.archiveRepoPath, "node_modules", "left-pad", "index.js"), "utf8"),
    ).rejects.toThrow();

    const descriptor = JSON.parse(
      await readFile(
        path.join(
          captured.archiveRepoPath,
          ".shipyard-target-archive",
          "target.json",
        ),
        "utf8",
      ),
    ) as {
      latestTag: string;
      latestDescription: string;
      latestTags: string[];
    };
    expect(descriptor.latestTag).toBe(captured.tag);
    expect(descriptor.latestDescription).toBe("Standalone archive demo target.");
    expect(descriptor.latestTags).toEqual(captured.tags);

    const releaseRecord = JSON.parse(
      await readFile(captured.releaseMetadataPath, "utf8"),
    ) as {
      reason: string;
      description: string;
      tags: string[];
      turnCount: number;
    };
    expect(releaseRecord.reason).toBe("Refresh requested: src/main.ts");
    expect(releaseRecord.description).toBe("Standalone archive demo target.");
    expect(releaseRecord.tags).toEqual(captured.tags);
    expect(releaseRecord.turnCount).toBe(12);

    const tagList = await runGit(captured.archiveRepoPath, ["tag", "--list"]);
    expect(tagList.exitCode).toBe(0);
    expect(tagList.stdout.split("\n").filter(Boolean)).toContain(captured.tag);

    const archiveIndex = JSON.parse(
      await readFile(path.join(archiveRoot, "index.json"), "utf8"),
    ) as {
      targets: Array<{
        targetDirectory: string;
        archiveRepoPath: string;
        latestTag: string;
      }>;
    };
    expect(archiveIndex.targets).toContainEqual(
      expect.objectContaining({
        targetDirectory,
        archiveRepoPath: captured.archiveRepoPath,
        latestTag: captured.tag,
      }),
    );
  });

  it("creates a new git tag for each later refresh and updates the shared index", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-target-archive-repeat-");
    const targetDirectory = path.join(targetsDirectory, "repeat-target");

    await mkdir(path.join(targetDirectory, "src"), { recursive: true });
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({
        name: "repeat-target",
        packageManager: "pnpm@10.33.0",
      }, null, 2),
      "utf8",
    );
    await writeFile(path.join(targetDirectory, "src", "main.ts"), "export const v = 1;\n");

    const discovery = await discoverTarget(targetDirectory);
    const archiveRoot = resolveTargetReleaseArchiveRoot(targetsDirectory);

    const firstCapture = await captureTargetReleaseArchive({
      archiveRoot,
      targetDirectory,
      targetsDirectory,
      sessionId: "session-repeat",
      turnCount: 1,
      previewState: {
        status: "running",
        summary: "Preview is running on loopback.",
        url: "http://127.0.0.1:4174/",
        logTail: [],
        lastRestartReason: "Refresh requested: src/main.ts",
      },
      discovery,
    });

    await writeFile(path.join(targetDirectory, "src", "main.ts"), "export const v = 2;\n");

    const secondCapture = await captureTargetReleaseArchive({
      archiveRoot,
      targetDirectory,
      targetsDirectory,
      sessionId: "session-repeat",
      turnCount: 2,
      previewState: {
        status: "running",
        summary: "Preview is running on loopback.",
        url: "http://127.0.0.1:4174/",
        logTail: [],
        lastRestartReason: "Refresh requested: src/main.ts",
      },
      discovery: await discoverTarget(targetDirectory),
    });

    expect(secondCapture.archiveRepoPath).toBe(firstCapture.archiveRepoPath);
    expect(secondCapture.tag).not.toBe(firstCapture.tag);

    const tagList = await runGit(secondCapture.archiveRepoPath, ["tag", "--list"]);
    expect(tagList.exitCode).toBe(0);
    expect(tagList.stdout.split("\n").filter(Boolean)).toEqual(
      expect.arrayContaining([firstCapture.tag, secondCapture.tag]),
    );

    const log = await runGit(secondCapture.archiveRepoPath, ["log", "--oneline"]);
    expect(log.exitCode).toBe(0);
    expect(log.stdout.split("\n").filter(Boolean)).toHaveLength(2);

    const archiveIndex = JSON.parse(
      await readFile(path.join(archiveRoot, "index.json"), "utf8"),
    ) as {
      targets: Array<{
        targetDirectory: string;
        latestTag: string;
      }>;
    };
    const targetEntry = archiveIndex.targets.find((entry) =>
      entry.targetDirectory === targetDirectory
    );
    expect(targetEntry?.latestTag).toBe(secondCapture.tag);
  });
});
