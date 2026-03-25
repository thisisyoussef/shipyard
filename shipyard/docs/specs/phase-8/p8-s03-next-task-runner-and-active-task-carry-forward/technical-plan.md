# Technical Plan

## Metadata
- Story ID: P8-S03
- Story Title: Next-Task Runner and Active Task Carry-Forward
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - plan-store helpers from `P8-S02`
  - CLI/UI instruction routing for `next` / `continue`
  - `shipyard/src/engine/state.ts` and/or `shipyard/src/context/envelope.ts` for active-task carry-forward
  - task execution helpers that translate a task entry into a normal Shipyard instruction turn
  - tests such as `shipyard/tests/task-runner.test.ts`
- Public interfaces/contracts:
  - active plan selection/load helper
  - task execution/resume helper
  - active-task context/checklist field persisted in session state or equivalent runtime state
- Data flow summary: the operator issues `next` or `continue`, the runtime resolves the active plan and task, loads spec refs if needed, marks the task `in_progress`, stores compact active-task context, runs the normal execution path, and then records the resulting status back into the plan artifact.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - persisted task plans
  - resumable operator execution
  - active-task coherence across turns
  - greenfield bootstrap reuse
- Story ordering rationale: this story depends on persisted plans from `P8-S02` and is the execution half of the operator workflow.
- Gaps/overlap check: this story absorbs the useful part of the consultant’s “session-summary plan string” idea, but moves it into dedicated active-task context instead of overloading `rollingSummary`.
- Whole-pack success signal: an operator can plan once, then progress one task at a time without re-explaining the task or losing the current checklist.

## Architecture Decisions
- Decision: persist active-task context as a dedicated field or artifact, not as an ad hoc line in the rolling summary.
- Alternatives considered:
  - append a prose checklist to `rollingSummary`
  - keep all task state only in memory during a single run
- Rationale: rolling summaries should remain compact. Active-task context needs deterministic structure and durable resumption semantics.

## Data Model / API Contracts
- Request shape:
  - command alias (`next` / `continue`)
  - active plan id or resolvable default plan
- Response shape:
  - selected task id
  - status transition summary
  - execution result summary
- Storage/index changes:
  - extend the persisted plan artifact with task run metadata
  - add active-task context to session persistence or a small adjacent runtime artifact

## Dependency Plan
- Existing dependencies used: persisted plans from `P8-S02`, context envelope/session state, trace logging, standard execution path.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: stale in-progress task state gets stranded after crashes.
  - Mitigation: make `continue` explicit and allow clear fallback to the first pending task when no active task exists.

## Test Strategy
- Unit tests:
  - task selection helpers
  - active-task context persistence
  - status transitions
- Integration tests:
  - `next` executes the first pending task
  - `continue` resumes an in-progress task
  - failure path marks the task `failed`
- E2E or smoke tests:
  - deferred until a later browser/UI story wants visible plan-state surfaces
- Edge-case coverage mapping:
  - no active plan
  - all tasks done
  - missing spec ref
  - crashed/incomplete prior task

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - later UI surfaces should display compact task status, not raw plan JSON
- Component structure:
  - deferred in this story
- Accessibility implementation plan:
  - not applicable in this routing/state story
- Visual regression capture plan:
  - not applicable in this routing/state story

## Rollout and Risk Mitigation
- Rollback strategy: `next` / `continue` remain explicit commands and can be disabled without affecting normal instructions.
- Feature flags/toggles: explicit aliases act as the natural gate.
- Observability checks: traces/local logs should capture plan id, task id, and status changes.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
