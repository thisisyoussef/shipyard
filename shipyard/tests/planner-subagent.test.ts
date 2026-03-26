import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  ContextReport,
  DiscoveryReport,
  TargetProfile,
} from "../src/artifacts/types.js";
import {
  parseExecutionSpec,
  PLANNER_TOOL_NAMES,
  runPlannerSubagent,
} from "../src/agents/planner.js";
import {
  createLightweightExecutionSpec,
  shouldCoordinatorUsePlanner,
} from "../src/agents/coordinator.js";
import type { ContextEnvelope } from "../src/engine/state.js";
import "../src/tools/index.js";
import {
  DEFAULT_FAKE_MODEL_NAME,
  createFakeModelAdapter,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
  getToolNamesFromCall,
  getToolResultContentParts,
} from "./support/fake-model-adapter.js";

const createdDirectories: string[] = [];

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-planner-"));
  createdDirectories.push(directory);
  return directory;
}

function createDiscoveryReport(): DiscoveryReport {
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
    topLevelDirectories: ["src"],
    projectName: "shipyard",
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

function createTargetProfile(
  discovery: DiscoveryReport,
): TargetProfile {
  return {
    name: "Shipyard",
    description: "Persistent coding agent.",
    purpose: "Local coding workflow.",
    stack: ["TypeScript", "React"],
    architecture: "Coordinator plus helper agents.",
    keyPatterns: ["typed artifacts", "raw-loop helpers"],
    complexity: "medium",
    suggestedAgentsRules: "Prefer read-only helpers before edits.",
    suggestedScripts: {
      test: "pnpm test",
    },
    taskSuggestions: ["Add planner contract"],
    enrichedAt: "2026-03-25T12:00:00.000Z",
    enrichmentModel: DEFAULT_FAKE_MODEL_NAME,
    discoverySnapshot: discovery,
  };
}

function createContextReport(): ContextReport {
  return {
    query: "Fix the auth flow",
    findings: [
      {
        filePath: "src/auth.ts",
        excerpt: "export async function authenticateUser() {}",
        relevanceNote: "This file owns auth entry.",
      },
    ],
  };
}

function createContextEnvelope(): ContextEnvelope {
  return {
    stable: {
      discovery: createDiscoveryReport(),
      projectRules: "",
      availableScripts: {
        test: "vitest run",
      },
    },
    task: {
      currentInstruction: "Fix src/app.ts",
      injectedContext: [],
      targetFilePaths: [],
    },
    runtime: {
      recentToolOutputs: [],
      recentErrors: [],
      currentGitDiff: null,
    },
    session: {
      rollingSummary: "",
      retryCountsByFile: {},
      blockedFiles: [],
      latestHandoff: null,
      activeTask: null,
    },
  };
}

describe("planner subagent", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("uses only the read-only tool allowlist and fails closed on unauthorized tool requests", async () => {
    const directory = await createTempProject();
    const discovery = createDiscoveryReport();
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_write",
          name: "write_file",
          input: {
            path: "notes.md",
            contents: "hello",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        instruction: "Fix the auth flow",
        goal: "Fix the auth flow",
        deliverables: ["Update the auth implementation."],
        acceptanceCriteria: ["The auth flow works."],
        verificationIntent: ["Run the test suite."],
        targetFilePaths: ["src/auth.ts"],
        risks: ["Regression risk in auth."],
      })),
    ]);

    await expect(
      runPlannerSubagent(
        {
          instruction: "Fix the auth flow",
          discovery,
        },
        directory,
        {
          modelAdapter,
          logger: {
            log() {},
          },
        },
      ),
    ).rejects.toThrow(/write_file|read-only|not available|unauthorized/i);

    expect(getToolNamesFromCall(modelAdapter.calls[0]!)).toEqual([
      ...PLANNER_TOOL_NAMES,
    ]);
  });

  it("does not inherit prior history and includes discovery, target profile, and explorer findings in the prompt", async () => {
    const directory = await createTempProject();
    const discovery = createDiscoveryReport();
    const targetProfile = createTargetProfile(discovery);
    const contextReport = createContextReport();
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult(JSON.stringify({
        instruction: "Fix the auth flow",
        goal: "Fix the auth flow",
        deliverables: ["Update the auth implementation."],
        acceptanceCriteria: ["The auth flow works."],
        verificationIntent: ["Run the auth tests."],
        targetFilePaths: ["src/auth.ts"],
        risks: ["Regression risk in auth."],
      })),
    ]);

    const result = await runPlannerSubagent(
      {
        instruction: "Fix the auth flow",
        discovery,
        targetProfile,
        contextReport,
      },
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      instruction: "Fix the auth flow",
      goal: "Fix the auth flow",
      deliverables: ["Update the auth implementation."],
      acceptanceCriteria: ["The auth flow works."],
      verificationIntent: ["Run the auth tests."],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Regression risk in auth."],
    });
    expect(modelAdapter.calls[0]?.messages).toHaveLength(1);
    expect(modelAdapter.calls[0]?.messages[0]).toEqual({
      role: "user",
      content: expect.stringContaining("Fix the auth flow"),
    });
    expect(modelAdapter.calls[0]?.messages[0]?.content).toContain('"projectName": "shipyard"');
    expect(modelAdapter.calls[0]?.messages[0]?.content).toContain('"name": "Shipyard"');
    expect(modelAdapter.calls[0]?.messages[0]?.content).toContain('"filePath": "src/auth.ts"');
  });

  it("runs a broad planning request and returns a structured execution spec", async () => {
    const directory = await createTempProject();
    const authPath = path.join(directory, "src", "auth.ts");

    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(
      authPath,
      "export async function authenticateUser(token: string) {\n  return token.length > 0;\n}\n",
      "utf8",
    );

    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_search",
          name: "search_files",
          input: {
            pattern: "authenticateUser",
          },
        },
        {
          id: "toolu_read",
          name: "read_file",
          input: {
            path: "src/auth.ts",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        instruction: "Fix the auth flow",
        goal: "Repair the authentication flow without widening scope.",
        deliverables: [
          "Update the auth entry point to match the requested behavior.",
        ],
        acceptanceCriteria: [
          "Authentication succeeds for valid tokens.",
          "The change stays within the auth surface.",
        ],
        verificationIntent: [
          "Run the auth-focused test coverage.",
          "Run the repo test suite if auth coverage is unclear.",
        ],
        targetFilePaths: ["src/auth.ts"],
        risks: ["Regression risk in authentication state handling."],
      })),
    ]);

    const result = await runPlannerSubagent(
      {
        instruction: "Fix the auth flow",
        discovery: createDiscoveryReport(),
      },
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      instruction: "Fix the auth flow",
      goal: "Repair the authentication flow without widening scope.",
      deliverables: [
        "Update the auth entry point to match the requested behavior.",
      ],
      acceptanceCriteria: [
        "Authentication succeeds for valid tokens.",
        "The change stays within the auth surface.",
      ],
      verificationIntent: [
        "Run the auth-focused test coverage.",
        "Run the repo test suite if auth coverage is unclear.",
      ],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Regression risk in authentication state handling."],
    });

    const toolResultPayloads = getToolResultContentParts(modelAdapter.calls[1]!);

    expect(toolResultPayloads).toHaveLength(2);
    expect(toolResultPayloads[0]?.result.success).toBe(true);
    expect(toolResultPayloads[0]?.result.output).toContain("src/auth.ts:1:");
    expect(toolResultPayloads[1]?.result.output).toContain("Path: src/auth.ts");
    expect(toolResultPayloads[1]?.result.output).toContain("authenticateUser");
  });

  it("rejects malformed final report JSON", () => {
    expect(() =>
      parseExecutionSpec("not json at all", "Fix the auth flow"),
    ).toThrow(/json|executionspec/i);
  });

  it("accepts valid report JSON wrapped in prose and markdown fences", () => {
    const result = parseExecutionSpec(
      [
        "Planning complete.",
        "",
        "```json",
        JSON.stringify({
          instruction: "Fix the auth flow",
          goal: "Fix the auth flow",
          deliverables: ["Update auth behavior."],
          acceptanceCriteria: ["The auth flow works."],
          verificationIntent: ["Run the auth tests."],
          targetFilePaths: ["src/auth.ts"],
          risks: ["Auth regression risk."],
        }, null, 2),
        "```",
      ].join("\n"),
      "Fix the auth flow",
    );

    expect(result).toEqual({
      instruction: "Fix the auth flow",
      goal: "Fix the auth flow",
      deliverables: ["Update auth behavior."],
      acceptanceCriteria: ["The auth flow works."],
      verificationIntent: ["Run the auth tests."],
      targetFilePaths: ["src/auth.ts"],
      risks: ["Auth regression risk."],
    });
  });

  it("planner routing helper skips trivial exact-path instructions", () => {
    expect(
      shouldCoordinatorUsePlanner({
        instruction: "Update src/app.ts to rename the counter export.",
        contextEnvelope: createContextEnvelope(),
      }),
    ).toBe(false);
  });

  it("lightweight execution specs preserve deliverables, acceptance criteria, and verification intent", () => {
    const executionSpec = createLightweightExecutionSpec({
      instruction: "Update src/app.ts to rename the counter export.",
      contextEnvelope: createContextEnvelope(),
    });

    expect(executionSpec).toMatchObject({
      instruction: "Update src/app.ts to rename the counter export.",
      goal: "Update src/app.ts to rename the counter export.",
      targetFilePaths: ["src/app.ts"],
    });
    expect(executionSpec.deliverables).not.toHaveLength(0);
    expect(executionSpec.acceptanceCriteria).not.toHaveLength(0);
    expect(executionSpec.verificationIntent).not.toHaveLength(0);
  });

  it("adds starter-theme and stylesheet continuity guidance for single-turn UI builds", () => {
    const executionSpec = createLightweightExecutionSpec({
      instruction: "Make a login page.",
      contextEnvelope: createContextEnvelope(),
    });

    expect(executionSpec.deliverables).toContain(
      "Choose a deliberate visual direction instead of reusing a generic dark-blue starter aesthetic.",
    );
    expect(executionSpec.deliverables).toContain(
      "Replace any leftover starter branding or starter theme choices that conflict with the requested UI.",
    );
    expect(executionSpec.acceptanceCriteria).toContain(
      "The resulting UI does not simply fall back to a generic starter palette or repeated dark-blue glassmorphism treatment without user direction.",
    );
    expect(executionSpec.acceptanceCriteria).toContain(
      "Any stylesheet created or renamed for the UI is referenced from the relevant source files.",
    );
    expect(executionSpec.verificationIntent).toContain(
      "Confirm any touched stylesheet is still referenced from the source tree.",
    );
  });

  it("can ignore recent touched files when lightweight scope widening is disabled", () => {
    const widenedContextEnvelope = createContextEnvelope();

    widenedContextEnvelope.session.recentTouchedFiles = [
      "src/App.tsx",
      "src/App.css",
      "src/login.css",
    ];

    const narrowedContextEnvelope = createContextEnvelope();

    narrowedContextEnvelope.session.recentTouchedFiles = [
      "src/App.tsx",
      "src/App.css",
      "src/login.css",
    ];
    narrowedContextEnvelope.runtime.featureFlags = {
      disableRecentTouchedScopeWidening: true,
      preferSingleTurnUiBuilds: false,
      enableStrictFreshUiVerification: false,
    };

    const widenedExecutionSpec = createLightweightExecutionSpec({
      instruction: "Make a login page.",
      contextEnvelope: widenedContextEnvelope,
    });
    const narrowedExecutionSpec = createLightweightExecutionSpec({
      instruction: "Make a login page.",
      contextEnvelope: narrowedContextEnvelope,
    });

    expect(widenedExecutionSpec.targetFilePaths).toEqual([
      "src/App.tsx",
      "src/App.css",
      "src/login.css",
    ]);
    expect(narrowedExecutionSpec.targetFilePaths).toEqual([]);
  });
});
