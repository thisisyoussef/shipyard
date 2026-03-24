# Technical Plan

## Metadata
- Story ID: SV-S03
- Story Title: Persistent Loop Test Flakiness Hardening
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/tests/cli-loop.test.ts`
  - any shared CLI test helpers (if applicable)
- Public interfaces/contracts:
  - none; this is test-only hardening
- Data flow summary: spawn one CLI process, drive it through multiple input lines, and assert prompt/turn completion/session persistence milestones with load-tolerant waits.

## Implementation Notes

- Prefer milestone-based waits (prompt appears, turn completion line appears, session file updated) over long blanket timeouts.
- Avoid overfitting to exact timing; keep polling intervals reasonable.
- If needed, increase the per-test timeout while still failing early when milestones cannot be reached.
- Ensure the test is not accidentally depending on TTY behavior that differs under CI (e.g., PTY vs pipe).

## Test Strategy

- Primary: harden `shipyard/tests/cli-loop.test.ts`.
- Optional: add a small repeat-run loop for the most sensitive portion, bounded to keep CI runtime reasonable.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
