# Feature Spec

## Metadata
- Story ID: SV-S01
- Story Title: MVP Stress and Smoke Matrix
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: MVP hardening and demo confidence

## Problem Statement

Shipyard now has implementation slices for the persistent loop, tool guardrails, browser UI, context assembly, graph or fallback runtime, and tracing. What it does not yet have is one disciplined stress and smoke story that proves those behaviors still work together after repeated turns, error cases, and UI-driven usage. Without that matrix, the project can look complete while still being fragile.

## Story Objectives

- Objective 1: Define one requirement matrix that maps each MVP requirement to concrete smoke and stress coverage.
- Objective 2: Add automated coverage for repeated-use and failure-mode cases that are easy to miss in story-by-story tests.
- Objective 3: Leave a small manual checklist for the few high-value scenarios that should be observed in a real terminal or browser.

## User Stories

- As a Shipyard developer, I want one stress-oriented validation story so I can trust that the agent really survives repeated use and ugly edge cases.
- As a demo operator, I want confidence that the persistent loop, browser UI, and trace links will still work after multiple turns instead of only on the first happy-path run.

## Acceptance Criteria

- [ ] AC-1: The story defines a requirement matrix covering at least these requirements:
  - persistent loop and session resume
  - surgical file editing guardrails
  - context injection and rolling session history
  - browser UI operator flow
  - tracing for a successful run and a failure run
- [ ] AC-2: The persistent loop receives repeated instructions in one process, interleaves built-in commands like `status`, and proves the process stays alive until explicit exit.
- [ ] AC-3: Session persistence is stress-tested across restart, resume, and partial-failure cases.
- [ ] AC-4: Tool guardrails are exercised beyond the current happy path, including repeated edits to the same file, stale reads, ambiguous anchors, not-found anchors, and large-rewrite rejection.
- [ ] AC-5: Context injection and rolling summary behavior are exercised across multiple turns so stale or missing context is detectable.
- [ ] AC-6: `--ui` mode is smoke-tested as a real operator surface: submit instructions, receive streamed activity, observe file changes, and recover from at least one error.
- [ ] AC-7: Graph mode and fallback mode both produce trace evidence, including one success case and one intentional failure case.
- [ ] AC-8: The story leaves behind a compact command set or script entry point so future contributors can rerun the matrix without rediscovering how.

## Edge Cases

- Repeated no-op instructions should not corrupt session state or rolling summary.
- A failed turn should still persist the updated session state and remain resume-safe.
- Long multi-turn sessions should keep bounded history rather than growing unbounded logs into the prompt.
- Browser reconnect after an error should still surface the latest session snapshot.
- Fallback mode without `ANTHROPIC_API_KEY` should still give deterministic preview behavior rather than hanging.

## Non-Functional Requirements

- Reliability: tests should be stable enough for routine reruns, not one-off demos only.
- Speed: keep the automated suite focused; move truly long soak checks into an explicit stress tier or manual checklist.
- Observability: failures should say which requirement regressed, not just which assertion broke.

## UI Requirements (if applicable)

- The browser validation path should prove the UI remains a truthful operator surface, not a second-class shell.
- UI smoke coverage should verify visible activity streaming, final response display, and at least one error presentation.

## Out of Scope

- Load testing remote hosting or multi-user scenarios.
- Performance benchmarking or token-cost analysis.
- New feature work unrelated to validating current MVP behavior.

## Done Definition

- One requirement-driven stress/smoke matrix exists and is linked to the current MVP promises.
- Core failure modes are covered instead of relying on memory or ad hoc demo prep.
- Contributors can rerun the suite and know whether Shipyard is truly demo-ready.
