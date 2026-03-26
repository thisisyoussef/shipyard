# Task Breakdown

## Story
- Story ID: RTH-S03
- Story Title: Continuation-Aware Routing and Subagent Visibility

## Execution Notes
- Prefer recent local evidence over redundant helper-agent hops.
- If a subagent still runs, make that work visible through the same outer evidence path the operator already sees.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for same-session continuation routing, recent-path reuse, and visible subagent activity. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/turn-runtime.test.ts` |
| T002 | Persist or derive recent touched-path evidence from bootstrap, edits, active tasks, and prior planning artifacts. | blocked-by:T001 | yes | focused runtime test |
| T003 | Update coordinator heuristics so recent-path evidence can keep same-session follow-ups on the lightweight path. | blocked-by:T001 | no | focused graph-runtime test |
| T004 | Expand `createSubagentLoopOptions()` and related reporter plumbing so subagent tool hooks and budget settings propagate outward. | blocked-by:T001 | no | focused UI/runtime or trace test |
| T005 | Document the new routing expectations and visible subagent evidence in runtime or smoke docs. | blocked-by:T002,T003,T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Recent same-session edits or bootstrap work can keep a follow-up turn on the lightweight path when that evidence is sufficient.
- Explorer and planner work stays visible when it does run.
- Routing heuristics remain explicit, test-backed, and reversible.
