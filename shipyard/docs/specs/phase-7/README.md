# Phase 7: Planner, Evaluator, and Long-Run Handoff Story Pack

- Pack: Phase 7 Planner, Evaluator, and Long-Run Handoff
- Estimate: 8-12 hours
- Date: 2026-03-25
- Status: In progress

## Pack Objectives

1. Add a planner-grade execution contract for broad or non-trivial instructions so Shipyard can expand intent into a concrete implementation brief before writing.
2. Replace the current single-command verifier path with a richer evaluation plan that can express hard checks, ordered evidence, and explicit pass/fail thresholds.
3. Add a read-only browser evaluator for previewable targets so Shipyard can validate live UI behavior instead of relying on shell checks alone.
4. Persist richer handoff artifacts and define reset routing for long-running work so Shipyard can resume from durable state rather than only an abbreviated rolling summary.
5. Keep the coordinator-only write boundary intact while using local traces and LangSmith metadata to calibrate evaluator strictness and route the heavier harness only when needed.

## Shared Constraints

- Product code and product docs stay under `shipyard/`; `.ai/` remains helper-only.
- The coordinator remains the only writer. New planner and evaluator roles are read-only or artifact-only.
- Trivial or exact-path instructions should keep the current lightweight path whenever the heavier harness does not add clear value.
- New contracts should be typed, schema-validated, and report-based, following the existing `TaskPlan`, `ContextReport`, and `VerificationReport` pattern.
- Preview-backed evaluation is local-only, loopback-bound, and must never imply deployment or public hosting.
- Deterministic checks should remain first-class. Subjective or browser-driven evaluation can add evidence, but it must not replace basic correctness checks.
- The pack should build on the existing preview supervisor, subagent contract, trace stack, and session model instead of introducing a parallel runtime.
- LangSmith-backed calibration is preferred when credentials are present, but the pack must still work with local JSONL traces only.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P7-S01 | Planner Subagent and ExecutionSpec Artifact | Introduce a read-only planner contract that can expand broad instructions into a typed `ExecutionSpec` while preserving the lightweight path for trivial tasks. | Phase 4 implementation, Phase 6 implementation, Target Manager profile contract |
| P7-S02 | Evaluation Plan and Multi-Check Verifier | Replace the verifier's single-command contract with an explicit evaluation plan and richer structured result model. | P7-S01, Phase 6 verifier implementation |
| P7-S03 | Browser Evaluator for Previewable Targets | Add a read-only browser evaluator that can inspect the local preview surface and return structured UI evidence. | Phase 5 implementation, P7-S02 |
| P7-S04 | Long-Run Handoff Artifacts and Reset Routing | Persist richer handoff artifacts under `.shipyard/` and define when long-running work should reset and resume from them. | Phase 4 implementation, P7-S01 |
| P7-S05 | Adaptive Coordinator Routing and Trace Calibration | Integrate planner, evaluator, browser QA, and handoff routing into coordinator heuristics and record the chosen path in traces. | P7-S02, P7-S03, P7-S04 |

## Sequencing Rationale

- `P7-S01` lands first because the rest of the pack needs a richer planning artifact than the current `TaskPlan`.
- `P7-S02` follows because evaluator depth depends on having explicit execution goals and acceptance criteria to verify against.
- `P7-S03` comes next because preview-backed browser evidence should plug into the richer evaluation model rather than invent a parallel contract.
- `P7-S04` adds long-run handoff and reset behavior after the richer planning contract exists, so persisted artifacts can carry more than a thin summary.
- `P7-S05` lands last because it is the integration and tuning story: it should only route real work through planner, evaluator, browser QA, and reset paths after each contract is proven independently.

## Whole-Pack Success Signal

- Shipyard can expand a broad instruction into a typed execution contract instead of relying on a thin file list plus generic steps.
- Evaluation can fail on explicit missing behaviors, not only on the first available `test`, `typecheck`, or `build` command.
- Previewable targets can be inspected through a read-only browser evaluator that produces structured evidence.
- Long-running work can emit and reload durable handoff artifacts from `.shipyard/` without losing important execution state.
- Local trace logs and optional LangSmith traces make it obvious which harness path was used, why a run passed or failed, and where evaluator tuning still needs work.

## Implementation Evidence

### P7-S01

#### Code References

- `shipyard/src/artifacts/types.ts`: adds the shared `ExecutionSpec` and
  `PlanningMode` contracts that later Phase 7 stories can reuse.
- `shipyard/src/agents/planner.ts` and `shipyard/src/agents/coordinator.ts`:
  add the read-only planner helper, schema validation, lightweight fallback
  specs, and planner opt-in heuristics.
