# Task Breakdown

## Story
- Story ID: P5-S01
- Story Title: Local Preview Runtime and Auto Refresh

## Execution Notes

- Keep preview support explicit and local-first; do not quietly guess commands
  when detection confidence is low.
- Reuse target-native dev/watch behavior before adding custom restart logic.
- Treat preview lifecycle as parallel to the agent runtime, not as a blocking
  step inside a turn.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extend discovery and typed artifacts with a narrow preview capability contract and support matrix. | must-have | no | unit tests |
| T002 | Implement a session-scoped preview supervisor that starts, monitors, restarts, and stops a target preview process safely. | blocked-by:T001 | no | integration test |
| T003 | Extend browser runtime contracts and the workbench UI with preview state, URL, recent logs, and unavailable/error handling. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |
| T004 | Wire edit-triggered refresh/restart behavior, then run manual verification against the Vite tic-tac-toe target and an unavailable-target scenario. | blocked-by:T002,T003 | no | manual preview verification |

## TDD Mapping

- T001 tests:
  - [x] `discovery infers preview capability from scripts/framework signals`
  - [x] `unsupported targets return unavailable with a reason`
- T002 tests:
  - [x] `preview supervisor starts once per session and shuts down cleanly`
  - [x] `preview supervisor restarts or surfaces failure without orphaning the process`
- T003 tests:
  - [x] `ui runtime emits preview state without regressing existing session messages`
  - [x] `workbench renders unavailable, healthy, and error preview states`
- T004 tests:
  - [x] `preview updates after a Shipyard edit in the Vite target`
  - [x] `non-previewable target stays explicit and usable`

## Completion Criteria

- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Manual preview verification recorded for supported and unsupported targets
