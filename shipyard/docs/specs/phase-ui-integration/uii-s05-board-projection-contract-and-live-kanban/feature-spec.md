# Feature Spec

## Metadata
- Story ID: UII-S05
- Story Title: Board Projection Contract and Live Kanban
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase UI Integration

## Problem Statement

The new Kanban board is visually complete but entirely mock-backed. At the same
time, Shipyard already has richer runtime truth than “turn history only”:
persisted plan queues, active task context, open-project state, turn status,
preview/deploy state, and now typed ultimate projection. The board should start
life as a real read-only projection of current runtime state, not as a
throwaway visualization that future task-graph work has to replace wholesale.

## Story Pack Objectives
- Objective 1: publish one live board projection the UI can consume directly.
- Objective 2: use today’s plan/session/runtime truth before inventing a new
  task model.
- Objective 3: stay compatible with later Phase 11 board/task-graph work.
- How this story contributes to the overall objective set: it turns the board
  route into a real operations surface without pre-implementing Phase 11.

## User Stories
- As an operator, I want the board to show real work status instead of mock
  cards.
- As an operator, I want the board to prefer active plan/task truth when it
  exists and fall back to a clear session-derived view when it does not.
- As a future UI/runtime pack, I want the board contract to be replaceable by a
  richer task graph without rewriting the UI.

## Acceptance Criteria
- [ ] AC-1: The backend publishes a typed `board:state` projection that derives
  from persisted plan queues and active task context first, with a clear
  session/turn fallback when no active plan exists.
- [ ] AC-2: The projection includes enough metadata for trustworthy UX,
  including data-driven states, tasks, stories, projection source, freshness,
  and explicit empty/stale reasons.
- [ ] AC-3: The Kanban UI renders only backend-provided board data and removes
  all mock task/state/story sources.
- [ ] AC-4: Columns remain fully data-driven and task placement is derived from
  projection state rather than hardcoded UI rules.
- [ ] AC-5: The projection shape is intentionally compatible with the later
  Phase 11 board/task-graph boundary and does not introduce a second mutable
  task store.

## Edge Cases
- Empty/null inputs: no active plan, no active task, or no recent turns still
  yields a valid empty board state.
- Boundary values: a one-task plan and a completed plan use the same contract.
- Invalid/malformed data: missing plan files, stale active-task pointers, or
  inconsistent status values surface a stale/attention-needed board state.
- External-service failures: if project/runtime truth cannot refresh, the board
  exposes the stale reason instead of pretending it is current.

## Non-Functional Requirements
- Reliability: projection must be deterministic and truth-oriented.
- Performance: board projection should be cheap enough to recompute on relevant
  runtime events.
- Observability: projection source and freshness should be inspectable.
- Maintainability: board state should be swappable to a future task graph with
  minimal UI churn.

## UI Requirements
- Required states: live board from plan, session-derived fallback, empty board,
  stale board, filtered board, blocked task state.
- Accessibility contract: story filter, columns, and cards remain keyboard
  reachable and readable.
- Design token contract: board keeps the current Art Deco styling but uses
  runtime truth for motion/status cues.
- Visual-regression snapshot states: populated board, empty board, stale board,
  filtered board, blocked cards.

## Out of Scope
- Drag-and-drop task movement.
- Mutable task CRUD.
- Full Phase 11 task graph, leases, or coordination bus behavior.

## Done Definition
- The board route renders a live, typed, read-only projection of current
  Shipyard work instead of mock data.
