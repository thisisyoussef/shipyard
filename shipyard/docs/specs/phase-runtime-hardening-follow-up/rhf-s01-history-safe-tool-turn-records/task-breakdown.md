# Task Breakdown

## Story
- Story ID: RHF-S01
- Story Title: History-Safe Tool Turn Records

## Execution Notes
- Keep live tool execution rich; only the replay-history representation should shrink.
- Favor one shared digest format over tool-specific one-off strings.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for write-heavy and command-heavy replay history growth. | must-have | no | `pnpm --dir shipyard test -- tests/raw-loop.test.ts tests/anthropic-contract.test.ts` |
| T002 | Introduce history-safe serialization helpers for completed assistant tool turns and tool results. | blocked-by:T001 | no | focused history serialization tests |
| T003 | Thread compact digests through raw-loop completed-turn storage without changing live reporter or trace contracts. | blocked-by:T002 | no | focused raw-loop replay test |
| T004 | Add observability or doc notes that explain when compact digests are used. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] replay history compacts `write_file` bodies after turn completion
  - [ ] replay history compacts oversized `run_command` results after turn completion
- T002 tests:
  - [ ] compact assistant history records preserve tool identity, path, success state, and preview
  - [ ] compact tool-result history records preserve concise failure detail
- T003 tests:
  - [ ] live tool hooks still receive full results while replay history stays compact

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for replay-history serialization
- [ ] Compact digests preserve re-read guidance for exact file contents
