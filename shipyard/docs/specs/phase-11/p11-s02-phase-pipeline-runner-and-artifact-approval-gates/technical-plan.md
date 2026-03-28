# Technical Plan

## Metadata
- Story ID: P11-S02
- Story Title: Phase Pipeline Runner and Artifact Approval Gates
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/phases/phase.ts`
  - `shipyard/src/engine/loop.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/plans/task-runner.ts`
  - new pipeline helpers under `shipyard/src/pipeline/`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
- Public interfaces/contracts:
  - `PhasePipeline`
  - `PhaseRunState`
  - `ApprovalGateMode`
  - `ApprovalDecision`
  - `PipelineResumePointer`
- Data flow summary: pipeline mode creates a durable phase run, executes the
  next phase, saves produced artifacts, enters an approval-wait state when
  required, accepts operator decisions, and then resumes the next phase with
  approved upstream artifacts injected as input.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: the registry from P11-S01 must exist first, and the
  pipeline runner must exist before PM or TDD phases become runtime-native.
- Gaps/overlap check: this story defines pipeline mechanics, not the content or
  prompt rules of later phases.
- Whole-pack success signal: downstream stories can rely on approved upstream
  artifacts and explicit pause/resume semantics.

## Architecture Decisions
- Decision: make pipeline state explicit and durable instead of hiding it in
  session summaries or ad hoc command interpretation.
- Alternatives considered:
  - keep phase sequencing as an informal operator workflow
  - overload the plan queue to behave like a general multi-phase runner
- Rationale: the first option is too fragile, and the second collapses planning
  semantics and artifact approvals into one overloaded system.

## Data Model / API Contracts
- Request shape:
  - pipeline start with ordered phases and initial brief
  - approval decision with approve, reject, or edit payload
- Response shape:
  - active phase summary
  - waiting-for-approval state
  - resume pointer and latest artifact references
- Storage/index changes:
  - pipeline run state under `.shipyard/pipelines/`
  - approval decision records attached to produced artifacts

## Dependency Plan
- Existing dependencies used: session persistence, runtime thread state,
  artifacts registry, UI event stream, turn execution contract.
- New dependencies proposed (if any): none initially.
- Risk and mitigation:
  - Risk: pipeline state drifts from artifact state after rejection or edit.
  - Mitigation: keep artifact version references in the durable pipeline state
    and make downstream continuation depend on approved versions only.

## Test Strategy
- Unit tests:
  - approval decision validation
  - phase transition logic
  - resume pointer updates
- Integration tests:
  - execute phase -> await approval -> approve -> continue
  - execute phase -> edit artifact -> continue with new version
  - reject and return to previous phase
- E2E or smoke tests:
  - browser socket flow for waiting approval and later resume
- Edge-case coverage mapping:
  - advisory gate auto-continue
  - disabled gate skip
  - restart during waiting state
  - malformed edit payload

## Rollout and Risk Mitigation
- Rollback strategy: keep direct instruction and current plan mode unchanged
  while pipeline mode is introduced behind an explicit entry path.
- Feature flags/toggles: enable pipeline execution before exposing broader UI
  affordances if needed.
- Observability checks: log phase transitions, wait states, approvals, edits,
  rejections, and resumes.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
