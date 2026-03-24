import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";

import {
  CheckpointManager,
  type CheckpointManagerLike,
} from "../checkpoints/manager.js";
import type { TaskPlan, VerificationReport } from "../artifacts/types.js";
import { createStubCodeTaskPlan } from "../phases/code/index.js";
import type { Phase } from "../phases/phase.js";
import { readFileTool } from "../tools/read-file.js";
import { normalizeTargetRelativePath } from "../tools/file-state.js";
import {
  RAW_LOOP_MAX_ITERATIONS,
  runRawToolLoopDetailed,
  type RawToolLoopOptions,
  type RawLoopToolHookContext,
  type RawToolLoopResult,
} from "./raw-loop.js";
import type { ContextEnvelope, FileHashMap } from "./state.js";

export type AgentRuntimeStatus =
  | "planning"
  | "acting"
  | "verifying"
  | "recovering"
  | "responding"
  | "done"
  | "failed";

export interface AgentGraphState {
  sessionId: string;
  messageHistory: MessageParam[];
  currentInstruction: string;
  contextEnvelope: ContextEnvelope;
  targetDirectory: string;
  phaseConfig: Phase;
  fileHashes: FileHashMap;
  retryCountsByFile: Record<string, number>;
  blockedFiles: string[];
  lastEditedFile: string | null;
  status: AgentRuntimeStatus;
  finalResult: string | null;
  taskPlan: TaskPlan | null;
  verificationReport: VerificationReport | null;
  actingIterations: number;
  fallbackMode: boolean;
  lastError: string | null;
}

export interface CreateAgentGraphStateOptions {
  sessionId?: string;
  instruction: string;
  contextEnvelope: ContextEnvelope;
  targetDirectory: string;
  phaseConfig: Phase;
  messageHistory?: MessageParam[];
  fileHashes?: FileHashMap;
  retryCountsByFile?: Record<string, number>;
  blockedFiles?: string[];
  lastEditedFile?: string | null;
  status?: AgentRuntimeStatus;
  finalResult?: string | null;
  taskPlan?: TaskPlan | null;
  verificationReport?: VerificationReport | null;
  actingIterations?: number;
  fallbackMode?: boolean;
  lastError?: string | null;
}

export interface ActingLoopResult {
  finalText: string;
  messageHistory: MessageParam[];
  iterations: number;
  didEdit: boolean;
  lastEditedFile: string | null;
}

export interface AgentRuntimeDependencies {
  createTaskPlan?: (state: AgentGraphState) => TaskPlan | Promise<TaskPlan>;
  runActingLoop?: (
    state: AgentGraphState,
  ) => ActingLoopResult | Promise<ActingLoopResult>;
  verifyState?: (
    state: AgentGraphState,
  ) => VerificationReport | Promise<VerificationReport>;
  createCheckpointManager?: (
    state: AgentGraphState,
  ) => CheckpointManagerLike;
  createRawLoopOptions?: (
    state: AgentGraphState,
  ) => RawToolLoopOptions | Promise<RawToolLoopOptions>;
}

export interface AgentRuntimeOptions {
  mode?: "graph" | "fallback";
  maxRecoveriesPerFile?: number;
  dependencies?: AgentRuntimeDependencies;
}

type AgentGraphNodeName = "plan" | "act" | "verify" | "recover" | "respond";

const DEFAULT_MAX_RECOVERIES_PER_FILE = 2;

const AgentGraphStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  messageHistory: Annotation<MessageParam[]>(),
  currentInstruction: Annotation<string>(),
  contextEnvelope: Annotation<ContextEnvelope>(),
  targetDirectory: Annotation<string>(),
  phaseConfig: Annotation<Phase>(),
  fileHashes: Annotation<FileHashMap>(),
  retryCountsByFile: Annotation<Record<string, number>>(),
  blockedFiles: Annotation<string[]>(),
  lastEditedFile: Annotation<string | null>(),
  status: Annotation<AgentRuntimeStatus>(),
  finalResult: Annotation<string | null>(),
  taskPlan: Annotation<TaskPlan | null>(),
  verificationReport: Annotation<VerificationReport | null>(),
  actingIterations: Annotation<number>(),
  fallbackMode: Annotation<boolean>(),
  lastError: Annotation<string | null>(),
});

