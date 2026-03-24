# Task Breakdown

## Story
- Story ID: P2-S04
- Story Title: Discovery, Execution, and Smoke Coverage

## Execution Notes
- Keep read-only tools readable first and clever second.
- Reuse shared helpers for shell execution and path normalization instead of cloning logic across tools.
- Add the smoke script after focused tests so the manual path confirms behavior instead of discovering it for the first time.

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
- Why this story set is cohesive: this story completes the pack with the remaining read-only tools and the direct validation loop.
- Coverage check: P2-S04 advances the bounded read-only tooling objective and proves whole-pack readiness.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for `list_files`, `search_files`, `run_command`, and `git_diff` against the new `ToolResult` contract. | must-have | no | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T002 | Implement `list_files` and `search_files` with filtering, relative output, and bounded results. | blocked-by:T001 | yes | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T003 | Implement bounded `run_command` and `git_diff` behavior, including color stripping, timeout caps, and non-git errors. | blocked-by:T001 | yes | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T004 | Add and run the direct smoke script for the full prompt scenario list, then finish baseline repo validation and the scoped commit. | blocked-by:T002,T003 | no | `node --import tsx ./shipyard/tests/manual/phase2-tools-smoke.ts` |

## TDD Mapping

- T001 tests:
  - [ ] `list_files returns a tree-style view with directories before files`
  - [ ] `search_files treats no matches as a successful result`
  - [ ] `run_command returns failing command diagnostics without ANSI color noise`
  - [ ] `git_diff reports a non-git directory clearly`
- T002 tests:
  - [ ] `search_files limits results and rewrites paths relative to the target directory`
- T003 tests:
  - [ ] `run_command clips combined output at 5000 characters`
  - [ ] `git_diff supports staged and path-scoped calls`
- T004 tests:
  - [ ] `manual smoke script exercises every Phase 2 tool and the critical edit_block failure cases`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
