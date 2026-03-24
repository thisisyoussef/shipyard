# Task Breakdown

## Story
- Story ID: PRE2-S01
- Story Title: UI Runtime Contract and `--ui` Mode

## Execution Notes
- Keep the startup and transport contract small and explicit.
- Assume `P2-S02` has already landed and reuse its real file-IO/tool surfaces instead of inventing placeholders.
- Do not let the browser mode fork the engine.
- Choose one backend and one frontend build path and stick to them.

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
- Why this story set is cohesive: it moves from runtime contract to backend events to frontend rendering to browser proof.
- Coverage check: PRE2-S01 advances the foundational runtime objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the UI-mode runtime selector and message schemas. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Choose and document the local server and SPA build approach. | blocked-by:T001 | no | docs review |
| T003 | Add tests for CLI mode parsing and invalid WebSocket message handling. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T004 | Document the shared-engine constraint so later stories build on one runtime. | blocked-by:T002 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [ ] `--ui selects the browser runtime path`
- T002 tests:
  - [ ] `WebSocket message schema accepts the expected event types`
- T003 tests:
  - [ ] `invalid message types are rejected clearly`
- T004 tests:
  - [ ] `contract docs make terminal and UI modes share one engine`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
