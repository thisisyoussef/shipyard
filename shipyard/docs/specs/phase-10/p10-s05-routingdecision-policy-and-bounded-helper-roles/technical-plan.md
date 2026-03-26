# Technical Plan

## Metadata
- Story ID: P10-S05
- Story Title: RoutingDecision Policy and Bounded Helper Roles
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/agents/explorer.ts`
  - `shipyard/src/agents/planner.ts`
  - `shipyard/src/agents/verifier.ts`
  - `shipyard/src/agents/browser-evaluator.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - new routing helpers under `shipyard/src/routing/`
- Public interfaces/contracts:
  - `RoutingDecision`
  - `RoutingDecisionReason`
  - `HelperCapabilityProfile`
  - `ExpectedEvidence`
- Data flow summary: coordinator inputs feed a routing-policy evaluator, the
  chosen decision tells the runtime which helper roles to use and what evidence
  to expect, and the final turn record includes the route taken, any fallback,
  and the evidence returned.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: routing lands after thread, policy, memory, and
  indexing because those are the signals it should use.
- Gaps/overlap check: this story chooses helper paths but does not yet deepen
  verification itself; P10-S06 uses the new routing contract.
- Whole-pack success signal: later stories can tune route quality from explicit
  artifacts instead of reverse-engineering coordinator branches.

## Architecture Decisions
- Decision: represent routing as a first-class artifact produced before helper
  invocation rather than as an implicit side effect of coordinator code.
- Alternatives considered:
  - keep today's heuristics and add more logging
  - make every turn use every helper role
- Rationale: logging alone does not make the route inspectable enough, and
  calling every helper would waste cost and blur role boundaries.

## Data Model / API Contracts
- Request shape:
  - active instruction, thread metadata, memory receipts, target profile, and
    risk signals
- Response shape:
  - route selection, confidence, expected evidence, helper list, fallback path
- Storage/index changes:
  - persist routing artifacts under thread or trace state for later tuning

## Dependency Plan
- Existing dependencies used: coordinator, helper roles, layered memory, index
  freshness, policy decisions, traces.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: routing becomes overfit and harder to reason about than current
    heuristics.
  - Mitigation: keep human-readable rationale strings, confidence thresholds,
    and a deterministic fallback path.

## Test Strategy
- Unit tests:
  - route selection and fallback
  - helper capability enforcement
  - malformed routing artifact handling
- Integration tests:
  - planner route for broad requests
  - lightweight route for exact-path requests
  - browser-evaluator route for preview checks
- E2E or smoke tests:
  - UI shows route rationale for representative turns
- Edge-case coverage mapping:
  - missing index but broad request
  - denied risky command influences route
  - unavailable helper runtime
  - invalid decision fallback

## Rollout and Risk Mitigation
- Rollback strategy: keep existing coordinator heuristics as a fallback path
  until the routing artifact is proven.
- Feature flags/toggles: enable route artifact visibility before making it the
  only source of helper selection.
- Observability checks: log selected route, confidence, expected vs actual
  evidence, fallback frequency, and helper failures.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
