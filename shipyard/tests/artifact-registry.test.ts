import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createExecutionHandoff,
  createExecutionHandoffDecision,
  saveExecutionHandoff,
} from "../src/artifacts/handoff.js";
import {
  loadArtifact,
  queryArtifacts,
  saveArtifact,
} from "../src/artifacts/registry/index.js";
import type {
  ExecutionSpec,
  VerificationReport,
} from "../src/artifacts/types.js";
import { derivePlanTasks, savePlanTaskQueue } from "../src/plans/store.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createExecutionSpec(): ExecutionSpec {
  return {
    instruction: "Plan the artifact registry story.",
    goal: "Add a versioned artifact registry and query surface.",
    deliverables: [
      "Persist typed artifact metadata and content under .shipyard/artifacts/registry/.",
      "Project legacy plan queues and handoffs into the registry.",
    ],
    acceptanceCriteria: [
      "The registry versions artifacts by logical id.",
      "Legacy plan and handoff files stay usable.",
    ],
    verificationIntent: [
      "Run the artifact registry tests.",
    ],
    targetFilePaths: [
      "src/artifacts/types.ts",
      "src/artifacts/registry/index.ts",
    ],
    risks: [
      "Legacy projections could drift from the source files if fingerprints are wrong.",
    ],
  };
}

function createVerificationReport(
  overrides: Partial<VerificationReport> = {},
): VerificationReport {
  return {
    command: "pnpm test",
    exitCode: 0,
    passed: true,
    stdout: "",
    stderr: "",
    summary: "Verification passed.",
    ...overrides,
  };
}

