# Task Breakdown

## Story
- Story ID: UII-S03
- Story Title: Editor Runtime Composition and Safe Code Explorer

## Execution Notes
- Reuse behavior before rewriting visuals.
- Keep the code browser strictly read-only.
- Persist editor layout by target/project, not globally.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for live editor-route composition, legacy-workbench regression, code-browser path restrictions, and per-target layout persistence. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/ui-view-models.test.ts tests/ui-workbench.test.ts` |
| T002 | Extract reusable conversation/workspace surfaces from the current workbench and wire the editor route to live transcript, composer, preview, files, and session context. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement sandboxed read-only file-tree and file-read endpoints plus shared response schemas for the Code tab. | blocked-by:T001 | no | focused file-browser/runtime tests |
| T004 | Wire the Code tab to the live tree/read API and add explicit UI states for empty, denied, binary, and truncated files. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T005 | Persist per-target editor layout/tab prefs and update docs for the new editor/code-browser behavior. | blocked-by:T002,T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [ ] editor route renders live state instead of mocks
  - [ ] legacy workbench behavior stays intact
  - [ ] traversal, binary, and oversized files are rejected correctly
- T002 tests:
  - [ ] reused panels receive the same behavior props as before
- T003 tests:
  - [ ] tree/read responses stay target-root scoped
- T004 tests:
  - [ ] code tab shows explicit empty/error/truncated states
- T005 tests:
  - [ ] split ratio and active tab restore per target

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Editor route shows live transcript/preview/files/code data
- [ ] Code browser is safe, bounded, and read-only
- [ ] Legacy workbench remains supported during the transition
