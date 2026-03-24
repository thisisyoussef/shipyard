# Task Breakdown

## Story
- Story ID: SV-S03
- Story Title: Persistent Loop Test Flakiness Hardening

## Execution Notes
- Optimize for stable CI signal without weakening the contract coverage.
- Prefer better synchronization over simply raising timeouts.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Identify which wait step times out under load and make it a named milestone. | must-have | no | local repro notes |
| T002 | Refactor waits to be milestone-based and load-tolerant (prompt, turn completion, session persistence). | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Tune timeouts/polling intervals and improve timeout error messages. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |
| T004 | Add a bounded repeat-run guard if flake persists. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## Completion Criteria

- The persistent-loop test is stable in the full suite.
- Timeouts point to the missing milestone rather than failing ambiguously.
