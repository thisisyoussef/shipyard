import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalTraceLogger } from "../src/tracing/local-log.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("local trace logger", () => {
  it("treats late writes after target cleanup as best-effort", async () => {
    const targetDirectory = await createTempDirectory("shipyard-local-log-");
    const logger = await createLocalTraceLogger(targetDirectory, "late-log-session");

    await rm(targetDirectory, { recursive: true, force: true });

    await expect(
      logger.log("late-cleanup-event", { ok: true }),
    ).resolves.toBeUndefined();
  });
});
