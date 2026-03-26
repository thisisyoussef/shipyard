# Technical Plan

## Metadata
- Story ID: P10-S06
- Story Title: Verification Planner, Assertion Library, and Eval Ops
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/verifier.ts`
  - `shipyard/src/agents/browser-evaluator.ts`
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - new verification helpers under `shipyard/src/verification/`
- Public interfaces/contracts:
  - `VerificationPlannerInput`
  - `VerificationPlan`
  - `AssertionCheck`
  - `AssertionEvidence`
  - `EvalFixtureExport`
- Data flow summary: routing selects verification depth, a planner builds an
  ordered verification plan, assertion executors gather evidence from shell,
  browser, file, diff, or deploy surfaces, and failing evidence can be exported
  into eval-linked trace artifacts.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: verification deepening follows explicit routing so
  the runtime can choose the right assertion surface intentionally.
- Gaps/overlap check: this story improves verification only. P10-S08 later
  turns verification runs into first-class jobs and readiness signals.
- Whole-pack success signal: runtime failures become structured eval inputs
  rather than isolated anecdotes.

## Architecture Decisions
- Decision: keep verification planner-led and read-only, with a shared
  assertion library rather than separate special-case verifiers for each
  surface.
- Alternatives considered:
  - keep command checks only
  - hard-code browser smoke behavior for all previewable targets
- Rationale: command-only checks miss important acceptance failures, and fixed
  browser smoke wastes cost and misses target-specific intent.

## Data Model / API Contracts
- Request shape:
  - verification planning input from route, execution spec, target profile, and
    available surfaces
- Response shape:
  - ordered verification plan, structured evidence per check, and optional eval
    export metadata
- Storage/index changes:
  - save eval fixture exports and assertion artifacts under `.shipyard/`

## Dependency Plan
- Existing dependencies used: verifier, browser evaluator, deploy tool,
  traces, routing artifacts.
- New dependencies proposed (if any): none required for the first pass.
- Risk and mitigation:
  - Risk: assertion proliferation makes verification too slow or flaky.
  - Mitigation: keep target-aware default plans, stable check IDs, and explicit
    skip reasons for unavailable surfaces.

## Test Strategy
- Unit tests:
  - verification plan selection
  - assertion execution and evidence formatting
  - eval fixture export
- Integration tests:
  - mixed command plus browser verification
  - diff or file invariant failures
  - deploy-health verification when a production URL exists
- E2E or smoke tests:
  - operator sees per-check evidence and eval-export marker in the workbench
- Edge-case coverage mapping:
  - docs-only change
  - preview unavailable
  - flaky browser assertion
  - deploy URL missing

## Rollout and Risk Mitigation
- Rollback strategy: preserve command-only verification as a compatible fallback
  while richer assertion types mature.
- Feature flags/toggles: enable eval fixture export separately from richer
  verification planning if needed.
- Observability checks: log plan depth, per-check timings, skip reasons, export
  counts, and assertion flake rates.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
