# Technical Plan

## Metadata
- Story ID: PRE2-S04
- Story Title: Context Injection, Rehydration, and Browser Verification
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - left-sidebar context controls
  - session reload/bootstrap logic
  - CLI startup messaging for `--ui`
  - manual browser verification harness or checklist
- Public interfaces/contracts:
  - injected-context payload shape
  - rehydrated session bootstrap data
  - browser verification checklist
- Data flow summary: the user pastes context, submits an instruction, the backend injects that text into the next run, the UI records the injection visibly, and page reload reconnects to the same session snapshot before future instructions continue.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - browser-first progress surface
  - real-time event streaming
  - visual proof of context injection and surgical edits
- Story ordering rationale: this story closes the UI pack because it depends on both the backend stream and the frontend shell already existing.
- Gaps/overlap check: this story owns interaction polish and browser verification, not the underlying layout or event transport.
- Whole-pack success signal: the UI can now act as the natural demo surface for all later phases.

## Architecture Decisions
- Decision: treat browser reload as session reattachment, not as a fresh startup by default.
- Alternatives considered:
  - clear the UI on every reload
  - require manual session re-entry after refresh
- Rationale: the UI's value is continuity and visible progress.

## Data Model / API Contracts
- Request shape:
  - instruction plus optional injected context text
  - reconnect/status request
- Response shape:
  - injected-context acknowledgement
  - rehydrated session snapshot
  - browser-visible error and retry events
- Storage/index changes:
  - no new storage; reuse current session persistence

## Dependency Plan
- Existing dependencies used: socket contract, session state, frontend shell, engine runtime.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: reload rehydrates stale or partial data that confuses the user.
  - Mitigation: treat the server session snapshot as the source of truth and show a visible reconnect state while data loads.

## Test Strategy
- Unit tests:
  - injected-context state clearing after submit
  - session rehydration view-model logic
- Integration tests:
  - reload restores the existing session
  - instruction submission includes injected context
- E2E or smoke tests:
  - browser-based five-instruction MVP flow
- Edge-case coverage mapping:
  - empty context
  - disconnected reconnect
  - visible error/retry event rendering

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - context draft and injection acknowledgement
  - reconnect bootstrap flow
- Component structure:
  - context panel enhancements
  - browser verification is primarily behavioral, not structural
- Accessibility implementation plan:
  - clear labels and focus return after submit/reload
- Visual regression capture plan:
  - context injected state
  - rehydrated session
  - error/retry state

## Rollout and Risk Mitigation
- Rollback strategy: if automatic rehydration is unstable, keep browser mode but require explicit session restore.
- Feature flags/toggles: not required.
- Observability checks: log reconnect and context-injection events clearly in development mode.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
