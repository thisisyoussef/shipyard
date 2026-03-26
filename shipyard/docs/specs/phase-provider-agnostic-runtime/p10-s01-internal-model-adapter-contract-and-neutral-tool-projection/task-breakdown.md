# Task Breakdown

## Story
- Story ID: P10-S01
- Story Title: Internal Model Adapter Contract and Neutral Tool Projection

## Execution Notes
- Keep the new contract small and focused on the shared loop's actual needs.
- Do not let provider naming leak into the new contract or registry.
- Preserve existing tool registration semantics and JSON-schema shapes.

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
- Why this story set is cohesive: it introduces the abstraction first, migrates the existing provider second, then adds routing, a second provider, and broad test migration in that order.
- Coverage check: P10-S01 advances the abstraction-boundary objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add a provider-neutral contract module under `src/engine/` for turn messages, tool calls, tool-call results, and adapter results. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Refactor `src/tools/registry.ts` so it exposes only generic `ToolDefinition` data and no longer exports Anthropic-specific tool descriptor helpers. | blocked-by:T001 | no | `pnpm --dir shipyard test` |
| T003 | Add provider-side projection helpers or adapter-facing utilities that consume `ToolDefinition[]` without changing registry semantics. | blocked-by:T001,T002 | yes | `pnpm --dir shipyard build` |
| T004 | Add focused tests for the internal contract and provider-neutral tool-projection boundary. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## TDD Mapping

- T001 tests:
  - [x] `internal model contract represents a no-tool turn`
  - [x] `internal model contract represents a tool-call turn`
- T002 tests:
  - [x] `registry still resolves tool definitions in deterministic order`
  - [x] `registry no longer exports provider-specific tool descriptor helpers`
- T003 tests:
  - [x] `provider projection consumes registry-produced tool definitions unchanged`
- T004 tests:
  - [x] `malformed tool-call result normalization fails descriptively`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
