# Feature Spec

## Metadata
- Story ID: P7-S04
- Story Title: Long-Run Handoff Artifacts and Reset Routing
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 7 planner, evaluator, and long-run handoff

## Problem Statement

Shipyard currently persists sessions and a bounded rolling summary, but that is still a thin memory layer for long-running or repeatedly recovering work. The runtime needs richer handoff artifacts and a reset-routing policy so big tasks can resume from explicit state instead of relying only on an 8-line summary and a partially exhausted loop.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Persist durable handoff artifacts for long-running work.
- Objective 2: Define when the runtime should reset and resume from a handoff artifact instead of stretching the current loop further.
- Objective 3: Preserve current lightweight behavior for short or simple turns.
- How this story or pack contributes to the overall objective set: This story gives the pack a durable long-run memory and reset mechanism rather than relying only on prompt summaries.

## User Stories
- As a coordinator, I want a durable handoff artifact so I can resume large tasks without rebuilding intent from sparse history.
- As a developer, I want reset reasons and resume state to be explicit so long-running failures are debuggable instead of mysterious.

## Acceptance Criteria
- [x] AC-1: Shipyard can persist a typed handoff artifact under `.shipyard/` with execution state such as completed work, remaining work, touched files, latest evaluation outcome, and next recommended action.
- [x] AC-2: The runtime can decide to emit and use a handoff artifact when a run crosses configured long-run thresholds such as loop iterations or repeated recoveries.
- [x] AC-3: A subsequent run can reload the latest handoff artifact and use it as structured context instead of relying only on the rolling summary.
- [x] AC-4: Short or trivial turns continue to use the lightweight summary path without mandatory handoff emission.
- [x] AC-5: Reset reasons are recorded in local logs and trace metadata.
- [x] AC-6: Handoff persistence and resume logic preserve the coordinator-only write boundary.

## Edge Cases
- Empty/null inputs: missing handoff artifacts are treated as absent state, not fatal corruption.
- Boundary values: a run that barely exceeds a threshold should produce one clean handoff, not a handoff storm.
- Invalid/malformed data: corrupted handoff JSON is rejected with explicit fallback behavior.
- External-service failures: a run can still emit a local handoff artifact even when LangSmith is unavailable.

## Non-Functional Requirements
- Security: handoff artifacts should avoid secret leakage and stay target-local under `.shipyard/`.
- Performance: handoff emission should be bounded and not trigger on every small turn.
- Observability: reset reason, handoff path, and resume path should be visible in logs and traces.
- Reliability: handoff writes should be atomic enough that partial artifacts do not silently poison resume behavior.

## UI Requirements (if applicable)
- If surfaced in the workbench, handoff artifacts should be shown as concise resume checkpoints, not raw JSON blobs.

## Out of Scope
- Cross-machine or multi-user synchronization.
- Browser evidence capture.
- Final coordinator routing heuristics across the whole pack.

## Done Definition
- Shipyard can emit and reload durable handoff artifacts for large or unstable runs while preserving the lightweight behavior of short turns.

## Implementation Evidence

- `shipyard/src/artifacts/types.ts` and `shipyard/src/artifacts/handoff.ts`:
  define the typed `ExecutionHandoff` payload, validate persisted JSON with
  Zod, reject malformed reloads explicitly, and save artifacts under
  `.shipyard/artifacts/<sessionId>/`.

  ```ts
  const executionHandoffSchema = z.object({
    version: z.literal(1),
    sessionId: z.string().trim().min(1),
    turnCount: z.number().int().positive(),
    // ...
  });
  ```

- `shipyard/src/engine/state.ts`, `shipyard/src/context/envelope.ts`, and
  `shipyard/src/engine/turn.ts`: keep only `activeHandoffPath` in persisted
  session state, inject `latestHandoff` into the serialized prompt as a
  dedicated `Latest Handoff` block, and clear the pointer again after a
  successful resumed turn that does not need another reset.

  ```ts
  if (loadedHandoff && !emittedHandoff && finalStatus === "success") {
    state.activeHandoffPath = null;
  }
  ```

- `shipyard/src/engine/graph.ts`, `shipyard/src/engine/loop.ts`, and
  `shipyard/src/ui/server.ts`: expose reset routing in observability by logging
  the structured handoff payload locally and tagging traces with
  `handoffLoaded`, `handoffPath`, and `handoffReason`.

  ```ts
  return {
    // ...
    handoffLoaded: latestHandoff !== null,
    handoffPath: latestHandoff?.artifactPath ?? null,
    handoffReason: latestHandoff?.handoff.resetReason.kind ?? null,
  };
  ```

- `shipyard/src/tracing/langsmith.ts`: keeps trace-reference lookup
  best-effort so live LangSmith indexing lag does not convert a successful
  handoff turn into an `error` outcome during finish-stage verification.

- `shipyard/tests/handoff-artifacts.test.ts`,
  `shipyard/tests/context-envelope.test.ts`,
  `shipyard/tests/graph-runtime.test.ts`, and
  `shipyard/tests/loop-runtime.test.ts`: cover save/load round-trips, malformed
  fallback, threshold gating, resumed-turn context injection, and local/remote
  observability.

- This first landing persists the current `TaskPlan` plus latest verification
  outcome as the planning payload on `main`, which keeps handoff routing
  shippable now while leaving room for later Phase 7 planner work to deepen the
  same artifact instead of replacing the reset path.
