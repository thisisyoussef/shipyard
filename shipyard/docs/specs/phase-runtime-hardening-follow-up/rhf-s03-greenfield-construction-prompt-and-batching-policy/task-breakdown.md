# Task Breakdown

## Story
- Story ID: RHF-S03
- Story Title: Greenfield Construction Prompt and Batching Policy

## Execution Notes
- Tighten the wording around existing-file edits before relaxing new-file creation.
- Keep the prompt aligned with the actual acting-loop and verifier contract.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing prompt-contract tests for new-file creation, existing-file modification, and batching guidance. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts` |
| T002 | Update the code-phase prompt to distinguish net-new files from existing-file edits and encourage coherent batching after bootstrap. | blocked-by:T001 | no | focused prompt test |
| T003 | Remove or replace stale acting-loop instructions that no longer match coordinator behavior. | blocked-by:T001 | yes | focused prompt snapshot |
| T004 | Refresh any nearby docs or smoke notes that describe the greenfield editing contract. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] prompt requires `read_file` before modifying an existing file
  - [ ] prompt allows direct `write_file` for net-new files
  - [ ] prompt encourages batching coherent new-file writes after bootstrap
- T002 tests:
  - [ ] mixed new-file and existing-file instructions keep both rules visible

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Prompt contract matches actual tool behavior
- [ ] Existing-file guardrails remain explicit and test-backed
