# Task Breakdown

## Story
- Story ID: P11-S07
- Story Title: Railway Hosted Runtime and Remote Workspace Integration

## Execution Notes
- Build on the existing Railway-hosted Shipyard contract instead of inventing a
  second hosted runtime.
- Keep hosted GitHub auth adapter selection inside the normalized source-control
  capability layer from `P11-S06`.
- Preserve an explicit degraded hosted mode so the project stays manageable when
  GitHub binding or auth is unavailable.

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
- Why this story set is cohesive: the pack needs a hosted runtime path that can
  consume the same source-control and artifact contracts as local execution.
- Coverage check: P11-S07 advances the pack's Railway-hosted availability and
  remote workspace objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for hosted runtime profile resolution, workspace restore, hosted auth-adapter selection, degraded hosted fallback, and preview or deploy status separation. | must-have | no | `pnpm --dir shipyard test -- tests/*hosting*.test.ts tests/ui-runtime.test.ts tests/*source-control*.test.ts` |
| T002 | Introduce hosted runtime profile, remote workspace binding, and hosted source-control adapter contracts that build on the Phase 9 Railway baseline. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement Railway-hosted workspace restore, GitHub-backed project sync, and explicit degraded hosted mode when GitHub auth or binding is unavailable. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/*hosting*.test.ts tests/ui-runtime.test.ts tests/*source-control*.test.ts` |
| T004 | Publish hosted availability metadata that clearly separates Shipyard service, preview, and target deployment surfaces for later graph or coordinator consumers. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `boots a railway-hosted profile without assuming local gh auth`
  - [ ] `falls back to explicit degraded hosted mode when github auth is missing`
  - [ ] `separates shipyard service preview and public deployment urls`
- T002 tests:
  - [ ] `persists hosted runtime profile and workspace binding across restart`
- T003 tests:
  - [ ] `restores a github-bound project inside the persistent railway workspace`
  - [ ] `keeps non-merge phases usable in degraded hosted mode`
- T004 tests:
  - [ ] `publishes hosted availability metadata for downstream board or coordinator consumers`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
