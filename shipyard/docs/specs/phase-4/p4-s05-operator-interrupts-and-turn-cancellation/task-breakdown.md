# Task Breakdown

## Story
- Story ID: P4-S05
- Story Title: Operator Interrupts and Turn Cancellation

## Execution Notes
- Keep cancellation centered in the shared turn executor instead of branching
  terminal and browser behavior into separate runtimes.
- Prefer explicit safe-boundary interruption over magical rollback promises.
- Prove follow-up work in the same session; cancellation alone is not enough if
  the loop still requires restart to recover.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the shared cancellation contract and cancelled outcome across turn execution, runtime state, and streamed events. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Make graph and fallback runtime execution honor cancellation at safe boundaries. | blocked-by:T001 | no | `pnpm --dir shipyard test` |
| T003 | Add terminal active-turn interrupt handling so the process survives and the prompt returns ready for the next instruction. | blocked-by:T001,T002 | no | `pnpm --dir shipyard test` |
| T004 | Replace the browser cancel placeholder with a real active-turn interruption path and truthful cancelled-state streaming. | blocked-by:T001,T002 | yes | `pnpm --dir shipyard test` |
| T005 | Propagate cancellation into long-running subprocess-backed tools and guard against late post-cancel emissions. | blocked-by:T001,T002 | yes | `pnpm --dir shipyard test` |
| T006 | Add automated coverage for terminal interrupt, browser cancel, idle/no-op cancel, and successful follow-up instructions in the same session. | blocked-by:T003,T004,T005 | no | `pnpm --dir shipyard test` |
| T007 | Update operator-facing help and durable runtime docs so interrupt behavior is explicit in terminal and browser mode. | blocked-by:T003,T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [ ] turn/reporter contracts can represent `cancelled` distinctly from `error`
- T002 tests:
  - [ ] graph and fallback runtime stop on cancellation without continuing tool or response work
- T003 tests:
  - [ ] active terminal turn can be interrupted and the next instruction runs in the same process
- T004 tests:
  - [ ] browser `cancel` ends the active turn with `agent:done` status `cancelled`
- T005 tests:
  - [ ] long-running subprocess work is terminated or concluded as cancelled and does not leak late output
- T006 tests:
  - [ ] idle or repeated cancel requests are safe and explicit
- T007 tests:
  - [ ] operator docs explain how to interrupt work without restarting Shipyard

## Completion Criteria

- [ ] Acceptance criteria mapped to completed tasks
- [ ] Terminal and browser interrupt flows are both covered
- [ ] Cancelled turns are reported distinctly from errors in runtime and UI
- [ ] A follow-up instruction succeeds in the same session after cancellation
