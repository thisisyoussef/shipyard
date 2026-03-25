# Task Breakdown

## Story
- Story ID: P7-S04
- Story Title: Long-Run Handoff Artifacts and Reset Routing

## Execution Notes
- Keep handoff artifacts typed, bounded, and target-local.
- Do not make handoff emission mandatory for short turns.
- Record explicit reset reasons so resets are debuggable.
- Preserve coordinator-only writes even when runs reset and resume.

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
- Why this story set is cohesive: the pack is about deepening Shipyard's harness without giving up the current safety model.
- Coverage check: P7-S04 advances the pack's durable-handoff and reset-routing objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for handoff artifact validation, threshold routing, and save/load resume behavior. | must-have | no | `pnpm --dir shipyard test -- tests/handoff-artifacts.test.ts` |
| T002 | Implement typed handoff artifacts plus save/load helpers under `.shipyard/` runtime output. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add reset-threshold helpers and inject loaded handoff state back into the execution path without disturbing trivial turns. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/handoff-artifacts.test.ts` |
| T004 | Add trace and log metadata for reset reasons and handoff paths, then sync nearby docs if the runtime artifact layout changes. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `handoff artifact validation rejects malformed persisted state`
  - [ ] `threshold helper does not trigger for trivial turns`
- T002 tests:
  - [ ] `handoff artifact save and load round-trips execution state`
- T003 tests:
  - [ ] `latest handoff artifact can be injected back into a resumed run`
  - [ ] `reset routing records the reason for the reset`
- T004 tests:
  - [ ] `trace or local log metadata includes handoff path and reset reason`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
