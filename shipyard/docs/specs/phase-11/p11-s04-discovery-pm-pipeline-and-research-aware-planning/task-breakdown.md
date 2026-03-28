# Task Breakdown

## Story
- Story ID: P11-S04
- Story Title: Discovery, PM Pipeline, and Research-Aware Planning

## Execution Notes
- Keep research read-only and evidence-oriented.
- Make backlog artifacts deterministic and queryable.
- Defer brand and visual design phases to later work so this pack stays
  runtime-focused.

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
- Why this story set is cohesive: PM output becomes the input contract for TDD,
  task graphs, and future parallel execution.
- Coverage check: P11-S04 advances the pack's front-half planning objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for discovery artifact creation, PM artifact lineage, backlog ordering, and research-source filtering. | must-have | no | `pnpm --dir shipyard test -- tests/*discovery*.test.ts tests/*pm*.test.ts tests/*research*.test.ts` |
| T002 | Implement discovery, PM, backlog, and research artifact contracts plus phase modules. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add read-only official-doc lookup and source-aware research briefs for planning flows. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/*research*.test.ts tests/*pm*.test.ts` |
| T004 | Route explicit discovery/PM pipelines through approvals and artifact queries, then document how later phases consume the backlog. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [x] `creates a discovery brief from a raw project idea`
  - [x] `turns approved discovery into epic story and spec artifacts`
  - [x] `orders backlog entries deterministically`
- T002 tests:
  - [x] `preserves artifact lineage from discovery to backlog`
- T003 tests:
  - [x] `prefers official documentation sources for research-backed planning`
  - [x] `falls back clearly when external research is unavailable`
- T004 tests:
  - [x] `resumes PM after approval without rebuilding context from chat`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Tests added and passing for each implemented task
- [x] Deferred tasks documented with rationale

## Implementation Evidence

| Task ID | Evidence |
|---|---|
| T001 | `shipyard/tests/discovery-pm-pipeline.test.ts` adds failing-then-passing coverage for discovery brief creation, PM artifact generation, deterministic backlog ordering, artifact lineage, skip-discovery behavior, and resume after approval. |
| T002 | `shipyard/src/artifacts/types.ts`, `shipyard/src/phases/discovery/index.ts`, `shipyard/src/phases/pm/index.ts`, and `shipyard/src/pipeline/planning-artifacts.ts` add the discovery/research/PM artifact contracts, phase factories, normalized IDs, and deterministic backlog builder. |
| T003 | `shipyard/src/research/lookup.ts`, `shipyard/src/tools/lookup-official-docs.ts`, `shipyard/src/tools/index.ts`, and `shipyard/tests/research-lane.test.ts` implement official-doc-first research lookup with explicit repo-local fallback and source-attributed takeaways. |
| T004 | `shipyard/src/pipeline/defaults.ts`, `shipyard/src/pipeline/turn.ts`, and `shipyard/src/engine/graph.ts` route the default discovery/PM pipeline through explicit phase dependencies, alternate/optional artifact resolution, approval-gated resume, and runtime-injected research lookup. |

## Deferred Tasks

- Brand, visual design, and kanban-board UI remain intentionally deferred to
  later stories so P11-S04 stays runtime-only and keeps the PM/research lane
  narrow.
