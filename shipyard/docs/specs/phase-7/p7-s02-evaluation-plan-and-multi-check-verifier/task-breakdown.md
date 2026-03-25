# Task Breakdown

## Story
- Story ID: P7-S02
- Story Title: Evaluation Plan and Multi-Check Verifier

## Execution Notes
- Keep deterministic command checks as the first evaluator deepening step.
- Preserve one-check backward compatibility while the richer contract lands.
- Fail closed on malformed output and make required-check failures obvious.
- Keep the richer verifier isolated until coordinator integration lands later.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - browser-visible QA for previewable targets
  - durable handoff for long-running work
- Planned stories in this pack:
  - P7-S01 Planner Subagent and ExecutionSpec Artifact
  - P7-S02 Evaluation Plan and Multi-Check Verifier
  - P7-S03 Browser Evaluator for Previewable Targets
  - P7-S04 Long-Run Handoff Artifacts and Reset Routing
  - P7-S05 Adaptive Coordinator Routing and Trace Calibration
- Why this story set is cohesive: the pack needs explicit planning, explicit evaluation, explicit handoff, and explicit routing rather than one monolithic coordinator prompt.
- Coverage check: P7-S02 advances the pack's richer-evaluation objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for `EvaluationPlan` validation, ordered multi-check execution, required-check failure semantics, and one-check backward compatibility. | must-have | no | `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts` |
| T002 | Extend artifact types and verifier parsing helpers to support evaluation plans plus per-check results. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement multi-check verifier execution while keeping the verifier read-only and command-only. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts` |
| T004 | Add focused result-summary coverage, failure-first behavior checks, and nearby doc sync if the public result contract changes. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `evaluation plan validation rejects empty or malformed plans`
  - [ ] `single command input normalizes to a one-check evaluation plan`
- T002 tests:
  - [ ] `verification report captures ordered per-check results`
- T003 tests:
  - [ ] `required failing checks fail the overall evaluation`
  - [ ] `optional check failures do not mask required-check success`
- T004 tests:
  - [ ] `verifier summary names the first hard failure clearly`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
