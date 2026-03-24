# Technical Plan

## Metadata
- Story ID: P5-S01
- Story Title: Local Preview Runtime and Auto Refresh
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/context/discovery.ts`
  - `shipyard/src/artifacts/*` for preview capability/state types
  - a new preview lifecycle module such as `shipyard/src/preview/`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/ui/src/*` for the preview panel or embedded result surface
- Public interfaces/contracts:
  - preview capability inferred from target discovery
  - preview state contract streamed to the browser workbench
  - preview supervisor lifecycle: start, restart, stop, health/update events
- Data flow summary: discovery infers whether preview is applicable, the UI
  runtime spins up a session-scoped preview supervisor when it is, the
  supervisor launches the target's preferred local command and captures URL/log
  state, and edit events or target-native HMR keep the visible preview current.

## Architecture Decisions

- Decision: prefer the target's existing dev server or watch script over a
  Shipyard-owned watcher whenever one exists.
- Decision: supervise preview as a session-scoped singleton rather than a fresh
  process per turn.
- Decision: keep preview loopback-only and surface it through the workbench
  instead of implying deployment.
- Decision: degrade gracefully to `unavailable` when detection confidence is
  low rather than guessing a risky command.
- Rationale: preview should increase confidence and speed, not add hidden
  process churn or unsafe process management.

## Data Model / API Contracts

- Discovery additions:
  - `previewCapability.status`: `available` | `unavailable`
  - `previewCapability.kind`: `dev-server` | `watch-build` | `static-output`
  - `previewCapability.command`: resolved command or script label
  - `previewCapability.reason`: human-readable explanation
- Runtime/browser additions:
  - `previewState.status`: `idle` | `starting` | `running` | `refreshing` |
    `error` | `exited` | `unavailable`
  - `previewState.url`: optional local URL when one is known
  - `previewState.logTail`: bounded recent output
  - `previewState.lastRestartReason`: optional explanation for restart/reload
- Storage/index changes:
  - session-backed preview state in the current workbench/session model
  - no durable artifact storage beyond bounded recent logs unless later stories
    demand it

## Dependency Plan

- Existing dependencies used: target discovery, Node `child_process`, browser
  runtime contracts, session state, and current event streaming.
- New dependencies proposed (if any): none in the first pass.
- Risk and mitigation:
  - Risk: generic preview inference could choose the wrong command.
  - Mitigation: start with a narrow support matrix keyed off explicit scripts
    and known framework signals, otherwise return `unavailable`.
  - Risk: filesystem watch behavior differs across platforms.
  - Mitigation: rely on target-native watch/HMR first and keep any Shipyard
    fallback watcher abortable and minimal.
  - Risk: long-running child processes become orphaned.
  - Mitigation: centralize preview lifecycle in one supervisor with explicit
    shutdown on session close and restart.

## Test Strategy

- Unit tests:
  - preview capability inference from discovery data
  - preview URL extraction and bounded log clipping
  - preview state reducer behavior for start, run, restart, and exit
- Integration tests:
  - preview supervisor start/stop/restart semantics
  - UI runtime contract emits preview state without breaking existing session
    messages
- E2E or smoke tests:
  - `test-targets/tic-tac-toe` auto-starts a local preview and remains current
    after an edit
  - a non-previewable fixture reports `unavailable` clearly
- Edge-case coverage mapping:
  - port already in use
  - startup failure before URL detection
  - unexpected process exit after a healthy start
  - edit that requires full reload or restart rather than HMR

## Rollout and Risk Mitigation

- Rollback strategy: if supervision proves unstable, keep the workbench preview
  panel but require explicit user-triggered start/restart until lifecycle
  issues are resolved.
- Feature flags/toggles: optional manual disable for preview auto-start if the
  first implementation is too eager.
- Observability checks: log preview lifecycle transitions and recent stderr/stdout
  to the browser workbench and local session trace.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
