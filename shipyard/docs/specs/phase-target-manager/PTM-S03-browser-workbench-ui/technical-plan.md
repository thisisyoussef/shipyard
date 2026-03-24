# Technical Plan

## Metadata
- Story ID: PTM-S03
- Story Title: Browser Workbench Target UI
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/ui/contracts.ts` — new Zod schemas for `TargetManagerState`, `TargetSwitchRequest`, `TargetSwitchComplete`, `EnrichmentProgress`
  - `shipyard/src/ui/server.ts` — emit target events, handle switch requests via WebSocket
  - `shipyard/src/ui/workbench-state.ts` — add target manager fields to `WorkbenchViewState`
  - `shipyard/ui/src/` — new React components: `TargetHeader`, `TargetSwitcher`, `TargetCreationDialog`, `EnrichmentIndicator`

- Public interfaces/contracts:
  - WebSocket message schemas (Zod):
    - `TargetManagerStateSchema` — emitted on connect and on target change
    - `TargetSwitchRequestSchema` — sent by browser to request switch
    - `TargetSwitchCompleteSchema` — emitted by server after switch completes
    - `EnrichmentProgressSchema` — streamed during enrichment (status: started | in-progress | complete | error)
  - `WorkbenchViewState.targetManager` — optional field with current target, available targets, enrichment status

- Data flow summary:
  1. Browser connects → server sends `TargetManagerState` with current target + available list
  2. User clicks a target in switcher → browser sends `TargetSwitchRequest`
  3. Server calls `switchTarget()` → emits `TargetSwitchComplete` with new state
  4. User triggers enrichment → server runs `enrich_target` → streams `EnrichmentProgress` events
  5. Enrichment completes → server sends updated `TargetManagerState` with profile

## Architecture Decisions

- Decision: Target events use the existing WebSocket transport, not a separate HTTP endpoint.
  - Rationale: All other workbench events already flow through WebSocket. Adding REST for targets would create a second communication channel.

- Decision: The React components are small and embedded in the existing workbench layout, not a separate "page" or route.
  - Rationale: Target switching is a context action, not a navigation destination. It should be accessible from any workbench state.

- Decision: `TargetManagerState` is sent proactively on connect, not fetched on demand.
  - Rationale: The browser needs to know the current target immediately on load. Push model avoids a request-response round-trip.

## Dependency Plan

- Existing dependencies used: Zod (schema validation), React, WebSocket transport, `WorkbenchViewState`.
- New dependencies proposed: none.

## Implementation Notes

- `TargetHeader` component: sits below the main toolbar. Shows target name + description. Click handler toggles switcher panel visibility.
- `TargetSwitcher` component: overlay panel with a list of target cards. Each card: name (h3), language + framework badges, "Enriched" or "Not enriched" label. Click selects. "New Target" button at bottom.
- `TargetCreationDialog` component: modal form with name input, description textarea, scaffold type `<select>`. Submit sends `create_target` request followed by `select_target`.
- `EnrichmentIndicator` component: inline in the header. Three states: idle (nothing shown), enriching (spinner + "Analyzing project..."), error (red text + retry button).
- Server-side: `handleTargetSwitchRequest()` validates the request, calls `switchTarget()`, and emits `TargetSwitchComplete`. If the switch fails, emits an error event.
- State recovery: `WorkbenchViewState.targetManager` is serialized into session state. On browser reconnect, the server sends the current `TargetManagerState` from the live session.

## Test Strategy

- Unit: Zod schema validation for all new message types.
- Unit: `WorkbenchViewState` target manager field serialization/deserialization.
- Unit: server event emission for target switch and enrichment progress.
- Integration: simulate browser connect, verify `TargetManagerState` is received.
- Integration: simulate switch request, verify `TargetSwitchComplete` is emitted.
- UI: manual smoke test — open workbench, switch targets, create target, trigger enrichment.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
