# Task Breakdown

## Story
- Story ID: P10-S03
- Story Title: Layered Memory, Context Compaction, and Decision-Time Guidance

## Execution Notes
- Land memory layering before repo indexing so the index has a clear retrieval
  slot to plug into later.
- Keep source pointers everywhere so compaction does not become irreversible.
- Ship base layering first, then add targeted guidance once the receipts are
  observable and testable.

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
- Why this story set is cohesive: bounded memory is the connective tissue that
  lets the rest of the pack reason over durable artifacts instead of raw prompt
  sprawl.
- Coverage check: P10-S03 advances the pack's layered-memory objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for memory-layer selection, compaction, source-pointer preservation, and decision-time guidance triggers. | must-have | no | `pnpm --dir shipyard test -- tests/context-envelope.test.ts tests/turn-runtime.test.ts` |
| T002 | Introduce typed memory-layer, receipt, and compaction helpers plus target-local summary storage. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Rework prompt assembly to use layered retrieval and add guidance hooks for repeated-failure and risky-trajectory cases. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/context-envelope.test.ts tests/graph-runtime.test.ts` |
| T004 | Surface memory receipts and compaction evidence in traces and the workbench, with docs for operator debugging. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `selects only relevant memory layers for an active task`
  - [ ] `compacts large outputs while preserving source pointers`
- T002 tests:
  - [ ] `stores compacted summaries and reloads them deterministically`
- T003 tests:
  - [ ] `injects decision time guidance after repeated failure patterns`
  - [ ] `preserves uploads and target rules through layered retrieval`
- T004 tests:
  - [ ] `publishes memory receipts and guidance reasons to ui and traces`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
