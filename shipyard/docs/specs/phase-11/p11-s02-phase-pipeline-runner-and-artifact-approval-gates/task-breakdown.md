# Task Breakdown

## Story
- Story ID: P11-S02
- Story Title: Phase Pipeline Runner and Artifact Approval Gates

## Execution Notes
- Keep pipeline mode explicit and additive; do not silently route every turn
  through it.
- Use approved artifact references as the only downstream input source.
- Defer visual gate polish to the separate UI pack.

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
- Why this story set is cohesive: approval-aware phase execution is the control
  plane that later PM, TDD, and orchestration lanes need.
- Coverage check: P11-S02 advances the pack's durable workflow objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for phase transitions, approval wait states, edit/reject flows, and resume behavior. | must-have | no | `pnpm --dir shipyard test -- tests/*pipeline*.test.ts tests/ui-runtime.test.ts` |
| T002 | Extend phase contracts and implement durable pipeline state plus approval decision schemas. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Route explicit pipeline commands through the runner and preserve direct-turn behavior for non-pipeline instructions. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/turn-runtime.test.ts tests/plan-mode.test.ts tests/*pipeline*.test.ts` |
| T004 | Publish approval-wait projections and docs for later UI consumption without shipping board or gate visuals yet. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `pauses on required approval after phase artifact creation`
  - [ ] `auto-continues advisory gates unless the operator intervenes`
  - [ ] `returns rejected artifacts to the producing phase`
- T002 tests:
  - [ ] `stores edited approvals as new artifact versions`
- T003 tests:
  - [ ] `keeps normal single-turn instructions off the pipeline path`
  - [ ] `resumes a pipeline after restart from the correct phase`
- T004 tests:
  - [ ] `publishes approval-wait status through ui contracts`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
