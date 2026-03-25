# Task Breakdown

## Story
- Story ID: P6-S03
- Story Title: Coordinator Integration

## Execution Notes
- Keep the coordinator narrow and decision-oriented.
- Treat subagent reports as structured evidence, not free-form notes.
- Skip explorer when the instruction already names the file or when the target is still greenfield.
- Let verification outcomes, not discovery guesses, decide recover vs respond.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - split read-only discovery and verification away from the coordinator
  - make subagent contracts explicit and independently testable
  - preserve coordinator-only writes while adding narrower evidence paths
- Planned stories in this pack:
  - P6-S01 Explorer Subagent
  - P6-S02 Verifier Subagent
  - P6-S03 Coordinator Integration
- Why this story set is cohesive: it proves each helper in isolation first, then teaches the coordinator to consume those reports without surrendering write authority.
- Coverage check: P6-S03 advances the pack's orchestration objective and closes the loop between discovery, editing, verification, and recovery.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing graph-runtime tests for broad-plan exploration, exact-path skip behavior, post-edit verifier routing, and verification-vs-exploration conflict handling. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts` |
| T002 | Implement coordinator helper heuristics for path extraction, explorer routing, task-plan creation, and verification-command selection in `shipyard/src/agents/coordinator.ts`. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Wire `shipyard/src/engine/graph.ts` to persist `ContextReport`, call explorer before broad plans, and call verifier after edits while preserving recovery behavior. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts` |
| T004 | Sync the nearby agent/architecture docs and record manual TDD handoff metadata for the integrated coordinator flow. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Contract

- Public API surface:
  - coordinator helper exports from `shipyard/src/agents/coordinator.ts`
  - `createAgentRuntimeNodes(...)`
  - `runFallbackRuntime(...)`
- Handoff artifact path: `.ai/state/tdd-handoff/p6-s03/`
- Focused RED/GREEN command: `pnpm --dir shipyard test -- tests/graph-runtime.test.ts`
- Property tests: not required
- Mutation gate: skipped because the helper script is not present in this repo; record the skip in the handoff metadata

## TDD Mapping

- T001 tests:
  - [ ] `plan node delegates broad instructions to the explorer before acting`
  - [ ] `plan node skips explorer when the instruction already names an exact path`
- T002 tests:
  - [ ] `verify node delegates post-edit checks to the verifier helper`
- T003 tests:
  - [ ] `verification evidence beats explorer guesses and keeps recovery intact`
- T004 checks:
  - [ ] `fallback runtime still succeeds for greenfield no-edit instructions`

## Completion Criteria

- Coordinator uses subagents intentionally and predictably.
- Structured reports influence edit planning and recovery decisions.
- Acceptance criteria are mapped to green runtime tests.
- Manual TDD handoff artifacts are present on disk for the story.