function ensureNonBlankString(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank.`);
  }

  return trimmed;
}

function applyStateUpdate(
  state: AgentGraphState,
  update: Partial<AgentGraphState>,
): AgentGraphState {
  return {
    ...state,
    ...update,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCheckpointManager(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
): CheckpointManagerLike {
  return dependencies.createCheckpointManager?.(state)
    ?? new CheckpointManager(state.targetDirectory, state.sessionId);
}

function getRelativeToolPath(input: unknown): string | null {
  if (
    typeof input === "object" &&
    input !== null &&
    "path" in input &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    return normalizeTargetRelativePath(input.path);
  }

  return null;
}

async function checkpointBeforeEdit(
  context: RawLoopToolHookContext,
  checkpointManager: CheckpointManagerLike,
): Promise<void> {
  if (context.toolUse.name !== "edit_block") {
    return;
  }

  const relativePath = getRelativeToolPath(context.toolUse.input);

  if (!relativePath) {
    throw new Error("edit_block requires a non-empty relative path before checkpointing.");
  }

  await checkpointManager.checkpoint(relativePath);
}

function createDefaultVerificationReport(
  state: AgentGraphState,
): VerificationReport {
  if (!state.lastEditedFile) {
    return {
      command: "phase4.verify.placeholder",
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "No edited file available for verification.",
      summary: "Verification failed because no edited file was recorded.",
    };
  }

  return {
    command: "phase4.verify.placeholder",
    exitCode: 0,
    passed: true,
    stdout: "",
    stderr: "",
    summary: `Verification placeholder passed for ${state.lastEditedFile}.`,
  };
}

async function defaultActingLoop(
  state: AgentGraphState,
  dependencies: AgentRuntimeDependencies,
): Promise<ActingLoopResult> {
  const rawLoopOptions =
    await dependencies.createRawLoopOptions?.(state)
    ?? {};
  const checkpointManager = getCheckpointManager(state, dependencies);
  const existingBeforeToolExecution = rawLoopOptions.beforeToolExecution;
  const result: RawToolLoopResult = await runRawToolLoopDetailed(
    state.phaseConfig.systemPrompt,
    state.currentInstruction,
    state.phaseConfig.tools,
    state.targetDirectory,
    {
      ...rawLoopOptions,
      maxIterations: rawLoopOptions.maxIterations ?? RAW_LOOP_MAX_ITERATIONS,
      beforeToolExecution: async (context) => {
        await checkpointBeforeEdit(context, checkpointManager);
        await existingBeforeToolExecution?.(context);
      },
    },
  );

  return {
    finalText: result.finalText,
    messageHistory: result.messageHistory,
    iterations: result.iterations,
    didEdit: result.didEdit,
    lastEditedFile: result.lastEditedFile,
  };
}

function ensureValidRecoveries(maxRecoveriesPerFile: number): number {
  if (!Number.isInteger(maxRecoveriesPerFile) || maxRecoveriesPerFile <= 0) {
    throw new Error("maxRecoveriesPerFile must be a positive integer.");
  }

  return maxRecoveriesPerFile;
}

export function createAgentGraphState(
  options: CreateAgentGraphStateOptions,
): AgentGraphState {
  return {
    sessionId: options.sessionId ?? "runtime-session",
    messageHistory: [...(options.messageHistory ?? [])],
    currentInstruction: ensureNonBlankString(
      options.instruction,
      "instruction",
    ),
    contextEnvelope: options.contextEnvelope,
    targetDirectory: options.targetDirectory,
    phaseConfig: options.phaseConfig,
    fileHashes: { ...(options.fileHashes ?? {}) },
    retryCountsByFile: { ...(options.retryCountsByFile ?? {}) },
    blockedFiles: [...(options.blockedFiles ?? [])],
    lastEditedFile: options.lastEditedFile ?? null,
    status: options.status ?? "planning",
    finalResult: options.finalResult ?? null,
    taskPlan: options.taskPlan ?? null,
    verificationReport: options.verificationReport ?? null,
    actingIterations: options.actingIterations ?? 0,
    fallbackMode: options.fallbackMode ?? false,
    lastError: options.lastError ?? null,
  };
}

export function routeAfterAct(
  state: Pick<AgentGraphState, "status">,
): "verify" | "respond" {
  if (state.status === "verifying") {
    return "verify";
  }

  if (
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-act status: ${state.status}`);
}

