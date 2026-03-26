import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  DiscoveryReport,
  ExecutionSpec,
} from "../src/artifacts/types.js";
import { PLANNER_MODEL_ROUTE } from "../src/engine/model-routing.js";
import { createSessionState } from "../src/engine/state.js";
import { createInstructionRuntimeState } from "../src/engine/turn.js";
import {
  derivePlanTasks,
  getPlanFilePath,
  loadPlanTaskQueue,
  savePlanTaskQueue,
} from "../src/plans/store.js";
import { executePlanningTurn } from "../src/plans/turn.js";
import "../src/tools/index.js";
import {
  createFakeModelAdapter,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
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
    projectName: "shipyard-plan-mode",
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

function createExecutionSpec(): ExecutionSpec {
  return {
    instruction: "Plan the persisted task queue feature.",
    goal: "Add operator-facing planning mode with durable queue artifacts.",
    deliverables: [
      "Route plan-mode instructions before the normal coding executor.",
      "Persist a typed task queue under .shipyard/plans/.",
    ],
    acceptanceCriteria: [
      "plan: creates a saved queue without performing code writes.",
      "Saved tasks remain ordered and resumable across sessions.",
    ],
    verificationIntent: [
      "Run the focused plan-mode test suite.",
    ],
    targetFilePaths: [
      "src/plans/store.ts",
      "src/plans/turn.ts",
    ],
    risks: [
      "The queue could drift from the planner contract if task derivation is too loose.",
    ],
  };
}

describe("plan mode", () => {
  afterEach(async () => {
    await Promise.all(
      createdDirectories.splice(0, createdDirectories.length).map((directory) =>
        rm(directory, { recursive: true, force: true })
      ),
    );
  });

  it("persists a typed task queue under .shipyard/plans and avoids overwriting on id collisions", async () => {
    const targetDirectory = await createTempDirectory("shipyard-plan-store-");
    const executionSpec = createExecutionSpec();

    const firstPlan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      loadedSpecRefs: ["spec:docs/specs/feature-spec"],
      tasks: derivePlanTasks({
        executionSpec,
        loadedSpecRefs: ["spec:docs/specs/feature-spec"],
      }),
      createdAt: "2026-03-25T18:00:00.000Z",
    });
    const secondPlan = await savePlanTaskQueue({
      targetDirectory,
      instruction: executionSpec.instruction,
      executionSpec,
      planningMode: "planner",
      loadedSpecRefs: ["spec:docs/specs/feature-spec"],
      tasks: derivePlanTasks({
        executionSpec,
        loadedSpecRefs: ["spec:docs/specs/feature-spec"],
      }),
      createdAt: "2026-03-25T18:00:00.000Z",
    });

    expect(firstPlan.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        description:
          "Route plan-mode instructions before the normal coding executor.",
        status: "pending",
        targetFilePaths: executionSpec.targetFilePaths,
        specRefs: ["spec:docs/specs/feature-spec"],
      }),
      expect.objectContaining({
        id: "task-2",
        description:
          "Persist a typed task queue under .shipyard/plans/.",
        status: "pending",
        targetFilePaths: executionSpec.targetFilePaths,
        specRefs: ["spec:docs/specs/feature-spec"],
      }),
    ]);
    expect(secondPlan.planId).toMatch(new RegExp(`^${firstPlan.planId}-2$`));

    await expect(
      readFile(getPlanFilePath(targetDirectory, firstPlan.planId), "utf8"),
    ).resolves.toContain('"planningMode": "planner"');
    await expect(
      loadPlanTaskQueue(targetDirectory, firstPlan.planId),
    ).resolves.toEqual(firstPlan);
  });

  it("passes the planner model route into raw-loop option creation", async () => {
    const targetDirectory = await createTempDirectory("shipyard-plan-route-");
    const createRawLoopRouteIds: string[] = [];
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult(JSON.stringify(createExecutionSpec())),
    ]);
    const sessionState = createSessionState({
      sessionId: "plan-route-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const runtimeState = createInstructionRuntimeState({
      projectRules: "",
      runtimeDependencies: {
        createRawLoopOptions(_graphState, request) {
          if (request?.routeId) {
            createRawLoopRouteIds.push(request.routeId);
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

    const result = await executePlanningTurn({
      sessionState,
      runtimeState,
      instruction: "plan: add durable queue persistence",
    });

    expect(result.status).toBe("success");
    expect(createRawLoopRouteIds).toContain(PLANNER_MODEL_ROUTE);
  });

  it("rejects malformed persisted task queues instead of silently coercing them", async () => {
    const targetDirectory = await createTempDirectory("shipyard-plan-invalid-");
    const plansDirectory = path.join(targetDirectory, ".shipyard", "plans");
    await mkdir(plansDirectory, { recursive: true });
    await writeFile(
      path.join(plansDirectory, "broken-plan.json"),
      JSON.stringify(
        {
          planId: "broken-plan",
          instruction: "Broken artifact",
          tasks: [
            {
              description: "Missing id and status",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(
      loadPlanTaskQueue(targetDirectory, "broken-plan"),
    ).rejects.toThrowError(/invalid plan task queue/i);
  });

  it("creates a persisted plan from planner output, captures loaded spec refs, and keeps the target read-only", async () => {
    const targetDirectory = await createTempDirectory("shipyard-plan-turn-");
    const specPath = path.join(targetDirectory, "docs/specs/feature-spec.md");
    await mkdir(path.dirname(specPath), { recursive: true });
    await writeFile(
      specPath,
      "# Feature Spec\n\nUse plan mode before writing code.\n",
      "utf8",
    );
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "shipyard-plan-turn" }, null, 2),
      "utf8",
    );

    const sessionState = createSessionState({
      sessionId: "plan-mode-session",
      targetDirectory,
      discovery: createDiscovery(),
    });
    const executionSpec = createExecutionSpec();
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_load_spec",
          name: "load_spec",
          input: {
            path: "docs/specs/feature-spec.md",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify(executionSpec)),
    ]);
    const runtimeState = createInstructionRuntimeState({
      projectRules: "Prefer the persisted plan before implementation.",
      runtimeDependencies: {
        createRawLoopOptions: () => ({
          modelAdapter,
          logger: {
            log() {},
          },
        }),
      },
    });
    const toolCalls: string[] = [];
    const toolResults: string[] = [];
    const textEvents: string[] = [];
    const doneEvents: Array<{
      status: "success" | "error" | "cancelled";
      summary: string;
    }> = [];

    const result = await executePlanningTurn({
      sessionState,
      runtimeState,
      instruction:
        "plan: turn docs/specs/feature-spec.md into a persisted Shipyard task queue",
      reporter: {
        onToolCall(event) {
          toolCalls.push(event.toolName);
        },
        onToolResult(event) {
          if (event.success) {
            toolResults.push(event.toolName);
          }
        },
        onText(text) {
          textEvents.push(text);
        },
        onDone(event) {
          doneEvents.push(event);
        },
      },
    });

    expect(result.status).toBe("success");
    expect(result.planningMode).toBe("planner");
    expect(result.loadedSpecRefs).toEqual(["spec:docs/specs/feature-spec"]);
    expect(result.plan).not.toBeNull();
    expect(result.plan?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        description:
          "Route plan-mode instructions before the normal coding executor.",
        status: "pending",
      }),
      expect.objectContaining({
        id: "task-2",
        description:
          "Persist a typed task queue under .shipyard/plans/.",
        status: "pending",
      }),
    ]);
    expect(toolCalls).toEqual(["load_spec"]);
    expect(toolResults).toEqual(["load_spec"]);
    expect(textEvents.at(-1)).toContain(result.plan?.planId ?? "");
    expect(doneEvents).toEqual([
      expect.objectContaining({
        status: "success",
      }),
    ]);
    expect(sessionState.turnCount).toBe(1);
    expect(sessionState.rollingSummary).toContain(
      "plan: turn docs/specs/feature-spec.md into a persisted Shipyard task queue",
    );
    await expect(
      loadPlanTaskQueue(targetDirectory, result.plan?.planId ?? ""),
    ).resolves.toEqual(result.plan);
    await expect(readFile(specPath, "utf8")).resolves.toContain(
      "Use plan mode before writing code.",
    );
  });
});