- `shipyard/src/engine/graph.ts`, `shipyard/src/engine/turn.ts`,
  `shipyard/src/engine/loop.ts`, and `shipyard/src/ui/server.ts`: carry
  planner artifacts through the runtime and attach planner metadata to local and
  LangSmith trace surfaces.
- `shipyard/tests/planner-subagent.test.ts`, `shipyard/tests/graph-runtime.test.ts`,
  `shipyard/tests/turn-runtime.test.ts`, `shipyard/tests/loop-runtime.test.ts`,
  and `shipyard/tests/ui-runtime.test.ts`: verify planner isolation, graph
  routing, lightweight-path preservation, and cancellation/follow-up behavior.

#### Representative Snippets

```ts
export interface ExecutionSpec {
  instruction: string;
  goal: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  verificationIntent: string[];
  targetFilePaths: string[];
  risks: string[];
}
```

```ts
usedPlanner: shouldCoordinatorUsePlanner({
  instruction: state.currentInstruction,
  contextEnvelope: state.contextEnvelope,
  taskPlan: state.taskPlan,
  executionSpec: state.executionSpec,
  contextReport: state.contextReport,
}),
```

### P7-S02

#### Code References

- `shipyard/src/artifacts/types.ts`: adds `EvaluationPlan`,
  `VerificationCheckResult`, `VerificationHardFailure`, and the richer
  `VerificationReport` fields used by the multi-check verifier.
- `shipyard/src/agents/verifier.ts`: validates evaluation plans, normalizes
  legacy single-command input into a one-check plan, executes ordered
  command-backed checks, and reports the first required hard failure.
- `shipyard/src/agents/coordinator.ts` and `shipyard/src/engine/graph.ts`:
  derive the default verification plan from context plus
  `ExecutionSpec.verificationIntent` and route the verify node through the new
  contract.
- `shipyard/tests/verifier-subagent.test.ts` and
  `shipyard/tests/graph-runtime.test.ts`: verify plan validation,
  backward-compatible single-check normalization, ordered results,
  required-check fail-fast behavior, optional-check handling, and graph
  integration.

#### Representative Snippets

```ts
export interface VerificationCheckResult {
  checkId: string;
  label: string;
  kind: "command";
  command: string;
  required: boolean;
  status: VerificationCheckStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  summary: string;
}
```

```ts
return runVerifierSubagent(
  createVerificationPlan({
    contextEnvelope: state.contextEnvelope,
    executionSpec: state.executionSpec,
  }),
  state.targetDirectory,
  await createSubagentLoopOptions(state, dependencies, signal),
);
```

### P7-S04

#### Code References

- `shipyard/src/artifacts/types.ts` and `shipyard/src/artifacts/handoff.ts`:
  add the typed `ExecutionHandoff` contract, threshold evaluation,
  malformed-artifact rejection, and target-local save/load helpers under
  `.shipyard/artifacts/<sessionId>/`.
- `shipyard/src/engine/state.ts`, `shipyard/src/context/envelope.ts`, and
  `shipyard/src/engine/turn.ts`: persist `activeHandoffPath`, inject the latest
  loaded handoff into the shared context envelope, and emit or clear handoff
  state without disturbing short-turn lightweight behavior.
- `shipyard/src/engine/graph.ts`, `shipyard/src/engine/loop.ts`, and
  `shipyard/src/ui/server.ts`: record reset reason, handoff path, and resume
  state in LangSmith metadata plus local JSONL `instruction.plan` events.
- `shipyard/src/tracing/langsmith.ts`: keeps LangSmith URL lookup best-effort
  so fresh handoff traces can return a stable `runId` even when the hosted run
  URL has not indexed yet, rather than turning observability lag into a failed
  turn.
- `shipyard/tests/handoff-artifacts.test.ts`,
  `shipyard/tests/context-envelope.test.ts`,
  `shipyard/tests/graph-runtime.test.ts`, and
  `shipyard/tests/loop-runtime.test.ts`: cover persistence, threshold gating,
  malformed fallback, prompt injection, and observability.

#### Representative Snippets

```ts
if (options.actingIterations >= thresholds.actingIterations) {
  return {
    shouldPersist: true,
    kind: "iteration-threshold",
    summary:
      `Shipyard used ${String(options.actingIterations)} acting ${label}, so the next turn should resume from a persisted handoff instead of continuing the same long-running loop.`,
    thresholds,
    metrics,
  };
}
```

```ts
await writeFile(tempPath, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
await rename(tempPath, absolutePath);
```

- Remaining stories `P7-S03` and `P7-S05`: implementation evidence is still
  pending on `main`.
