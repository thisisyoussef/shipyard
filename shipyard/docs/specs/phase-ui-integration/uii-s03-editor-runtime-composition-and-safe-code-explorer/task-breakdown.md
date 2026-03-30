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
| T001 | Add failing coverage for live editor-route composition, legacy-workbench regression, code-browser path restrictions, and per-target layout persistence. | must-have | no | `pnpm --dir shipyard exec vitest run tests/ui-editor-preferences.test.ts tests/ui-code-browser.test.ts tests/ui-editor-view.test.ts tests/ui-runtime.test.ts` |
| T002 | Extract reusable conversation/workspace surfaces from the current workbench and wire the editor route to live transcript, composer, preview, files, and session context. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement sandboxed read-only file-tree and file-read endpoints plus shared response schemas for the Code tab. | blocked-by:T001 | no | `pnpm --dir shipyard exec vitest run tests/ui-code-browser.test.ts tests/ui-runtime.test.ts` |
| T004 | Wire the Code tab to the live tree/read API and add explicit UI states for empty, denied, binary, and truncated files. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T005 | Persist per-target editor layout/tab prefs and update docs for the new editor/code-browser behavior. | blocked-by:T002,T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [x] editor route renders live state instead of mocks
  - [x] legacy workbench behavior stays intact
  - [x] traversal, binary, and oversized files are rejected correctly
- T002 tests:
  - [x] reused panels receive the same behavior props as before
- T003 tests:
  - [x] tree/read responses stay target-root scoped
- T004 tests:
  - [x] code tab shows explicit empty/error/truncated states
- T005 tests:
  - [x] split ratio and active tab restore per target

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Editor route shows live transcript/preview/files/code data
- [x] Code browser is safe, bounded, and read-only
- [x] Legacy workbench remains supported during the transition

## Implementation Evidence

| Task ID | Evidence |
|---|---|
| T001 | `shipyard/tests/ui-editor-view.test.ts`, `shipyard/tests/ui-code-browser.test.ts`, `shipyard/tests/ui-editor-preferences.test.ts`, `shipyard/tests/ui-runtime.test.ts` |
| T002 | `shipyard/ui/src/workbench-surfaces.tsx`, `shipyard/ui/src/views/EditorView.tsx`, `shipyard/ui/src/ShipyardWorkbench.tsx`, `shipyard/ui/src/App.tsx` |
| T003 | `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/code-browser.ts`, `shipyard/src/ui/server.ts` |
| T004 | `shipyard/ui/src/code-browser-client.ts`, `shipyard/ui/src/panels/CodeExplorerPanel.tsx`, `shipyard/ui/src/views/editor.css` |
| T005 | `shipyard/ui/src/editor-preferences.ts`, `shipyard/ui/src/views/EditorView.tsx`, `shipyard/ui/src/preview-harness.tsx` |
