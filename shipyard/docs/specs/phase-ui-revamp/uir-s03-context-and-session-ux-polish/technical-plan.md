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
  - saved-run history and resume controls
  - error and empty-state components
- Public interfaces/contracts:
  - add `session:state.sessionHistory` so the browser sees saved runs for the
    current target
  - add `session:resume_request` so the browser can switch to an earlier saved
    run without restarting the process
- Data flow summary: the UI renders persisted session metadata, saved-run
  history, and context receipts; resume requests rehydrate a saved session
  through the same runtime session-switch path used by target changes.

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
- Keep saved-run management separate from the core session metadata panel so the
  left sidebar can show the current run and historical runs without collapsing
  them into one overloaded card.

## Test Strategy

- Manual: reload the UI during an active session and verify rehydration behavior.
- UI QA critic: evaluate clarity of error and empty states.

## Rollout and Risk Mitigation

- Rollback strategy: keep prior context panel behavior behind a toggle if needed.
- Observability: log connection transitions in the UI so they are visible.

## Implementation Evidence

- Code references:
  - `src/engine/state.ts`: adds `listSessionRunSummaries(...)` so persisted
    `.shipyard/sessions/*.json` files become ordered saved-run summaries for the
    current target.
  - `src/ui/contracts.ts`, `src/ui/events.ts`, `src/ui/server.ts`: extend the
    websocket contract with `sessionHistory` and `session:resume_request`, then
    resume a saved run through the shared runtime session-switch path.
  - `ui/src/panels/RunHistoryPanel.tsx` and `ui/src/App.tsx`: render saved runs
    in the left sidebar and send resume requests from the browser.
  - `tests/session-history.test.ts`, `tests/ui-events.test.ts`, and
    `tests/ui-runtime.test.ts`: cover summary ordering, typed websocket
    contracts, and end-to-end browser resume.
- Representative snippets:

```ts
const sessionHistory = await listSessionRunSummaries(
  sessionState.targetDirectory,
  sessionState.sessionId,
);
```

```tsx
<RunHistoryPanel
  runs={props.sessionHistory}
  currentSessionId={props.sessionState?.sessionId ?? null}
  onResumeSession={props.onRequestSessionResume}
/>
```

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
