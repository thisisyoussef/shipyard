# Task Breakdown

## Story
- Story ID: RTH-S01
- Story Title: Context Compaction and Session Budget Guardrails

## Execution Notes
- Keep the most recent tool-use protocol tail verbatim until the provider no longer needs it.
- Prefer compact summaries plus reread-on-demand behavior over replaying full historical file bodies.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for multi-turn history bloat, rolling-summary character budgets, and serialized envelope caps. | must-have | no | `pnpm --dir shipyard test -- tests/raw-loop.test.ts tests/turn-runtime.test.ts` |
| T002 | Introduce a raw-loop history-compaction helper that summarizes completed older tool cycles while preserving the required verbatim tail. | blocked-by:T001 | no | focused raw-loop test |
| T003 | Enforce instruction and summary truncation in `turn-summary.ts` plus total-budget handling in `context/envelope.ts`. | blocked-by:T001 | yes | focused turn/runtime test |
| T004 | Surface compaction and truncation metadata through runtime state, logs, or traces so follow-up debugging shows when history was compacted. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard typecheck` |
| T005 | Update long-run runtime docs or notes so future stories and smoke coverage target the compacted-history contract instead of the current unbounded behavior. | blocked-by:T002,T003,T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Completed older tool cycles no longer replay raw lifetime payloads forever.
- Rolling summary and serialized session history stay within explicit budgets.
- Compaction remains visible and test-backed instead of becoming invisible prompt magic.
