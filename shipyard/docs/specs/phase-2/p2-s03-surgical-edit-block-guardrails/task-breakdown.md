# Task Breakdown

## Story
- Story ID: P2-S03
- Story Title: Surgical `edit_block` Guardrails

## Execution Notes
- Write the guardrail tests before the happy path to keep the tool honest.
- Keep all recovery guidance actionable from the model's point of view.
- Treat the diff-size guard as a product requirement, not a best-effort hint.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - shared tool contract
  - safe file operations
  - complete bounded read-only tools
- Planned stories in this pack:
  - P2-S01 Registry and Anthropic Tool Export
  - P2-S02 Safe Relative File IO
  - P2-S03 Surgical `edit_block` Guardrails
  - P2-S04 Discovery, Execution, and Smoke Coverage
- Why this story set is cohesive: this story isolates the pack's highest-risk mutation behavior instead of mixing it into lower-risk read-only work.
- Coverage check: P2-S03 advances the safe-file-operations objective and enforces the PRD's anti-whole-file stance.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for zero-match, multi-match, stale-read, and large-rewrite rejection. | must-have | no | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T002 | Rewrite `edit_block` to consume the shared hash map and enforce all guardrails before writing. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add bounded preview formatting and edit summary output for success and failure paths. | blocked-by:T002 | yes | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T004 | Run focused tool tests plus baseline build checks and capture any deferred follow-up risks. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `edit_block fails with not found guidance when the anchor is missing`
  - [ ] `edit_block fails with exact duplicate count when the anchor is ambiguous`
  - [ ] `edit_block fails with stale-read guidance when the file changed after read_file`
  - [ ] `edit_block rejects a >60 percent rewrite on a file larger than 500 characters`
- T002 tests:
  - [ ] `edit_block succeeds on a unique anchor and leaves the rest of the file untouched`
- T003 tests:
  - [ ] `edit_block returns a no-op success when old_string equals new_string`
  - [ ] `edit_block success output includes line deltas and previews`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
