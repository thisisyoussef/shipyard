# Technical Plan

## Metadata
- Story ID: PRE2-S01
- Story Title: UI Runtime Contract and `--ui` Mode
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/bin/shipyard.ts`
  - a new UI server module under `shipyard/src/`
  - shared runtime/session modules
  - frontend app entry files and build configuration
- Public interfaces/contracts:
  - CLI option `--ui`
  - HTTP server bootstrap
  - typed WebSocket message unions
  - shared session/runtime selector
- Data flow summary: the CLI parses `--ui`, boots the local UI server, serves the static SPA, and maintains a socket bridge between frontend events and the existing Shipyard engine/session state.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - browser-first progress surface
  - real-time event streaming
  - visual proof of context injection and surgical edits
- Story ordering rationale: once `P2-S02` is in place, the startup contract and message schema land first so backend and frontend work can target the same runtime surface.
- Gaps/overlap check: this story owns contract and bootstrapping only; the actual event emission and rendering live in later stories.
- Whole-pack success signal: later UI stories do not need to re-decide transport or runtime shape.

## Architecture Decisions
- Decision: keep the UI inside the existing Shipyard process and expose it behind `--ui`.
- Alternatives considered:
  - build a separate web app/repo
  - bolt a web server on only after the engine phases are complete
- Rationale: the UI is meant to reveal the real engine in progress, not fork it.

## Data Model / API Contracts
- Request shape:
  - browser instruction payload with text and optional injected context
  - cancel request
  - session status request
- Response shape:
  - structured agent event stream
  - session state snapshot
- Storage/index changes:
  - none beyond reusing `.shipyard` session state

## Dependency Plan
- Existing dependencies used: commander, current session/runtime helpers, local tracing.
- New dependencies proposed (if any):
  - React + React DOM
  - a lightweight frontend build path such as Vite
  - a local HTTP server library and WebSocket library if the chosen server stack needs them
- Risk and mitigation:
  - Risk: the frontend stack becomes larger than the agent itself.
  - Mitigation: keep the UI single-page, local-only, and event-driven with no extra routing or SSR.

## Test Strategy
- Unit tests:
  - CLI mode parsing
  - message schema validation
- Integration tests:
  - `--ui` boots the UI runtime instead of the REPL
- E2E or smoke tests: deferred to PRE2-S04
- Edge-case coverage mapping:
  - invalid message types
  - boot failure
  - no active WebSocket client

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - UI runtime selector
  - socket protocol contracts
- Component structure:
  - frontend app shell entrypoint is deferred to PRE2-S03
- Accessibility implementation plan:
  - keyboard-first interaction starts with the chat input
- Visual regression capture plan:
  - snapshot the connected shell once PRE2-S03 exists

## Rollout and Risk Mitigation
- Rollback strategy: keep terminal mode as the fallback interface if the browser server path is unstable.
- Feature flags/toggles: `--ui` acts as the runtime selector.
- Observability checks: log server boot, WebSocket connect/disconnect, and session binding events.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
