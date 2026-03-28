# Technical Plan

## Metadata
- Story ID: P11-S08
- Story Title: Task Graph, Dependency Metadata, and Coordination Bus Contracts
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - new task-graph helpers under `shipyard/src/tasks/`
  - new coordination helpers under `shipyard/src/coordination/`
  - new source-control projection helpers under `shipyard/src/source-control/`
  - `shipyard/src/plans/store.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
- Public interfaces/contracts:
  - `StoryNode`
  - `TaskNode`
  - `TaskDependency`
  - `TaskAssignment`
  - `SourceControlRef`
  - `HostedWorkspaceRef`
  - `FileLease`
  - `CoordinationThread`
  - `BoardCardProjection`
  - `BoardProjection`
- Data flow summary: PM, TDD, source-control, and hosted-runtime artifacts feed
  a task graph; assignments and leases attach to nodes; coordination messages
  capture agent-to-agent intent; and the runtime produces a non-visual board
  projection for status consumers.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - GitHub-first and Railway-hosted runtime execution
  - coordination and multi-story execution
- Story ordering rationale: the graph depends on approved PM and TDD artifacts
  plus source-control and hosted-runtime metadata, but must land before the
  master coordinator can schedule parallel work.
- Gaps/overlap check: this story defines contracts and projection only. It does
  not render the board or schedule parallel workers yet.
- Whole-pack success signal: later UI and orchestration work can share one task
  graph and board projection instead of inventing separate state models.

## Architecture Decisions
- Decision: make coordination explicit through typed messages, leases,
  source-control refs, and hosted-runtime refs rather than hiding it inside
  transcript text.
- Alternatives considered:
  - use only the current plan queue with a few extra statuses
  - adopt an external mail or task system as the first-class state store
- Rationale: the current queue is too linear, and an external system is better
  treated as an optional adapter boundary after local contracts are proven.

## Data Model / API Contracts
- Request shape:
  - create or update story or task nodes
  - assign nodes to roles
  - attach or refresh source-control refs and hosted workspace refs
  - claim, renew, or release advisory leases
  - append or acknowledge coordination messages
- Response shape:
  - graph summary
  - board projection by column
  - lease, message thread, source-control, and hosted-state summaries
- Storage/index changes:
  - graph state under `.shipyard/tasks/`
  - source-control refs or indexes under `.shipyard/source-control/`
  - hosted-runtime refs under `.shipyard/hosting/`
  - coordination logs or threads under `.shipyard/coordination/`

## Dependency Plan
- Existing dependencies used: artifact registry, PM backlog artifacts, TDD lane
  state, GitHub source bindings, hosted Railway runtime state, current UI
  event-stream projection.
- New dependencies proposed (if any): none initially; keep external
  coordination as an adapter interface only.
- Risk and mitigation:
  - Risk: graph and artifact state drift apart.
  - Mitigation: node metadata should point to artifact IDs and latest approved
    versions instead of copying artifact content.
  - Risk: branch or hosted-runtime state becomes stale and the board lies.
  - Mitigation: store references plus freshness timestamps and surface stale
    states explicitly instead of pretending they are current.

## Test Strategy
- Unit tests:
  - dependency validation
  - board projection calculation
  - lease expiration and renewal
  - source-control and hosted-state projection
  - message acknowledgement rules
- Integration tests:
  - create story/task graph from backlog artifacts
  - project GitHub branch and PR state plus degraded local mode
  - project hosted Railway workspace status
  - assign tasks and acquire leases
  - publish board projection updates
- E2E or smoke tests:
  - browser contract receives board projection without requiring a visual board
- Edge-case coverage mapping:
  - circular dependency
  - stale lease holder
  - merged or deleted branch ref
  - hosted workspace offline
  - orphaned task
  - duplicate assignment

## Rollout and Risk Mitigation
- Rollback strategy: keep current plan queue and project board behavior intact
  while the new task graph is introduced additively.
- Feature flags/toggles: enable graph projection before enabling coordinator use
  of leases or message threads.
- Observability checks: log node state changes, dependency resolution, lease
  churn, coordination-thread events, source-control updates, and hosted-runtime
  freshness transitions.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
