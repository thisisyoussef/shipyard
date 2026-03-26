# Task Breakdown

## Story
- Story ID: P10-S03
- Story Title: Provider Routing and Capability Resolution

## Execution Notes
- Keep routing declarative and inspectable.
- Replace hard-coded provider env checks with a shared capability resolver.
- Preserve current Anthropic defaults until another provider is explicitly chosen.

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
- Why this story set is cohesive: it separates route selection from provider implementation details while still using the same shared adapter boundary.
- Coverage check: P10-S03 advances the configurable multi-provider objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add a shared provider/model resolver with explicit precedence for defaults and override points. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Extend phase or adjacent route config so code phase, target manager, and helper roles can express model-routing intent. | blocked-by:T001 | no | `pnpm --dir shipyard build` |
| T003 | Replace Anthropic-only capability checks in target enrichment and related runtime code with provider-aware availability resolution. | blocked-by:T001,T002 | yes | `pnpm --dir shipyard test` |
| T004 | Add focused tests for route precedence, invalid config, and provider-aware capability checks. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## Delivery Notes
- T001 completed in
  [`../../../../src/engine/model-routing.ts`](../../../../src/engine/model-routing.ts)
  with deterministic default resolution, named route IDs, and provider-aware
  capability diagnostics.
- T002 completed in
  [`../../../../src/phases/phase.ts`](../../../../src/phases/phase.ts),
  [`../../../../src/phases/code/index.ts`](../../../../src/phases/code/index.ts),
  [`../../../../src/phases/target-manager/index.ts`](../../../../src/phases/target-manager/index.ts),
  [`../../../../src/engine/graph.ts`](../../../../src/engine/graph.ts), and
  [`../../../../src/plans/turn.ts`](../../../../src/plans/turn.ts).
- T003 completed in
  [`../../../../src/engine/target-enrichment.ts`](../../../../src/engine/target-enrichment.ts),
  [`../../../../src/engine/target-command.ts`](../../../../src/engine/target-command.ts),
  [`../../../../src/ui/server.ts`](../../../../src/ui/server.ts), and
  [`../../../../src/tools/target-manager/enrich-target.ts`](../../../../src/tools/target-manager/enrich-target.ts).
- T004 completed in
  [`../../../../tests/model-routing.test.ts`](../../../../tests/model-routing.test.ts),
  [`../../../../tests/turn-runtime.test.ts`](../../../../tests/turn-runtime.test.ts),
  [`../../../../tests/plan-mode.test.ts`](../../../../tests/plan-mode.test.ts),
  and
  [`../../../../tests/target-auto-enrichment.test.ts`](../../../../tests/target-auto-enrichment.test.ts).

## TDD Mapping

- T001 tests:
  - [x] `global default provider and model resolve deterministically`
  - [x] `route-specific override wins over the global default`
- T002 tests:
  - [x] `phase configuration carries a named model route without SDK types`
  - [x] `helper role can request an explicit route`
- T003 tests:
  - [x] `automatic enrichment availability does not read ANTHROPIC_API_KEY directly`
  - [x] `missing provider credentials surface a provider-aware diagnostic`
- T004 tests:
  - [x] `unknown route or provider configuration fails clearly`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale
