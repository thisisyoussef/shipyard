# Technical Plan

## Metadata
- Story ID: P8-S02
- Story Title: Plan Mode and Persisted Task Queue
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/types.ts`
  - a new plan-store module, for example `shipyard/src/plans/store.ts`
  - CLI/UI instruction routing where `plan:`-prefixed input is interpreted
  - planner integration points that can consume Phase 7 `ExecutionSpec`
  - tests such as `shipyard/tests/plan-mode.test.ts`
- Public interfaces/contracts:
  - persisted task-queue artifact under `.shipyard/plans/`
  - plan-mode routing helper
  - task queue schema/type
- Data flow summary: the operator submits `plan: ...`, the runtime routes to planning-only mode, the planner loads any needed specs, produces a richer planning artifact, derives a task queue, persists it, and returns the plan summary without entering the code-writing path.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - spec-driven planning
  - operator-reviewed task queues
  - resumable task-by-task execution
  - lighter greenfield bootstrap
- Story ordering rationale: this story must land before `next` / `continue` because the runner needs a persisted plan artifact to execute.
- Gaps/overlap check: this story deliberately builds on the Phase 7 planner direction. It should not create a second free-form task-planning format that drifts away from `ExecutionSpec`.
- Whole-pack success signal: later stories can execute pending tasks from a durable plan file instead of from ad hoc operator notes.

## Architecture Decisions
- Decision: treat the persisted task queue as a typed operator artifact rather than “just a JSON file with no contract.”
- Alternatives considered:
  - plain untyped JSON
  - keep plans only in chat output
- Rationale: Shipyard already leans on typed artifacts and persisted runtime files. A typed queue is easier to validate, trace, resume, and evolve.

## Data Model / API Contracts
- Request shape:
  - raw instruction body after `plan:`
  - optional loaded spec references
  - current repo context
- Response shape:
  - plan id
  - persisted task queue summary
  - ordered task list
- Storage/index changes:
  - add `.shipyard/plans/`
  - define a task queue artifact with task statuses such as `pending`, `in_progress`, `done`, `failed`

## Dependency Plan
- Existing dependencies used: Phase 7 planner work, context envelope, local trace logging, `.shipyard/` persistence patterns.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: task queues become too coarse and stop being one-cycle executable.
  - Mitigation: validate task granularity and require explicit file targets/spec refs where known.

## Test Strategy
- Unit tests:
  - `plan:` routing helper
  - task queue schema validation
  - plan file persistence and load
- Integration tests:
  - planning-only invocation with mocked planner output
  - `load_spec` plus plan creation
- E2E or smoke tests:
  - deferred until the runner story executes the saved plans
- Edge-case coverage mapping:
  - blank `plan:` input
  - malformed planner output
  - plan id collisions
  - no spec refs

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - later browser surfaces should show plan summaries and task counts, not raw storage internals
- Component structure:
  - deferred in this story
- Accessibility implementation plan:
  - not applicable in this artifact/routing story
- Visual regression capture plan:
  - not applicable in this artifact/routing story

## Rollout and Risk Mitigation
- Rollback strategy: `plan:` routing can be feature-gated while the persisted queue format stabilizes.
- Feature flags/toggles: explicit `plan:` prefix is already a natural gate.
- Observability checks: traces/local logs should show plan creation, loaded spec refs, and persisted plan ids.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
