import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverTarget } from "../src/context/discovery.js";

const createdDirectories: string[] = [];

describe("discoverTarget", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    for (const directory of directories) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, { recursive: true, force: true }),
      );
    }
  });

  it("reports the local Ship repo structure", async () => {
    const shipPath = "/Users/youss/Development/gauntlet/ship";
    const report = await discoverTarget(shipPath);

    expect(report.isGreenfield).toBe(false);
    expect(report.language).toBe("typescript");
    expect(report.packageManager).toBe("pnpm");
    expect(Object.keys(report.scripts).length).toBeGreaterThan(0);
    expect(report.hasReadme).toBe(true);
    expect(report.hasAgentsMd).toBe(true);
    expect(report.topLevelFiles).toContain("package.json");
    expect(report.topLevelDirectories.length).toBeGreaterThan(0);
  });

  it("reports an empty folder as greenfield", async () => {
    const emptyDirectory = await mkdtemp(path.join(tmpdir(), "shipyard-empty-"));
    createdDirectories.push(emptyDirectory);

    const report = await discoverTarget(emptyDirectory);

    expect(report.isGreenfield).toBe(true);
    expect(report.language).toBeNull();
    expect(report.framework).toBeNull();
    expect(report.packageManager).toBeNull();
    expect(report.scripts).toEqual({});
    expect(report.hasReadme).toBe(false);
    expect(report.hasAgentsMd).toBe(false);
    expect(report.topLevelFiles).toEqual([]);
    expect(report.topLevelDirectories).toEqual([]);
    expect(report.projectName).toBeNull();
  });

  it("keeps README/AGENTS seeded targets bootstrap-ready", async () => {
    const seededDirectory = await mkdtemp(path.join(tmpdir(), "shipyard-seeded-"));
    createdDirectories.push(seededDirectory);
    await writeFile(
      path.join(seededDirectory, "README.md"),
      "# Seeded target\n",
      "utf8",
    );
    await writeFile(
      path.join(seededDirectory, "AGENTS.md"),
      "Follow the local rules.\n",
      "utf8",
    );

    const report = await discoverTarget(seededDirectory);

    expect(report.isGreenfield).toBe(true);
    expect(report.hasReadme).toBe(true);
    expect(report.hasAgentsMd).toBe(true);
    expect(report.topLevelFiles).toEqual(["AGENTS.md", "README.md"]);
  });

  it("infers preview capability from a Vite dev script", async () => {
    const targetDirectory = await mkdtemp(path.join(tmpdir(), "shipyard-previewable-"));
    createdDirectories.push(targetDirectory);
    await mkdir(path.join(targetDirectory, "src"), { recursive: true });
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify(
        {
          name: "previewable-demo",
          scripts: {
            dev: "vite",
            build: "vite build",
          },
          devDependencies: {
            vite: "^5.0.8",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = await discoverTarget(targetDirectory);

    expect(report.previewCapability).toMatchObject({
      status: "available",
      kind: "dev-server",
      runner: "npm",
      scriptName: "dev",
      autoRefresh: "native-hmr",
    });
    expect(report.previewCapability.command).toContain("npm run dev");
    expect(report.previewCapability.reason).toContain("Vite");
  });

  it("marks unsupported targets as preview-unavailable with a reason", async () => {
    const targetDirectory = await mkdtemp(path.join(tmpdir(), "shipyard-no-preview-"));
    createdDirectories.push(targetDirectory);
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify(
        {
          name: "api-only-demo",
          scripts: {
            test: "vitest run",
          },
          dependencies: {
            express: "^5.0.0",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = await discoverTarget(targetDirectory);

    expect(report.previewCapability).toMatchObject({
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      autoRefresh: "none",
      command: null,
    });
    expect(report.previewCapability.reason).toContain("No supported local preview");
  });
});
