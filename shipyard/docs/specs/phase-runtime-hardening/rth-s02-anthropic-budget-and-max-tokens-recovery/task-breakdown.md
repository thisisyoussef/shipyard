# Task Breakdown

## Story
- Story ID: RTH-S02
- Story Title: Anthropic Budget and Max-Tokens Recovery

## Execution Notes
- Keep budget handling centralized in the Anthropic/runtime layer.
- Recovery must stay bounded and must never duplicate already completed tool execution.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for Anthropic budget defaults, env overrides, and `max_tokens` stop-reason handling in the raw loop. | must-have | no | `pnpm --dir shipyard test -- tests/anthropic-contract.test.ts tests/raw-loop.test.ts` |
| T002 | Raise Anthropic timeout and `max_tokens` defaults and expose explicit override plumbing through config resolution. | blocked-by:T001 | yes | focused Anthropic config test |
| T003 | Add explicit `max_tokens` recovery or targeted failure handling in `raw-loop.ts` so truncated responses no longer masquerade as empty-final-text errors. | blocked-by:T001 | no | focused raw-loop test |
| T004 | Surface timeout, cancellation, and budget-exhaustion metadata through runtime summaries, logs, or traces. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard typecheck` |
| T005 | Update runtime docs or smoke prerequisites to reflect the new configurable Anthropic budgets. | blocked-by:T002,T003,T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Anthropic budget defaults are realistic for code-writing loops and still configurable.
- `max_tokens` is handled as an explicit truncation condition instead of a generic empty-response error.
- Operators and maintainers can tell timeout, cancellation, and budget exhaustion apart from each other.
