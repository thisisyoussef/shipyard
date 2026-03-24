# Task Breakdown

## Story
- Story ID: PTM-S03
- Story Title: Browser Workbench Target UI

## Execution Notes
- Start with WebSocket contracts, then server-side handlers, then React components.
- Components can be built in parallel once the contracts are defined.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define Zod schemas for `TargetManagerState`, `TargetSwitchRequest`, `TargetSwitchComplete`, `EnrichmentProgress` in `contracts.ts`. | must-have | yes | `pnpm --dir shipyard typecheck` |
| T002 | Add `targetManager` field to `WorkbenchViewState` with serialization support. | blocked-by:T001 | yes | unit test |
| T003 | Implement server-side: emit `TargetManagerState` on WebSocket connect. | blocked-by:T001 | no | integration test |
| T004 | Implement server-side: handle `TargetSwitchRequest`, call `switchTarget()`, emit `TargetSwitchComplete`. | blocked-by:T003 | no | integration test |
| T005 | Implement server-side: stream `EnrichmentProgress` events during `enrich_target` execution. | blocked-by:T003 | no | integration test |
| T006 | Build `TargetHeader` React component: active target name + description, click to toggle switcher. | blocked-by:T001 | yes | manual smoke test |
| T007 | Build `TargetSwitcher` React component: target card list, selection handler, "New Target" button. | blocked-by:T006 | no | manual smoke test |
| T008 | Build `TargetCreationDialog` React component: form with name, description, scaffold type, submit handler. | blocked-by:T007 | yes | manual smoke test |
| T009 | Build `EnrichmentIndicator` React component: spinner, completion, error states. | blocked-by:T006 | yes | manual smoke test |
| T010 | Wire components into the workbench layout and test end-to-end in browser. | blocked-by:T006,T007,T008,T009 | no | manual E2E |

## Completion Criteria

- Browser workbench displays the active target with a header bar.
- Target switching works from browser with real-time state updates.
- Enrichment progress is visible during AI analysis.
- State recovery on browser reload restores target context.
