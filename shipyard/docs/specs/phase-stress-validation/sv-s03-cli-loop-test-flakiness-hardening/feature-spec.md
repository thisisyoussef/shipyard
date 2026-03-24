# Feature Spec

## Metadata
- Story ID: SV-S03
- Story Title: Persistent Loop Test Flakiness Hardening
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: MVP hardening (persistent loop)

## Problem Statement

The persistent-loop integration test occasionally times out under load, yet passes when rerun alone. That pattern strongly suggests test flakiness (timing/IO sensitivity) rather than a confirmed runtime failure. The risk is that the test becomes a noisy signal and blocks merges even when the CLI loop contract still holds.

## Story Objectives

- Objective 1: Make the persistent-loop integration test resilient to timing variance.
- Objective 2: Preserve the intent of the test: one long-lived process accepts multiple instructions, persists after each turn, and exits only when told.
- Objective 3: Improve failure messages so a timeout points at the actual missing milestone (prompt, turn completion, session persistence, etc.).

## User Stories

- As a Shipyard developer, I want the persistent-loop test to be reliable so CI failures indicate real regressions.
- As a maintainer, I want timeouts to identify the missing contract milestone instead of “hung somewhere”.

## Acceptance Criteria

- [ ] AC-1: `shipyard/tests/cli-loop.test.ts` no longer fails intermittently due to load-sensitive timeouts.
- [ ] AC-2: The test continues to cover multiple instructions in one process, with an interleaved `status` command and session persistence checks.
- [ ] AC-3: Timeouts are tuned or milestone waits are restructured so typical CI variance does not cause false failures.
- [ ] AC-4: If the loop truly regresses (prompt never returns, session not saved), the test still fails quickly with a clear message.

## Notes / Evidence

- Manual CLI usage remains responsive, suggesting runtime contract is intact.
- The test’s failure mode is timeout-based and sensitive to suite load.

## Out of Scope

- Changing the runtime contract to “make tests pass”.
- Broad refactors of the CLI or engine loop unrelated to stability.

## Done Definition

- The persistent-loop integration test is stable in suite runs and still meaningful as a regression guard.
