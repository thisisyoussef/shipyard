# Task Breakdown

## Story
- Story ID: P8-S03
- Story Title: Next-Task Runner and Active Task Carry-Forward

## Execution Notes
- Keep `next` / `continue` thin wrappers around the normal execution path rather than inventing a second acting loop.
- Store compact active-task context separately from the rolling summary.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for `next`, `continue`, task status transitions, and active-task persistence. | must-have | no | `pnpm --dir shipyard test -- tests/task-runner.test.ts` |
| T002 | Implement active-plan lookup and task selection helpers. | blocked-by:T001 | yes | unit test |
| T003 | Add active-task context/checklist persistence and wire it into the next-turn context envelope. | blocked-by:T002 | no | `pnpm --dir shipyard typecheck` |
| T004 | Implement `next` / `continue` routing plus task status updates around the normal execution path. | blocked-by:T002,T003 | no | integration test |
| T005 | Add trace/log reporting for plan id, task id, and task outcome. | blocked-by:T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- `next` and `continue` can drive one-task-at-a-time execution from persisted plans.
- Task status and active-task context survive across sessions.
- Multi-file tasks retain a compact checklist without polluting the rolling summary.
