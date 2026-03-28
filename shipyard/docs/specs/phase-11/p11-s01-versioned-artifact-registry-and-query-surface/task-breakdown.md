# Task Breakdown

## Story
- Story ID: P11-S01
- Story Title: Versioned Artifact Registry and Query Surface

## Execution Notes
- Treat this as a unification story, not a greenfield rewrite.
- Preserve current handoff and plan behavior while the registry becomes the
  common artifact substrate.
- Prefer compact summaries by default and full content only on explicit load.

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
- Why this story set is cohesive: artifact discipline is the shared substrate
  that lets every later runtime lane exchange work safely.
- Coverage check: P11-S01 advances the pack's persistence and query objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for artifact metadata validation, versioning, query filters, and legacy artifact projection. | must-have | no | `pnpm --dir shipyard test -- tests/*artifact*.test.ts tests/plan-mode.test.ts tests/turn-runtime.test.ts` |
| T002 | Introduce typed artifact registry contracts, save/load helpers, and target-local storage layout. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Project existing plan and handoff outputs through the new registry while keeping current consumers working. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/plan-mode.test.ts tests/turn-runtime.test.ts` |
| T004 | Add query helpers, compact summary projection, and docs for later phase consumers. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [x] `saves and versions multiple artifacts with one logical id`
  - [x] `queries latest approved artifact by type and tag`
  - [x] `fails closed on malformed artifact metadata`
- T002 tests:
  - [x] `persists markdown and json content behind one registry contract`
- T003 tests:
  - [x] `projects legacy plan artifacts without breaking next or continue`
  - [x] `projects execution handoffs into registry summaries`
- T004 tests:
  - [x] `returns compact summaries unless full content is requested`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Implementation Evidence

| Task ID | Evidence |
|---|---|
| T001 | `shipyard/tests/artifact-registry.test.ts` adds the red/green coverage for versioning, filtered latest queries, malformed metadata isolation, and compact default query shape. |
| T002 | `shipyard/src/artifacts/types.ts`, `shipyard/src/artifacts/registry/index.ts`, and `shipyard/src/engine/state.ts` add the typed contracts, save/load helpers, and target-local registry layout. |
| T003 | `shipyard/src/artifacts/registry/index.ts` lazily projects `.shipyard/plans/*.json` and `.shipyard/artifacts/**/*.handoff.json` into registry records without changing existing plan/handoff writers or readers. |
| T004 | `shipyard/src/artifacts/README.md` and the registry query/load helpers document and enforce the compact-summary-by-default behavior for later phase consumers. |
