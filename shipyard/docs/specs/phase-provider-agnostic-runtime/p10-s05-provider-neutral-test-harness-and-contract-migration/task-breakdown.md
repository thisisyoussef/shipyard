# Task Breakdown

## Story
- Story ID: P10-S05
- Story Title: Provider-Neutral Test Harness and Contract Migration

## Execution Notes
- Optimize for stable behavior coverage, not fixture churn for its own sake.
- Keep provider-specific contract tests focused and small.
- Do not reintroduce provider SDK types into broad runtime suites once the fake adapter seam exists.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - introduce a provider-neutral runtime contract
  - keep one shared orchestration path
  - add configurable multi-provider routing
  - ship an OpenAI adapter
  - migrate tests to provider-neutral fakes
- Planned stories in this pack:
  - P10-S01 Internal Model Adapter Contract and Neutral Tool Projection
  - P10-S02 Anthropic Adapter Migration and Runtime Decoupling
  - P10-S03 Provider Routing and Capability Resolution
  - P10-S04 OpenAI Responses Adapter
  - P10-S05 Provider-Neutral Test Harness and Contract Migration
- Why this story set is cohesive: it ends by aligning the suite with the architecture delivered by the earlier stories.
- Coverage check: P10-S05 advances the durability and maintainability objective directly.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add shared fake adapter helpers and normalized turn-result fixtures for runtime tests. | must-have | no | `pnpm --dir shipyard test` |
| T002 | Migrate engine and subagent tests to the provider-neutral fake adapter seam. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Migrate target-manager, plan-mode, and UI runtime tests to the provider-neutral fake adapter seam. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T004 | Keep or add focused Anthropic and OpenAI adapter contract suites, then remove stale provider-wire imports from broad tests. | blocked-by:T002,T003 | no | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [x] `fake adapter can emit a tool-call turn`
  - [x] `fake adapter can emit a final-text turn`
- T002 tests:
  - [x] `graph and raw loop tests run without provider SDK request types`
  - [x] `planner, explorer, and verifier tests inject fake adapters`
- T003 tests:
  - [x] `target enrichment and UI runtime tests inject fake adapters`
  - [x] `plan-mode tests no longer depend on Anthropic request fixtures`
- T004 tests:
  - [x] `adapter contract suites remain focused on provider translation only`
  - [x] `broad runtime test grep no longer finds provider wire imports outside focused adapter suites`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Implementation Evidence

| Task ID | Evidence |
|---|---|
| T001 | `shipyard/tests/support/fake-model-adapter.ts` adds reusable fake adapter helpers, normalized turn builders, and shared tool-result inspection helpers; `shipyard/tests/fake-model-adapter.test.ts` covers the seam directly. |
| T002 | `shipyard/tests/raw-loop.test.ts`, `shipyard/tests/graph-runtime.test.ts`, `shipyard/tests/turn-runtime.test.ts`, `shipyard/tests/planner-subagent.test.ts`, `shipyard/tests/explorer-subagent.test.ts`, and `shipyard/tests/verifier-subagent.test.ts` now inject `modelAdapter` instead of Anthropic request/response fixtures. |
| T003 | `shipyard/tests/plan-mode.test.ts`, `shipyard/tests/ui-runtime.test.ts`, and `shipyard/tests/manual/phase5-local-preview-smoke.ts` now route planner/UI/preview behavior through the provider-neutral fake adapter seam. |
| T004 | `shipyard/tests/provider-neutral-harness.test.ts` guards against provider SDK wire imports in broad suites, while `shipyard/tests/anthropic-contract.test.ts` and `shipyard/tests/openai-contract.test.ts` remain the focused provider translation suites. |
