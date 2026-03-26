# Task Breakdown

## Story
- Story ID: P9-S04
- Story Title: Deploy UX and Public URL Surfacing

## Execution Notes
- Keep the production URL surface explicit and honest; do not blur it with any
  localhost-only preview UI.
- Add just enough persistence to recover the latest deploy result without
  turning this story into a full deployment-history system.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for deploy-request routing, deploy-state transitions, persisted latest-deploy recovery, and honest URL labeling. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/ui-workbench.test.ts` |
| T002 | Extend backend contracts/state with a first-class deploy request path and persisted latest-deploy summary for the active target. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add automatic publish after successful edited turns, target-header deploy status UI, and production URL surfacing with accessible labels. | blocked-by:T002 | no | `pnpm --dir shipyard build` |
| T004 | Run the full validation pass and do one hosted auto-publish smoke covering success and failure states once provider access exists. | blocked-by:T002,T003 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Hosted users get automatic publish behavior in the workbench after
  successful edited turns.
- The latest production URL is recoverable after refresh/reconnect.
- The UI clearly distinguishes Shipyard hosting from deployed target hosting.
