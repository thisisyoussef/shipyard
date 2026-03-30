import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadArtifact,
  queryArtifacts,
} from "../src/artifacts/registry/index.js";
import type { DiscoveryReport } from "../src/artifacts/types.js";
import { PLANNER_MODEL_ROUTE } from "../src/engine/model-routing.js";
import {
  createSessionState,
  loadSessionState,
} from "../src/engine/state.js";
import { createInstructionRuntimeState } from "../src/engine/turn.js";
import type { PhasePipelineDefinition } from "../src/pipeline/contracts.js";
import { loadPipelineRun } from "../src/pipeline/store.js";
import {
  executePipelineTurn,
  isPipelineInstruction,
} from "../src/pipeline/turn.js";
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
    topLevelFiles: ["package.json"],
    topLevelDirectories: ["src", "docs"],
    projectName: "shipyard-pipeline-runtime",
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

function createMarkdownPipeline(
  phases: PhasePipelineDefinition["phases"],
): PhasePipelineDefinition {
  return {
    id: "test-pipeline",
    title: "Test Pipeline",
    description: "A synthetic pipeline used to validate phase execution.",
    phases,
  };
}

function createRuntimeState(
  modelResponses: string[],
  observedRouteIds?: string[],
) {
  const modelAdapter = createFakeModelAdapter(
    modelResponses.map((text) => createFakeTextTurnResult(text)),
  );

  const runtimeState = createInstructionRuntimeState({
    projectRules: "Keep the pipeline deterministic.",
    runtimeDependencies: {
      async createRawLoopOptions(_graphState, request) {
        if (request?.routeId) {
          observedRouteIds?.push(request.routeId);
        }

        return {
          modelAdapter,
          logger: {
            log() {},
          },
        };
      },
    },
  });

  return {
    modelAdapter,
    runtimeState,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("pipeline runtime", () => {
  it("pauses on required approval after phase artifact creation", async () => {
    const targetDirectory = await createTempDirectory("shipyard-pipeline-required-");
    const sessionState = createSessionState({
      sessionId: "pipeline-required-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const observedRouteIds: string[] = [];
    const { runtimeState } = createRuntimeState(
      ["# Discovery Brief\n\nFocus on collaborative editing."],
      observedRouteIds,
    );
    const pipeline = createMarkdownPipeline([
      {
        id: "discovery",
        title: "Discovery Brief",
        description: "Summarize the initial idea into a discovery brief.",
        systemPrompt: "Return only the markdown artifact.",
        instructions: "Write a concise discovery brief.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["discovery-brief"],
        output: {
          type: "discovery-brief",
          contentKind: "markdown",
        },
      },
    ]);

    const result = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline start Build a collaborative notes app for product teams.",
      pipelineDefinition: pipeline,
    });

    expect(result.status).toBe("success");
    expect(result.run?.status).toBe("awaiting_approval");
    expect(result.run?.pendingApproval?.phaseId).toBe("discovery");
    expect(result.run?.phases[0]).toMatchObject({
      phaseId: "discovery",
      status: "awaiting_approval",
      attemptCount: 1,
    });
    expect(sessionState.workbenchState.pipelineState).toMatchObject({
      activeRunId: result.run?.runId ?? null,
      status: "awaiting_approval",
      waitingForApproval: true,
      approvalMode: "required",
      currentPhaseId: "discovery",
    });
    expect(observedRouteIds).toContain(PLANNER_MODEL_ROUTE);

    const records = await queryArtifacts(targetDirectory, {
      type: "discovery-brief",
      includeContent: true,
      latestOnly: false,
    });
    expect(records.records).toHaveLength(1);
    expect(records.records[0]?.metadata.status).toBe("draft");
    expect(records.records[0]?.content).toBe(
      "# Discovery Brief\n\nFocus on collaborative editing.",
    );
  });

  it("auto-continues advisory gates and records approved artifacts", async () => {
    const targetDirectory = await createTempDirectory("shipyard-pipeline-advisory-");
    const sessionState = createSessionState({
      sessionId: "pipeline-advisory-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const { runtimeState } = createRuntimeState([
      "# Technical Plan\n\nKeep the work narrow and test-first.",
    ]);
    const pipeline = createMarkdownPipeline([
      {
        id: "technical-plan",
        title: "Technical Plan",
        description: "Create the implementation plan.",
        systemPrompt: "Return only the markdown artifact.",
        instructions: "Write the technical plan in markdown.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "advisory",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["technical-plan"],
        output: {
          type: "technical-plan",
          contentKind: "markdown",
        },
      },
    ]);

    const result = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline start Add a reusable approval-gate runtime.",
      pipelineDefinition: pipeline,
    });

    expect(result.status).toBe("success");
    expect(result.run?.status).toBe("completed");
    expect(result.run?.pendingApproval).toBeNull();
    expect(result.run?.phases[0]).toMatchObject({
      status: "completed",
      approvedArtifact: {
        type: "technical-plan",
      },
    });

    const records = await queryArtifacts(targetDirectory, {
      type: "technical-plan",
      includeContent: true,
      latestOnly: false,
    });
    expect(records.records).toHaveLength(1);
    expect(records.records[0]?.metadata.status).toBe("approved");
    expect(records.records[0]?.metadata.approvedBy).toBe("shipyard:auto");
  });

  it("returns rejected artifacts to the producing phase and regenerates a fresh draft", async () => {
    const targetDirectory = await createTempDirectory("shipyard-pipeline-reject-");
    const sessionState = createSessionState({
      sessionId: "pipeline-reject-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const { runtimeState } = createRuntimeState([
      "# Discovery Brief\n\nVersion one is too vague.",
      "# Discovery Brief\n\nVersion two incorporates the rejection feedback.",
    ]);
    const pipeline = createMarkdownPipeline([
      {
        id: "discovery",
        title: "Discovery Brief",
        description: "Summarize the initial idea into a discovery brief.",
        systemPrompt: "Return only the markdown artifact.",
        instructions: "Write a concise discovery brief.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["discovery-brief"],
        output: {
          type: "discovery-brief",
          contentKind: "markdown",
        },
      },
    ]);

    const started = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline start Build a hosted release checklist assistant.",
      pipelineDefinition: pipeline,
    });
    expect(started.run?.status).toBe("awaiting_approval");

    const rejected = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline reject Add clearer user goals and constraints.",
    });

    expect(rejected.status).toBe("success");
    expect(rejected.run?.status).toBe("awaiting_approval");
    expect(rejected.run?.phases[0]).toMatchObject({
      phaseId: "discovery",
      status: "awaiting_approval",
      attemptCount: 2,
    });
    expect(
      rejected.run?.auditTrail.some((entry) => entry.kind === "artifact-rejected"),
    ).toBe(true);

    const records = await queryArtifacts(targetDirectory, {
      type: "discovery-brief",
      includeContent: true,
      latestOnly: false,
    });
    expect(records.records.map((record) => record.metadata.status)).toEqual([
      "draft",
      "rejected",
      "draft",
    ]);
    expect(records.records[0]?.content).toBe(
      "# Discovery Brief\n\nVersion two incorporates the rejection feedback.",
    );
  });

  it("stores edited approvals as new artifact versions before continuing", async () => {
    const targetDirectory = await createTempDirectory("shipyard-pipeline-edit-");
    const sessionState = createSessionState({
      sessionId: "pipeline-edit-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const { runtimeState } = createRuntimeState([
      "# Feature Spec\n\nThe first draft needs operator polish.",
    ]);
    const pipeline = createMarkdownPipeline([
      {
        id: "feature-spec",
        title: "Feature Spec",
        description: "Turn the brief into a spec.",
        systemPrompt: "Return only the markdown artifact.",
        instructions: "Write a feature spec in markdown.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["feature-spec"],
        output: {
          type: "feature-spec",
          contentKind: "markdown",
        },
      },
    ]);

    const started = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline start Build a safer approval checkpoint.",
      pipelineDefinition: pipeline,
    });
    expect(started.run?.status).toBe("awaiting_approval");

    const edited = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction:
        "pipeline edit # Feature Spec\n\nUse deterministic resume semantics and preserve approval audit history.",
    });

    expect(edited.status).toBe("success");
    expect(edited.run?.status).toBe("completed");

    const run = await loadPipelineRun(targetDirectory, edited.run?.runId ?? "");
    expect(run?.phases[0]?.approvedArtifact).toMatchObject({
      type: "feature-spec",
      version: 2,
    });

    const approvedArtifact = await loadArtifact(
      targetDirectory,
      run?.phases[0]?.approvedArtifact ?? {
        type: "feature-spec",
        id: "missing",
        version: 1,
      },
      {
        includeContent: true,
      },
    );

    expect(approvedArtifact.record?.metadata.status).toBe("approved");
    expect(approvedArtifact.record?.content).toBe(
      "# Feature Spec\n\nUse deterministic resume semantics and preserve approval audit history.",
    );
  });

  it("resumes a persisted pipeline after restart from the correct phase", async () => {
    const targetDirectory = await createTempDirectory("shipyard-pipeline-resume-");
    const sessionState = createSessionState({
      sessionId: "pipeline-resume-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const { runtimeState } = createRuntimeState([
      "# Discovery Brief\n\nDraft the discovery artifact.",
    ]);
    const pipeline = createMarkdownPipeline([
      {
        id: "discovery",
        title: "Discovery Brief",
        description: "Summarize the brief.",
        systemPrompt: "Return only the markdown artifact.",
        instructions: "Write a discovery brief.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["discovery-brief"],
        output: {
          type: "discovery-brief",
          contentKind: "markdown",
        },
      },
      {
        id: "technical-plan",
        title: "Technical Plan",
        description: "Produce the technical plan.",
        systemPrompt: "Return only the markdown artifact.",
        instructions: "Write a technical plan.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "disabled",
        consumesArtifacts: ["discovery-brief"],
        producesArtifacts: ["technical-plan"],
        output: {
          type: "technical-plan",
          contentKind: "markdown",
        },
      },
    ]);

    const started = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline start Build a runtime-native pipeline.",
      pipelineDefinition: pipeline,
    });
    expect(started.run?.status).toBe("awaiting_approval");

    const loadedSession = await loadSessionState(targetDirectory, sessionState.sessionId);
    expect(loadedSession).not.toBeNull();

    const resumedRuntime = createRuntimeState([
      "# Technical Plan\n\nContinue from the approved discovery brief.",
    ]);
    const approved = await executePipelineTurn({
      sessionState: loadedSession!,
      runtimeState: resumedRuntime.runtimeState,
      instruction: "pipeline approve",
    });

    expect(approved.status).toBe("success");
    expect(approved.run?.status).toBe("completed");
    expect(approved.run?.phases[0]?.status).toBe("completed");
    expect(approved.run?.phases[1]?.status).toBe("completed");

    const records = await queryArtifacts(targetDirectory, {
      type: "technical-plan",
      includeContent: true,
      latestOnly: false,
    });
    expect(records.records[0]?.metadata.status).toBe("approved");
    expect(records.records[0]?.content).toBe(
      "# Technical Plan\n\nContinue from the approved discovery brief.",
    );
  });

  it("rejects malformed edited artifact payloads and keeps the gate open", async () => {
    const targetDirectory = await createTempDirectory("shipyard-pipeline-invalid-edit-");
    const sessionState = createSessionState({
      sessionId: "pipeline-invalid-edit-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const { runtimeState } = createRuntimeState([
      "{\"title\":\"Valid JSON artifact\"}",
    ]);
    const pipeline = createMarkdownPipeline([
      {
        id: "json-spec",
        title: "JSON Spec",
        description: "Produce a JSON artifact.",
        systemPrompt: "Return only the JSON artifact.",
        instructions: "Write a JSON object with a title field.",
        modelRoute: PLANNER_MODEL_ROUTE,
        approvalGate: "required",
        consumesArtifacts: ["pipeline-brief"],
        producesArtifacts: ["json-spec"],
        output: {
          type: "json-spec",
          contentKind: "json",
        },
      },
    ]);

    const started = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline start Build a JSON-driven approval flow.",
      pipelineDefinition: pipeline,
    });
    expect(started.run?.status).toBe("awaiting_approval");

    const invalidEdit = await executePipelineTurn({
      sessionState,
      runtimeState,
      instruction: "pipeline edit definitely-not-json",
    });

    expect(invalidEdit.status).toBe("error");
    expect(invalidEdit.run?.status).toBe("awaiting_approval");
    expect(sessionState.workbenchState.pipelineState?.waitingForApproval).toBe(true);

    const records = await queryArtifacts(targetDirectory, {
      type: "json-spec",
      latestOnly: false,
    });
    expect(records.records).toHaveLength(1);
    expect(records.records[0]?.metadata.status).toBe("draft");
  });

  it("keeps normal instructions off the pipeline path", () => {
    expect(isPipelineInstruction("inspect package.json")).toBe(false);
    expect(isPipelineInstruction("pipeline start build a roadmap")).toBe(true);
  });
});
