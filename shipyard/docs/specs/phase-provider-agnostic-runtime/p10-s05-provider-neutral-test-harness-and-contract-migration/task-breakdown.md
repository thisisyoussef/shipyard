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
  - [ ] `fake adapter can emit a tool-call turn`
  - [ ] `fake adapter can emit a final-text turn`
- T002 tests:
  - [ ] `graph and raw loop tests run without provider SDK request types`
  - [ ] `planner, explorer, and verifier tests inject fake adapters`
- T003 tests:
  - [ ] `target enrichment and UI runtime tests inject fake adapters`
  - [ ] `plan-mode tests no longer depend on Anthropic request fixtures`
- T004 tests:
  - [ ] `adapter contract suites remain focused on provider translation only`
  - [ ] `broad runtime test grep no longer finds provider wire imports outside focused adapter suites`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
