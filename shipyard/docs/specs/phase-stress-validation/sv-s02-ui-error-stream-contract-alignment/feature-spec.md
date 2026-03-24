# Feature Spec

## Metadata
- Story ID: SV-S02
- Story Title: UI Error-Stream Contract Alignment
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: MVP hardening (browser operator surface)

## Problem Statement

The UI runtime’s failure-stream contract must be stable and truthful: when a turn fails, the browser should still receive the agent’s final text plus an explicit error event, and tests should assert that contract without being brittle or out of date. A recent failure report suggests at least one UI runtime regression test asserted a failed-turn sequence that omitted `agent:text`, even though the shared turn execution path emits final text in failure cases.

## Story Objectives

- Objective 1: Treat the shared per-turn reporter contract as the source of truth for error-turn streaming.
- Objective 2: Align UI runtime contract tests with that contract so they fail only on real regressions.
- Objective 3: Remove ordering flake by asserting the minimal required sequence and invariants.

## User Stories

- As a Shipyard developer, I want UI error-stream tests to match the runtime contract so failures are actionable and not noise.
- As a demo operator, I want the browser to always show what the agent said before it errored.

## Acceptance Criteria

- [ ] AC-1: Document the canonical “failed turn” event contract for the UI runtime:
  - `agent:text` is emitted for failed turns when a final user-facing text exists.
  - `agent:error` is emitted with the structured error message.
  - `agent:done` is emitted with `status: "error"`.
- [ ] AC-2: `shipyard/tests/ui-runtime.test.ts` asserts the error-turn sequence includes `agent:text` (and that it precedes `agent:error`).
- [ ] AC-3: Tests avoid brittle exact-match arrays when the runtime can legitimately insert tool events; instead assert required events and ordering constraints.
- [ ] AC-4: The test suite remains stable when run repeatedly (no intermittent mismatch on the error-stream contract).

## Notes / Evidence

- Shared turn execution emits final text on failure via the turn reporter (`onText`) before emitting `onError`.
- The UI runtime maps those reporter callbacks into `agent:text` and `agent:error` messages over WebSocket.

## Out of Scope

- Changing the UI protocol schema unless a breaking change is explicitly agreed.
- Changing engine behavior to “fit” a stale test; the contract should follow the runtime truth.

## Done Definition

- Error-stream tests reflect the real failure contract and are resilient to expected event noise.
- The browser failure path reliably shows final text plus a structured error message.
