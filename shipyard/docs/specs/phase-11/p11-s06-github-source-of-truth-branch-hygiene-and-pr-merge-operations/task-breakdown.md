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
  - [x] `prefers a hosted-safe auth adapter when local gh is unavailable`
  - [x] `falls back to explicit degraded local mode when github auth is absent`
  - [x] `marks later conflicting work stale after first merge wins`
- T002 tests:
  - [x] `persists repo binding and degraded-source state across restart`
- T003 tests:
  - [x] `routes merge work through a dedicated pr-ops role`
  - [x] `creates a conflict-resolution ticket instead of silently force merging`
- T004 tests:
  - [x] `publishes source-control metadata for downstream board or coordinator consumers`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Implementation Evidence

| Task ID | Implementation Evidence |
|---|---|
| T001 | `shipyard/tests/source-control-runtime.test.ts` adds failing-first coverage for auth precedence, degraded fallback, stale-branch handling, `pr-ops` ownership, conflict tickets, and workbench projection. |
| T002 | `shipyard/src/source-control/contracts.ts`, `shipyard/src/source-control/store.ts`, and `shipyard/src/source-control/runtime.ts` introduce the durable source-control vocabulary, target-local persistence, repo binding, degraded mode, and restart-safe sync helpers. |
| T003 | `shipyard/src/agents/profiles.ts` adds the dedicated `pr-ops` role, while `shipyard/src/source-control/runtime.ts` routes PR creation, merge, and blocked stale-merge recovery through that owner. |
| T004 | `shipyard/src/tools/source-control.ts`, `shipyard/src/tools/index.ts`, `shipyard/src/phases/code/index.ts`, `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/workbench-state.ts`, `shipyard/src/ui/server.ts`, and `shipyard/src/tools/target-manager/create-target.ts` publish and project source-control state for downstream runtime consumers. |

## Deferred / Follow-On Work

- No story-local deferrals remain. Hosted workspace boot and remote GitHub
  adapter flows are intentionally deferred to `P11-S07`, which consumes the
  normalized source-control contract landed here.
