# Technical Plan

## Metadata
- Story ID: P11-S05
- Story Title: Three-Role TDD Runtime and Reviewable Handoff Contracts
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - new TDD helpers under `shipyard/src/tdd/`
  - `shipyard/src/agents/`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/phases/phase.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/ui/contracts.ts`
- Public interfaces/contracts:
  - `TddLaneState`
  - `TddStage`
  - `TddHandoffArtifact`
  - `TddEscalationArtifact`
  - `TddQualityReportArtifact`
- Data flow summary: an approved spec starts a TDD lane, the test-author stage
  emits test and metadata artifacts, RED must be observed, the implementer
  stage writes code and emits stage results, optional property or mutation hooks
  run when configured, and the reviewer stage emits a quality artifact before
  the task is considered implementation-complete.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: approved PM artifacts and runtime profiles need to
  exist before TDD stages can attach to them.
- Gaps/overlap check: this story defines one implementation lane only. It does
  not schedule multiple stories in parallel yet.
- Whole-pack success signal: implementation work has durable stage boundaries
  and review evidence that later coordinators can reason about.

## Architecture Decisions
- Decision: model TDD as a dedicated lane with explicit stage artifacts rather
  than trying to infer stage boundaries from ordinary turns.
- Alternatives considered:
  - keep the three-agent flow as helper-harness guidance only
  - collapse tests, implementation, and review into one planner-backed agent
- Rationale: the first option is too easy to drift from, and the second loses
  exactly the bounded role separation that makes the workflow valuable.

## Data Model / API Contracts
- Request shape:
  - start TDD lane from approved story or spec artifact
  - focused validation command and optional property/mutation configuration
- Response shape:
  - stage handoff artifacts
  - RED/GREEN outcomes
  - quality report and escalation entries
- Storage/index changes:
  - TDD artifacts under `.shipyard/tdd/` or in the general artifact registry
  - current lane state attached to runtime thread or pipeline state

## Dependency Plan
- Existing dependencies used: artifact registry, pipeline runner, model
  profiles, current verification and run-command infrastructure.
- New dependencies proposed (if any): optional property-test and mutation-test
  adapters only.
- Risk and mitigation:
  - Risk: the implementer stage still finds a way to weaken tests.
  - Mitigation: treat test artifacts as immutable inputs and record objections in
    structured escalations instead of allowing edits.

## Test Strategy
- Unit tests:
  - TDD stage transitions
  - handoff validation
  - retry-limit and escalation behavior
- Integration tests:
  - RED guard before implementation
  - implementer cannot modify test-author outputs
  - reviewer emits quality artifact after green
- E2E or smoke tests:
  - pipeline from approved spec into TDD lane completion
- Edge-case coverage mapping:
  - already-green contract
  - missing test tooling
  - property-test skip
  - mutation adapter unavailable

## Rollout and Risk Mitigation
- Rollback strategy: retain direct implementation turns for stories that do not
  opt into the TDD lane yet.
- Feature flags/toggles: enable the lane first for explicit spec-driven stories
  before expanding it.
- Observability checks: log stage transitions, retries, skips, escalations,
  focused commands, and quality findings.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
