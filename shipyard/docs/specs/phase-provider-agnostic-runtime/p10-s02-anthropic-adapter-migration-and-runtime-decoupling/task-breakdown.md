# Task Breakdown

## Story
- Story ID: P10-S02
- Story Title: Anthropic Adapter Migration and Runtime Decoupling

## Execution Notes
- Keep one orchestration path; do not duplicate the raw loop.
- Move provider-specific parsing and request assembly into the adapter, not into graph or subagent helpers.
- Preserve current Anthropic behavior while the runtime boundary changes.

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
- Why this story set is cohesive: it converts the existing provider first so the later routing and second-provider stories depend on a proven adapter shape.
- Coverage check: P10-S02 advances the shared-loop and backward-compatibility objectives.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add an Anthropic adapter module that implements the new provider-neutral model contract. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Refactor `raw-loop.ts`, `graph.ts`, and shared subagent consumers to depend on provider-neutral history and result types instead of Anthropic SDK types. | blocked-by:T001 | no | `pnpm --dir shipyard build` |
| T003 | Update tracing/runtime metadata to capture provider/model information through the adapter boundary. | blocked-by:T001,T002 | yes | `pnpm --dir shipyard test` |
| T004 | Add regression tests proving the Anthropic-backed loop still supports tool use, cancellation, and final-text completion via the adapter. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard test` |

## TDD Mapping

- T001 tests:
  - [x] `Anthropic adapter fails clearly when credentials are missing`
  - [x] `Anthropic adapter normalizes tool-call responses`
- T002 tests:
  - [x] `raw loop no longer depends on Anthropic message types`
  - [x] `graph state stores provider-neutral turn history`
- T003 tests:
  - [x] `trace metadata reports provider and model from adapter execution`
- T004 tests:
  - [x] `Anthropic-backed tool loop completes through the adapter`
  - [x] `Anthropic-backed cancellation still returns a cancelled turn result`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Implementation Evidence

| Task ID | Evidence |
|---|---|
| T001 | `shipyard/src/engine/anthropic.ts` adds `createAnthropicModelAdapter`, provider-owned turn/message conversion, and adapter-backed request execution. |
| T002 | `shipyard/src/engine/raw-loop.ts`, `shipyard/src/engine/history-compaction.ts`, `shipyard/src/engine/graph.ts`, `shipyard/src/engine/turn.ts`, and `shipyard/src/plans/turn.ts` now use `TurnMessage`, `ToolCall`, and `ModelAdapter` rather than Anthropic SDK types in shared orchestration. |
| T003 | `shipyard/src/engine/raw-loop.ts` returns `modelProvider` / `modelName`, and `shipyard/src/engine/graph.ts` persists those fields into LangSmith runtime metadata. |
| T004 | `shipyard/tests/anthropic-contract.test.ts`, `shipyard/tests/raw-loop.test.ts`, `shipyard/tests/history-compaction.test.ts`, and `shipyard/tests/graph-runtime.test.ts` cover adapter normalization, completion, cancellation, compaction, and trace metadata. |
