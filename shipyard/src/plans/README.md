# Plans

This folder holds the operator-facing planning path added in Phase 8.

## Responsibilities

- detect and execute `plan:` instructions without entering the code-writing
  runtime
- persist typed task queues under `target/.shipyard/plans/`
- reload saved spec context and run one queued task at a time through `next`
  and `continue`
- keep compact active-task state on the shared session so retries and later
  turns can stay focused on the current deliverable

## Current Modules

- `store.ts`: task-queue schema validation plus save/load helpers
- `turn.ts`: planning-only executor, reporter hooks, and `plan:` routing helpers
- `task-runner.ts`: active-plan lookup, spec reload, task status transitions,
  and `next` / `continue` execution over the shared turn runtime

## Rules

- Planning mode stays read-only.
- Persisted queues should be compact, typed, and resilient across session
  restarts.
- Any spec refs used to create a plan should stay attached to the saved queue.
- Active-task carry-forward belongs in structured session state, not the rolling
  summary.
