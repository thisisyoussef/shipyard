# Task Breakdown

## Story
- Story ID: P10-S04
- Story Title: OpenAI Responses Adapter

## Execution Notes
- Keep OpenAI-specific differences inside the adapter and its contract tests.
- Reuse the shared loop and routing infrastructure from earlier stories.
- Favor the smallest official OpenAI integration surface that fully supports the shared tool loop.

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
- Why this story set is cohesive: it adds the second provider only after the abstraction and routing layers are ready for it.
- Coverage check: P10-S04 advances the multi-provider execution objective directly.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add OpenAI provider config and the adapter module that implements the shared model contract. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Implement provider-side tool projection and request assembly for the Responses API. | blocked-by:T001 | no | `pnpm --dir shipyard build` |
| T003 | Implement response normalization and tool-result round-tripping for `function_call` / `function_call_output`. | blocked-by:T001,T002 | no | `pnpm --dir shipyard test` |
| T004 | Add focused adapter tests for config failure, request assembly, tool-call normalization, and final-text extraction. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## TDD Mapping

- T001 tests:
  - [ ] `OpenAI adapter fails clearly when credentials are missing`
- T002 tests:
  - [ ] `provider tool projection produces OpenAI function tools`
  - [ ] `Responses request assembly includes the resolved model and tools`
- T003 tests:
  - [ ] `function_call items normalize into Shipyard tool calls`
  - [ ] `tool-call results encode as function_call_output with call_id`
- T004 tests:
  - [ ] `OpenAI adapter extracts final text without tool calls`
  - [ ] `malformed tool arguments fail descriptively`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
