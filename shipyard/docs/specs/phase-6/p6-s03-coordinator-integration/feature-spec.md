# Feature Spec

## Metadata
- Story ID: P6-S03
- Story Title: Coordinator Integration
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 6 subagents

## Problem Statement

The coordinator needs explicit heuristics for when to ask the explorer for context and when to delegate verification. Without that routing, the subagents exist as isolated utilities instead of becoming a coherent operating model.

## Story Objectives

- Objective 1: Teach the coordinator when to spawn the explorer.
- Objective 2: Teach the coordinator when to spawn the verifier.
- Objective 3: Merge structured reports into planning and recovery decisions safely.

## User Stories

- As a coordinator, I want broad instructions to trigger discovery first so I can plan edits against real file evidence.
- As a coordinator, I want verification to run after edits so I can decide whether to continue, retry, or escalate.

## Acceptance Criteria

- [ ] AC-1: The coordinator spawns the explorer before planning when the instruction is broad or references files/components it has not seen.
- [ ] AC-2: The coordinator spawns the verifier after every edit instead of running test commands directly itself.
- [ ] AC-3: The coordinator consumes structured `ContextReport` and `VerificationReport` data rather than raw prose.
- [ ] AC-4: When explorer suggestions conflict with verification evidence, the coordinator trusts verification first.
- [ ] AC-5: Recovery logic still works with subagent reports in the loop.

## Edge Cases

- Explorer returns insufficient context: coordinator should still proceed conservatively.
- Verifier reports failure with noisy logs: coordinator should rely on pass/fail and summary first.
- Conflicting evidence: verification wins over exploration guesses.

## Non-Functional Requirements

- Reliability: routing heuristics should be obvious and testable.
- Observability: it should be clear why the coordinator chose to spawn a subagent.
- Performance: avoid spawning subagents for trivial instructions that already name exact paths.

## UI Requirements (if applicable)

- If surfaced in logs or UI, the user should be able to see when the coordinator delegated to a subagent and why.

## Out of Scope

- New subagent types.
- Changing the explorer or verifier contracts.

## Done Definition

- The coordinator can make routing decisions that use structured subagent reports to plan, edit, verify, and recover.
