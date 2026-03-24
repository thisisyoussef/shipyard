# Task Breakdown

## Story
- Story ID: P4-S02
- Story Title: Checkpointing and Recovery Flow

## Execution Notes
- Keep checkpoint naming deterministic and sortable.
- Make the retry threshold explicit in one place.
- Re-read the reverted file in recovery so the next plan step uses fresh content, not stale assumptions.

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
- Why this story set is cohesive: this story turns state-machine retries into safe file operations instead of risky repeated edits.
- Coverage check: P4-S02 advances the reversible-editing objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Redesign `CheckpointManager` around `checkpoint(relativePath)` and `revert(relativePath)` with session-scoped storage. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Integrate checkpoint-before-edit and revert-on-failure into the graph or fallback runtime. | blocked-by:T001 | no | `pnpm --dir shipyard test` |
| T003 | Track retry counts, last edited file, and blocked files in recovery state updates. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |
| T004 | Add tests for latest-checkpoint selection, missing-checkpoint restore, and retry blocking after two failures. | blocked-by:T001,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `checkpoint stores a copy under the session checkpoint directory`
  - [ ] `revert returns false when no checkpoint exists`
- T002 tests:
  - [ ] `edit path creates a checkpoint before edit_block runs`
- T003 tests:
  - [ ] `recover increments retry counts and blocks after retries exceed two`
- T004 tests:
  - [ ] `revert restores the newest checkpoint for a file`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
