# Technical Plan

## Metadata
- Story ID: P11-S04
- Story Title: Discovery, PM Pipeline, and Research-Aware Planning
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/phases/discovery/index.ts`
  - `shipyard/src/phases/pm/index.ts`
  - `shipyard/src/research/lookup.ts`
  - `shipyard/src/tools/lookup-official-docs.ts`
  - `shipyard/src/pipeline/planning-artifacts.ts`
  - `shipyard/src/pipeline/defaults.ts`
  - `shipyard/src/pipeline/turn.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/tools/index.ts`
- Public interfaces/contracts:
  - `DiscoveryBrief`
  - `EpicArtifact`
  - `UserStoryArtifact`
  - `TechnicalSpecArtifact`
  - `BacklogArtifact`
  - `ResearchBrief`
- Data flow summary: pipeline mode starts with discovery, optionally runs
  research lookups, produces approved discovery artifacts, then PM turns those
  into epics, stories, specs, and ordered backlog entries that later phases can
  query.

## Implemented Shape
- Discovery and research are separate pipeline phases so discovery keeps the
  required approval gate while research stays deterministic and read-only.
- PM JSON artifacts are normalized before persistence so downstream phases see
  stable IDs, summaries, priorities, and story/spec relationships.
- Backlog generation is deterministic and derived from approved PM artifacts
  rather than a freeform model response.
- Research lookup is injectable through runtime dependencies, which keeps the
  production adapter swappable and the finish-check deterministic.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: discovery and PM phases depend on artifacts,
  approval gates, and runtime skills or profiles from earlier stories.
- Gaps/overlap check: this story covers discovery, PM, and research planning
  only. TDD execution remains for P11-S05.
- Whole-pack success signal: a later implementation phase can start from
  approved specs and backlog entries instead of reinterpreting the user brief.

## Architecture Decisions
- Decision: add a dedicated read-only research lane instead of letting planning
  prompts browse or speculate informally.
- Alternatives considered:
  - keep research as a manual human step outside Shipyard
  - let the PM phase freely browse without artifacted results
- Rationale: explicit research artifacts make planning auditable and easier to
  reuse later.

## Data Model / API Contracts
- Request shape:
  - discovery start with raw brief
  - PM generation from approved discovery
  - research lookup scope with source preferences
- Response shape:
  - typed discovery, PM, backlog, and research artifacts
  - ordered backlog entries with dependencies and status
- Storage/index changes:
  - artifact types for discovery, epic, story, spec, backlog, and research
  - bounded research brief content stored through the artifact registry

## Dependency Plan
- Existing dependencies used: artifact registry, pipeline runner, phase
  profiles, model routing, current planning state.
- New dependencies proposed (if any): a bounded read-only research adapter for
  official-doc lookup via runtime dependency injection and the
  `lookup_official_docs` tool.
- Risk and mitigation:
  - Risk: research output becomes noisy or over-long.
  - Mitigation: persist a compact research brief with source links and
  distilled takeaways instead of raw dumps.

## Test Strategy
- Unit tests:
  - artifact validation for discovery, PM, backlog, and research outputs
  - source filtering and ranking
  - backlog ordering behavior
- Integration tests:
  - discovery -> approval -> PM -> backlog
  - research-aware planning with official-doc preference
- E2E or smoke tests:
  - pipeline resume from approved discovery into PM
- Edge-case coverage mapping:
  - skip discovery
  - reenter PM after rejection
  - research source unavailable
  - malformed story dependency metadata

## Rollout and Risk Mitigation
- Rollback strategy: retain the current `plan:` path for lightweight planning
  while richer discovery and PM phases are proven.
- Feature flags/toggles: enable research-aware PM only for explicit pipelines at
  first.
- Observability checks: log source attribution, PM artifact lineage, backlog
  ordering, and skip or rewind actions.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
