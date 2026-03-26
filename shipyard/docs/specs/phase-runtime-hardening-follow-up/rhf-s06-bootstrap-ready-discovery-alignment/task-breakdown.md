# Task Breakdown

## Story
- Story ID: RHF-S06
- Story Title: Bootstrap-Ready Discovery Alignment

## Execution Notes
- Prefer one explicit readiness contract over scattered implicit checks.
- Keep the fix narrow: align routing and discovery, not the scaffold catalog itself.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for empty, doc-seeded, and truly existing targets. | must-have | no | `pnpm --dir shipyard test -- tests/scaffold-bootstrap.test.ts` |
| T002 | Add a shared bootstrap-readiness signal in discovery or an equivalent normalized rule. | blocked-by:T001 | no | focused discovery test |
| T003 | Update bootstrap-related routing to use the shared readiness signal. | blocked-by:T001 | no | focused routing test |
| T004 | Refresh nearby docs or summaries so operators can see why a target was considered bootstrap-ready. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] empty target is bootstrap-ready
  - [ ] `AGENTS.md`-only target is bootstrap-ready
  - [ ] `README.md`-only target is bootstrap-ready
  - [ ] target with real source or manifest files is not bootstrap-ready
- T003 tests:
  - [ ] doc-seeded targets take the lightweight bootstrap path

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Discovery and routing share one bootstrap-ready rule
- [ ] Doc-seeded targets stop entering broad exploration loops
