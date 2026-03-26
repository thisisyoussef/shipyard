# Feature Spec

## Metadata
- Story ID: RHF-S05
- Story Title: Continuation-First Iteration Threshold Resume
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

The raw loop still treats the acting-iteration threshold as an exception and the graph still maps that path to `status: failed`, even though Shipyard already has a typed handoff system for resuming long work from checkpoints. That makes long greenfield tasks look broken right when the runtime should convert the turn into a continuation and keep going under a higher-level safety budget.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: convert loop-length exhaustion from a hard failure into an explicit continuation state.
- Objective 2: automatically resume from a persisted handoff when continuation is still safe.
- Objective 3: keep true runtime, provider, and tool errors distinguishable from healthy checkpointable long work.
- How this story or pack contributes to the overall objective set: This story is what turns better handoffs into better operator behavior. Without it, long builds still end as false failures.

## User Stories
- As an operator, I want Shipyard to say "this needs a continuation" instead of pretending the run failed when it merely hit the acting-loop threshold.
- As a resumed Shipyard turn, I want to continue from the persisted handoff automatically until the task is done or a higher-level safety budget is reached.

## Acceptance Criteria
- [ ] AC-1: When the raw loop reaches the acting-iteration threshold without a more specific runtime error, it returns a typed continuation condition instead of throwing a generic failure.
- [ ] AC-2: The graph maps that continuation condition to a checkpoint or handoff status rather than `failed`, and persists the relevant handoff automatically.
- [ ] AC-3: The turn executor can auto-resume from the emitted handoff until the task finishes or a configurable global wall-clock or turn budget is reached.
- [ ] AC-4: Cancellation, provider failures, tool failures, and blocked-file states still surface as their own explicit outcomes and do not get mislabeled as healthy continuation.
- [ ] AC-5: Tests cover threshold-hit continuation, resumed execution, and the stop condition when the higher-level continuation budget is exhausted.

## Edge Cases
- A task may hit the acting-iteration threshold repeatedly without real progress, so auto-resume must have its own outer budget.
- A threshold hit followed immediately by cancellation should surface cancellation, not continuation.
- The handoff may contain failed verification context that must remain visible on resume.
- UI and trace surfaces should not lose the fact that one logical turn continued across multiple raw-loop runs.

## Non-Functional Requirements
- Reliability: continuation should be deterministic and bounded.
- Performance: auto-resume must avoid redoing the same initialization work unnecessarily.
- Observability: operator-visible status and traces should show threshold-hit continuation clearly.
- Maintainability: continuation handling should reuse the existing handoff pipeline rather than inventing a second retry mechanism.

## Out of Scope
- Making the acting-iteration budget itself task-aware; that belongs in `RHF-S07`.
- Rewriting handoff contents; that belongs in `RHF-S04`.
- Provider budget changes unrelated to loop thresholds.

## Done Definition
- Hitting the acting-iteration threshold produces a continuation checkpoint and bounded resume path, not a misleading hard failure.
