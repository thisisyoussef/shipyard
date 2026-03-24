# Task Breakdown

## Story
- Story ID: P3-S01
- Story Title: Anthropic Client and Tool-Use Contract

## Execution Notes
- Keep the Claude client layer small and explicit.
- Centralize model naming and message-block helpers so later engine work does not hand-roll the same shapes.
- Prefer test doubles for unit coverage; live API checks belong in the final story.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - prove the model-to-tool pipeline
  - preserve surgical editing under live model behavior
  - keep the first live loop observable and bounded
- Planned stories in this pack:
  - P3-S01 Anthropic Client and Tool-Use Contract
  - P3-S02 Raw Claude Tool Loop
  - P3-S03 Live Loop Verification and Prompt Hardening
- Why this story set is cohesive: it separates provider protocol, loop orchestration, and live behavior verification into distinct responsibilities.
- Coverage check: P3-S01 advances the protocol-foundation objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add a Claude config/client module with environment-key validation and a default Sonnet 4.5 model constant. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Add helper types or adapters for Anthropic message content, `tool_use`, and `tool_result` blocks. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Wire the Phase 2 registry output into the Claude request assembly path. | blocked-by:T001,T002 | no | `pnpm --dir shipyard build` |
| T004 | Add focused tests for config failure, request assembly, and response-block extraction. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## TDD Mapping

- T001 tests:
  - [ ] `Anthropic client setup fails clearly when ANTHROPIC_API_KEY is missing`
- T002 tests:
  - [ ] `assistant response helpers extract tool_use blocks`
  - [ ] `user tool_result helpers preserve success and error payloads`
- T003 tests:
  - [ ] `Claude request assembly consumes registry-produced tool definitions unchanged`
- T004 tests:
  - [ ] `unknown response block types fail descriptively`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
