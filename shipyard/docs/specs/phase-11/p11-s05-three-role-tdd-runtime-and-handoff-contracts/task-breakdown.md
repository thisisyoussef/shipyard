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
  - P11-S06 GitHub Source of Truth, Branch Hygiene, and PR Merge Operations
  - P11-S07 Railway Hosted Runtime and Remote Workspace Integration
  - P11-S08 Task Graph, Dependency Metadata, and Coordination Bus Contracts
  - P11-S09 Master Coordinator and Parallel Story Orchestration
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
  - [x] `requires a red check before implementation begins`
  - [x] `blocks implementer edits to test-author artifacts`
  - [x] `surfaces already-green test contracts as an escalation`
- T002 tests:
  - [x] `persists tdd stage state and handoffs across restart`
- T003 tests:
  - [x] `records implementer escalations instead of mutating tests`
  - [x] `emits a reviewer quality report after green`
- T004 tests:
  - [x] `records property or mutation adapters as pass skip or blocked`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Implementation Evidence

| Task ID | Evidence |
|---|---|
| T001 | `shipyard/tests/tdd-runtime.test.ts` adds failing-then-passing coverage for RED guard enforcement, already-green escalation handling, restart-safe lane persistence, immutable test-artifact protection, reviewer quality report completion, and optional property or mutation downgrade behavior. |
| T002 | `shipyard/src/tdd/contracts.ts`, `shipyard/src/tdd/store.ts`, `shipyard/src/artifacts/types.ts`, and `shipyard/src/engine/state.ts` add the durable lane schema, target-local persistence, TDD artifact contracts, and `activeTddLaneId` session persistence under `.shipyard/tdd`. |
| T003 | `shipyard/src/tdd/turn.ts`, `shipyard/src/engine/turn.ts`, and `shipyard/src/agents/profiles.ts` implement `tdd start|continue|status`, stage-specific phase overrides, the `test-author` profile, focused RED/GREEN validation, immutable test enforcement, and reviewer completion semantics. |
| T004 | `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/workbench-state.ts`, `shipyard/src/engine/loop.ts`, and `shipyard/src/ui/server.ts` project compact `tddState` into session snapshots and route `tdd ...` commands through both CLI and browser runtimes so later coordinators and UI packs can consume the lane state directly. |

## Deferred Tasks

- A visual TDD board and richer reviewer/refactor sub-turn remain deferred to
  later coordination or UI stories so P11-S05 can stay focused on durable lane
  contracts and runtime safety.
