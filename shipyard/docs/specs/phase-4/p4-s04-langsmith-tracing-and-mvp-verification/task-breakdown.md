# Task Breakdown

## Story
- Story ID: P4-S04
- Story Title: LangSmith Tracing and MVP Verification

## Execution Notes
- Treat the two trace URLs as deliverables, not optional artifacts.
- Keep the success and failure tasks small but representative.
- If graph tracing stalls, switch to the fallback path early enough to still leave the phase with working trace evidence.

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
- Why this story set is cohesive: the pack ends with real runtime proof and durable trace references.
- Coverage check: P4-S04 advances the trace-capture and MVP-acceptance objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Enable tracing for the chosen runtime path and verify a local traced run appears in LangSmith. | must-have | no | manual traced run |
| T002 | Run one successful natural-language task and capture its LangSmith trace URL. | blocked-by:T001 | no | manual traced run |
| T003 | Run one intentional error task and capture its LangSmith trace URL. | blocked-by:T001 | no | manual traced run |
| T004 | Update `shipyard/CODEAGENT.md` with the two MVP trace links, rerun repo validation, and commit the final phase. | blocked-by:T002,T003 | no | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `tracing config recognizes the env vars required for the selected runtime path`
- T002 tests:
  - [ ] `successful task run produces a stored trace URL`
- T003 tests:
  - [ ] `failing task run still produces a stored trace URL`
- T004 tests:
  - [ ] `CODEAGENT.md includes the two captured MVP trace links`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
