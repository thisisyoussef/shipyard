# Task Breakdown

## Story
- Story ID: P4-S01
- Story Title: Graph Runtime and Fallback Contract

## Execution Notes
- Keep the state object explicit and small enough to inspect.
- Make status-based routing a named helper so graph logic and fallback logic share one decision model.
- Treat the raw-loop fallback as a first-class plan, not a throwaway note.

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
- Why this story set is cohesive: it moves from runtime contract to recovery safety to user-facing integration to proof.
- Coverage check: P4-S01 advances the core runtime objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the shared Phase 4 graph state type and status model. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Implement the LangGraph nodes and conditional routing helpers around `plan`, `act`, `verify`, `recover`, and `respond`. | blocked-by:T001 | no | `pnpm --dir shipyard test` |
| T003 | Integrate the Phase 3 raw acting loop into the `act` node and enforce the 25-iteration cap. | blocked-by:T002 | no | `pnpm --dir shipyard build` |
| T004 | Document and test the fallback runtime path that uses manual state management instead of LangGraph. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |

## TDD Mapping

- T001 tests:
  - [ ] `graph state can represent retries, blocked files, last edited file, and final result`
- T002 tests:
  - [ ] `status helpers route act to verify when an edit occurred`
  - [ ] `status helpers route verify failure to recover`
- T003 tests:
  - [ ] `act node fails clearly after 25 tool-loop iterations`
- T004 tests:
  - [ ] `fallback runtime preserves retry and blocked-file semantics`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
