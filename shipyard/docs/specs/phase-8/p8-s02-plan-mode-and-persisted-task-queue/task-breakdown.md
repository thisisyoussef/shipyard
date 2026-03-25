# Task Breakdown

## Story
- Story ID: P8-S02
- Story Title: Plan Mode and Persisted Task Queue

## Execution Notes
- Reuse richer planner output instead of introducing a competing free-form planning path.
- Keep this story read-only; it should stop before any code-writing execution.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for `plan:` routing, task queue schema validation, and persisted plan storage under `.shipyard/plans/`. | must-have | no | `pnpm --dir shipyard test -- tests/plan-mode.test.ts` |
| T002 | Define the typed task-queue artifact and storage helpers. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Integrate planning-only routing and derive the queue from richer planner output plus optional `load_spec` inputs. | blocked-by:T002 | no | integration test |
| T004 | Add trace/activity coverage and any compact user-facing plan summary needed for CLI/UI reporting. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- `plan:` creates a persisted task queue instead of starting code execution.
- Task queues are typed, reviewable, and resumable.
- The story aligns with Phase 7 planning instead of competing with it.
