# Task Breakdown

## Story
- Story ID: PRE2-S03
- Story Title: Frontend Developer Console and Diff-First Workbench

## Execution Notes
- Keep the layout visibly tool-oriented.
- Make streamed activity and diffs first-class citizens.
- Prefer progressive disclosure instead of dumping every event open by default.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - browser-first progress surface
  - real-time event streaming
  - visual proof of context injection and surgical edits
- Planned stories in this pack:
  - PRE2-S01 UI Runtime Contract and `--ui` Mode
  - PRE2-S02 Backend Activity Stream and Session Bridge
  - PRE2-S03 Frontend Developer Console and Diff-First Workbench
  - PRE2-S04 Context Injection, Rehydration, and Browser Verification
- Why this story set is cohesive: the frontend workbench is the visible expression of the runtime and event-stream contracts established earlier.
- Coverage check: PRE2-S03 advances the browser-first and diff-visibility objectives.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Build the five-panel app shell and top/bottom chrome. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Render chat turns, activity logs, and session state from streamed events. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Build the file-activity feed and compact diff rendering for edits. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T004 | Apply the dark developer-tool visual system and add focused UI tests/snapshots where appropriate. | blocked-by:T002,T003 | no | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `app shell renders the five major panels`
- T002 tests:
  - [ ] `tool events append to the active turn activity log`
- T003 tests:
  - [ ] `edit events render compact diffs with add/remove styling`
- T004 tests:
  - [ ] `connection and error states remain visible and keyboard accessible`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
