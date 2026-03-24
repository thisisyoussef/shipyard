# Task Breakdown

## Story
- Story ID: SV-S02
- Story Title: UI Error-Stream Contract Alignment

## Execution Notes
- Treat `shipyard/src/engine/turn.ts` as the authoritative contract for what the UI should stream per turn.
- Prefer minimal ordering assertions over brittle exact-message sequences.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Write down the canonical failed-turn event contract (required events + ordering). | must-have | no | docs review |
| T002 | Update UI runtime contract tests to assert `agent:text` is present and ordered before `agent:error`. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Remove brittle full-array assertions where tool events may be legitimately inserted. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |
| T004 | Add a bounded repeated-run guard for the failure stream if ordering flake persists. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## Completion Criteria

- Error-stream tests fail only on real runtime regressions.
- Failure turns in the browser always show final text plus a structured error.
