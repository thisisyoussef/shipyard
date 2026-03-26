# Feature Spec

## Metadata
- Story ID: P10-S06
- Story Title: Verification Planner, Assertion Library, and Eval Ops
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard's verification path is richer than the original one-command MVP, but
it still leans heavily on command checks and a fixed browser smoke pattern. For
the next stage, verification needs to become a planner-led subsystem that can
choose focused assertions, mix evidence types, and feed failures back into a
traceable eval pipeline. That means verification can no longer be treated as an
afterthought at the tail end of the coordinator loop.

## Story Pack Objectives
- Objective 1: Turn verification into an explicit planning surface with richer
  check types and evidence contracts.
- Objective 2: Reuse browser, file, diff, and deploy evidence through a shared
  assertion library.
- Objective 3: Close the loop between runtime failures and eval calibration so
  verification quality can improve over time.
- How this story contributes to the overall objective set: it operationalizes
  the recommendation to make evaluation an architecture, not a postscript.

## User Stories
- As a coordinator, I want to choose the smallest meaningful verification plan
  for the active change instead of relying on a fixed command or smoke pattern.
- As an operator, I want richer failure evidence that points at what actually
  broke: tests, DOM state, console errors, diff invariants, or deploy health.
- As a runtime owner, I want failing runs to become reusable eval fixtures for
  later tuning.

## Acceptance Criteria
- [ ] AC-1: Shipyard can create a typed verification plan that mixes commands,
  browser assertions, file or diff invariants, and deploy or health checks.
- [ ] AC-2: A shared assertion library executes those checks and returns
  structured evidence with pass/fail semantics.
- [ ] AC-3: Default verification selection remains target-aware and cost-aware
  rather than running every possible check on every turn.
- [ ] AC-4: Verification failures can be exported or tagged for later eval
  calibration through trace-linked artifacts.
- [ ] AC-5: Existing command-only verification stays available as a compatible
  fallback path.
- [ ] AC-6: Browser and deploy verification stay honest about availability and
  do not imply public hosting when only a local preview exists.

## Edge Cases
- Empty/null inputs: no-op or documentation-only turns can produce an explicit
  lightweight verification plan.
- Boundary values: one assertion and many assertions both use the same planner
  and result model.
- Invalid/malformed data: malformed assertion config or evidence fails closed
  and reports which check could not run.
- External-service failures: missing preview, flaky browser startup, or absent
  deploy provider becomes structured evidence rather than a silent skip.

## Non-Functional Requirements
- Security: verification must remain read-only and must not widen credential
  access beyond the minimum needed for a given check.
- Performance: default plans should stay bounded and avoid expensive browser or
  deploy checks when a command-level proof is enough.
- Observability: every verification plan and failing assertion needs stable IDs
  and trace references.
- Reliability: the same verification plan should produce comparable evidence
  across retries unless the code or environment changed.

## UI Requirements (if applicable)
- Required states: verification planning, assertion running, required failure,
  optional failure, and exported-to-eval marker.
- Accessibility contract: the workbench should expose per-check evidence in a
  readable, keyboard-friendly way.

## Out of Scope
- Organization-wide scorecard dashboards.
- Human-labeling UI beyond exported trace hooks.
- Full deployment orchestration changes.

## Done Definition
- Shipyard can choose and execute richer verification plans with reusable
  evidence and trace-linked eval hooks instead of defaulting to a narrow fixed
  tail check.
