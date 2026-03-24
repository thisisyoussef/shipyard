# Task Breakdown

## Story
- Story ID: P4-S03
- Story Title: Context Envelope and CLI Execution Wiring

## Execution Notes
- Keep the envelope readable enough for humans to inspect in logs and traces.
- Separate assembly from serialization so tests can target both layers.
- Preserve the same CLI contract even if the runtime selector switches between graph and fallback.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stateful execution engine
  - reversible editing and bounded recovery
  - real CLI wiring and trace capture
- Planned stories in this pack:
  - P4-S01 Graph Runtime and Fallback Contract
  - P4-S02 Checkpointing and Recovery Flow
  - P4-S03 Context Envelope and CLI Execution Wiring
  - P4-S04 LangSmith Tracing and MVP Verification
- Why this story set is cohesive: this story turns the graph contract into an actual user-facing entrypoint.
- Coverage check: P4-S03 advances the CLI integration objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Expand the context envelope builder to include retries, blocked files, recent errors, and injected context. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Add deterministic prompt serialization with the required section headers. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Replace the CLI's stub instruction handler with real runtime execution and session-summary updates. | blocked-by:T001,T002 | no | `pnpm --dir shipyard build` |
| T004 | Add tests for envelope serialization and CLI runtime selection between graph and fallback paths. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## TDD Mapping

- T001 tests:
  - [ ] `envelope assembly includes blocked files, retries, and recent errors`
- T002 tests:
  - [ ] `serialized envelope renders the required section headers in a stable order`
- T003 tests:
  - [ ] `CLI instruction path updates rolling summary after engine execution`
- T004 tests:
  - [ ] `CLI can invoke graph or fallback runtime without changing user input handling`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
