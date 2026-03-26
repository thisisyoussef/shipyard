# Feature Spec

## Metadata
- Story ID: P10-S05
- Story Title: RoutingDecision Policy and Bounded Helper Roles
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard's coordinator already delegates to explorer, planner, verifier, and
browser evaluator helpers, but the decision to use those roles mostly lives in
scattered heuristics. As the runtime gets more durable, more indexed, and more
policy-aware, that routing logic needs to become inspectable and typed rather
than hidden in coordinator conditionals. Shipyard now needs a `RoutingDecision`
artifact plus explicit helper-role capability boundaries so the coordinator can
explain its path and stay the only writer.

## Story Pack Objectives
- Objective 1: Turn helper selection into an explicit runtime artifact with
  rationale, confidence, and expected evidence.
- Objective 2: Keep the single-writer coordinator model while letting helper
  roles expand in a bounded way.
- Objective 3: Give traces and the workbench enough routing evidence to tune
  policy without reading coordinator internals.
- How this story contributes to the overall objective set: it replaces one of
  the main hidden prompt or heuristic layers with a durable policy contract.

## User Stories
- As an operator, I want to know why Shipyard used planner, explorer, browser
  evaluator, or the lightweight path on a given turn.
- As a coordinator, I want a typed route contract that says what evidence I
  expect back from each helper.
- As a runtime owner, I want helper-role capability boundaries so the system
  does not drift into uncontrolled multi-writer behavior.

## Acceptance Criteria
- [ ] AC-1: A typed `RoutingDecision` artifact records chosen route, confidence,
  rationale, expected evidence, and fallback path.
- [ ] AC-2: Coordinator routing uses policy evaluation rather than only
  scattered regex or prefix heuristics.
- [ ] AC-3: Helper roles expose explicit capability and write-boundary
  contracts, and the coordinator remains the only writer to the main target.
- [ ] AC-4: CLI, UI, and traces can show the chosen route, helper usage, and
  fallback reason for each turn.
- [ ] AC-5: Invalid or missing routing decisions fall back to a safe existing
  path instead of blocking all work.
- [ ] AC-6: New helper roles or skills can be added through the bounded routing
  contract without reopening every coordinator branch.

## Edge Cases
- Empty/null inputs: tiny exact-path instructions can still route straight to
  the lightweight path.
- Boundary values: one helper route and many-helper route both use the same
  typed decision structure.
- Invalid/malformed data: malformed routing artifacts trigger a safe fallback
  and a trace warning.
- External-service failures: unavailable helper loops or browser runtime errors
  should not strand the coordinator without a fallback route.

## Non-Functional Requirements
- Security: helper capability scopes must remain narrower than the coordinator
  write surface.
- Performance: policy evaluation should be cheap enough to run every turn.
- Observability: route selection, fallback, and helper evidence must be visible
  in traces and operator surfaces.
- Reliability: helper failures should degrade to safe fallback behavior rather
  than cascading into full-turn crashes.

## UI Requirements (if applicable)
- Required states: lightweight route, delegated route, fallback after helper
  failure, and route-with-warning.
- Accessibility contract: route reason and helper evidence must be readable in
  the workbench activity flow.

## Out of Scope
- Task board or background execution.
- Approval policy enforcement.
- Verification implementation details beyond route selection.

## Done Definition
- Shipyard can explain and persist how it chose its helper path, and that path
  remains bounded by explicit role contracts.
