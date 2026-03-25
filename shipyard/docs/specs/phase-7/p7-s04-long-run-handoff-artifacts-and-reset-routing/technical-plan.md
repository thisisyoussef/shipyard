# Technical Plan

## Metadata
- Story ID: P7-S04
- Story Title: Long-Run Handoff Artifacts and Reset Routing
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/types.ts`
  - new handoff persistence helpers under `shipyard/src/engine/` or `shipyard/src/artifacts/`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - handoff-focused tests such as `shipyard/tests/handoff-artifacts.test.ts`
- Public interfaces/contracts:
  - `ExecutionHandoff` or equivalent typed artifact
  - handoff save/load helpers
  - reset-routing helper for long-run thresholds
- Data flow summary: when a run crosses defined thresholds or needs an explicit reset, the runtime emits a structured handoff artifact under `.shipyard/`, logs the reset reason, and a future turn reloads that artifact as structured context before resuming work.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - browser-visible QA for previewable targets
  - durable handoff for long-running work
- Story ordering rationale: this story lands after the planning contract exists so persisted handoff artifacts can carry richer state than the current rolling summary.
- Gaps/overlap check: this story owns artifact persistence and reset policy only; adaptive routing across planner and evaluator remains in `P7-S05`.
- Whole-pack success signal: long-running work can resume from durable artifacts rather than only abbreviated prompt summaries.

## Architecture Decisions
- Decision: keep handoff artifacts target-local under `.shipyard/` and treat them as runtime outputs, not hand-authored docs.
- Alternatives considered:
  - keep only the existing rolling summary
  - dump arbitrary free-form notes into session JSON
- Rationale: a typed handoff artifact is easier to validate, inspect, and reuse in reset routing than either a lossy summary or an unstructured notes blob.

## Data Model / API Contracts
- Request shape:
  - current execution state needed to create a handoff artifact
  - reset-threshold configuration or defaults
- Response shape:
  - persisted handoff artifact path
  - loaded handoff artifact for resume
  - reset decision metadata
- Storage/index changes:
  - add a dedicated `.shipyard/artifacts/<sessionId>/` or similar runtime output directory for handoff artifacts

## Dependency Plan
- Existing dependencies used: current session model, current context envelope, current retry and recovery state, current trace stack.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: aggressive reset routing causes churn and makes short tasks slower.
  - Mitigation: gate handoff emission and reset usage behind explicit thresholds and keep the lightweight path untouched for trivial turns.

## Test Strategy
- Unit tests:
  - handoff artifact validation and parse failure handling
  - threshold helper logic
  - save/load latest artifact helpers
- Integration tests:
  - emit a handoff artifact after a simulated long or unstable run
  - resume a later run from the persisted artifact
- E2E or smoke tests:
  - deferred to `P7-S05`, where coordinator routing will use the new reset path
- Edge-case coverage mapping:
  - corrupted handoff artifact
  - no handoff artifact present
  - threshold just exceeded once
  - repeated recoveries producing a bounded reset reason

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - optional workbench exposure should consume typed handoff summaries only
- Component structure:
  - deferred until a later story chooses to surface handoff checkpoints in the browser workbench
- Accessibility implementation plan:
  - not applicable in this artifact-first story
- Visual regression capture plan:
  - not applicable in this artifact-first story

## Rollout and Risk Mitigation
- Rollback strategy: preserve the current rolling-summary-only path as the default fallback while reset routing is proven.
- Feature flags/toggles: reset routing can remain disabled or heuristic-gated until integration tuning is complete.
- Observability checks: local logs and LangSmith metadata should record reset reason, handoff artifact path, and whether a resume loaded prior state.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
