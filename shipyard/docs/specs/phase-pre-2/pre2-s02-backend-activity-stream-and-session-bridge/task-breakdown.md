# Task Breakdown

## Story
- Story ID: PRE2-S02
- Story Title: Backend Activity Stream and Session Bridge

## Execution Notes
- Emit structured data, not console text.
- Keep event ordering stable within a turn.
- Summaries should be informative enough for the browser UI but bounded enough to stay readable.

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
- Why this story set is cohesive: the backend event bridge is the hinge between runtime work and visible UI value.
- Coverage check: PRE2-S02 advances the real-time event-stream objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add typed event emitters for session, thinking, tool, edit, done, and error events. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Hook the existing engine/tool flow into those event emitters. | blocked-by:T001 | no | `pnpm --dir shipyard test` |
| T003 | Add reconnect/status handling so the browser can request current session state. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T004 | Add tests for ordered tool events, error emission, and reconnect snapshots. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `tool call events include call ID, name, and summarized input`
- T002 tests:
  - [ ] `engine emits ordered tool call and result events during one instruction`
- T003 tests:
  - [ ] `status requests return the current session snapshot`
- T004 tests:
  - [ ] `engine failures emit agent:error without closing the session`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
