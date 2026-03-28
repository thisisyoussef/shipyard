# Task Breakdown

## Story
- Story ID: UII-S02
- Story Title: Dashboard Product Catalog and Launch Flow

## Execution Notes
- Keep the dashboard truthful even when metadata is incomplete.
- Prefer explicit request correlation to inferred success.
- Do not expand this story into delete/rename/product-management workflows.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for dashboard projection, live card state mapping, request-correlated launch flow, and empty/filter states. | must-have | no | `pnpm --dir shipyard test -- tests/ui-view-models.test.ts tests/ui-runtime.test.ts` |
| T002 | Implement dashboard projection and local dashboard preferences (`recent`, `starred`, active tab) from live target/project/session state. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add deterministic launch-intent handling for hero prompt and card-open flows, including request correlation for create/switch completion. | blocked-by:T001 | no | focused dashboard/runtime tests |
| T004 | Wire `DashboardView` and `ProductCard` to live data, truthful statuses, and placeholder-backed preview treatment. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T005 | Update docs and pack audit guidance for dashboard launch behavior and known deferred thumbnail work. | blocked-by:T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [ ] dashboard cards combine target and project truth correctly
  - [ ] empty and filtered states show the right copy
  - [ ] launch intent survives create/open flow
- T002 tests:
  - [ ] recent/starred preferences persist across reload
- T003 tests:
  - [ ] create completion resolves the intended editor route
  - [ ] create failure clears pending launch intent
- T004 tests:
  - [ ] busy/ready/error states render truthfully on cards

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Dashboard renders real products and statuses
- [ ] Hero prompt and card open flows land in the right editor route
- [ ] Recent/starred behavior survives reload without new dependencies
