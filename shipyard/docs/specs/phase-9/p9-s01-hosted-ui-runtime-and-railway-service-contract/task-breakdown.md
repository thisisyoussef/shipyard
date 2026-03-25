# Task Breakdown

## Story
- Story ID: P9-S01
- Story Title: Hosted UI Runtime and Railway Service Contract

## Execution Notes
- Reuse the existing browser runtime instead of adding a second web server.
- Keep all hosted-path assumptions explicit in config/docs, not hidden inside
  ad hoc deployment commands.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for hosted host/port resolution, fixed workspace initialization, and hosted health behavior. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts` |
| T002 | Extend the CLI and UI runtime so hosted startup can bind to provider networking and boot against the fixed workspace path without breaking local defaults. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add Railway-facing startup config/docs for build, start, env vars, and workspace-path expectations. | blocked-by:T002 | yes | `pnpm --dir shipyard build` |
| T004 | Run the combined validation pass and do one manual hosted-mode smoke using local overrides or Railway once credentials/access exist. | blocked-by:T002,T003 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Shipyard has a documented Railway-ready browser startup contract.
- Hosted-mode startup can create and use the fixed workspace path safely.
- Local workflows remain backward compatible.
