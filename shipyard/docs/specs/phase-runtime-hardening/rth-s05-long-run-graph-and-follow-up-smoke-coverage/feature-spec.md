# Feature Spec

## Metadata
- Story ID: RTH-S05
- Story Title: Long-Run Graph and Follow-Up Smoke Coverage
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening supplemental pack

## Problem Statement

The current live smoke proves only that Shipyard can create one tiny greeting file through the raw loop. It does not exercise graph mode, large `write_file` payloads, persisted-session follow-up turns, or the coordinator routing behaviors that fail in real code-writing sessions. That leaves the runtime vulnerable to regressions that only appear when Shipyard is about to generate the first meaningful app files.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Replace the tiny live smoke with a graph-aware, multi-turn runtime validation that reflects real code-writing behavior.
- Objective 2: Exercise large-write or scaffold-heavy scenarios that would trigger history growth and provider-budget pressure.
- Objective 3: Capture enough artifacts to tell whether a failure came from compaction, provider limits, or routing.
- How this story or pack contributes to the overall objective set: This story becomes the acceptance gate for the whole runtime-hardening pack by reproducing the observed failure class end to end.

## User Stories
- As a maintainer, I want one opt-in live smoke that exercises graph mode, large writes, and same-session follow-up turns so regressions show up before demo-time surprises.
- As an operator debugging a runtime failure, I want transcripts, session snapshots, and trace links or stop-reason summaries so I can tell what actually failed.

## Acceptance Criteria
- [ ] AC-1: The live smoke runs through graph mode across at least two turns in the same target and session.
- [ ] AC-2: The smoke includes a large-write or scaffold-heavy scenario that is meaningfully closer to real app scaffolding than the current tiny greeting-file case.
- [ ] AC-3: The smoke includes a follow-up turn that validates lightweight continuation or visible explorer/planner activity after the initial write-heavy turn.
- [ ] AC-4: The smoke leaves behind transcript, artifact, and trace or stop-reason evidence sufficient to diagnose context growth, routing, or provider-budget failures.
- [ ] AC-5: Manual-test docs point contributors at one rerunnable command or script plus the required Anthropic prerequisites.

## Edge Cases
- Missing Anthropic credentials should fail fast with a clear prerequisite message.
- A live failure should preserve artifacts for inspection instead of cleaning them up eagerly.
- If graph mode is unavailable for a scenario, the smoke should say so explicitly rather than silently falling back without recording it.
- The smoke should remain bounded enough for a deliberate manual run, not an all-day soak test.

## Non-Functional Requirements
- Reliability: the smoke should reflect the real runtime path, not a fake or overly stubbed control path.
- Observability: artifacts must explain which scenario failed and why.
- Maintainability: the script should reuse existing transcript and live-verification utilities where possible.
- Scope control: keep the smoke opt-in/manual if it depends on live Anthropic access.

## Out of Scope
- Always-on CI coverage for live Anthropic sessions.
- Hosted or multi-user load testing.
- A full benchmark suite or cost dashboard.

## Done Definition
- Shipyard has an opt-in live smoke that can reproduce and guard the long-write, graph-mode, same-session follow-up failure class that the current tiny smoke misses.
