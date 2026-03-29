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
  - [x] route fallbacks and reconnect states are explicit
  - [x] legacy entry surfaces still work
- T002 tests:
  - [x] stored UI memory restores safely after reload
  - [x] missing/stale runtime cases render explanatory copy
- T003 tests:
  - [x] no high-severity a11y/perf issues remain unnoticed
- T004 tests:
  - [x] docs and audit checklist match the shipped route behavior

## Implementation Evidence

- T001: `shipyard/tests/ui-route-state.test.ts`,
  `shipyard/tests/ui-board-view-model.test.ts`,
  `shipyard/tests/ui-dashboard-system-notice.test.ts`,
  `shipyard/tests/ui-access.test.ts`, and
  `shipyard/tests/ui-human-feedback-page.test.ts`
- T002: `shipyard/ui/src/board-preferences.ts`,
  `shipyard/ui/src/board-view-model.ts`,
  `shipyard/ui/src/target-selection.ts`,
  `shipyard/ui/src/App.tsx`, and
  `shipyard/ui/src/views/BoardView.tsx`
- T003: `shipyard/ui/src/HostedAccessGate.tsx`,
  `shipyard/ui/src/HumanFeedbackPage.tsx`,
  `shipyard/ui/src/dashboard-system-notice.ts`,
  `shipyard/ui/src/views/KanbanView.tsx`,
  `shipyard/ui/src/views/TaskCard.tsx`, and
  `shipyard/ui/src/styles.css`
- T004: `shipyard/docs/specs/phase-ui-integration/README.md`,
  `shipyard/docs/specs/phase-ui-integration/user-audit-checklist.md`,
  `shipyard/docs/specs/phase-ui-integration/uii-s06-cross-view-resilience-polish-and-release-gate/feature-spec.md`,
  and `shipyard/ui/src/README.md`
- Post-ship follow-up: `shipyard/src/ui/server.ts`,
  `shipyard/tests/ui-runtime.test.ts`,
  `shipyard/docs/architecture/hosted-railway.md`, and `shipyard/README.md`
  extend the same release gate so successful edited `ultimate` cycles auto-publish
  to Vercel instead of leaving deployment automation only on non-ultimate turns.

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Cross-view system states are explicit and trustworthy
- [x] Preview harness and legacy operator paths still work
- [x] Docs and audit artifacts are updated with final behavior