describe("artifact registry", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("saves and versions multiple artifacts with one logical id", async () => {
    const targetDirectory = await createTempDirectory("shipyard-artifact-version-");

    const first = await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "story-001",
      status: "draft",
      producedBy: "pm",
      tags: ["auth", "frontend"],
      contentKind: "markdown",
      content: "# Story 001\n\nFirst draft",
    });
    const second = await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "story-001",
      status: "approved",
      producedBy: "pm",
      tags: ["auth", "frontend"],
      contentKind: "markdown",
      content: "# Story 001\n\nApproved draft",
    });

    expect(first.metadata.version).toBe(1);
    expect(second.metadata.version).toBe(2);
    expect(second.metadataPath).toContain(
      ".shipyard/artifacts/registry/technical-spec/story-001/",
    );
    expect(second.contentPath).toContain("v0002.content.md");
  });

  it("queries the latest approved artifact by type and tag and keeps content compact by default", async () => {
    const targetDirectory = await createTempDirectory("shipyard-artifact-query-");

    await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "story-001",
      status: "draft",
      producedBy: "pm",
      tags: ["auth", "frontend"],
      contentKind: "markdown",
      content: "# Story 001\n\nDraft",
    });
    const approved = await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "story-001",
      status: "approved",
      producedBy: "pm",
      tags: ["auth", "frontend"],
      contentKind: "markdown",
      content: "# Story 001\n\nApproved",
    });
    await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "story-002",
      status: "approved",
      producedBy: "pm",
      tags: ["billing"],
      contentKind: "markdown",
      content: "# Story 002\n\nApproved",
    });

    const result = await queryArtifacts(targetDirectory, {
      type: "technical-spec",
      status: "approved",
      tags: ["auth"],
      latestOnly: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.records).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          id: "story-001",
          version: approved.metadata.version,
          status: "approved",
        }),
        content: undefined,
      }),
    ]);

    const loaded = await loadArtifact(
      targetDirectory,
      {
        type: "technical-spec",
        id: "story-001",
        version: approved.metadata.version,
      },
      { includeContent: true },
    );

    expect(loaded.error).toBeNull();
    expect(loaded.record?.content).toBe("# Story 001\n\nApproved");
  });

  it("fails closed on malformed artifact metadata without poisoning unrelated reads", async () => {
    const targetDirectory = await createTempDirectory("shipyard-artifact-bad-meta-");

    const broken = await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "broken-story",
      status: "approved",
      producedBy: "pm",
      tags: ["auth"],
      contentKind: "markdown",
      content: "# Broken",
    });
    const healthy = await saveArtifact(targetDirectory, {
      type: "technical-spec",
      id: "healthy-story",
      status: "approved",
      producedBy: "pm",
      tags: ["auth"],
      contentKind: "markdown",
      content: "# Healthy",
    });

    await writeFile(
      path.join(targetDirectory, broken.metadataPath),
      "{bad json",
      "utf8",
    );

    const result = await queryArtifacts(targetDirectory, {
      type: "technical-spec",
      status: "approved",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.metadata.id).toBe("healthy-story");
    expect(result.errors).toEqual([
      expect.stringMatching(/Malformed artifact metadata/i),
    ]);

    const loaded = await loadArtifact(targetDirectory, {
      type: "technical-spec",
      id: "broken-story",
      version: broken.metadata.version,
    });

    expect(loaded.record).toBeNull();
    expect(loaded.error).toMatch(/Malformed artifact metadata/i);
    expect(healthy.metadata.version).toBe(1);
  });

  it("persists markdown and json content behind one registry contract", async () => {
    const targetDirectory = await createTempDirectory("shipyard-artifact-content-");

    const markdown = await saveArtifact(targetDirectory, {
      type: "discovery-brief",
      id: "brief-001",
      status: "draft",
      producedBy: "discovery",
      contentKind: "markdown",
      content: "# Discovery Brief\n\nUser goals.",
    });
    const json = await saveArtifact(targetDirectory, {
      type: "verification-report",
      id: "verification-001",
      status: "generated",
      producedBy: "qa",
      contentKind: "json",
      content: {
        passed: true,
        checks: ["typecheck", "build"],
      },
    });

    const markdownLoaded = await loadArtifact(
      targetDirectory,
      {
        type: markdown.metadata.type,
        id: markdown.metadata.id,
        version: markdown.metadata.version,
      },
      { includeContent: true },
    );
    const jsonLoaded = await loadArtifact(
      targetDirectory,
      {
        type: json.metadata.type,
        id: json.metadata.id,
        version: json.metadata.version,
      },
      { includeContent: true },
    );

    expect(markdownLoaded.record?.content).toBe("# Discovery Brief\n\nUser goals.");
    expect(jsonLoaded.record?.content).toEqual({
      passed: true,
      checks: ["typecheck", "build"],
    });
  });

  it("projects legacy plan artifacts into the registry without changing plan storage", async () => {
    const targetDirectory = await createTempDirectory("shipyard-artifact-legacy-plan-");
    const executionSpec = createExecutionSpec();

    const savedPlan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      loadedSpecRefs: ["spec:phase-11/p11-s01"],
      tasks: derivePlanTasks({
        executionSpec,
        loadedSpecRefs: ["spec:phase-11/p11-s01"],
      }),
      createdAt: "2026-03-28T10:00:00.000Z",
    });

    const result = await queryArtifacts(targetDirectory, {
      type: "plan-task-queue",
      latestOnly: true,
      includeContent: true,
    });

    expect(result.projectedLegacyCount).toBeGreaterThanOrEqual(1);
    expect(result.records).toEqual([
      expect.objectContaining({
        source: "legacy-plan",
        metadata: expect.objectContaining({
          id: savedPlan.planId,
          version: 1,
          status: "generated",
        }),
        content: expect.objectContaining({
          planId: savedPlan.planId,
          goal: executionSpec.goal,
        }),
      }),
    ]);
  });

  it("projects execution handoffs into compact registry summaries", async () => {
    const targetDirectory = await createTempDirectory("shipyard-artifact-legacy-handoff-");
    const decision = createExecutionHandoffDecision({
      actingIterations: 5,
      retryCountsByFile: {},
      blockedFiles: [],
    });

    await saveExecutionHandoff(
      targetDirectory,
      createExecutionHandoff({
        sessionId: "session-123",
        turnCount: 3,
        instruction: "Continue the artifact registry work",
        phaseName: "code",
        runtimeMode: "graph",
        status: "success",
        summary: "Turn 3 checkpointed the artifact registry work.",
        taskPlan: {
          instruction: "Continue the artifact registry work",
          goal: "Finish the artifact registry implementation.",
          targetFilePaths: ["src/artifacts/registry/index.ts"],
          plannedSteps: ["Implement the registry helpers."],
        },
        actingIterations: 5,
        retryCountsByFile: {},
        blockedFiles: [],
        lastEditedFile: "src/artifacts/registry/index.ts",
        touchedFiles: ["src/artifacts/registry/index.ts"],
        verificationReport: createVerificationReport(),
        decision,
        createdAt: "2026-03-28T10:05:00.000Z",
      }),
    );

    const result = await queryArtifacts(targetDirectory, {
      type: "execution-handoff",
      latestOnly: true,
    });

    expect(result.projectedLegacyCount).toBeGreaterThanOrEqual(1);
    expect(result.records).toEqual([
      expect.objectContaining({
        source: "legacy-handoff",
        metadata: expect.objectContaining({
          id: "session-123",
          version: 3,
          status: "generated",
        }),
        summary: expect.stringContaining("checkpointed the artifact registry work"),
        content: undefined,
      }),
    ]);
  });
});
