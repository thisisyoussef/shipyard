# Feature Spec

## Metadata
- Story ID: P7-S02
- Story Title: Evaluation Plan and Multi-Check Verifier
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 7 planner, evaluator, and long-run handoff

## Problem Statement

Shipyard's current verifier can execute one command and return a compact `VerificationReport`, which is useful for broad regression checks but too narrow for feature-level acceptance. The runtime needs an explicit evaluation plan with multiple required checks and clear thresholds so missing behaviors fail cleanly instead of hiding behind a passing generic command.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Replace one-command verification with an explicit evaluation plan contract.
- Objective 2: Preserve deterministic, command-backed verification as the default foundation.
- Objective 3: Make hard failures obvious and structured enough for the coordinator to recover or escalate against them.
- How this story or pack contributes to the overall objective set: This story deepens the evaluator contract that later browser QA and coordinator routing will rely on.

## User Stories
- As a coordinator, I want ordered required checks so I can fail a run on a specific missing behavior instead of only on a broad shell failure.
- As a developer, I want richer verification evidence so I can understand exactly which acceptance check failed.

## Acceptance Criteria
- [ ] AC-1: A typed `EvaluationPlan` contract exists and can describe multiple ordered checks plus pass/fail policy.
- [ ] AC-2: The verifier can accept an `EvaluationPlan` and execute multiple command-backed checks in order.
- [ ] AC-3: Required failing checks fail the overall evaluation even if later checks could pass.
- [ ] AC-4: The resulting `VerificationReport` (or successor contract) includes per-check results, a clear overall pass/fail, and a concise failure summary.
- [ ] AC-5: Existing single-command verifier use can be normalized into a one-check evaluation plan for backward compatibility.
- [ ] AC-6: The verifier remains read-only and command-only in this story.

## Edge Cases
- Empty/null inputs: blank plans or plans with no checks fail closed.
- Boundary values: one required check still behaves like a valid evaluation plan, not a special-case path.
- Invalid/malformed data: malformed per-check results or malformed final JSON are rejected rather than coerced.
- External-service failures: missing scripts, timeouts, or command crashes become structured per-check failures.

## Non-Functional Requirements
- Security: command execution remains target-relative and never mutates files directly.
- Performance: the plan should support a small bounded number of checks so the verifier does not explode in cost or latency.
- Observability: each failed check should identify its check ID or label, command, and outcome.
- Reliability: backward-compatible one-check behavior must stay stable while the richer contract lands.

## UI Requirements (if applicable)
- If surfaced in the workbench, the evaluation result should show required vs optional checks and highlight the first hard failure clearly.

## Out of Scope
- Browser automation.
- Long-run handoff routing.
- Full coordinator integration of the new evaluation path.

## Done Definition
- Shipyard can describe evaluation as explicit ordered checks with hard failure semantics instead of only a single generic verification command.

## Code References

- [`../../../../src/artifacts/types.ts`](../../../../src/artifacts/types.ts):
  defines `EvaluationPlan`, `VerificationCheckResult`,
  `VerificationHardFailure`, and the richer `VerificationReport` shape that
  carries per-check evidence while preserving the legacy top-level fields.
- [`../../../../src/agents/verifier.ts`](../../../../src/agents/verifier.ts):
  validates and normalizes evaluation plans, keeps the verifier command-only,
  executes checks in order, skips trailing checks after the first required
  failure, and composes the final multi-check summary.
- [`../../../../src/agents/coordinator.ts`](../../../../src/agents/coordinator.ts):
  adds the coordinator-side helper that derives a default one-check
  `EvaluationPlan` from the current context and optional
  `ExecutionSpec.verificationIntent`.
- [`../../../../src/engine/graph.ts`](../../../../src/engine/graph.ts):
  routes post-edit verification through `createVerificationPlan` and preserves
  a fallback report shape when the graph has no edited file to verify yet.
- [`../../../../tests/verifier-subagent.test.ts`](../../../../tests/verifier-subagent.test.ts)
  and [`../../../../tests/graph-runtime.test.ts`](../../../../tests/graph-runtime.test.ts):
  cover evaluation-plan validation, one-check backward compatibility, ordered
  multi-check execution, required-check hard failures, optional-check behavior,
  and graph/runtime wiring.

## Representative Snippets

```ts
export interface EvaluationPlan {
  summary: string;
  checks: EvaluationCheck[];
}
```

```ts
for (const check of evaluationPlan.checks) {
  if (firstHardFailure) {
    checks.push(createSkippedCheckResult(check, firstHardFailure.label));
    continue;
  }

  const report = await runSingleVerificationCommand(
    check.command,
    targetDirectory,
    options,
  );
  const result = toEvaluationCheckResult(check, report);

  checks.push(result);

  if (check.required && result.status === "failed") {
    firstHardFailure = {
      checkId: result.checkId,
      label: result.label,
      command: result.command,
    };
  }
}
```
