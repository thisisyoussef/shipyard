# Technical Plan

## Metadata
- Story ID: UIR-S03
- Story Title: Context and Session UX Polish
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - context panel components
  - session banner/connection state
  - error and empty-state components
- Public interfaces/contracts:
  - no changes to the event schema
  - no changes to CLI or engine behavior
- Data flow summary: the UI renders existing session metadata with improved framing and persistence cues.

## Architecture Decisions

- Decision: treat context injection as a first-class history list, not a hidden input.
- Decision: show reconnection state and last-known activity after reload.
- Rationale: developers should never guess whether the UI is current.

## Dependency Plan

- Existing dependencies used: the frontend stack from Phase Pre-2.
- New dependencies proposed: none.

## Implementation Notes

- Store the last injected context payload and timestamp in UI state.
- Add explicit status states for socket connect, reconnect, and error.
- Provide short, action-oriented empty states.

## Test Strategy

- Manual: reload the UI during an active session and verify rehydration behavior.
- UI QA critic: evaluate clarity of error and empty states.

## Rollout and Risk Mitigation

- Rollback strategy: keep prior context panel behavior behind a toggle if needed.
- Observability: log connection transitions in the UI so they are visible.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
