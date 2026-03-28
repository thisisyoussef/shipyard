# Technical Plan

## Metadata
- Story ID: P11-S07
- Story Title: Master Coordinator and Parallel Story Orchestration
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/ultimate-mode.ts`
  - new coordinator helpers under `shipyard/src/orchestration/`
  - `shipyard/src/tasks/`
  - `shipyard/src/coordination/`
  - `shipyard/src/phases/`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
- Public interfaces/contracts:
  - `CoordinatorRun`
  - `CoordinatorWorkerAssignment`
  - `CoordinatorDecision`
  - `CoordinatorStatusProjection`
  - `HumanIntervention`
- Data flow summary: the master coordinator watches the task graph, chooses
  ready tasks, assigns them to role-aware workers, waits on approvals or lease
  conflicts when necessary, accepts human interventions, and projects current
  runtime status for later UI consumption.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: this story sits last because it depends on the full
  artifact, approval, profile, TDD, and task-graph stack.
- Gaps/overlap check: this story focuses on orchestration and supervision only.
  The visual board remains a later UI concern.
- Whole-pack success signal: Shipyard can route several approved work items
  through specialized lanes while preserving operator control.

## Architecture Decisions
- Decision: evolve `ultimate mode` into a scheduler-backed coordinator instead
  of introducing a separate parallel-runtime concept.
- Alternatives considered:
  - keep `ultimate mode` as a single-thread simulator loop forever
  - create a completely separate orchestration engine beside the existing one
- Rationale: the first option leaves too much product value on the table, and
  the second risks duplicating runtime semantics and status surfaces.

## Data Model / API Contracts
- Request shape:
  - start coordinator run over selected backlog or ready-task scope
  - apply human interrupts such as stop, reprioritize, inject feedback, approve,
    or reroute
- Response shape:
  - active worker assignments
  - blocked or waiting reasons
  - next-ready task hints
  - coordinator summary projection
- Storage/index changes:
  - coordinator runtime state under `.shipyard/orchestration/`
  - per-worker assignment state linked to task-graph nodes and runtime threads

## Dependency Plan
- Existing dependencies used: artifact registry, pipeline runner, skill and
  profile registry, PM backlog, TDD lane, task graph, current `ultimate mode`
  loop and session persistence.
- New dependencies proposed (if any): none initially beyond optional isolated
  worker adapters already implied by upstream runtime work.
- Risk and mitigation:
  - Risk: coordinator state balloons again and becomes another oversized loop.
  - Mitigation: make coordinator state evented, compact, and shardable by story
    or worker assignment rather than one monolithic transcript.

## Test Strategy
- Unit tests:
  - scheduler readiness and dependency checks
  - worker assignment selection
  - human intervention handling
- Integration tests:
  - schedule two ready stories with different role needs
  - block work on approval or lease conflict
  - recover orchestration after restart
- E2E or smoke tests:
  - master coordinator drives several task transitions while status projections
    remain coherent
- Edge-case coverage mapping:
  - no ready tasks
  - stale worker assignment
  - failed worker while others continue
  - human reprioritization mid-run

## Rollout and Risk Mitigation
- Rollback strategy: keep the current single-thread `ultimate` flow as a narrow
  fallback while the new coordinator runtime is introduced.
- Feature flags/toggles: enable multi-story orchestration only after lower-level
  task graph and lease contracts are proven.
- Observability checks: log scheduling decisions, worker churn, blocked reasons,
  intervention events, and orchestration resume points.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
