# Task Breakdown

## Story
- Story ID: P10-S04
- Story Title: Repository Index and Generated Architecture Wiki

## Execution Notes
- Ship a bounded structural index first and layer richer wiki summaries on top.
- Treat freshness as part of the contract; stale index use should never be
  silent.
- Preserve live-search fallback so the index helps broad work without becoming a
  single point of failure.

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
- Why this story set is cohesive: durable repo knowledge lowers the cost of
  broad planning, routing, and background-task decomposition across the pack.
- Coverage check: P10-S04 advances the pack's repo-knowledge objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for index generation, incremental refresh, stale detection, wiki-summary loading, and fallback to live search. | must-have | no | `pnpm --dir shipyard test -- tests/discovery.test.ts tests/planner-subagent.test.ts` |
| T002 | Introduce target-local repository index and architecture-wiki artifact types plus bounded builders. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Integrate index retrieval into planner, explorer, and layered-memory receipts with freshness reporting. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/planner-subagent.test.ts tests/turn-runtime.test.ts` |
| T004 | Surface index status and refresh controls in CLI/UI and document large-repo behavior and stale fallbacks. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `builds a structural repository index for a target`
  - [ ] `marks stale or missing index artifacts and falls back to live search`
- T002 tests:
  - [ ] `persists wiki summary alongside structural index metadata`
- T003 tests:
  - [ ] `planner retrieves architecture notes from a fresh index`
  - [ ] `explorer uses live search when index freshness is insufficient`
- T004 tests:
  - [ ] `publishes index freshness and refresh status to ui state`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
