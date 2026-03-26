# Task Breakdown

## Story
- Story ID: RHF-S02
- Story Title: Write-Aware Compaction and Adaptive History Budgets

## Execution Notes
- Preserve recent write context in bounded form; do not regress into replaying raw file bodies.
- Keep budget policy explicit so future tests can reason about why a given tail was or was not preserved.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing replay tests that reproduce preserved-tail collapse after large writes. | must-have | no | `pnpm --dir shipyard test -- tests/raw-loop.test.ts` |
| T002 | Update compaction heuristics so at least one recent write-heavy tail survives in exact or compact form. | blocked-by:T001 | no | focused compaction test |
| T003 | Raise or scale the history budget from one centralized policy and expose effective-budget metadata. | blocked-by:T001 | yes | focused raw-loop or config test |
| T004 | Document or log the new compaction decision path for replay debugging. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] preserved tail never collapses to zero after a recent large write
  - [ ] replay after a large generated file retains the latest file path context
- T002 tests:
  - [ ] mixed read and write turns still preserve the write-relevant tail
- T003 tests:
  - [ ] effective history budget reflects the configured or adaptive policy

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Replay coverage proves recent write context survives compaction
- [ ] History budget policy is explicit, bounded, and test-backed
