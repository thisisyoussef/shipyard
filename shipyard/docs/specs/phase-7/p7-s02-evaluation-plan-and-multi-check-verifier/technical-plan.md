# Technical Plan

## Metadata
- Story ID: P7-S02
- Story Title: Evaluation Plan and Multi-Check Verifier
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/agents/verifier.ts`
  - verifier-focused tests such as `shipyard/tests/verifier-subagent.test.ts`
  - coordinator-side default plan helpers, isolated until later integration
- Public interfaces/contracts:
  - `EvaluationPlan`
  - per-check result contract
  - richer `VerificationReport` or successor-compatible result model
- Data flow summary: the coordinator or planner produces an `EvaluationPlan`, the verifier executes command-backed checks in order, each check produces structured evidence, and the final report captures both per-check outcomes and overall pass/fail.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - browser-visible QA for previewable targets
  - durable handoff for long-running work
- Story ordering rationale: this story lands after the planning contract because evaluation checks should tie back to explicit acceptance criteria, and before browser QA because browser evidence should slot into a richer evaluation contract.
- Gaps/overlap check: this story deepens command-backed evaluation only; browser automation and reset routing remain in later stories.
- Whole-pack success signal: later browser and coordinator stories can consume a stable evaluation contract instead of inventing their own pass/fail formats.

## Architecture Decisions
- Decision: keep the verifier read-only and command-only in this story, even while the contract expands.
- Alternatives considered:
  - add browser checks directly into the verifier now
  - keep the single-command contract and add richer coordinator prose
- Rationale: multi-check command verification is the smallest safe step that meaningfully deepens evaluator behavior without mixing browser automation into the same story.

## Data Model / API Contracts
- Request shape:
  - `EvaluationPlan` with ordered `checks`
  - each check initially uses a command-backed shape
- Response shape:
  - per-check result array
  - overall `passed` or equivalent field
  - summary plus first hard failure details
- Storage/index changes:
  - extend `shipyard/src/artifacts/types.ts` with evaluation-plan and per-check result types
  - no persisted storage required in this story

## Dependency Plan
- Existing dependencies used: current raw loop, current verifier helper, current `run_command` tool, current artifact validation patterns.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: evaluation plans become too large and slow.
  - Mitigation: keep the number of command-backed checks explicitly bounded and fail fast on the first required hard failure when appropriate.

## Test Strategy
- Unit tests:
  - `EvaluationPlan` normalization and validation
  - per-check result parsing
  - one-check backward compatibility
- Integration tests:
  - multiple command-backed checks with ordered pass/fail behavior
  - first required failure stops or fails the overall plan correctly
- E2E or smoke tests:
  - deferred to `P7-S05`, where the coordinator will route real work through the richer evaluation plan
- Edge-case coverage mapping:
  - blank plan
  - malformed per-check output
  - timeout or missing script
  - optional check failure alongside required-check success

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - any UI exposure should consume the structured per-check result contract only
- Component structure:
  - deferred until a later story surfaces richer evaluation results in the browser workbench
- Accessibility implementation plan:
  - not applicable in this contract-first story
- Visual regression capture plan:
  - not applicable in this contract-first story

## Rollout and Risk Mitigation
- Rollback strategy: keep current single-command verifier usage by normalizing it to a one-check plan until the richer path is proven.
- Feature flags/toggles: evaluator depth can remain non-default until `P7-S05` integrates routing heuristics.
- Observability checks: record check IDs, commands, and the first hard failure in local logs and trace metadata where available.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
