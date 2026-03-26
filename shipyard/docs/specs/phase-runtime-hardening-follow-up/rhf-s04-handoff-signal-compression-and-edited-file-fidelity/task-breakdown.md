# Task Breakdown

## Story
- Story ID: RHF-S04
- Story Title: Handoff Signal Compression and Edited-File Fidelity

## Execution Notes
- Prefer actual edited-path evidence over inferred plan targets wherever possible.
- Spend the handoff budget on continuation signal, not copied prose.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for multi-file handoff path loss and noisy completed-work summaries. | must-have | no | `pnpm --dir shipyard test -- tests/turn-runtime.test.ts` |
| T002 | Replace copied-goal completed-work prose with a concise goal summary and stronger remaining-work shaping. | blocked-by:T001 | yes | focused handoff test |
| T003 | Persist all edited or created file paths from turn evidence and prioritize them in serialized handoff output. | blocked-by:T001 | no | focused handoff and envelope test |
| T004 | Document compatibility expectations and any handoff-shape evolution. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] multi-file turns keep all edited paths in persisted handoff state
  - [ ] serialized handoff keeps useful file evidence inside the fixed budget
- T002 tests:
  - [ ] completed-work summary does not copy the full task goal text
- T003 tests:
  - [ ] retry and blocked-file evidence is merged without dropping edited paths

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Persisted handoffs remain compatible and budget-bounded
- [ ] Edited-file evidence survives into continuation context
