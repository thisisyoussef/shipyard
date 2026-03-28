# Task Breakdown

## Story
- Story ID: P11-S09
- Story Title: Master Coordinator and Parallel Story Orchestration

## Execution Notes
- Treat this as an orchestration-capstone story, not as a place to re-decide
  lower-level contracts.
- Keep human interrupt and approval handling central.
- Treat first-merge-wins as explicit runtime policy, not an implementation
  detail hidden inside git commands.
- Make status compact and event-driven so long runs stay durable.

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
- Why this story set is cohesive: this capstone story only works once the pack's
  lower-level persistence, approval, role, TDD, source-control, hosted-runtime,
  and graph contracts exist.
- Coverage check: P11-S09 advances the pack's multi-story orchestration
  objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for scheduler readiness, dependency blocking, worker assignment, hosted-capacity checks, first-merge-wins staleness detection, interrupt handling, and restart-safe orchestration. | must-have | no | `pnpm --dir shipyard test -- tests/*ultimate*.test.ts tests/*orchestration*.test.ts tests/ui-runtime.test.ts` |
| T002 | Introduce durable coordinator-run, worker-assignment, and conflict-recovery contracts linked to task graph, source-control state, hosted-runtime state, and phase lanes. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Evolve `ultimate mode` into a scheduler-backed supervisor that can orchestrate multiple ready work items, dispatch GitHub ops or merge work, and route stale conflicting branches into recovery. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/*ultimate*.test.ts tests/*orchestration*.test.ts tests/turn-runtime.test.ts` |
| T004 | Publish compact coordinator status projections and docs for the later kanban-ui pack. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `schedules only dependency-ready tasks`
  - [ ] `halts or reroutes work on approval wait states`
  - [ ] `marks later conflicting branches stale after first merge wins`
  - [ ] `accepts human reprioritization and interrupt commands`
- T002 tests:
  - [ ] `persists coordinator state worker assignments and recovery queues across restart`
- T003 tests:
  - [ ] `orchestrates multiple tasks without collapsing into one transcript`
  - [ ] `keeps failed workers isolated from still-ready work`
  - [ ] `routes merge or rebase recovery through a dedicated role`
- T004 tests:
  - [ ] `publishes coordinator status projections for future board consumption`
  - [ ] `includes source-control blockers and hosted-capacity state`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
