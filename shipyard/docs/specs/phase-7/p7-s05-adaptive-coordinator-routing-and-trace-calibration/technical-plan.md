# Technical Plan

## Metadata
- Story ID: P7-S05
- Story Title: Adaptive Coordinator Routing and Trace Calibration
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/tracing/local-log.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - graph- and turn-focused tests plus any new calibration fixtures
- Public interfaces/contracts:
  - coordinator routing heuristics for planner, richer evaluation, browser QA, and handoff usage
  - trace metadata fields for the selected harness path
  - evaluator calibration fixture format and golden scenario set
- Data flow summary: the coordinator inspects instruction shape and target capability, chooses the light or heavy harness path, records that decision in traces, executes against the richer contracts, and checks evaluator strictness against a small set of golden scenarios.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - browser-visible QA for previewable targets
  - durable handoff for long-running work
- Story ordering rationale: this story lands last because it integrates every earlier contract and defines the acceptance behavior for when each path should be used.
- Gaps/overlap check: this story owns routing heuristics, trace metadata, and calibration only; the underlying planner, verifier, browser, and handoff contracts are owned by earlier stories.
- Whole-pack success signal: the runtime can explain and justify when it used the heavier harness instead of treating orchestration choices as opaque prompt behavior.

## Architecture Decisions
- Decision: keep harness routing adaptive rather than making the heavy path the default for every instruction.
- Alternatives considered:
  - always use planner plus evaluator plus browser QA
  - leave routing fully implicit inside the coordinator prompt
- Rationale: the current lightweight path is still a strength, and the article's core lesson is to add harness complexity only where the task sits beyond baseline model capability.

## Data Model / API Contracts
- Request shape:
  - current instruction
  - optional `ExecutionSpec`
  - optional `EvaluationPlan`
  - preview capability or preview URL
  - reset-threshold metadata
- Response shape:
  - final routed execution state
  - trace metadata describing planner, evaluator, browser, and reset usage
  - calibration result summary for golden scenarios
- Storage/index changes:
  - optional calibration fixtures or golden scenarios under `shipyard/tests/` or a dedicated eval-fixture directory
  - no new durable product-facing storage beyond trace and handoff artifacts already defined in prior stories

## Dependency Plan
- Existing dependencies used: current coordinator heuristics, current trace stack, current preview supervisor, earlier Phase 7 contracts.
- New dependencies proposed (if any): none beyond any browser dependency already introduced in `P7-S03`.
- Risk and mitigation:
  - Risk: routing heuristics become too eager and slow down common small tasks.
  - Mitigation: make heuristics explicit, test broad vs trivial routing separately, and record route choice in traces for later tuning.

## Test Strategy
- Unit tests:
  - coordinator route selection for trivial vs broad instructions
  - trace metadata population for each harness path
  - calibration fixture scoring or pass/fail thresholds
- Integration tests:
  - broad request routes through planner plus richer evaluator
  - previewable request routes through browser evaluator when available
  - long-run threshold routes through handoff/reset path
- E2E or smoke tests:
  - one lightweight task that stays on the current path
  - one broad task that uses planner plus richer verification
  - one preview-backed task that produces browser evidence
- Edge-case coverage mapping:
  - missing LangSmith credentials
  - preview unavailable
  - malformed planner or handoff artifact
  - strictness-regression scenario where evaluator should fail but previously passed

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - optional workbench exposure should consume compact route-summary metadata only
- Component structure:
  - any workbench presentation can remain minimal and should not block the runtime integration
- Accessibility implementation plan:
  - if route summaries are surfaced, status and failure state must remain readable and keyboard accessible
- Visual regression capture plan:
  - not required unless a route-summary UI surface is added as part of integration

## Rollout and Risk Mitigation
- Rollback strategy: heavy harness routing can be disabled selectively while preserving the earlier isolated contracts for planner, verifier, browser QA, or handoff.
- Feature flags/toggles: adaptive routing thresholds can remain configurable while calibration stabilizes.
- Observability checks: local trace events and LangSmith metadata should record route decisions, first hard failures, browser-evaluator usage, and reset reasons.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
