# Technical Plan

## Metadata
- Story ID: P11-S06
- Story Title: Task Graph, Dependency Metadata, and Coordination Bus Contracts
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - new task-graph helpers under `shipyard/src/tasks/`
  - new coordination helpers under `shipyard/src/coordination/`
  - `shipyard/src/plans/store.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
- Public interfaces/contracts:
  - `StoryNode`
  - `TaskNode`
  - `TaskDependency`
  - `TaskAssignment`
  - `FileLease`
  - `CoordinationThread`
  - `BoardProjection`
- Data flow summary: PM and TDD artifacts feed a task graph, assignments and
  leases attach to nodes, coordination messages capture agent-to-agent intent,
  and the runtime produces a non-visual board projection for status consumers.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: the graph depends on approved PM and TDD artifacts,
  but must land before the master coordinator can schedule parallel work.
- Gaps/overlap check: this story defines contracts and projection only. It does
  not render the board or schedule parallel workers yet.
- Whole-pack success signal: later UI and orchestration work can share one task
  graph and board projection instead of inventing separate state models.

## Architecture Decisions
- Decision: make coordination explicit through typed messages and leases rather
  than hiding it inside transcript text.
- Alternatives considered:
  - use only the current plan queue with a few extra statuses
  - adopt an external mail or task system as the first-class state store
- Rationale: the current queue is too linear, and an external system is better
  treated as an optional adapter boundary after local contracts are proven.

## Data Model / API Contracts
- Request shape:
  - create or update story or task nodes
  - assign nodes to roles
  - claim, renew, or release advisory leases
  - append or acknowledge coordination messages
- Response shape:
  - graph summary
  - board projection by column
  - lease and message thread state
- Storage/index changes:
  - graph state under `.shipyard/tasks/`
  - coordination logs or threads under `.shipyard/coordination/`

## Dependency Plan
- Existing dependencies used: artifact registry, PM backlog artifacts, TDD lane
  state, current UI event-stream projection.
- New dependencies proposed (if any): none initially; keep external
  coordination as an adapter interface only.
- Risk and mitigation:
  - Risk: graph and artifact state drift apart.
  - Mitigation: node metadata should point to artifact IDs and latest approved
    versions instead of copying artifact content.

## Test Strategy
- Unit tests:
  - dependency validation
  - board projection calculation
  - lease expiration and renewal
  - message acknowledgement rules
- Integration tests:
  - create story/task graph from backlog artifacts
  - assign tasks and acquire leases
  - publish board projection updates
- E2E or smoke tests:
  - browser contract receives board projection without requiring a visual board
- Edge-case coverage mapping:
  - circular dependency
  - stale lease holder
  - orphaned task
  - duplicate assignment

## Rollout and Risk Mitigation
- Rollback strategy: keep current plan queue and project board behavior intact
  while the new task graph is introduced additively.
- Feature flags/toggles: enable graph projection before enabling coordinator use
  of leases or message threads.
- Observability checks: log node state changes, dependency resolution, lease
  churn, and coordination-thread events.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
