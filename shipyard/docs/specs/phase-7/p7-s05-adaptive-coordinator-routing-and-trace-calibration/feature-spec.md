# Feature Spec

## Metadata
- Story ID: P7-S05
- Story Title: Adaptive Coordinator Routing and Trace Calibration
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 7 planner, evaluator, and long-run handoff

## Problem Statement

Even with richer planner, evaluator, browser QA, and handoff contracts, Shipyard will not benefit unless the coordinator can route work through them selectively and the evaluator can be tuned against real evidence. The runtime needs adaptive coordinator heuristics plus trace-backed calibration so heavy harness paths are used when they help and skipped when they do not.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Integrate planner, richer verifier, browser evaluator, and reset routing into the coordinator path without giving up the current lightweight mode.
- Objective 2: Record which harness path was used so failures and costs are explainable.
- Objective 3: Calibrate evaluator strictness against a small golden scenario set using local traces and LangSmith when available.
- How this story or pack contributes to the overall objective set: This story is the pack-level integration and acceptance gate.

## User Stories
- As a coordinator, I want adaptive routing so trivial edits stay cheap while broad or preview-heavy work gets stronger planning and QA.
- As a Shipyard developer, I want trace-backed calibration so the evaluator becomes stricter based on evidence instead of hand-wavy prompt changes.

## Acceptance Criteria
- [ ] AC-1: The coordinator can choose between lightweight execution and planner-backed execution based on instruction breadth, path specificity, or related heuristics.
- [ ] AC-2: The coordinator can attach an explicit evaluation plan and consume hard failures from the richer verifier contract.
- [ ] AC-3: The coordinator can route previewable, UI-relevant work through the browser evaluator when the local preview surface is available.
- [ ] AC-4: The coordinator can emit or consume long-run handoff artifacts when reset thresholds are met.
- [ ] AC-5: Local trace logs and LangSmith metadata record the selected harness path, evaluator usage, browser-evaluator usage, and reset reason.
- [ ] AC-6: Evaluator prompt or threshold tuning is regression-checked against a small golden scenario set so strictness changes are measurable.
- [ ] AC-7: The coordinator remains the only writer across all integrated paths.

## Edge Cases
- Empty/null inputs: trivial instructions still take the lightweight path instead of trying to activate the full harness.
- Boundary values: broad requests that also name one explicit file should not accidentally trigger every heavy path.
- Invalid/malformed data: missing planner, evaluation, browser, or handoff artifacts fail back to explicit error handling or lightweight fallbacks rather than silent corruption.
- External-service failures: missing LangSmith credentials must not block local calibration or route metadata logging.

## Non-Functional Requirements
- Security: adaptive routing must not create new write-capable roles.
- Performance: route selection should avoid extra model calls for small work and bound browser or reset costs for larger work.
- Observability: every heavy-path decision should be traceable after the fact.
- Reliability: evaluator-calibration fixtures should be stable enough to catch regressions, not create constant flake.

## UI Requirements (if applicable)
- If surfaced in the workbench, the selected harness path should be shown as a compact run summary, not a debugging wall of metadata.

## Out of Scope
- A general-purpose benchmark dashboard.
- Continuous remote evaluation infrastructure beyond the local trace and LangSmith hooks already used by Shipyard.
- Automatic prompt tuning from production traffic.

## Done Definition
- Shipyard can selectively use planner, richer evaluation, browser QA, and handoff routing based on task shape, and the chosen path is visible in traces and calibration fixtures.
