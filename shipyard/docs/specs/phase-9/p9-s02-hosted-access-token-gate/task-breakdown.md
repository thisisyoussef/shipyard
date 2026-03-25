# Task Breakdown

## Story
- Story ID: P9-S02
- Story Title: Hosted Access Token Gate

## Execution Notes
- Keep the auth surface intentionally lightweight and assignment-scoped.
- Protect the session/bootstrap boundary first; do not build a full account
  system.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for locked startup, valid-token unlock, websocket rejection, and token-redaction behavior. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts` |
| T002 | Add the hosted access helper and server-side validation for the locked/unlocked browser flow. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add the browser login/bootstrap UI, reconnect handling, and query-token cleanup. | blocked-by:T002 | no | `pnpm --dir shipyard build` |
| T004 | Run the full validation suite and do one manual hosted-login smoke with `SHIPYARD_ACCESS_TOKEN` set. | blocked-by:T002,T003 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Hosted Shipyard can require a shared secret before exposing the agent loop.
- Invalid access stays explicit and secret-safe.
- Local development remains unchanged when the env var is absent.
