# Task Breakdown

## Story
- Story ID: PTM-S05
- Story Title: Multi-Project Browser Workspaces

## Execution Notes
- Start with contract and runtime RED tests before moving server code.
- Keep the single-writer-per-target rule explicit by deduping one open runtime
  per target path.
- Preserve the existing target-manager create/open surfaces; do not invent a
  second target creation path.

## Story Pack Alignment
- Higher-level pack objectives:
  - selectable targets
  - runtime switching
  - browser target management
  - automatic background enrichment
  - concurrent browser multi-project operation
- Planned stories in this pack:
  - PTM-S01 Target Manager Tools & Data Model
  - PTM-S02 CLI Integration & Runtime Switching
  - PTM-S03 Browser Workbench Target UI
  - PTM-S04 Automatic Background Enrichment
  - PTM-S05 Multi-Project Browser Workspaces
- Why this story set is cohesive: PTM-S05 is the browser-scale follow-on to the
  existing target-manager contract instead of a separate product line.
- Coverage check: PTM-S05 advances the pack's multi-project browser operation
  objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for project-board contracts, active-project routing, and create/open flows while another project is busy. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/ui-view-models.test.ts tests/ui-workbench.test.ts` |
| T002 | Add typed project-board contracts and reducer state for open projects plus active-project identity. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement server-side project runtime registry, target dedupe, and active-project snapshot routing. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts` |
| T004 | Implement the project board UI, activation flow, and keyed active-project rendering in the workbench shell. | blocked-by:T002 | yes | `pnpm --dir shipyard test -- tests/ui-workbench.test.ts tests/ui-view-models.test.ts` |
| T005 | Run full validation, update story-pack evidence, and document any design tradeoffs or follow-ons. | blocked-by:T003,T004 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## TDD Mapping

- T001 tests:
  - [x] `opens a second target while the first project remains busy`
  - [x] `activating an already-open target does not create a duplicate runtime`
- T002 tests:
  - [x] `session snapshots are routed by active project id`
- T003 tests:
  - [x] `background target updates do not overwrite the active project detail state`
  - [x] `creating a target opens a new project runtime`
- T004 tests:
  - [x] `project board renders open project summaries and highlights the active project`
  - [x] `active project shell is keyed so switching restores the correct snapshot`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale
