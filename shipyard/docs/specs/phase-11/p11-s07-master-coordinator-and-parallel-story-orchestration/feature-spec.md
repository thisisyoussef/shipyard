# Feature Spec

## Metadata
- Story ID: P11-S07
- Story Title: Master Coordinator and Parallel Story Orchestration
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

`Ultimate mode` currently acts like a persistent simulator-backed loop over one
instruction stream. It can keep a build moving, but it is not yet a true master
coordinator for many stories or many specialized workers. Once artifacts,
approvals, profiles, PM phases, TDD lanes, and task graphs exist, Shipyard
should evolve `ultimate mode` into a coordinator that can supervise multiple
story runs, respect dependencies, assign work to specialized roles, incorporate
live human interrupts, and keep the whole factory progressing without collapsing
back into one giant turn transcript.

## Story Pack Objectives
- Objective 1: Turn `ultimate mode` from a simulator loop into a real runtime
  supervisor.
- Objective 2: Schedule multiple stories or tasks in parallel when dependencies,
  approvals, leases, and isolation rules allow it.
- Objective 3: Keep human interrupt, approval, and feedback behavior central so
  autonomy does not outrun operator control.
- How this story contributes to the overall objective set: it is the pack's
  capstone orchestration story and the runtime bridge to future multi-agent
  factory execution.

## User Stories
- As an operator, I want one master coordinator to keep several stories moving
  without losing the ability to interrupt or redirect priority.
- As a coordinator, I want to assign work based on dependencies, active
  approvals, loaded skills, and agent-role fit.
- As a reviewer, I want each active story to remain inspectable and bounded even
  while several workers are running.

## Acceptance Criteria
- [ ] AC-1: Shipyard has a master coordinator runtime that can supervise
  multiple story or task runs at once rather than only one active loop.
- [ ] AC-2: The coordinator respects dependency edges, approval wait states,
  advisory leases, and isolated worker boundaries when scheduling work.
- [ ] AC-3: The coordinator can choose specialized profiles or phase lanes such
  as discovery, PM, TDD, QA, or deploy based on the active task.
- [ ] AC-4: Human interrupts, edits, approvals, and reprioritization requests
  can preempt or reroute the coordinator safely.
- [ ] AC-5: Coordinator state stays durable enough to recover after restart
  without losing task ownership or active next steps.
- [ ] AC-6: The orchestration contract is usable by a future kanban UI pack but
  does not require that UI to exist first.

## Edge Cases
- Empty/null inputs: the coordinator can idle cleanly when no ready tasks are
  available.
- Boundary values: one ready task still uses the same master-coordinator
  contract as many concurrent tasks.
- Invalid/malformed data: tasks with broken dependencies or stale assignments do
  not deadlock the whole scheduler; they surface as blocked or attention-needed.
- External-service failures: if one worker fails or times out, the coordinator
  preserves other ready work and marks the failed work explicitly.

## Non-Functional Requirements
- Security: the coordinator must not widen main-target write authority beyond
  what lower-level isolation and apply policies allow.
- Performance: scheduler decisions should be cheap enough to re-evaluate on each
  task transition or human interrupt.
- Observability: active stories, worker assignments, blocked reasons, and next
  ready tasks must be visible in traces and status projections.
- Reliability: long-running orchestration must rotate or compact state so it
  does not repeat the oversized-session failures the current runtime has already
  hit in practice.

## Out of Scope
- The visual kanban board and its animations.
- Cross-machine fleet management.
- Autonomous merge conflict resolution across many accepted workers.

## Done Definition
- Shipyard can supervise multiple specialized work streams through one durable
  coordinator instead of treating `ultimate mode` as a single forever-loop.
