# Technical Plan

## Metadata
- Story ID: PRE2-S03
- Story Title: Frontend Developer Console and Diff-First Workbench
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - frontend app entrypoint and layout shell
  - panel components for session/context, chat, file activity, top bar, and status bar
  - shared event parsing and view-model helpers
  - CSS/theme tokens for the dark developer-tool look
- Public interfaces/contracts:
  - socket client hook
  - panel-level props/contracts
  - diff preview presenter
- Data flow summary: the React app opens a socket on load, subscribes to backend events, updates local UI state incrementally, and renders the five-panel workbench with emphasis on live activity and diffs.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - browser-first progress surface
  - real-time event streaming
  - visual proof of context injection and surgical edits
- Story ordering rationale: the layout depends on the runtime contract and backend event stream being defined first.
- Gaps/overlap check: this story owns rendering and design language; context injection and verification workflows remain in PRE2-S04.
- Whole-pack success signal: the UI makes progress and surgical edits legible at a glance.

## Architecture Decisions
- Decision: give file activity and diff rendering equal visual weight to the chat transcript.
- Alternatives considered:
  - center-only chatbot layout
  - bury file changes inside collapsible metadata
- Rationale: the grader and developer both need to see surgical editing and tool progress naturally.

## Data Model / API Contracts
- Request shape:
  - socket event stream from PRE2-S02
- Response shape:
  - local UI state for session panel, chat turns, activity logs, file activity feed, and status strip
- Storage/index changes:
  - browser-local ephemeral state only; persisted session data remains server-side

## Dependency Plan
- Existing dependencies used: chosen React/frontend stack, backend event schema.
- New dependencies proposed (if any):
  - a compact diff-view helper only if the implementation cannot keep inline diff rendering simple enough in-house
- Risk and mitigation:
  - Risk: the layout drifts into generic chat UI.
  - Mitigation: encode the five-panel layout and diff-first emphasis directly into the component spec and prompt brief.

## Test Strategy
- Unit tests:
  - event-to-view-model formatting
  - collapsed activity log behavior
  - diff rendering states
- Integration tests:
  - socket event stream updates the correct panels
  - reconnect preserves the visible session shell
- E2E or smoke tests: deferred to PRE2-S04
- Edge-case coverage mapping:
  - empty shell
  - long activity stream
  - socket error state

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - socket connection/state hook
  - event reducers for chat and file activity
- Component structure:
  - `ShipyardWorkbench`
  - `SessionSidebar`
  - `ChatPanel`
  - `FileActivityPanel`
  - `TopBar`
  - `StatusBar`
- Accessibility implementation plan:
  - keyboard-first controls and clear semantic labels on collapsibles and status indicators
- Visual regression capture plan:
  - empty shell
  - active streaming turn
  - edit diff event
  - disconnected/error state

## Rollout and Risk Mitigation
- Rollback strategy: if the full layout is unstable, keep the center chat and right diff panel first, but do not drop file visibility entirely.
- Feature flags/toggles: not required.
- Observability checks: mirror connection state and event counts in development tooling if needed.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
