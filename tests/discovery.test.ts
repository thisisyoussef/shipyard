import { mkdtemp } from "node:fs/promises";
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

    expect(report.isEmpty).toBe(false);
    expect(report.isGreenfield).toBe(false);
    expect(report.packageJsonExists).toBe(true);
    expect(report.primaryLanguage).toBe("typescript");
    expect(report.packageManager).toBe("pnpm");
    expect(report.scripts.length).toBeGreaterThan(0);
    expect(report.hasReadme).toBe(true);
    expect(report.hasAgents).toBe(true);
  });

  it("reports an empty folder as greenfield", async () => {
    const emptyDirectory = await mkdtemp(path.join(tmpdir(), "shipyard-empty-"));
    createdDirectories.push(emptyDirectory);

    const report = await discoverTarget(emptyDirectory);

    expect(report.isEmpty).toBe(true);
    expect(report.isGreenfield).toBe(true);
    expect(report.summary).toBe("greenfield project");
    expect(report.packageJsonExists).toBe(false);
    expect(report.scripts).toEqual([]);
  });
});
