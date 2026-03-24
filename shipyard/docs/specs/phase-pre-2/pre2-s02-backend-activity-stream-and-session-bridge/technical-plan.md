# Technical Plan

## Metadata
- Story ID: PRE2-S02
- Story Title: Backend Activity Stream and Session Bridge
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - UI server and WebSocket handlers
  - engine/tool execution hooks
  - session-state loaders
  - local tracing or logger adapters if reused for event fan-out
- Public interfaces/contracts:
  - WebSocket event emitter helpers
  - session snapshot serializer
  - engine hooks for tool/model/edit/status events
- Data flow summary: the browser sends an instruction, the backend forwards it into the engine, the engine emits lifecycle events through the bridge, and the browser receives a live ordered stream plus occasional session-state snapshots.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - browser-first progress surface
  - real-time event streaming
  - visual proof of context injection and surgical edits
- Story ordering rationale: backend events must exist before the frontend can render them meaningfully.
- Gaps/overlap check: this story owns transport and event formatting, while layout and rendering live in PRE2-S03.
- Whole-pack success signal: later frontend stories consume a stable live stream instead of polling or replaying logs.

## Architecture Decisions
- Decision: reuse existing engine/tool boundaries and add event hooks around them instead of building a browser-specific execution path.
- Alternatives considered:
  - run a separate browser-only engine
  - stream raw console output to the browser
- Rationale: structured events are easier to render, test, and diff than terminal text.

## Data Model / API Contracts
- Request shape:
  - browser instruction event
  - cancel event
  - status event
- Response shape:
  - `agent:*` lifecycle events
  - `session:state` snapshot
- Storage/index changes:
  - none; session state remains on disk in `.shipyard`

## Dependency Plan
- Existing dependencies used: current engine/session modules, chosen WebSocket stack, current tool contracts.
- New dependencies proposed (if any): none beyond the PRE2-S01 runtime choice.
- Risk and mitigation:
  - Risk: event payloads drift from actual tool/runtime state.
  - Mitigation: centralize event creation in typed helpers and test them.

## Test Strategy
- Unit tests:
  - tool-call and tool-result event formatting
  - session-state serialization
- Integration tests:
  - one instruction emits the expected event sequence
  - reconnect returns session state
- E2E or smoke tests: deferred to PRE2-S04
- Edge-case coverage mapping:
  - socket disconnect mid-turn
  - multiple tool calls
  - error event emission

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - socket client contract consumer is deferred to PRE2-S03
- Component structure:
  - not the focus of this story
- Accessibility implementation plan:
  - status labels should be derivable from event names and payloads
- Visual regression capture plan:
  - deferred

## Rollout and Risk Mitigation
- Rollback strategy: keep terminal logging and disable browser streaming if the event bridge proves unstable.
- Feature flags/toggles: not required beyond `--ui`.
- Observability checks: log socket connect/disconnect and event names in development mode.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
