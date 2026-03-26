# Task Breakdown

## Story
- Story ID: P10-S07
- Story Title: Background Task Board and Isolated Task Runtimes

## Execution Notes
- Preserve foreground `next` / `continue` while the background board is
  introduced.
- Use isolated worktrees or sandbox adapters behind one task-run contract.
- Keep apply or discard explicit; review is part of the product value here.

## Story Pack Alignment
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Planned stories in this pack:
  - P10-S01 Durable Graph Threads and Unified Execution State
  - P10-S02 Risk-Tiered Approval Modes and Sandbox Policy Profiles
  - P10-S03 Layered Memory, Context Compaction, and Decision-Time Guidance
  - P10-S04 Repository Index and Generated Architecture Wiki
  - P10-S05 RoutingDecision Policy and Bounded Helper Roles
  - P10-S06 Verification Planner, Assertion Library, and Eval Ops
  - P10-S07 Background Task Board and Isolated Task Runtimes
  - P10-S08 Evented Job Runtime and Agent Readiness Dashboard
- Why this story set is cohesive: task-level parallelism becomes safe only after
  the pack establishes durable threads, policy, routing, and verification.
- Coverage check: P10-S07 advances the pack's background-task and review
  workflow objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for task-run lifecycle, isolation setup, review/apply decisions, cancellation, retry, and cleanup. | must-have | no | `pnpm --dir shipyard test -- tests/task-runner.test.ts tests/ui-runtime.test.ts tests/ui-workbench.test.ts` |
| T002 | Introduce typed task-run, isolation, and review-decision contracts plus target-local task storage. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement isolated background task execution, thread wiring, and apply/discard flow while keeping foreground execution intact. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/task-runner.test.ts tests/turn-runtime.test.ts` |
| T004 | Add browser and CLI task-board projections, cleanup helpers, and docs for review-driven task execution. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `spawns a background task run from a persisted plan`
  - [ ] `keeps blocked tasks reviewable without mutating the main target`
- T002 tests:
  - [ ] `records isolation metadata and cleanup markers for each task run`
- T003 tests:
  - [ ] `applies accepted task output back to the main target intentionally`
  - [ ] `supports cancel and retry without corrupting the task thread`
- T004 tests:
  - [ ] `publishes task board status transitions to ui state`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
