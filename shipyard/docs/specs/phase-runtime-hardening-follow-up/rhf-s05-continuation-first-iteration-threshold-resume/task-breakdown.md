# Task Breakdown

## Story
- Story ID: RHF-S05
- Story Title: Continuation-First Iteration Threshold Resume

## Execution Notes
- Reserve `failed` for real errors; threshold-only exhaustion should become a continuation state.
- Bound automatic continuation explicitly so the runtime cannot spin forever.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for acting-threshold hits being mislabeled as failures. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/turn-runtime.test.ts` |
| T002 | Return a typed continuation outcome from the raw loop instead of throwing on threshold-only exhaustion. | blocked-by:T001 | no | focused raw-loop test |
| T003 | Update graph and turn orchestration to persist handoff, surface checkpoint status, and auto-resume under an outer budget. | blocked-by:T001 | no | focused graph and turn-runtime tests |
| T004 | Add trace or reporter evidence for continuation count and outer-budget exhaustion. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] threshold-only raw-loop exhaustion yields continuation, not failure
  - [ ] graph state marks continuation or checkpoint instead of `failed`
- T002 tests:
  - [ ] true provider or tool errors still map to failure
- T003 tests:
  - [ ] turn executor auto-resumes from handoff until done or outer budget reached

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Threshold-only exhaustion no longer surfaces as a generic failure
- [ ] Automatic continuation is bounded and observable
