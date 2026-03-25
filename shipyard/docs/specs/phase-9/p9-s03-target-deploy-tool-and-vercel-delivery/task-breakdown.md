# Task Breakdown

## Story
- Story ID: P9-S03
- Story Title: Target Deploy Tool and Vercel Delivery Contract

## Execution Notes
- Keep deploy behavior typed and deterministic instead of teaching the model a
  pile of provider shell incantations.
- Treat secret-redaction and timeout handling as first-class behavior, not
  cleanup work after the happy path.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for deploy-tool registration, Vercel success parsing, timeout handling, and secret-safe failure modes. | must-have | no | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T002 | Implement the typed deploy tool, including Vercel command execution, longer bounded timeout handling, and structured result parsing. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Register the deploy tool in the code phase and update prompt guidance so Shipyard can use it from normal coding sessions. | blocked-by:T002 | yes | `pnpm --dir shipyard build` |
| T004 | Run the full validation pass and perform one manual Vercel deploy smoke once provider credentials are available. | blocked-by:T002,T003 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Shipyard has a typed deploy primitive for the active target.
- Vercel deploys can run non-interactively with explicit failure handling.
- Deploy activity is traceable and safe to surface later in the UI.
