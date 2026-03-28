# Feature Spec

## Metadata
- Story ID: P11-S05
- Story Title: Three-Role TDD Runtime and Reviewable Handoff Contracts
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard already uses explorer, planner, verifier, and browser-evaluator
subagents, but its TDD process still lives mostly as workflow guidance outside
the product runtime. There is no runtime-native equivalent of "Agent 1 writes
tests from the spec, Agent 2 implements without editing those tests, Agent 3
reviews or refactors while keeping the suite green." That means the TDD
discipline is harder to preserve once the product itself starts orchestrating
multi-phase work. Shipyard needs a dedicated TDD runtime lane with explicit
handoffs, stage policies, RED/GREEN guards, and durable quality reports.

## Story Pack Objectives
- Objective 1: Make the current three-role TDD discipline a real runtime path
  instead of a docs-only promise.
- Objective 2: Preserve stage isolation so tests, implementation, and review do
  not silently collapse back into one opaque agent loop.
- Objective 3: Give later coordinators and task graphs a clean implementation
  lane with explicit evidence and retry limits.
- How this story contributes to the overall objective set: it is the
  implementation backbone that turns approved PM artifacts into bounded code
  delivery stages.

## User Stories
- As an operator, I want Shipyard to prove RED before implementation starts.
- As a test author, I want my contract preserved so the implementer cannot
  silently weaken it.
- As a reviewer, I want explicit quality and missing-test reports after the
  implementation goes green.

## Acceptance Criteria
- [ ] AC-1: Shipyard has a dedicated TDD runtime lane with explicit stages for
  test author, implementer, and reviewer.
- [ ] AC-2: The implementer stage cannot modify test-author artifacts silently;
  objections are recorded as escalations instead.
- [ ] AC-3: RED/GREEN checks are first-class runtime events with durable
  handoff artifacts and retry counters.
- [ ] AC-4: The TDD lane can attach to approved specs and later emit structured
  quality or review artifacts back into the registry.
- [ ] AC-5: Optional property-test and mutation-test hooks can run when the
  story qualifies, but the lane degrades cleanly when those adapters are not
  configured.
- [ ] AC-6: The operator can inspect stage outputs, escalations, and quality
  findings without reconstructing them from chat history.

## Edge Cases
- Empty/null inputs: a TDD lane cannot start without an approved spec and a
  focused validation command or equivalent test contract.
- Boundary values: trivial bug-fix stories can still use the same lane with one
  narrow test group.
- Invalid/malformed data: malformed test-stage artifacts or missing handoff
  files fail clearly instead of advancing to implementation.
- External-service failures: missing property or mutation tooling records an
  explicit skip rather than failing the whole TDD lane.

## Non-Functional Requirements
- Security: the test-author and reviewer stages should default to read-only
  tool surfaces except where stage-specific writes are explicitly allowed.
- Performance: the lane should keep focused validation narrow enough for
  interactive development.
- Observability: stage transitions, retries, skips, and escalations must be
  visible in traces and later task-board projections.
- Reliability: restart or interruption should not lose the current TDD stage or
  its handoff files.

## Out of Scope
- Rendering a visual TDD lane in the UI.
- Full mutation infrastructure for repos that do not support it.
- Autonomous PR or merge handling.

## Done Definition
- Shipyard can execute an explicit three-role TDD lane with durable handoffs
  and quality reports instead of relying on external workflow memory.
