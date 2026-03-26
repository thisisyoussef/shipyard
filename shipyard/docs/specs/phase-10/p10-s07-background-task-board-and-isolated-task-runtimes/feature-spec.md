# Feature Spec

## Metadata
- Story ID: P10-S07
- Story Title: Background Task Board and Isolated Task Runtimes
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard's current plan queue lets the operator advance one task at a time, but
it still behaves like a foreground command queue rather than a true task board.
To support more software-factory-style workflows, Shipyard needs isolated task
runs with durable status, explicit review, and apply or discard flow. The key
is to add task-level parallelism and reviewability without breaking the
single-writer coordinator rule for the main target workspace.

## Story Pack Objectives
- Objective 1: Turn persisted plans into first-class background task runs with
  durable status and evidence.
- Objective 2: Execute tasks in isolated worktrees or sandboxed environments so
  review happens before main-target apply.
- Objective 3: Preserve explicit operator control over which task results land
  in the main target.
- How this story contributes to the overall objective set: it borrows the best
  task-board patterns from software-factory tools without adopting uncontrolled
  parallel writers.

## User Stories
- As an operator, I want to start a task in the background, keep working, and
  later review what it changed before applying it.
- As a coordinator, I want each background task to have its own durable thread,
  checkpoints, and evidence trail.
- As a reviewer, I want task dependencies, retries, cancellations, and apply or
  discard decisions to be visible in one task board.

## Acceptance Criteria
- [ ] AC-1: Persisted plans can spawn background task runs with statuses such as
  draft, queued, running, blocked, ready for review, applied, and discarded.
- [ ] AC-2: Each task run executes in an isolated worktree or sandbox profile
  rather than mutating the main target directly.
- [ ] AC-3: Each task run retains its own thread, checkpoints, and verification
  evidence.
- [ ] AC-4: Operators can review task output and explicitly apply or discard the
  result back into the main target.
- [ ] AC-5: Task scheduling supports dependency order, retry, cancel, and stale
  isolation cleanup.
- [ ] AC-6: Foreground `next` / `continue` remains available for operators who
  do not want the background task board yet.

## Edge Cases
- Empty/null inputs: plans with no pending tasks do not spawn empty task runs.
- Boundary values: one-task plans and many-task plans use the same lifecycle.
- Invalid/malformed data: orphaned or corrupted task-run metadata is surfaced
  clearly and can be cleaned up without affecting the main target.
- External-service failures: worktree or sandbox setup failures keep the task in
  a blocked state and do not mutate the main target.

## Non-Functional Requirements
- Security: isolated tasks must honor policy profiles and not widen filesystem,
  network, or credential access beyond the chosen sandbox.
- Performance: background task creation should be cheap enough for iterative
  planning workflows.
- Observability: task lifecycle, evidence, apply decisions, and cleanup events
  must be visible in traces and the task board.
- Reliability: interrupted background tasks should resume or fail cleanly
  without corrupting the main workspace.

## UI Requirements (if applicable)
- Required states: queued, running, blocked, ready for review, applied,
  discarded, canceled, and cleanup-pending.
- Accessibility contract: the task board must remain keyboard navigable and
  make apply or discard decisions obvious.

## Out of Scope
- Autonomous merge conflict resolution between many task writers.
- Cross-repository portfolio scheduling.
- Human-team notifications outside Shipyard.

## Done Definition
- Shipyard can run isolated background tasks with durable evidence and an
  explicit review/apply step instead of treating every task as one long
  foreground loop.
