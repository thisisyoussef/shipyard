import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { repairMissionSessionArtifacts } from "../src/mission-control/recovery.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

describe("mission control recovery", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("restores the latest session and matching handoff backup when the live artifacts are missing", async () => {
    const root = await createTempDirectory("shipyard-mission-recovery-");
    const targetDirectory = path.join(root, "target");
    const sessionBackupsDirectory = path.join(root, "backups", "sessions");
    const handoffBackupsDirectory = path.join(root, "backups", "handoffs");
    const quarantineDirectory = path.join(root, "backups", "quarantine");

    await mkdir(targetDirectory, { recursive: true });
    await mkdir(sessionBackupsDirectory, { recursive: true });
    await mkdir(handoffBackupsDirectory, { recursive: true });

    const sessionBackupName = "2026-03-28T23-52-37-578Z.json";
    await writeFile(
      path.join(sessionBackupsDirectory, sessionBackupName),
      JSON.stringify({
        activeHandoffPath: ".shipyard/handoffs/next.md",
      }),
    );
    await writeFile(
      path.join(
        handoffBackupsDirectory,
        "2026-03-28T23-52-37-578Z-next.md",
      ),
      "# next handoff\n",
    );

    const result = await repairMissionSessionArtifacts({
      targetDirectory,
      sessionId: "session-123",
      paths: {
        sessionBackupsDirectory,
        handoffBackupsDirectory,
        quarantineDirectory,
      },
    });

    expect(result.restoredSession).toBe(true);
    expect(result.restoredHandoff).toBe(true);
    expect(result.sessionBackupFile).toBe(sessionBackupName);
    expect(
      JSON.parse(
        await readFile(
          path.join(targetDirectory, ".shipyard", "sessions", "session-123.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      activeHandoffPath: ".shipyard/handoffs/next.md",
    });
    expect(
      await readFile(
        path.join(targetDirectory, ".shipyard", "handoffs", "next.md"),
        "utf8",
      ),
    ).toContain("next handoff");
  });

  it("quarantines an invalid live session before restoring a backup", async () => {
    const root = await createTempDirectory("shipyard-mission-recovery-invalid-");
    const targetDirectory = path.join(root, "target");
    const sessionBackupsDirectory = path.join(root, "backups", "sessions");
    const handoffBackupsDirectory = path.join(root, "backups", "handoffs");
    const quarantineDirectory = path.join(root, "backups", "quarantine");

    await mkdir(path.join(targetDirectory, ".shipyard", "sessions"), {
      recursive: true,
    });
    await mkdir(sessionBackupsDirectory, { recursive: true });
    await mkdir(handoffBackupsDirectory, { recursive: true });
    await writeFile(
      path.join(targetDirectory, ".shipyard", "sessions", "session-456.json"),
      "{ not-json",
    );
    await writeFile(
      path.join(sessionBackupsDirectory, "2026-03-28T23-55-00-000Z.json"),
      JSON.stringify({
        activeHandoffPath: null,
      }),
    );

    const result = await repairMissionSessionArtifacts({
      targetDirectory,
      sessionId: "session-456",
      paths: {
        sessionBackupsDirectory,
        handoffBackupsDirectory,
        quarantineDirectory,
      },
    });

    expect(result.restoredSession).toBe(true);
    expect(result.sessionStatus).toBe("valid");

    const quarantinedEntries = await (await import("node:fs/promises")).readdir(
      quarantineDirectory,
    );
    expect(quarantinedEntries).toHaveLength(1);
  });
});
