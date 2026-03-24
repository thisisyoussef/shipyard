# Technical Plan

## Metadata
- Story ID: SV-S02
- Story Title: UI Error-Stream Contract Alignment
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/tests/ui-runtime.test.ts`
  - `shipyard/src/engine/turn.ts` (contract reference, not necessarily changed)
  - `shipyard/src/ui/*` (event mapping reference, not necessarily changed)
- Public interfaces/contracts:
  - clarify the UI failure-stream contract (required events + ordering)
- Data flow summary: `executeInstructionTurn` emits reporter callbacks (`onText`, `onError`, `onDone`) which the UI runtime converts into WebSocket messages (`agent:text`, `agent:error`, `agent:done`).

## Implementation Notes

- Prefer contract-style assertions:
  - required event types appear
  - relative ordering constraints for `agent:text` vs `agent:error`
  - invariants around `agent:done.status === "error"`
- Avoid asserting full exact arrays when legitimate tool events may appear in between.
- If a test currently asserts an outdated sequence, update it to match the contract rather than changing runtime behavior.

## Test Strategy

- Primary: update/extend `shipyard/tests/ui-runtime.test.ts` error-turn coverage.
- Stress: add a small repeated-run loop in test (or a dedicated “flaky guard” test) if needed, but keep CI runtime bounded.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
