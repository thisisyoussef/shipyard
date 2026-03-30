# Technical Plan

## Metadata
- Story ID: UII-S05
- Story Title: Board Projection Contract and Live Kanban
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - new board projection helper under `shipyard/src/ui/` or `shipyard/src/tasks/`
  - `shipyard/src/plans/store.ts` and active-task runtime access
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/ui/src/views/KanbanView.tsx`
  - `shipyard/ui/src/views/KanbanColumn.tsx`
  - `shipyard/ui/src/views/TaskCard.tsx`
- Public interfaces/contracts:
  - `board:state`
  - `TaskStateDefinition`
  - `BoardStoryProjection`
  - `BoardTaskProjection`
  - `BoardProjectionSource`
- Data flow summary: the backend builds a board projection from active
  plan/task data when available, otherwise from live session/project/runtime
  state; the reducer stores that snapshot; the Kanban view renders it directly.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - live board route
  - future-compatible projection
  - no mock fallback
  - additive runtime wiring
- Story ordering rationale: the board should wait until the app spine and
  ultimate projection exist so it can consume real runtime truth.
- Gaps/overlap check: this story projects current state only; richer task graph
  and coordination contracts remain a later Phase 11 concern.
- Whole-pack success signal: the board becomes truthful now without trapping the
  repo in a UI-only task model later.

## Architecture Decisions
- Decision: prefer active plan/task truth over raw turn-history derivation.
  - Alternatives considered:
    - derive every card from turns only
    - introduce a new mutable task model immediately
  - Rationale: plan/task queues already express operator work more cleanly than
    turns, and a new mutable task store would overlap with Phase 11.
- Decision: include projection source and freshness metadata in `board:state`.
  - Rationale: the UI should be able to explain whether it is showing plan
    truth, session fallback, or a stale snapshot.
- Decision: keep the board projection read-only and additive.
  - Rationale: current UI needs visibility, not mutation authority.

## Data Model / API Contracts
- Request shape:
  - no new frontend request required for passive board updates
- Response shape:
  - `board:state { taskStates, stories, tasks, projectionSource, generatedAt, staleReason }`
- Storage/index changes:
  - optional persisted board snapshot inside `workbenchState` for reload safety

## Dependency Plan
- Existing dependencies used: persisted plan queues, active task context,
  current session state, project board state, ultimate UI state.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: active plan or task pointers become stale and the board lies.
  - Mitigation: projection carries explicit freshness/stale metadata.
  - Risk: session fallback looks too much like a “real” task graph.
  - Mitigation: projection source is explicit and card/story labeling reflects
    the fallback mode.

## Test Strategy
- Unit tests:
  - plan-backed projection
  - session fallback projection
  - state ordering and blocked-task derivation
- Integration tests:
  - board messages are broadcast and rehydrated in session snapshots
  - Kanban view renders backend data only
- E2E or smoke tests:
  - create a plan, run `next`, and verify board movement
- Edge-case coverage mapping:
  - no active plan
  - completed plan
  - stale/missing plan artifact
  - empty board

## UI Implementation Plan
- Behavior logic modules:
  - board projection builder
  - board reducer slice
  - story/task filter handling
- Component structure:
  - `KanbanView`
  - `KanbanColumn`
  - `TaskCard`
- Accessibility implementation plan:
  - board filter and card metadata remain readable and keyboard reachable
- Visual regression capture plan:
  - live board, empty board, stale board, filtered board

## Rollout and Risk Mitigation
- Rollback strategy: the board route can remain hidden behind an empty-state
  fallback until the projection is truthful; current project board behavior
  elsewhere stays intact.
- Feature flags/toggles: none required.
- Observability checks: include projection source and generation time in the
  board state so stale data is debuggable.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/plan-mode.test.ts tests/ui-runtime.test.ts tests/ui-view-models.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
