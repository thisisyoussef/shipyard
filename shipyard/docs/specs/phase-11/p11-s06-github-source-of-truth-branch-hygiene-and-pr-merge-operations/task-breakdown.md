# Task Breakdown

## Story
- Story ID: P11-S06
- Story Title: GitHub Source of Truth, Branch Hygiene, and PR Merge Operations

## Execution Notes
- Treat local `gh` auth as one adapter, not the whole source-control model.
- Keep degraded-local fallback explicit and inspectable so the project remains
  manageable when GitHub binding is unavailable.
- Do not blur merge execution into the implementer lane; the PR-ops role should
  own branch hygiene and merge semantics.

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
- Why this story set is cohesive: the pack needs one canonical source-control
  contract before hosted execution and multi-story coordination can be safe.
- Coverage check: P11-S06 advances the pack's GitHub-first execution and merge
  hygiene objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for auth-capability resolution, repo binding, degraded-local fallback, branch naming, PR lifecycle, and first-merge-wins stale-branch handling. | must-have | no | `pnpm --dir shipyard test -- tests/*source-control*.test.ts tests/*github*.test.ts tests/turn-runtime.test.ts` |
| T002 | Introduce source-control capability, canonical repo binding, and durable degraded-local fallback contracts. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add a dedicated GitHub-ops or PR-merge role that manages PR creation, merge, cleanup, and conflict-recovery ticket generation. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/*source-control*.test.ts tests/*github*.test.ts tests/*orchestration*.test.ts` |
| T004 | Publish source-control auth mode, branch, PR, and degraded-status metadata for later hosted and coordinator consumers. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `prefers a hosted-safe auth adapter when local gh is unavailable`
  - [ ] `falls back to explicit degraded local mode when github auth is absent`
  - [ ] `marks later conflicting work stale after first merge wins`
- T002 tests:
  - [ ] `persists repo binding and degraded-source state across restart`
- T003 tests:
  - [ ] `routes merge work through a dedicated pr-ops role`
  - [ ] `creates a conflict-resolution ticket instead of silently force merging`
- T004 tests:
  - [ ] `publishes source-control metadata for downstream board or coordinator consumers`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
