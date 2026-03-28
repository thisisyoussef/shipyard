# Task Breakdown

## Story
- Story ID: UII-S01
- Story Title: Shared Application Spine and Route State

## Execution Notes
- Treat this as a behavior-preserving refactor first.
- Do not let later dashboard/editor/board wiring leak into this story.
- Keep one controller owner for socket, uploads, and notices at all times.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for route resolution, editor-route fallback, reload-safe rehydration, and preserved workbench behavior under the new shell. | must-have | no | `pnpm --dir shipyard test -- tests/ui/router.test.ts tests/ui-view-models.test.ts tests/ui-workbench.test.ts` |
| T002 | Extract a shared browser controller for hosted access, socket lifecycle, reducer updates, uploads, composer state, and notices. Add selector helpers for dashboard/editor/board route models. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Thin `App.tsx` to a route shell with nav composition and route dispatch while preserving the current workbench inside the editor path. | blocked-by:T002 | no | `pnpm --dir shipyard build` |
| T004 | Preserve `/human-feedback` compatibility, route fallback states, and preview-harness isolation from the live controller. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard test -- tests/ui/router.test.ts tests/ui-workbench.test.ts` |
| T005 | Update frontend/spec docs for the controller + selector split. | blocked-by:T003,T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [x] hash and pathname route resolution stay stable
  - [x] editor route without a resolvable product shows an explicit fallback
  - [x] current workbench behavior survives the new shell
- T002 tests:
  - [x] one controller owns reducer, uploads, and access state
  - [x] route selectors return minimal derived props
- T003 tests:
  - [x] `App.tsx` renders dashboard/editor/board/human-feedback through route dispatch
- T004 tests:
  - [x] `/human-feedback` still works
  - [x] preview harness does not boot the live controller

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] `App.tsx` is materially smaller and shell-only
- [x] One shared browser controller powers all routes
- [x] Legacy workbench and operator paths remain functional

## Implementation Evidence

| Area | Evidence |
|---|---|
| Shared controller extraction | `shipyard/ui/src/use-workbench-controller.ts` |
| Route resolver and editor fallback state | `shipyard/ui/src/app-route.ts`, `shipyard/tests/ui-route-state.test.ts` |
| Thin app shell and parked board state | `shipyard/ui/src/App.tsx`, `shipyard/ui/src/views/RoutePlaceholderView.tsx` |
| Truthful dashboard landing shell | `shipyard/ui/src/views/DashboardLandingView.tsx`, `shipyard/ui/src/views/dashboard.css` |
| Nav and preview compatibility | `shipyard/ui/src/shell/NavBar.tsx`, `shipyard/ui/src/preview-harness.tsx`, `shipyard/tests/ui/router.test.ts` |
