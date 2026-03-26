# Feature Spec

## Metadata
- Story ID: P10-S01
- Story Title: Durable Graph Threads and Unified Execution State
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard currently persists different parts of long-running work in different
places: graph state lives in-memory, plan mode persists task queues under
`.shipyard/plans`, active-task state lives in the session model, recoveries use
checkpoint files, and handoffs save separate artifacts after thresholds trip.
That works for the current MVP, but it makes resume semantics, operator
approvals, and durable task execution harder than they need to be. Shipyard now
needs one durable execution-thread model that owns planning, acting,
verification, recovery, pause/resume, and handoff state end to end.

## Story Pack Objectives
- Objective 1: Give the runtime one durable execution thread instead of several
  partially overlapping persistence paths.
- Objective 2: Preserve the lightweight fast path for trivial instructions
  while making broad work much safer to pause and resume.
- Objective 3: Create a durable substrate that later approval, memory, routing,
  and background-task stories can build on.
- How this story contributes to the overall objective set: it is the pack's
  foundation story. Every later policy, memory, and background-execution story
  depends on a cleaner execution-state contract.

## User Stories
- As an operator, I want `plan:`, `next`, `continue`, and normal turns to
  attach to one durable thread so I can see what is active and resume safely.
- As a coordinator, I want recoveries, retries, and handoffs to reload from
  durable thread state instead of reconstructing context from several partial
  artifacts.
- As a reviewer, I want the UI and traces to show the current node, active
  task, and resume pointer for a long-running thread.

## Acceptance Criteria
- [ ] AC-1: A typed runtime thread contract exists for graph state, plan/task
  progress, approval checkpoints, recovery pointers, and handoff metadata.
- [ ] AC-2: `plan:`, `next`, `continue`, and normal instruction turns can all
  attach to the same persisted thread and checkpoint model.
- [ ] AC-3: Recovery and interruption paths can pause and later resume from the
  durable thread without losing task context or verification intent.
- [ ] AC-4: CLI and browser surfaces can report the current thread ID, node,
  active task, and latest checkpoint or resume pointer.
- [ ] AC-5: Existing sessions, plans, and handoff artifacts can be migrated or
  normalized into the new model without silent data loss.
- [ ] AC-6: Trivial exact-path work can still use a lightweight path without
  paying the full cost of the heavier durable workflow.

## Edge Cases
- Empty/null inputs: starting a new thread with no prior state should behave
  like today's simple turn start.
- Boundary values: a thread with one planned task still uses the same
  durability contract as a many-task plan.
- Invalid/malformed data: malformed legacy plan or handoff artifacts fail
  clearly and fall back to a safe reconstruction path.
- External-service failures: missing checkpoint storage or interrupted writes do
  not corrupt the active thread; the system keeps the last valid checkpoint.

## Non-Functional Requirements
- Security: thread state must not leak secrets or raw provider tokens into
  durable artifacts.
- Performance: the heavier thread machinery should be lazy enough that short
  single-turn edits do not feel materially slower.
- Observability: every persisted checkpoint and resume decision should be
  traceable in local logs and LangSmith metadata when configured.
- Reliability: interruption and restart semantics must be deterministic enough
  to support later approval pauses and background task execution.

## UI Requirements (if applicable)
- Required states: active thread, paused thread, resumable thread, failed
  checkpoint migration, and thread-with-pending-approval.
- Accessibility contract: thread status and resume controls must remain visible
  and keyboard reachable in the workbench.

## Out of Scope
- Approval policy details.
- Memory layering or repo indexing.
- Background task board UX beyond the core durable thread contract.

## Done Definition
- Shipyard can represent and resume long-running work from one durable thread
  contract instead of reconstructing execution from separate plan, session,
  checkpoint, and handoff systems.