export function routeAfterVerify(
  state: Pick<AgentGraphState, "status">,
): "recover" | "respond" {
  if (state.status === "recovering") {
    return "recover";
  }

  if (
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-verify status: ${state.status}`);
}

export function routeAfterRecover(
  state: Pick<AgentGraphState, "status">,
): "plan" | "respond" {
  if (state.status === "planning") {
    return "plan";
  }

  if (
    state.status === "responding" ||
    state.status === "failed" ||
    state.status === "done"
  ) {
    return "respond";
  }

  throw new Error(`Unsupported post-recover status: ${state.status}`);
}

export function createAgentRuntimeNodes(
  options: AgentRuntimeOptions = {},
): Record<AgentGraphNodeName, (state: AgentGraphState) => Promise<Partial<AgentGraphState>>> {
  const dependencies = options.dependencies ?? {};
  const maxRecoveriesPerFile = ensureValidRecoveries(
    options.maxRecoveriesPerFile ?? DEFAULT_MAX_RECOVERIES_PER_FILE,
  );

  return {
    async plan(state) {
      const taskPlan = await (dependencies.createTaskPlan
        ? dependencies.createTaskPlan(state)
        : createStubCodeTaskPlan(state.currentInstruction));

      return {
        taskPlan,
        status: "acting",
        lastError: null,
        verificationReport: null,
      };
    },
    async act(state) {
      try {
        const actingLoop = await (dependencies.runActingLoop
          ? dependencies.runActingLoop(state)
          : defaultActingLoop(state, dependencies));

        return {
          messageHistory: actingLoop.messageHistory,
          actingIterations: actingLoop.iterations,
          lastEditedFile: actingLoop.lastEditedFile,
          finalResult: actingLoop.finalText,
          status: actingLoop.didEdit ? "verifying" : "responding",
          lastError: null,
        };
      } catch (error) {
        const message = toErrorMessage(error);
        const limitHit = message.includes(String(RAW_LOOP_MAX_ITERATIONS));

        return {
          actingIterations: limitHit
            ? RAW_LOOP_MAX_ITERATIONS
            : state.actingIterations,
          status: "failed",
          finalResult: message,
          lastError: message,
        };
      }
    },
    async verify(state) {
      const verificationReport = await (dependencies.verifyState
        ? dependencies.verifyState(state)
        : createDefaultVerificationReport(state));

      return {
        verificationReport,
        status: verificationReport.passed ? "responding" : "recovering",
        lastError: verificationReport.passed
          ? null
          : verificationReport.summary,
      };
    },
    async recover(state) {
      if (!state.lastEditedFile) {
        return {
          status: "failed",
          finalResult:
            state.lastError ?? "Recovery failed because no edited file was recorded.",
        };
      }

      const currentRetries =
        state.retryCountsByFile[state.lastEditedFile] ?? 0;
      const nextRetries = currentRetries + 1;
      const checkpointManager = getCheckpointManager(state, dependencies);
      const retryCountsByFile = {
        ...state.retryCountsByFile,
        [state.lastEditedFile]: nextRetries,
      };
      let restored = false;

      try {
        restored = await checkpointManager.revert(state.lastEditedFile);
      } catch (error) {
        const message = `Recovery failed while restoring ${state.lastEditedFile}: ${toErrorMessage(error)}`;

        return {
          retryCountsByFile,
          status: "failed",
          finalResult: message,
          lastError: message,
        };
      }

      let rereadHashUpdate: Partial<AgentGraphState>;

      try {
        const rereadResult = await readFileTool({
          targetDirectory: state.targetDirectory,
          path: state.lastEditedFile,
        });

        rereadHashUpdate = {
          fileHashes: {
            ...state.fileHashes,
            [rereadResult.path]: rereadResult.hash,
          },
        };
      } catch (error) {
        const message = `Recovery failed while re-reading ${state.lastEditedFile}: ${toErrorMessage(error)}`;

        return {
          retryCountsByFile,
          status: "failed",
          finalResult: message,
          lastError: message,
        };
      }

      if (nextRetries > maxRecoveriesPerFile) {
        const blockedFiles = state.blockedFiles.includes(state.lastEditedFile)
          ? state.blockedFiles
          : [...state.blockedFiles, state.lastEditedFile];
        const escalationSummary = restored
          ? `Restored the latest checkpoint for ${state.lastEditedFile} before blocking further retries.`
          : `No checkpoint was available for ${state.lastEditedFile}, so Shipyard blocked further retries after re-reading the file.`;

        return {
          ...rereadHashUpdate,
          retryCountsByFile,
          blockedFiles,
          status: "responding",
          lastEditedFile: null,
          verificationReport: null,
          lastError: escalationSummary,
          finalResult: `Blocked ${state.lastEditedFile} after ${String(nextRetries)} failed verification attempts. ${escalationSummary}`,
        };
      }

      return {
        ...rereadHashUpdate,
        retryCountsByFile,
        status: "planning",
        lastEditedFile: null,
        verificationReport: null,
        lastError: null,
        finalResult: null,
      };
    },
    async respond(state) {
      return {
        status: state.status === "failed" ? "failed" : "done",
        finalResult:
          state.finalResult ??
          state.lastError ??
          "Shipyard finished without a final result.",
      };
    },
  };
}

export function createAgentRuntimeGraph(
  options: AgentRuntimeOptions = {},
) {
  const nodes = createAgentRuntimeNodes(options);

  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("plan", nodes.plan)
    .addNode("act", nodes.act)
    .addNode("verify", nodes.verify)
    .addNode("recover", nodes.recover)
    .addNode("respond", nodes.respond)
    .addEdge(START, "plan")
    .addEdge("plan", "act")
    .addConditionalEdges("act", routeAfterAct, {
      verify: "verify",
      respond: "respond",
    })
    .addConditionalEdges("verify", routeAfterVerify, {
      recover: "recover",
      respond: "respond",
    })
    .addConditionalEdges("recover", routeAfterRecover, {
      plan: "plan",
      respond: "respond",
    })
    .addEdge("respond", END)
    .compile({
      name: "shipyard-agent-runtime",
      description: "Phase 4 graph runtime contract with explicit fallback parity.",
    });
}

export async function runFallbackRuntime(
  initialState: AgentGraphState,
  options: AgentRuntimeOptions = {},
): Promise<AgentGraphState> {
  const nodes = createAgentRuntimeNodes(options);
  let state = applyStateUpdate(initialState, {
    fallbackMode: true,
  });
  let nextNode: AgentGraphNodeName = "plan";

  while (true) {
    if (nextNode === "plan") {
      state = applyStateUpdate(state, await nodes.plan(state));
      nextNode = "act";
      continue;
    }

    if (nextNode === "act") {
      state = applyStateUpdate(state, await nodes.act(state));
      nextNode = routeAfterAct(state);
      continue;
    }

    if (nextNode === "verify") {
      state = applyStateUpdate(state, await nodes.verify(state));
      nextNode = routeAfterVerify(state);
      continue;
    }

    if (nextNode === "recover") {
      state = applyStateUpdate(state, await nodes.recover(state));
      nextNode = routeAfterRecover(state);
      continue;
    }

    state = applyStateUpdate(state, await nodes.respond(state));
    return state;
  }
}

export async function runAgentRuntime(
  initialState: AgentGraphState,
  options: AgentRuntimeOptions = {},
): Promise<AgentGraphState> {
  if (options.mode === "fallback") {
    return runFallbackRuntime(initialState, options);
  }

  const graph = createAgentRuntimeGraph(options);
  const nextState = await graph.invoke(initialState);

  return applyStateUpdate(nextState, {
    fallbackMode: false,
  });
}
