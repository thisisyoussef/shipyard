# Plans

This folder holds the operator-facing planning path added in Phase 8.

## Responsibilities

- detect and execute `plan:` instructions without entering the code-writing
  runtime
- persist typed task queues under `target/.shipyard/plans/`
- reuse the existing planner contract so later stories can execute saved tasks
  instead of parsing ad hoc chat text

## Current Modules

- `store.ts`: task-queue schema validation plus save/load helpers
- `turn.ts`: planning-only executor, reporter hooks, and `plan:` routing helpers

## Rules

- Planning mode stays read-only.
- Persisted queues should be compact, typed, and resilient across session
  restarts.
- Any spec refs used to create a plan should stay attached to the saved queue.
