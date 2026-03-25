# Task Breakdown

## Story
- Story ID: P9-S05
- Story Title: Persistent Hosted Workspace Storage and Restore

## Execution Notes
- Keep the first persistence pass volume-first and filesystem-native.
- Make storage failure explicit; do not let hosted Shipyard quietly drift back
  to ephemeral storage when durability is expected.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for empty-volume boot, restored existing targets/session state, and unwritable-or-missing hosted storage behavior. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts` |
| T002 | Implement hosted workspace validation and restore helpers so Railway-hosted Shipyard can reuse an existing mounted `/app/workspace`. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Document the Railway volume contract, recovery expectations, and future object-store extension seam. | blocked-by:T002 | yes | `pnpm --dir shipyard build` |
| T004 | Run the full validation suite and do one hosted restart smoke with a mounted volume and an existing target. | blocked-by:T002,T003 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Hosted Shipyard can restore its workspace after a restart when the volume is
  mounted.
- Prior targets and `.shipyard/` state remain discoverable after restart.
- The pack now covers real persistent hosted storage rather than demo-only
  ephemeral workspace behavior.
