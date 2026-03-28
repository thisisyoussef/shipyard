# Task Breakdown

## Story
- Story ID: P11-S03
- Story Title: Runtime Skill Registry, Agent Profiles, and Role Loading

## Execution Notes
- Keep tools and skills distinct.
- Start with a narrow, high-value initial skill set instead of trying to ship
  every possible runtime skill at once.
- Make profile identity visible in traces and phase reporting from day one.

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
- Why this story set is cohesive: later phases need explicit conventions and
  role identity before they can safely specialize.
- Coverage check: P11-S03 advances the pack's role-aware runtime objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for skill discovery, manifest validation, load/unload behavior, and profile resolution. | must-have | no | `pnpm --dir shipyard test -- tests/*skill*.test.ts tests/model-routing.test.ts` |
| T002 | Implement runtime skill manifests, discovery, and loaded-skill prompt assembly. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add agent profile contracts, phase default skills, and route-aware profile resolution. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/model-routing.test.ts tests/*skill*.test.ts tests/turn-runtime.test.ts` |
| T004 | Surface loaded skills and active profiles in docs, traces, and status projections. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `discovers runtime skills from configured directories`
  - [ ] `rejects invalid manifests and duplicate skill names`
  - [ ] `loads and unloads skills without corrupting phase state`
- T002 tests:
  - [ ] `builds one ordered prompt block from loaded skills`
- T003 tests:
  - [ ] `resolves phase default skills and active role profile`
  - [ ] `keeps provider routing declarative and profile-aware`
- T004 tests:
  - [ ] `publishes loaded skills and profile id to browser state`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
