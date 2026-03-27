# Technical Plan

## Metadata
- Story ID: UIR-S04
- Story Title: Live Run Chat and Stepwise Playback
- Author: Codex
- Date: 2026-03-25

## Proposed Design

- Components/modules affected:
  - `src/engine/turn.ts`
  - `src/tools/edit-block.ts`
  - `src/tools/write-file.ts`
  - `src/ui/contracts.ts`
  - `src/ui/events.ts`
  - `src/ui/workbench-state.ts`
  - `ui/src/ShipyardWorkbench.tsx`
  - `ui/src/panels/ChatWorkspace.tsx`
  - `ui/src/panels/LiveViewPanel.tsx`
  - `ui/src/panels/FilePanel.tsx`
- Public interfaces/contracts:
  - extend the browser websocket contract with tool-result detail, immediate
    edit preview fields, and completed-turn LangSmith trace metadata
  - keep the schema backward-compatible by making the new fields optional
- Data flow summary:
  - tool success payloads now carry structured edit metadata
  - `executeInstructionTurn` emits immediate `agent:edit` events when edit tools
    finish successfully
  - the browser reducer stores those events as ordered activity items and file
    events
  - the frontend maps that state into a chat-first transcript and a live
    playback surface

## Architecture Decisions

- Decision: surface immediate edit evidence from tool completion instead of
  reconstructing everything only from the final diff.
- Decision: keep `Chat` and `Live view` as two views over the same turn model
  rather than splitting the session into separate pages.
- Decision: expose LangSmith trace metadata as completed-turn state, but keep
  the UI functional when only the local JSONL trace path exists.
- Rationale: the operator needs both a simple conversation surface and a
  trustworthy execution surface without changing sessions or relying on remote
  services.

## Dependency Plan

- Existing dependencies used: current React/Vite UI, current websocket runtime,
  current LangSmith integration path.
- New dependencies proposed: none.

## Implementation Notes

- `edit_block` and `write_file` return structured success data so the runtime
  can emit edit previews immediately.
- `turn.ts` tracks whether an immediate edit preview was already emitted and
  only falls back to the old end-of-turn diff preview when necessary.
- `workbench-state.ts` stores richer activity metadata on both activity items
  and file events so repeated same-path edits stay visible.
- `LiveViewPanel.tsx` defaults the detail pane toward the first edit step so the
  most concrete evidence is front and center.

## Test Strategy

- Unit: cover event serialization, reducer behavior, chat rendering, and live
  playback rendering.
- Integration: extend the browser runtime test so a real in-flight edit event is
  visible before `agent:done`.
- Manual: run the browser workbench against the tic-tac-toe target and confirm
  `Chat`, `Live view`, file evidence, and trace links all work together.

## Rollout and Risk Mitigation

- Rollback strategy: the old end-of-turn diff preview still exists as a fallback
  when a tool cannot produce immediate edit evidence.
- Observability: LangSmith trace metadata remains attached to the completed
  turn, and local JSONL tracing remains the local-first source of truth.

## Implementation Evidence

- Code references:
  - `src/tools/edit-block.ts` and `src/tools/write-file.ts`: return structured
    preview payloads on success so the runtime can surface before/after evidence
    immediately.
  - `src/engine/turn.ts`: emits richer `tool_result`, `edit`, and `done`
    events, including command/detail text and completed-turn trace metadata.
  - `src/ui/contracts.ts`, `src/ui/events.ts`, and
    `src/ui/workbench-state.ts`: extend the websocket schema and reducer state
    with optional edit preview and trace fields.
  - `src/engine/ultimate-mode.ts`, `src/agents/human-simulator.ts`, and
    `src/ui/server.ts`: add the foreground "ultimate mode" supervisor that
    keeps one live browser run open while alternating between Shipyard's normal
    turn entrypoint and a read-only human-simulator review pass, and queue
    follow-up human messages into the active run as feedback.
  - `src/engine/loop.ts`: exposes `ultimate <brief>`, `ultimate status`, and
    CLI interrupt guidance alongside the existing routed command surfaces.
  - `ui/src/ShipyardWorkbench.tsx`, `ui/src/panels/ChatWorkspace.tsx`, and
    `ui/src/panels/LiveViewPanel.tsx`: compose the new tabbed center workspace.
  - `ui/src/panels/FilePanel.tsx`: preserves repeated file events as distinct
    evidence rows.
  - `tests/human-simulator.test.ts`, `tests/ultimate-mode.test.ts`,
    `tests/ui-runtime.test.ts`, `tests/ui-events.test.ts`,
    `tests/ui-view-models.test.ts`, `tests/ui-chat-workspace.test.ts`, and
    `tests/ui-live-view.test.ts`: cover the simulator contract, the infinite
    supervisor loop, runtime streaming, typed contracts, reducer behavior, and
    frontend rendering.
- Representative snippets:

```ts
const immediateEditEvent = createImmediateEditEvent(tool.name, result.data);
if (immediateEditEvent) {
  reporter.onEdit(immediateEditEvent);
}
```

```tsx
{primaryView === "chat" ? (
  <ChatWorkspace turns={props.turns} />
) : (
  <LiveViewPanel turns={props.turns} tracePath={props.sessionState?.tracePath ?? null} />
)}
```

```ts
const decision = await runHumanSimulatorTurn(simulatorInput, sessionState.targetDirectory);
const turnResult = await executeTurn({
  sessionState,
  runtimeState,
  instruction: decision.instruction,
  reporter: innerReporter,
  signal,
  runtimeSurface: options.runtimeSurface,
});
```

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
