# Task Breakdown

## Story
- Story ID: P7-S05
- Story Title: Adaptive Coordinator Routing and Trace Calibration

## Execution Notes
- Keep the coordinator as the only writer even after the richer harness paths are integrated.
- Make route selection explicit and testable rather than burying it in prompt text.
- Record harness choices in both local logs and LangSmith metadata where available.
- Use a small golden scenario set to tune evaluator strictness before broadening scope.

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
- Why this story set is cohesive: the pack is only complete when the coordinator can use the earlier contracts deliberately and explain that choice after the fact.
- Coverage check: P7-S05 advances the pack's adaptive-routing and evaluator-calibration objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing route-selection, trace-metadata, and calibration-fixture tests for lightweight, planner-backed, preview-backed, and reset-backed paths. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/turn-runtime.test.ts` |
| T002 | Integrate planner, richer evaluation, browser QA, and handoff heuristics into the coordinator and graph runtime while preserving coordinator-only writes. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add local trace and LangSmith metadata for route decisions, evaluator usage, browser-evaluator usage, and reset reasons. | blocked-by:T002 | yes | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/turn-runtime.test.ts` |
| T004 | Add a small golden scenario set for evaluator strictness, run focused smoke coverage across the new harness paths, and sync docs to describe the chosen routing policy. | blocked-by:T002,T003 | no | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `trivial exact-path requests stay on the lightweight coordinator path`
  - [ ] `broad requests route through planner-backed execution`
- T002 tests:
  - [ ] `previewable UI-relevant work routes through browser evaluation when available`
  - [ ] `long-run thresholds trigger handoff-backed reset routing`
- T003 tests:
  - [ ] `trace metadata records selected harness path and reset reason`
- T004 tests:
  - [ ] `golden scenario set catches evaluator strictness regressions`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
