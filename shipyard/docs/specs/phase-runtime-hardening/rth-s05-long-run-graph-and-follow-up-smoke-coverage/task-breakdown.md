# Task Breakdown

## Story
- Story ID: RTH-S05
- Story Title: Long-Run Graph and Follow-Up Smoke Coverage

## Execution Notes
- Exercise the actual graph-mode turn executor, not just the raw loop in isolation.
- Preserve artifacts on failure so debugging starts from evidence instead of guesswork.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the failing live-smoke scenarios and update manual-test docs with the new acceptance target. | must-have | no | docs review |
| T002 | Implement or replace the current tiny live smoke with a graph-aware, write-heavy initial scenario that persists artifacts. | blocked-by:T001 | no | manual smoke run |
| T003 | Add a same-session follow-up scenario that validates lightweight continuation or visible explorer/planner activity after the first turn. | blocked-by:T002 | no | manual smoke run |
| T004 | Capture route, budget, transcript, and artifact evidence in a consistent result summary so failures are diagnosable. | blocked-by:T002,T003 | yes | manual smoke output review |
| T005 | Update stress-validation or runtime docs to point contributors at the new live-smoke command and its artifact expectations. | blocked-by:T002,T003,T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- The opt-in live smoke reaches graph mode, large writes, and same-session follow-up continuation.
- Failures leave behind enough evidence to distinguish routing, context, and provider-budget problems.
- Contributors have one documented command or script to rerun the regression.
