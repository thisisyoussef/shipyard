# Task Breakdown

## Story
- Story ID: PRE2-S04
- Story Title: Context Injection, Rehydration, and Browser Verification

## Execution Notes
- Make context injection obvious in the UI history.
- Treat session continuity as a visible user experience, not hidden implementation detail.
- Use the browser test flow as the baseline demo path for later phases.

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
- Why this story set is cohesive: it ends the UI pack with the behaviors that make the browser surface demo-worthy and durable.
- Coverage check: PRE2-S04 advances the context-visibility and demo-readiness objectives.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add context injection state and visible acknowledgement in the left sidebar. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Add page-reload rehydration to restore the same session and prior turns. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Finish the `--ui` startup ergonomics and browser connection messaging. | blocked-by:T001 | yes | `pnpm --dir shipyard build` |
| T004 | Run and document the browser-based MVP verification flow. | blocked-by:T002,T003 | no | manual browser verification |

## TDD Mapping

- T001 tests:
  - [ ] `injected context is attached to the next instruction and then cleared from draft state`
- T002 tests:
  - [ ] `page reload restores the same session snapshot`
- T003 tests:
  - [ ] `UI startup surfaces the browser URL and current connection state`
- T004 tests:
  - [ ] `browser flow shows streaming activity, diffs, context injection, session info, and errors`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
