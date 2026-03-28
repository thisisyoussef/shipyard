# Feature Spec

## Metadata
- Story ID: UII-S04
- Story Title: Ultimate Mode Control Plane and Composer Semantics
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase UI Integration

## Problem Statement

Ultimate mode currently behaves like a powerful hidden command. It works, but it
is only visible if the operator knows to type `ultimate ...` into the composer.
The redesigned UI already has a toggle and badge, but they are not connected to
runtime truth. Shipyard needs a typed ultimate control plane and a clear set of
composer semantics so operators can start, observe, feed, and stop ultimate
mode without relying on command memorization.

## Story Pack Objectives
- Objective 1: make ultimate mode first-class and observable in the UI.
- Objective 2: preserve compatibility with the current command-driven runtime.
- Objective 3: make feedback, stop, and reconnect semantics clear enough to
  build operator trust.
- How this story contributes to the overall objective set: it turns one of
  Shipyard’s most powerful features into an understandable product surface.

## User Stories
- As an operator, I want to start ultimate mode from the UI and know whether it
  is idle, running, or stopping.
- As an operator, I want to send follow-up feedback to the active loop without
  guessing whether my message became a normal instruction or queued feedback.
- As a returning user, I want reload or reconnect to show the real ultimate
  state instead of resetting the badge.

## Acceptance Criteria
- [ ] AC-1: The UI/backend contract supports typed ultimate actions and state
  projection without removing text-command fallback behavior.
- [ ] AC-2: Backend state projection includes enough truth for the UI to render
  an ultimate badge/toggle without guesswork, including active state, runtime
  phase, current brief, turn count, and queued feedback count.
- [ ] AC-3: Composer semantics are explicit: when idle, an armed ultimate send
  starts the loop; when active, submit becomes queued feedback with visible
  confirmation; stop remains available from the badge and the normal cancel
  flow remains coherent.
- [ ] AC-4: `/human-feedback` and typed `ultimate ...` commands continue working
  against the same active loop.
- [ ] AC-5: Reconnect/reload restores truthful ultimate state through session
  snapshots or incremental state messages instead of defaulting to “off.”

## Edge Cases
- Empty/null inputs: blank ultimate feedback should not enqueue.
- Boundary values: stop requested while a cycle is still shutting down.
- Invalid/malformed data: typed ultimate messages with invalid payloads fail
  clearly and do not disturb normal instruction flow.
- External-service failures: runtime errors inside the loop surface to the badge
  state and composer notices without hiding the last known brief.

## Non-Functional Requirements
- Reliability: UI state must reflect real runtime truth.
- Observability: ultimate transitions, queued feedback, and stop requests should
  remain traceable.
- Maintainability: typed ultimate controls should reuse existing runtime logic.
- Performance: state broadcasts should stay lightweight even during long loops.

## UI Requirements
- Required states: idle, armed, active, stopping, feedback queued, runtime
  error, reconnecting while active.
- Accessibility contract: toggle, badge, feedback input, and stop control are
  keyboard and screen-reader friendly.
- Design token contract: active-state treatment uses existing gold/amber system
  and motion tokens; no bespoke palette.
- Visual-regression snapshot states: idle composer, armed composer, active
  badge, open badge dropdown, stopping/error states.

## Out of Scope
- Multi-story orchestration or a master coordinator.
- New simulation logic inside the ultimate runtime.
- A second “ultimate only” transcript.

## Done Definition
- Ultimate mode becomes a typed, visible, reload-safe UI workflow while
  remaining compatible with the existing command path.
