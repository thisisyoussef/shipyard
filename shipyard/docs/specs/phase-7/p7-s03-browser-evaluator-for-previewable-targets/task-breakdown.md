# Task Breakdown

## Story
- Story ID: P7-S03
- Story Title: Browser Evaluator for Previewable Targets

## Execution Notes
- Keep the browser evaluator read-only and loopback-only.
- Reuse the existing preview stack rather than launching a separate app runtime.
- Bound browser plans tightly so this story proves the contract without exploding flakiness or cost.
- Treat preview-unavailable as a structured evaluator outcome, not as a test harness crash.

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
- Why this story set is cohesive: browser evidence is only useful once the planner and evaluator contracts can consume it cleanly.
- Coverage check: P7-S03 advances the pack's live UI-evidence objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for browser-plan validation, preview-unavailable handling, and bounded browser result parsing; add any new dependency wiring required for local browser automation. | must-have | no | `pnpm --dir shipyard test -- tests/browser-evaluator.test.ts` |
| T002 | Implement the read-only browser evaluator contract plus preview URL handoff and structured report generation. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add integration coverage against a scaffolded previewable target, including console-error and selector-failure outcomes. | blocked-by:T002 | yes | `pnpm --dir shipyard test -- tests/browser-evaluator.test.ts` |
| T004 | Add bounded manual or scripted smoke coverage, artifact-path recording, and nearby doc sync if the public contract changes. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `browser evaluator rejects malformed plans`
  - [ ] `browser evaluator returns a structured not-applicable result when preview is unavailable`
- T002 tests:
  - [ ] `browser evaluator can load a preview URL and return a passing structured report`
- T003 tests:
  - [ ] `browser evaluator records console-error failures`
  - [ ] `browser evaluator records selector or action-step failures`
- T004 tests:
  - [ ] `browser evaluator persists bounded artifact references when configured`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
