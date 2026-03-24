# Task Breakdown

## Story
- Story ID: P3-S03
- Story Title: Live Loop Verification and Prompt Hardening

## Execution Notes
- Treat live verification as the acceptance gate for Phase 3, not a nice-to-have.
- Keep prompts emphatic about surgical editing and only change them when the live run proves they are insufficient.
- Use byte-for-byte comparisons for the edit scenario rather than looser semantic assertions.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - prove the model-to-tool pipeline
  - preserve surgical editing under live model behavior
  - keep the first live loop observable and bounded
- Planned stories in this pack:
  - P3-S01 Anthropic Client and Tool-Use Contract
  - P3-S02 Raw Claude Tool Loop
  - P3-S03 Live Loop Verification and Prompt Hardening
- Why this story set is cohesive: the pack ends with real model behavior proof rather than stopping at mocked orchestration.
- Coverage check: P3-S03 advances the live-proof and surgical-edit objectives.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add local helpers or a manual harness for temp-directory setup, transcript capture, and byte-for-byte file comparison. | must-have | no | `pnpm --dir shipyard test` |
| T002 | Run the read scenario and verify Claude uses `read_file` and reports the correct functions. | blocked-by:T001 | no | live harness run |
| T003 | Run the surgical-edit scenario, verify `edit_block` use and unchanged bytes outside the target function, and harden prompts if the first attempt fails. | blocked-by:T001 | no | live harness run |
| T004 | Run the greenfield creation scenario, verify `write_file` use, then finish repo validation and commit the working phase. | blocked-by:T002,T003 | no | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `fixture helper creates the baseline file and can compare before/after bytes`
- T002 tests:
  - [ ] `live read scenario transcript shows read_file usage`
- T003 tests:
  - [ ] `live surgical-edit transcript shows edit_block and not write_file`
  - [ ] `surgical edit leaves untouched regions byte-for-byte identical`
- T004 tests:
  - [ ] `live greenfield transcript shows write_file usage`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
