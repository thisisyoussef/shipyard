# Task Breakdown

## Story
- Story ID: P8-S04
- Story Title: Shared Scaffold Presets and Empty-Target Bootstrap

## Execution Notes
- Reuse the existing scaffold generator and keep presets generic.
- Avoid introducing dependency installation or network side effects in the scaffold step.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for richer preset generation, empty-target guard rails, and shared template reuse. | must-have | no | `pnpm --dir shipyard test -- tests/scaffold-bootstrap.test.ts` |
| T002 | Extend the shared scaffold catalog with at least one richer generic workspace preset. | blocked-by:T001 | yes | unit test |
| T003 | Reuse the shared preset from target-manager creation flow. | blocked-by:T002 | no | integration test |
| T004 | Add a shared bootstrap path for already-selected empty targets and update greenfield prompt/runtime guidance to prefer it over manual boilerplate writes. | blocked-by:T002 | no | `pnpm --dir shipyard typecheck` |
| T005 | Add trace/log coverage and docs updates around preset usage. | blocked-by:T003,T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Richer generic presets exist in the shared scaffold catalog.
- Empty targets can be bootstrapped without duplicating scaffold logic.
- Greenfield guidance prefers shared bootstrap over repeated boilerplate writes.
