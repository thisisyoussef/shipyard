# Feature Spec

## Metadata
- Story ID: P8-S02
- Story Title: Plan Mode and Persisted Task Queue
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 8 spec-driven operator workflow

## Problem Statement

Shipyard’s current planning surface is internal: the lightweight `TaskPlan` exists for coordinator execution, and Phase 7 is introducing a richer `ExecutionSpec` for non-trivial work. What Shipyard still lacks is an operator-facing “plan this first” mode. Broad requests either start coding immediately or require the operator to manage the task list outside the tool.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Add a user-facing planning mode triggered by `plan:`-style instructions.
- Objective 2: Persist the resulting task queue under `.shipyard/plans/` so it survives across sessions.
- Objective 3: Reuse the richer planner direction instead of adding a second parallel planning system.
- How this story or pack contributes to the overall objective set: This story turns planner output into a reviewable operator artifact rather than an internal-only coordinator detail.

## User Stories
- As an operator, I want to ask Shipyard to plan a broad request without starting code changes immediately.
- As an operator, I want the plan saved on disk so I can review, revise, and resume it later.

## Acceptance Criteria
- [ ] AC-1: Instructions that start with `plan:` are routed to a planning-only path instead of the normal coding path.
- [ ] AC-2: The planning path can call `load_spec` to pull relevant on-disk specs before producing the plan.
- [ ] AC-3: Planning output is persisted under `.shipyard/plans/` as a typed task-queue artifact rather than transient chat text.
- [ ] AC-4: Each task entry includes at least `id`, `description`, `status`, optional `targetFilePaths`, and optional `specRefs`.
- [ ] AC-5: The initial task list is ordered and sized for one instruction cycle at a time rather than giant umbrella steps.
- [ ] AC-6: Planning mode returns the proposed task list to the operator for review and does not perform code writes.
- [ ] AC-7: The planning path reuses validated richer planner output, such as Phase 7 `ExecutionSpec`, instead of inventing a separate untyped planner contract.
- [ ] AC-8: Plan creation is visible in traces/activity logs, including which specs were loaded to create it.

## Edge Cases
- `plan:` with no meaningful body: fail with a clear operator error.
- Planner returns malformed output: reject it and keep the current repo untouched.
- No loaded specs available: planning still works from instruction + repo context alone.
- Existing plan file name collision: create a stable unique plan id instead of overwriting unexpectedly.

## Non-Functional Requirements
- Security: planning mode remains read-only.
- Performance: trivial exact-path instructions can still skip heavyweight planning outside explicit `plan:` mode.
- Reliability: persisted plan files should survive restarts without losing ordering or statuses.
- Observability: plan creation should be traceable after the fact.

## UI Requirements (if applicable)
- If surfaced in the workbench later, show a compact task-list summary and plan id instead of raw JSON.

## Out of Scope
- Automatic execution of the whole task queue.
- Rich plan editing UI.
- Automatic plan merging across targets.

## Done Definition
- Shipyard can generate a persisted task queue from a `plan:` instruction without starting implementation work.
