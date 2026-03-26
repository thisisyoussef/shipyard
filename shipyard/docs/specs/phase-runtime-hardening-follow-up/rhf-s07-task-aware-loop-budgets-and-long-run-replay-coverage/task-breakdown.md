# Task Breakdown

## Story
- Story ID: RHF-S07
- Story Title: Task-Aware Loop Budgets and Long-Run Replay Coverage

## Execution Notes
- Treat this as the last story in the pack, not the first rescue knob.
- Pair every larger-budget path with evidence that the earlier reread spiral is gone.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for narrow-vs-broad acting-budget selection and replay coverage gaps. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts` |
| T002 | Implement task-aware acting-budget selection for narrow, broad greenfield, and continuation paths. | blocked-by:T001 | no | focused graph-runtime test |
| T003 | Upgrade replay or smoke coverage for Trello/Jira-like greenfield builds and same-session follow-ups. | blocked-by:T001 | yes | focused replay or manual smoke |
| T004 | Record chosen acting budgets and rationale in logs, traces, or smoke artifacts, and update docs. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] exact-path or narrow follow-up work stays at the default acting budget
  - [ ] broad bootstrap-ready or greenfield builds receive the larger bounded budget
- T002 tests:
  - [ ] continuation resumes inherit the correct task-aware budget
- T003 tests:
  - [ ] replay or smoke coverage proves the next turns progress instead of rereading newly created files

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Larger acting budgets apply only to the intended task shapes
- [ ] Replay or smoke coverage proves the earlier pack fixes, not just the higher limit
