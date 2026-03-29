# Task Breakdown

## Story
- Story ID: P11-S08
- Story Title: Task Graph, Dependency Metadata, and Coordination Bus Contracts

## Execution Notes
- Keep the task graph separate from the visual board.
- Treat leases as advisory coordination primitives, not as a hidden source of
  write authority.
- Make the local coordination contract strong before adding any external
  adapter.

## Story Pack Alignment
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - GitHub-first and Railway-hosted runtime execution
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
- Why this story set is cohesive: parallel orchestration needs a durable graph
  and coordination substrate before it can schedule any real work.
- Coverage check: P11-S08 advances the pack's future-board and coordination
  foundation objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for task graph validation, dependency resolution, board projection, source-control refs, hosted-runtime refs, message threads, and advisory lease handling. | must-have | no | `pnpm --dir shipyard test -- tests/*task*.test.ts tests/*coordination*.test.ts tests/ui-runtime.test.ts` |
| T002 | Implement task graph and board projection contracts plus durable storage. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add coordination-thread and lease contracts with explicit audit semantics and attach source-control plus hosted-runtime freshness metadata to nodes. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/*coordination*.test.ts tests/*task*.test.ts` |
| T004 | Publish non-visual board projection updates that include branch, PR, degraded-source, and hosted-runtime state, then document the future UI-consumer boundary. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [x] `projects backlog artifacts into a story and task graph`
  - [x] `detects blocked tasks from dependency edges`
  - [x] `computes non-visual board columns deterministically`
- T002 tests:
  - [x] `persists task graph state across restart`
- T003 tests:
  - [x] `records advisory file lease acquisition renewal and release`
  - [x] `threads coordination messages with acknowledgement state`
  - [x] `surfaces source-control and hosted-runtime freshness on nodes`
- T004 tests:
  - [x] `publishes board projection snapshots without a rendered board ui`
  - [x] `includes branch pr and degraded-source metadata in board cards`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Completion Notes

- `T001-T004` landed in the new `shipyard/src/tasks/**` and
  `shipyard/src/coordination/**` runtime lanes, with additive workbench wiring
  in `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/workbench-state.ts`, and
  `shipyard/src/ui/server.ts`.
- The story deliberately does not ship the kanban UI itself. The forward
  boundary is the persisted `BoardProjection` plus the browser-visible
  `tasks:state` message.
