# Task Breakdown

## Story
- Story ID: UII-S06
- Story Title: Cross-View Resilience, Polish, and Release Gate

## Execution Notes
- Treat this as a closing gate, not a feature-expansion story.
- Prefer explicit state communication over decorative polish.
- Update docs and audit artifacts in the same pass as validation.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Build a final verification matrix for dashboard, editor, ultimate, board, hosted access, `/human-feedback`, reload/reconnect, and preview harness behavior. Add failing coverage where gaps remain. | must-have | no | `pnpm --dir shipyard test` |
| T002 | Implement remaining loading, empty, error, stale, reconnect, unauthorized, and missing-target states plus UI-memory restore gaps across routes. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Run final accessibility, motion/performance, and UX polish passes; fix high-severity findings or record them explicitly as follow-up work. | blocked-by:T002 | yes | `pnpm --dir shipyard build` |
| T004 | Update docs, spec artifacts, and the user audit checklist; manually verify the preview harness still works after the integration changes. | blocked-by:T002,T003 | no | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [ ] route fallbacks and reconnect states are explicit
  - [ ] legacy entry surfaces still work
- T002 tests:
  - [ ] stored UI memory restores safely after reload
  - [ ] missing/stale runtime cases render explanatory copy
- T003 tests:
  - [ ] no high-severity a11y/perf issues remain unnoticed
- T004 tests:
  - [ ] docs and audit checklist match the shipped route behavior

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Cross-view system states are explicit and trustworthy
- [ ] Preview harness and legacy operator paths still work
- [ ] Docs and audit artifacts are updated with final behavior
