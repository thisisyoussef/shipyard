# Task Breakdown

## Story
- Story ID: UII-S05
- Story Title: Board Projection Contract and Live Kanban

## Execution Notes
- Prefer plan/task truth first, session fallback second.
- Make freshness/source explicit so the board never masquerades as something it
  is not.
- Do not expand this story into drag/drop or mutable task management.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for plan-backed board projection, session fallback projection, empty/stale states, and reducer rehydration. | must-have | no | `pnpm --dir shipyard test -- tests/plan-mode.test.ts tests/ui-runtime.test.ts tests/ui-view-models.test.ts` |
| T002 | Implement a read-only board projection builder that prefers persisted plan/task truth and falls back to session/runtime truth with explicit source metadata. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add `board:state` contracts, reducer integration, and backend broadcast/rehydration behavior. | blocked-by:T001,T002 | no | focused board/runtime tests |
| T004 | Wire `KanbanView`, `KanbanColumn`, and `TaskCard` to live backend state and remove all mock data sources. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T005 | Update docs to record Phase 11 alignment and any intentional limits of the initial board projection. | blocked-by:T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [ ] plan-backed board projection yields expected states/stories/tasks
  - [ ] session fallback produces a valid board with explicit source metadata
  - [ ] stale or missing artifacts produce an attention-needed state
- T002 tests:
  - [ ] blocked/active/done task status is derived deterministically
- T003 tests:
  - [ ] board state survives session snapshot reload
- T004 tests:
  - [ ] Kanban UI renders backend data only with no mock fallback

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Board route renders real backend projection data
- [ ] Projection source and freshness are explicit
- [ ] No new mutable task store is introduced
