# Task Breakdown

## Story
- Story ID: P3-S02
- Story Title: Raw Claude Tool Loop

## Execution Notes
- Keep the loop literal and easy to trace.
- Treat the tool-result message assembly as a first-class helper so it does not get buried inside the main control-flow function.
- Do not add graph abstractions or generalized orchestration layers in this story.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - prove the model-to-tool pipeline
  - preserve surgical editing under live model behavior
  - keep the first live loop observable and bounded
- Planned stories in this pack:
  - P3-S01 Anthropic Client and Tool-Use Contract
  - P3-S02 Raw Claude Tool Loop
  - P3-S03 Live Loop Verification and Prompt Hardening
- Why this story set is cohesive: it moves from protocol foundation to runtime orchestration to live behavior proof without mixing responsibilities.
- Coverage check: P3-S02 advances the runtime-fallback objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for final-text completion, tool-use continuation, and iteration-cap failure. | must-have | no | `pnpm --dir shipyard test` |
| T002 | Implement `src/engine/raw-loop.ts` with message history, tool execution, and final text extraction. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add truncated console logging for turn count, tool calls, and tool results. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |
| T004 | Add coverage for multi-tool turns and unknown-tool failures through the registry path. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `raw loop returns final text when Claude ends without tool use`
  - [ ] `raw loop continues after a tool_use response and sends tool_result blocks back`
  - [ ] `raw loop fails after 25 iterations`
- T002 tests:
  - [ ] `raw loop executes all tool_use blocks from a single assistant turn`
- T003 tests:
  - [ ] `raw loop logs truncated tool inputs and outputs`
- T004 tests:
  - [ ] `raw loop returns a failure tool_result when Claude asks for an unknown tool`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
