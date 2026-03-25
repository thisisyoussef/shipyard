# Feature Spec

## Metadata
- Story ID: P7-S01
- Story Title: Planner Subagent and ExecutionSpec Artifact
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 7 planner, evaluator, and long-run handoff

## Problem Statement

Shipyard's current `TaskPlan` is intentionally lightweight, which keeps simple edits fast but leaves broad instructions underspecified. The runtime needs a richer planning contract for non-trivial work so the coordinator can act against explicit deliverables, acceptance criteria, and risks instead of inferring all of that from a thin file list.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Add a planner-grade execution artifact that expands broad instructions into concrete deliverables and verification intent.
- Objective 2: Keep the lightweight path for trivial or exact-path work so the runtime does not pay planner overhead unnecessarily.
- Objective 3: Preserve the current coordinator-only write boundary while improving pre-write clarity.
- How this story or pack contributes to the overall objective set: This story defines the planning contract that every later evaluator and handoff story depends on.

## User Stories
- As a coordinator, I want a richer plan artifact for broad requests so I can write against explicit scope instead of improvised assumptions.
- As a Shipyard developer, I want trivial requests to stay cheap so the runtime does not turn every small edit into a heavyweight harness run.

## Acceptance Criteria
- [ ] AC-1: A typed `ExecutionSpec` artifact exists and captures the goal, deliverables, acceptance criteria, verification intent, target file paths, and risks for non-trivial work.
- [ ] AC-2: A planner subagent or planner invocation can turn a broad natural-language request into valid `ExecutionSpec` JSON.
- [ ] AC-3: The planner contract can consume stable context such as discovery data, `TargetProfile`, and explorer findings without taking write authority.
- [ ] AC-4: Exact-path or clearly trivial requests can skip planner invocation or emit a minimal `ExecutionSpec` without an extra model round trip.
- [ ] AC-5: Planner output is schema-validated before the coordinator consumes it.
- [ ] AC-6: Planner usage is visible in runtime state or trace metadata so later routing and tuning can distinguish planned vs lightweight runs.

## Edge Cases
- Empty/null inputs: blank instructions fail before planner invocation.
- Boundary values: one-line instructions can still produce a minimal valid spec.
- Invalid/malformed data: malformed planner JSON fails closed and falls back to explicit error handling, not silent coercion.
- External-service failures: missing `TargetProfile` or missing discovery detail should degrade gracefully rather than blocking the whole planner path.

## Non-Functional Requirements
- Security: planner remains read-only and never mutates files directly.
- Performance: the planner path should be optional and only used when the instruction warrants it.
- Observability: traces and local logs should record when the planner path was chosen.
- Reliability: `ExecutionSpec` parsing must be deterministic and reject malformed output.

## UI Requirements (if applicable)
- If surfaced in the workbench, `ExecutionSpec` should be shown as a compact planning summary rather than a raw JSON dump.

## Out of Scope
- Multi-check verification execution.
- Browser automation.
- Reset or handoff routing.

## Done Definition
- Shipyard has a validated `ExecutionSpec` contract and a planner path that can produce it for broad work while preserving the lightweight path for trivial edits.

## Code References

- [`../../../../src/artifacts/types.ts`](../../../../src/artifacts/types.ts):
  defines `ExecutionSpec` and `PlanningMode` so later planner, evaluator, and
  handoff stories can share one typed planning contract.
- [`../../../../src/agents/planner.ts`](../../../../src/agents/planner.ts):
  implements the read-only planner helper, prompt, JSON extraction, Zod
  validation, and unauthorized-tool rejection.
- [`../../../../src/agents/coordinator.ts`](../../../../src/agents/coordinator.ts):
  adds the planner opt-in helper, the lightweight `ExecutionSpec` fallback, and
  `TaskPlan` derivation from richer planning artifacts.
- [`../../../../src/engine/graph.ts`](../../../../src/engine/graph.ts):
  threads `ExecutionSpec` and `planningMode` through the `plan` node, records
  planner usage in trace metadata, and preserves the existing act/verify path.
- [`../../../../src/engine/turn.ts`](../../../../src/engine/turn.ts):
  carries `TargetProfile` into runtime planning and includes planner artifacts
  in the turn result for local trace logging.
- [`../../../../tests/planner-subagent.test.ts`](../../../../tests/planner-subagent.test.ts)
  and [`../../../../tests/graph-runtime.test.ts`](../../../../tests/graph-runtime.test.ts):
  cover planner invocation, malformed output rejection, lightweight-path bypass,
  and planner trace metadata.

## Representative Snippets

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
const planningArtifacts = await maybePlanExecutionSpec(
  state,
  contextReport,
  dependencies,
  signal,
);

return {
  taskPlan,
  executionSpec: planningArtifacts.executionSpec,
  planningMode: planningArtifacts.planningMode,
  contextReport,
  status: "acting",
};
```
