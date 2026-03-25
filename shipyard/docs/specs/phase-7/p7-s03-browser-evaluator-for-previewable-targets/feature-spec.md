# Feature Spec

## Metadata
- Story ID: P7-S03
- Story Title: Browser Evaluator for Previewable Targets
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 7 planner, evaluator, and long-run handoff

## Problem Statement

Shipyard can already start and refresh a local preview for previewable targets, but it cannot yet inspect that running app as evidence. The runtime needs a read-only browser evaluator so preview-backed features can be validated through real UI behavior, console health, and simple scripted interactions instead of only shell commands.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Add read-only browser-backed evaluation for previewable targets.
- Objective 2: Reuse the existing local preview supervisor rather than inventing a second app runtime.
- Objective 3: Return structured browser evidence that later evaluator and coordinator stories can consume.
- How this story or pack contributes to the overall objective set: This story is the pack's bridge from command-only verification to live UI evidence.

## User Stories
- As a coordinator, I want UI-facing work to produce browser evidence so I can catch issues that tests and build checks miss.
- As a developer, I want preview-backed failures to name the exact page or interaction step that broke.

## Acceptance Criteria
- [ ] AC-1: A read-only browser evaluator can attach to a loopback preview URL for previewable targets.
- [ ] AC-2: The browser evaluator can execute a small structured plan that covers page load, console health, and optional interaction steps.
- [ ] AC-3: The browser evaluator returns structured output including preview URL, step outcomes, and any browser-side failures.
- [ ] AC-4: If preview is unavailable or fails to start, the browser evaluator returns a structured `not_applicable` or failure result instead of crashing.
- [ ] AC-5: Browser evaluation remains read-only and never mutates target files or application state beyond normal in-browser interaction.
- [ ] AC-6: The evaluator stays local-only and does not browse arbitrary external URLs.

## Edge Cases
- Empty/null inputs: blank browser plans fail closed.
- Boundary values: a no-interaction page-load-only plan is still valid.
- Invalid/malformed data: malformed selector or step definitions return structured plan-validation errors.
- External-service failures: preview startup failure, browser launch failure, or console error storms become structured evaluation results.

## Non-Functional Requirements
- Security: evaluation remains loopback-only and read-only.
- Performance: browser evaluation should stay bounded and avoid long-running uncontrolled browser sessions.
- Observability: failed steps should record the page, selector or action, and browser error details.
- Reliability: preview unavailability must be a first-class structured outcome, not an unhandled exception.

## UI Requirements (if applicable)
- If surfaced in the workbench, browser evaluator output should summarize the inspected preview URL, high-level outcome, and any captured browser-side errors or screenshots.

## Out of Scope
- Subjective visual-design scoring.
- Full end-to-end workflow fuzzing.
- Cross-browser matrix support.

## Done Definition
- Shipyard can gather structured browser evidence from its existing preview surface and use that evidence without giving write access to the evaluator.
