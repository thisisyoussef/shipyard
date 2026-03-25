# Feature Spec

## Metadata
- Story ID: P8-S03
- Story Title: Next-Task Runner and Active Task Carry-Forward
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 8 spec-driven operator workflow

## Problem Statement

Once Shipyard can create persisted task queues, the operator still needs an ergonomic way to execute them incrementally. Without a runner, the operator has to restate each task manually. Without active-task carry-forward, complex multi-file tasks can still lose their local checklist across retries, long turns, or later session resumes.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Add `next` / `continue` task execution against the persisted task queue.
- Objective 2: Persist task status transitions and in-flight task context.
- Objective 3: Absorb the useful part of the consultant’s multi-file orchestration idea without overloading the rolling summary.
- How this story or pack contributes to the overall objective set: This story turns persisted plans into resumable one-task-at-a-time execution with durable progress tracking.

## User Stories
- As an operator, I want to type `next` and have Shipyard pick up the next pending task from the active plan.
- As an operator, I want `continue` to resume the active in-progress task instead of making me restate it.
- As a coordinator, I want the current task checklist to survive retries and future turns so multi-file tasks stay coherent.

## Acceptance Criteria
- [ ] AC-1: `next` selects the first pending task from the active plan, loads any referenced spec context, and executes that task instead of treating `next` as a normal free-form instruction.
- [ ] AC-2: `continue` resumes the current in-progress task when one exists; otherwise it falls back to the next pending task with a clear explanation.
- [ ] AC-3: Task status transitions are persisted (`pending` → `in_progress` → `done` or `failed`) in the plan file.
- [ ] AC-4: The runtime stores a compact active-task checklist or note outside the rolling summary so future turns and retries know which task is currently being executed.
- [ ] AC-5: When a task completes successfully, Shipyard records a short completion summary and advances to the next pending task on the next `next` call.
- [ ] AC-6: When a task fails or verification fails, Shipyard marks it `failed`, preserves the failure summary, and does not auto-advance silently.
- [ ] AC-7: If no active plan exists or all tasks are complete, Shipyard returns a clear operator-facing message instead of attempting code execution.
- [ ] AC-8: Bulk `implement_all` execution is not added in this story.

## Edge Cases
- Active task already marked `in_progress` when the session resumes: `continue` should reuse it rather than starting a new task.
- Task references spec docs that no longer exist on disk: fail clearly and keep the plan state intact.
- Task queue has no pending items: return “plan complete” instead of making up work.
- Task has no explicit file targets: runner still works, but records that the task relied on broader repo context.

## Non-Functional Requirements
- Reliability: task status persistence must be crash-safe enough to survive between sessions.
- Observability: traces/logs should show the plan id, task id, and status transition for each `next` / `continue`.
- UX: operator messages should make it obvious whether Shipyard resumed an in-progress task or selected a new pending task.
- Scope control: the active checklist should be compact and not become a second giant rolling transcript.

## UI Requirements (if applicable)
- If later surfaced in the workbench, show the active plan id, active task, and pending-count summary compactly.

## Out of Scope
- Automatic execution of the entire remaining queue.
- Rich plan editing and reordering UI.
- Automatic reprioritization of failed tasks.

## Done Definition
- Operators can step through a persisted task queue one task at a time, and Shipyard keeps active-task context stable enough for multi-file work.
