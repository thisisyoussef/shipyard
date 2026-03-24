# Task Breakdown

## Story
- Story ID: P2-S02
- Story Title: Safe Relative File IO

## Execution Notes
- Keep all reported paths target-relative.
- Store the full hash internally and display a shortened hash in the output string.
- Keep `write_file` intentionally strict so `edit_block` becomes the default edit path.

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
- Why this story set is cohesive: this story owns the shared file-access primitives that the edit story builds on.
- Coverage check: P2-S02 advances the safe-file-operations objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add shared helpers for target-relative path resolution and read-hash tracking. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Rewrite `read_file` to use the new resolver, format `ToolResult`, and seed the shared hash map. | blocked-by:T001 | no | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T003 | Rewrite `write_file` to create parents, reject existing files by default, and honor `overwrite: true`. | blocked-by:T001 | yes | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T004 | Expand tooling tests for read/write success paths and failure modes. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard test -- tests/tooling.test.ts` |

## TDD Mapping

- T001 tests:
  - [ ] `resolveWithinTarget rejects absolute and escaping paths`
- T002 tests:
  - [ ] `read_file returns content, display hash, and line count`
  - [ ] `read_file records the latest hash for stale-read checks`
  - [ ] `read_file rejects directory targets`
- T003 tests:
  - [ ] `write_file creates missing parent directories`
  - [ ] `write_file rejects overwriting existing files unless overwrite is true`
- T004 tests:
  - [ ] `write_file failure messages stay relative-path only`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
