import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadArtifact,
  queryArtifacts,
} from "../src/artifacts/registry/index.js";
import type {
  DiscoveryReport,
  ResearchLookupResult,
} from "../src/artifacts/types.js";
import {
  createSessionState,
} from "../src/engine/state.js";
import { createInstructionRuntimeState } from "../src/engine/turn.js";
import {
  createDefaultPipelineDefinition,
} from "../src/pipeline/defaults.js";
import { executePipelineTurn } from "../src/pipeline/turn.js";
import {
  createFakeModelAdapter,
  createFakeTextTurnResult,
} from "./support/fake-model-adapter.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery(): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json", "README.md"],
    topLevelDirectories: ["src", "docs"],
    projectName: "shipyard-discovery-pm",
    previewCapability: {
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      command: null,
      reason: "No preview configured.",
      autoRefresh: "none",
    },
  };
}

function createResearchResult(): ResearchLookupResult {
  return {
    query: "Build a collaborative release planning app for product teams.",
    lookupStatus: "external",
    summary:
      "Use official React and Railway guidance first, then fill gaps from repo-local context.",
    sources: [
      {
        sourceId: "react-docs",
        title: "React Docs",
        url: "https://react.dev/reference/react",
        domain: "react.dev",
        label: "React Docs",
        tier: "official-docs",
        rank: 1,
        snippet: "Official React guidance for component patterns.",
      },
      {
        sourceId: "railway-docs",
        title: "Railway Docs",
        url: "https://docs.railway.com",
        domain: "docs.railway.com",
        label: "Railway Docs",
        tier: "official-docs",
        rank: 2,
        snippet: "Official Railway deployment and runtime docs.",
      },
      {
        sourceId: "repo-readme",
        title: "Repository README",
        url: "file://README.md",
        domain: "local",
        label: "Repo README",
        tier: "repo-local",
        rank: 3,
        snippet: "Repo-local constraints and scripts.",
      },
    ],
    takeaways: [
      {
        title: "Prefer official docs for unstable integrations",
        summary: "React and Railway docs should outrank community summaries.",
        sourceIds: ["react-docs", "railway-docs"],
      },
    ],
  };
}

