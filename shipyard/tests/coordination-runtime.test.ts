import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acknowledgeCoordinationMessage,
  acquireFileLease,
  openCoordinationThread,
  releaseFileLease,
  renewFileLease,
} from "../src/coordination/runtime.js";
import { loadCoordinationState } from "../src/coordination/store.js";

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

describe("coordination runtime", () => {
  it("records advisory file lease acquisition, renewal, and release", async () => {
    const targetDirectory = await createTempDirectory("shipyard-coordination-lease-");
    const acquiredAt = "2026-03-28T18:00:00.000Z";
    const renewedAt = "2026-03-28T18:05:00.000Z";
    const releasedAt = "2026-03-28T18:10:00.000Z";

    const acquired = await acquireFileLease(targetDirectory, {
      nodeId: "task-story-001",
      storyId: "STORY-001",
      holderRoleId: "implementer",
      advisoryScope: "Shipyard runtime task graph files",
      filePaths: [
        "shipyard/src/tasks/runtime.ts",
        "shipyard/src/tasks/contracts.ts",
      ],
      expiresAt: "2026-03-28T18:30:00.000Z",
      now: () => acquiredAt,
    });

    const renewed = await renewFileLease(targetDirectory, {
      leaseId: acquired.lease.id,
      holderRoleId: "implementer",
      expiresAt: "2026-03-28T18:45:00.000Z",
      now: () => renewedAt,
    });

    await releaseFileLease(targetDirectory, {
      leaseId: acquired.lease.id,
      holderRoleId: "implementer",
      reason: "Implementation handoff complete.",
      now: () => releasedAt,
    });

    const state = await loadCoordinationState(targetDirectory);

    expect(acquired.lease).toMatchObject({
      nodeId: "task-story-001",
      holderRoleId: "implementer",
      status: "active",
      advisory: true,
    });
    expect(renewed.lease).toMatchObject({
      id: acquired.lease.id,
      renewedAt,
      expiresAt: "2026-03-28T18:45:00.000Z",
    });
    expect(state?.fileLeases[0]).toMatchObject({
      id: acquired.lease.id,
      status: "released",
      releasedAt,
      releasedReason: "Implementation handoff complete.",
    });
    expect(state?.auditTrail.map((entry) => entry.kind)).toEqual([
      "lease-released",
      "lease-renewed",
      "lease-acquired",
    ]);
  });

  it("threads coordination messages with acknowledgement state", async () => {
    const targetDirectory = await createTempDirectory("shipyard-coordination-thread-");
    const openedAt = "2026-03-28T18:20:00.000Z";
    const replyAt = "2026-03-28T18:25:00.000Z";
    const acknowledgedAt = "2026-03-28T18:30:00.000Z";

    const opened = await openCoordinationThread(targetDirectory, {
      storyId: "STORY-020",
      taskId: "task-story-020",
      subject: "Resolve the remaining branch review notes",
      ownerRoleId: "coordinator",
      authorRoleId: "coordinator",
      body: "Implementer should finish the green stage before PR review.",
      now: () => openedAt,
    });

    const replied = await openCoordinationThread(targetDirectory, {
      threadId: opened.thread.id,
      authorRoleId: "implementer",
      body: "Acknowledged. I will finish the implementation pass next.",
      now: () => replyAt,
    });

    await acknowledgeCoordinationMessage(targetDirectory, {
      threadId: opened.thread.id,
      messageId: replied.message.id,
      roleId: "reviewer",
      now: () => acknowledgedAt,
    });

    const state = await loadCoordinationState(targetDirectory);

    expect(state?.threads[0]).toMatchObject({
      id: opened.thread.id,
      subject: "Resolve the remaining branch review notes",
      ownerRoleId: "coordinator",
      status: "open",
    });
    expect(state?.threads[0]?.messages).toHaveLength(2);
    expect(state?.threads[0]?.messages[1]).toMatchObject({
      id: replied.message.id,
      authorRoleId: "implementer",
      acknowledgements: [
        {
          roleId: "reviewer",
          acknowledgedAt,
        },
      ],
    });
    expect(state?.auditTrail.map((entry) => entry.kind)).toEqual([
      "message-acknowledged",
      "message-appended",
      "thread-opened",
    ]);
  });
});
