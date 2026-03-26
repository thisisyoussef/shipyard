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

## TDD Mapping

- [x] `uses higher Anthropic defaults for code-writing loops`
- [x] `wraps Anthropic timeouts with a targeted timeout message`
- [x] `inherits Anthropic env overrides through adapter defaults`
- [x] `retries stop_reason=max_tokens with a higher max_tokens budget`
- [x] `raises a targeted budget error when max_tokens exhaustion persists`
- [x] `does not re-execute completed tool turns when retrying a max_tokens response`
- [x] `classifies timeout and budget-exhaustion failures in LangSmith turn metadata`

## Completion Checklist

- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to implemented coverage
- [x] Runtime docs updated for the new Anthropic defaults
- [x] No deferred tasks for this story

## Implementation Evidence

| Area | Evidence |
|---|---|
| Anthropic defaults and env plumbing | `shipyard/src/engine/anthropic.ts`, `shipyard/tests/anthropic-contract.test.ts` |
| Bounded `max_tokens` recovery | `shipyard/src/engine/raw-loop.ts`, `shipyard/tests/raw-loop.test.ts` |
| Failure classification in trace metadata | `shipyard/src/engine/turn.ts`, `shipyard/tests/turn-runtime.test.ts` |
| Manual smoke prerequisites | `shipyard/tests/manual/README.md` |
