# Technical Plan

## Metadata
- Story ID: P7-S01
- Story Title: Planner Subagent and ExecutionSpec Artifact
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/agents/planner.ts`
  - planner-specific tests such as `shipyard/tests/planner-subagent.test.ts`
  - coordinator heuristic helpers for planner opt-in, kept isolated until later integration
- Public interfaces/contracts:
  - `ExecutionSpec`
  - planner prompt and planner invocation helper
  - planner opt-in helper for broad vs lightweight paths
- Data flow summary: the coordinator decides whether a request is broad enough to warrant planning, the planner receives stable repo context plus the instruction, the planner returns validated `ExecutionSpec` JSON, and later stories route execution against that artifact.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - durable handoff for long-running work
  - traceable harness routing
- Story ordering rationale: this story lands first because later evaluation, browser QA, and handoff artifacts all need a better planning contract than the current `TaskPlan`.
- Gaps/overlap check: this story defines the planning contract only; it does not yet deepen verifier behavior or add reset routing.
- Whole-pack success signal: later stories can consume explicit goals and acceptance criteria rather than reverse-engineering intent from the raw instruction alone.

## Architecture Decisions
- Decision: implement planning as a read-only planner contract rather than giving the coordinator more implicit planning text.
- Alternatives considered:
  - keep `TaskPlan` and add more string fields ad hoc
  - ask the coordinator to self-plan inside the act loop
- Rationale: a typed planner artifact is easier to validate, trace, persist, and reuse in later evaluator and handoff stories.

## Data Model / API Contracts
- Request shape:
  - instruction
  - discovery summary
  - optional `TargetProfile`
  - optional `ContextReport`
- Response shape:
  - `ExecutionSpec`
  - planner usage decision metadata
- Storage/index changes:
  - extend `shipyard/src/artifacts/types.ts` with `ExecutionSpec`
  - no persisted storage required in this story beyond trace metadata

## Dependency Plan
- Existing dependencies used: current raw loop, current artifact patterns, current discovery/context envelope, optional `TargetProfile`.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: planner output becomes too verbose or drifts into implementation detail.
  - Mitigation: keep the schema compact and explicitly emphasize deliverables, acceptance criteria, and risks rather than step-by-step code instructions.

## Test Strategy
- Unit tests:
  - `ExecutionSpec` parsing and validation
  - planner opt-in helper for broad vs lightweight instructions
  - malformed planner JSON rejection
- Integration tests:
  - planner invocation with a mocked model response
  - optional context inputs such as `TargetProfile` and `ContextReport`
- E2E or smoke tests:
  - deferred to `P7-S05`, where the coordinator will actually route work through the planner
- Edge-case coverage mapping:
  - blank instruction
  - trivial exact-path request bypass
  - malformed JSON
  - planner output missing required acceptance criteria

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - any workbench exposure should read the final `ExecutionSpec` shape only
- Component structure:
  - deferred until planner output is actually surfaced in the browser workbench
- Accessibility implementation plan:
  - not applicable in this contract-only story
- Visual regression capture plan:
  - not applicable in this contract-only story

## Rollout and Risk Mitigation
- Rollback strategy: keep the current `TaskPlan` path as the default fallback while the planner contract is proven in isolation.
- Feature flags/toggles: planner invocation can remain heuristic-gated until `P7-S05` integrates it into the default coordinator path.
- Observability checks: traces and local logs should record whether planner routing was chosen and whether the emitted `ExecutionSpec` validated successfully.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