function createRuntimeState(modelResponses: string[]) {
  const modelAdapter = createFakeModelAdapter(
    modelResponses.map((text) => createFakeTextTurnResult(text)),
  );

  return createInstructionRuntimeState({
    projectRules: "Keep artifacts deterministic and approval-friendly.",
    runtimeDependencies: {
      createRawLoopOptions() {
        return {
          modelAdapter,
          logger: {
            log() {},
          },
        };
      },
      async runResearchLookup() {
        return createResearchResult();
      },
    },
  });
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("discovery + PM pipeline", () => {
  it("creates discovery, research, PM, and backlog artifacts through the default pipeline", async () => {
    const targetDirectory = await createTempDirectory("shipyard-discovery-pm-");
    const sessionState = createSessionState({
      sessionId: "discovery-pm-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createRuntimeState([
      [
        "# Discovery Brief: Release Planning",
        "",
        "## Vision",
        "Help product teams plan releases with shared docs and review checkpoints.",
        "",
        "## Target Users",
        "- Product managers",
        "- Engineering leads",
      ].join("\n"),
      JSON.stringify({
        epics: [
          {
            title: "Collaborative planning",
            valueStatement: "Align product and engineering on one release plan.",
            scope: "Shared planning records and milestone grouping.",
            acceptanceCriteria: [
              "Teams can group release work under one planning space.",
            ],
            dependencies: [],
            estimatedComplexity: "Medium",
          },
        ],
      }),
      JSON.stringify({
        stories: [
          {
            epicId: "EPIC-001",
            title: "Plan review checklist",
            userStory:
              "As a product manager, I want an approval-ready release checklist so that reviews stay consistent.",
            acceptanceCriteria: [
              "Checklist items can be tracked and reviewed.",
            ],
            edgeCases: [
              "Empty plans still show review expectations.",
            ],
            dependencies: [],
            estimatedComplexity: "Small",
            priority: 2,
          },
          {
            epicId: "EPIC-001",
            title: "Release overview",
            userStory:
              "As an engineering lead, I want a release overview so that scope and milestones stay visible.",
            acceptanceCriteria: [
              "Overview shows milestones and owners.",
            ],
            edgeCases: [],
            dependencies: [],
            estimatedComplexity: "Medium",
            priority: 1,
          },
        ],
      }),
      JSON.stringify({
        specs: [
          {
            storyId: "STORY-001",
            title: "Release overview spec",
            overview: "Define the release overview surface and data dependencies.",
            dataModel: [
              "ReleasePlan(id, title, milestoneIds, ownerId)",
            ],
            apiContract: [
              "GET /api/releases/:id",
            ],
            componentStructure: [
              "ReleaseOverviewPage",
            ],
            stateManagement:
              "Use one shared query for release summary and milestones.",
            errorHandling: [
              "Show an empty state for missing milestones.",
            ],
            testExpectations: [
              "Coverage for empty and populated plans.",
            ],
            implementationOrder: [
              "Data contract",
              "Route",
              "UI",
            ],
            designReferences: [
              "Research brief official docs findings.",
            ],
          },
          {
            storyId: "STORY-002",
            title: "Checklist spec",
            overview: "Define the review checklist and approval interactions.",
            dataModel: [
              "ChecklistItem(id, releasePlanId, label, status)",
            ],
            apiContract: [
              "POST /api/releases/:id/checklist-items",
            ],
            componentStructure: [
              "ReleaseChecklistPanel",
            ],
            stateManagement:
              "Keep checklist item mutations optimistic with server confirmation.",
            errorHandling: [
              "Recover from failed checklist saves with inline retry.",
            ],
            testExpectations: [
              "Coverage for optimistic failure recovery.",
            ],
            implementationOrder: [
              "Model",
              "Mutation route",
              "Checklist UI",
            ],
            designReferences: [
              "Research brief official docs findings.",
            ],
          },
        ],
      }),
    ]);

    const started = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction:
        "pipeline start Build a collaborative release planning app for product teams.",
      pipelineDefinition: createDefaultPipelineDefinition(),
    });

    expect(started.status).toBe("success");
    expect(started.run?.status).toBe("awaiting_approval");
    expect(started.run?.phases[0]).toMatchObject({
      phaseId: "discovery",
      status: "awaiting_approval",
    });

    const afterDiscoveryApproval = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline approve",
    });

    expect(afterDiscoveryApproval.status).toBe("success");
    expect(afterDiscoveryApproval.run?.status).toBe("awaiting_approval");
    expect(afterDiscoveryApproval.run?.currentPhaseIndex).toBe(4);
    expect(afterDiscoveryApproval.run?.phases[1]).toMatchObject({
      phaseId: "research",
      status: "completed",
    });
    expect(afterDiscoveryApproval.run?.phases[2]).toMatchObject({
      phaseId: "epics",
      status: "completed",
    });
    expect(afterDiscoveryApproval.run?.phases[3]).toMatchObject({
      phaseId: "user-stories",
      status: "completed",
    });
    expect(afterDiscoveryApproval.run?.phases[4]).toMatchObject({
      phaseId: "technical-spec",
      status: "awaiting_approval",
    });
    expect(
      afterDiscoveryApproval.run?.phases[2]?.consumedArtifacts.some((artifact) =>
        artifact.type === "discovery-brief"
      ),
    ).toBe(true);
    expect(
      afterDiscoveryApproval.run?.phases[2]?.consumedArtifacts.some((artifact) =>
        artifact.type === "pipeline-brief"
      ),
    ).toBe(false);

    const afterSpecApproval = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline approve",
    });

    expect(afterSpecApproval.status).toBe("success");
    expect(afterSpecApproval.run?.status).toBe("completed");

    const discoveryRecords = await queryArtifacts(targetDirectory, {
      type: "discovery-brief",
      status: "approved",
      includeContent: true,
    });
    const researchRecords = await queryArtifacts(targetDirectory, {
      type: "research-brief",
      status: "approved",
      includeContent: true,
    });
    const storyRecords = await queryArtifacts(targetDirectory, {
      type: "user-story-artifact",
      status: "approved",
      includeContent: true,
    });
    const backlogRecords = await queryArtifacts(targetDirectory, {
      type: "backlog-artifact",
      status: "approved",
      includeContent: true,
    });

    expect(discoveryRecords.total).toBe(1);
    expect(researchRecords.total).toBe(1);
    expect(storyRecords.total).toBe(1);
    expect(backlogRecords.total).toBe(1);
    expect(researchRecords.records[0]?.content).toMatchObject({
      lookupStatus: "external",
    });
    const researchContent = researchRecords.records[0]?.content as unknown as ResearchLookupResult;
    expect(researchContent.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "react-docs",
          tier: "official-docs",
        }),
      ]),
    );
    expect(storyRecords.records[0]?.content).toMatchObject({
      stories: [
        expect.objectContaining({
          id: "STORY-001",
        }),
        expect.objectContaining({
          id: "STORY-002",
        }),
      ],
    });
    expect(backlogRecords.records[0]?.content).toMatchObject({
      orderedStoryIds: ["STORY-002", "STORY-001"],
      entries: [
        expect.objectContaining({
          storyId: "STORY-002",
          rank: 1,
        }),
        expect.objectContaining({
          storyId: "STORY-001",
          rank: 2,
        }),
      ],
    });
  });

  it("supports skipping discovery while preserving audit state and pipeline-brief fallback", async () => {
    const targetDirectory = await createTempDirectory("shipyard-discovery-skip-");
    const sessionState = createSessionState({
      sessionId: "discovery-skip-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createRuntimeState([
      [
        "# Discovery Brief: Disposable draft",
        "",
        "## Vision",
        "This draft should be skipped.",
      ].join("\n"),
      JSON.stringify({
        epics: [
          {
            title: "Core planning",
            valueStatement: "Plan work from the initial brief.",
            scope: "Pipeline-brief fallback.",
            acceptanceCriteria: ["Epics can be generated without discovery."],
            dependencies: [],
            estimatedComplexity: "Small",
          },
        ],
      }),
      JSON.stringify({
        stories: [
          {
            epicId: "EPIC-001",
            title: "Fallback story",
            userStory:
              "As an operator, I want PM planning to continue from the brief when discovery is skipped.",
            acceptanceCriteria: ["The story is still generated."],
            edgeCases: [],
            dependencies: [],
            estimatedComplexity: "Small",
            priority: 1,
          },
        ],
      }),
      JSON.stringify({
        specs: [
          {
            storyId: "STORY-001",
            title: "Fallback spec",
            overview: "Keep PM moving from the pipeline brief.",
            dataModel: ["Fallback(id)"],
            apiContract: ["GET /api/fallback"],
            componentStructure: ["FallbackView"],
            stateManagement: "Simple state flow.",
            errorHandling: ["Show a clear empty state."],
            testExpectations: ["Exercise the fallback route."],
            implementationOrder: ["Spec"],
            designReferences: ["N/A"],
          },
        ],
      }),
    ]);

    const started = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction:
        "pipeline start Build a planning workspace even if discovery gets skipped.",
      pipelineDefinition: createDefaultPipelineDefinition(),
    });
    expect(started.run?.status).toBe("awaiting_approval");

    const skipped = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline skip discovery",
    });

    expect(skipped.status).toBe("success");
    expect(skipped.run?.status).toBe("awaiting_approval");
    expect(skipped.run?.auditTrail.some((entry) => entry.kind === "phase-skipped")).toBe(
      true,
    );
    expect(skipped.run?.phases[0]).toMatchObject({
      phaseId: "discovery",
      status: "skipped",
    });
    expect(
      skipped.run?.phases[2]?.consumedArtifacts.some((artifact) =>
        artifact.type === "pipeline-brief"
      ),
    ).toBe(true);

    const completed = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline approve",
    });
    expect(completed.run?.status).toBe("completed");

    const backlog = await queryArtifacts(targetDirectory, {
      type: "backlog-artifact",
      status: "approved",
      includeContent: true,
    });
    expect(backlog.records[0]?.content).toMatchObject({
      orderedStoryIds: ["STORY-001"],
    });

    const loadedBacklog = await loadArtifact(
      targetDirectory,
      {
        type: "backlog-artifact",
        id: backlog.records[0]!.metadata.id,
        version: backlog.records[0]!.metadata.version,
      },
      { includeContent: true },
    );
    expect(loadedBacklog.record?.metadata.dependsOn).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^user-story-artifact\//),
      ]),
    );
  });
});
