# Task Breakdown

## Story
- Story ID: P11-S05
- Story Title: Three-Role TDD Runtime and Reviewable Handoff Contracts

## Execution Notes
- Keep the stage boundaries explicit and durable.
- Prefer focused validation commands over repo-wide test runs during the lane.
- Record skips or missing adapters honestly rather than pretending they passed.

## Story Pack Alignment
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Planned stories in this pack:
  - P11-S01 Versioned Artifact Registry and Query Surface
  - P11-S02 Phase Pipeline Runner and Artifact Approval Gates
  - P11-S03 Runtime Skill Registry, Agent Profiles, and Role Loading
  - P11-S04 Discovery, PM Pipeline, and Research-Aware Planning
  - P11-S05 Three-Role TDD Runtime and Reviewable Handoff Contracts
  - P11-S06 Task Graph, Dependency Metadata, and Coordination Bus Contracts
  - P11-S07 Master Coordinator and Parallel Story Orchestration
- Why this story set is cohesive: approved PM artifacts need a bounded
  implementation lane before the coordinator can safely parallelize work later.
- Coverage check: P11-S05 advances the pack's TDD-backed implementation
  objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for TDD stage transitions, immutable test-author artifacts, RED/GREEN guards, and restart-safe handoffs. | must-have | no | `pnpm --dir shipyard test -- tests/*tdd*.test.ts tests/turn-runtime.test.ts` |
| T002 | Introduce TDD lane contracts, handoff artifacts, and stage state persistence. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement test-author, implementer, and reviewer stage execution plus focused validation hooks. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/*tdd*.test.ts tests/turn-runtime.test.ts tests/graph-runtime.test.ts` |
| T004 | Add optional property or mutation adapters, quality report artifacts, and docs for later coordinator consumption. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `requires a red check before implementation begins`
  - [ ] `blocks implementer edits to test-author artifacts`
  - [ ] `surfaces already-green test contracts as an escalation`
- T002 tests:
  - [ ] `persists tdd stage state and handoffs across restart`
- T003 tests:
  - [ ] `records implementer escalations instead of mutating tests`
  - [ ] `emits a reviewer quality report after green`
- T004 tests:
  - [ ] `records property or mutation adapters as pass skip or blocked`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
