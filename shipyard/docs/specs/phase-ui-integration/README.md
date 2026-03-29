# Phase UI Integration: Seamless Runtime Integration Story Pack

- Pack: UI Integration
- Estimate: 20-28 hours
- Date: 2026-03-28
- Status: Completed
- Depends on: Phase Pre-2 browser runtime, Phase UI Revamp visual system, and the shipped `codex/ui-redesign` component layer
- Source context:
  - `docs/plans/2026-03-28-ui-redesign-design.md`
  - `docs/plans/2026-03-28-ui-integration-architecture.md`
  - `DESIGN.md`

## Pack Objectives

1. Replace the current monolithic browser app shell with a shared controller and
   route-aware application spine that can power Dashboard, Editor, Board, and
   human-feedback surfaces without duplicated WebSocket or upload logic.
2. Turn the new Dashboard, Editor, Kanban Board, and Ultimate controls into
   live Shipyard surfaces backed by real session, target, plan, preview, and
   deploy state instead of mock data.
3. Add the missing backend/UI contracts for safe code browsing, typed ultimate
   controls, and a board projection that the new views can render directly.
4. Keep the integration additive and future-compatible so the current pack does
   not collide with the later Phase 11 task-graph and master-coordinator work.
5. Finish with trust-building UX details: launch flow continuity, reload-safe
   state, explicit empty/error/loading states, and a clear release audit path.

## Shared Constraints

- No new runtime dependencies. Keep routing, state shaping, and browser APIs
  inside the current React + TypeScript stack.
- `ShipyardWorkbench` must keep working throughout the refactor and remain a
  supported composition path inside the Editor route until extracted surfaces
  are proven equivalent.
- Hosted access gating, `/human-feedback`, uploads, session rehydration, target
  switching, preview state, deploy state, and saved-run resume behavior must
  survive the refactor unchanged or improve additively.
- Kanban columns remain fully data-driven. The UI renders whatever state list
  the backend publishes.
- New websocket and HTTP contracts must be additive, typed, and reload-safe.
- The preview harness at `/preview.html` remains standalone and mock-backed; it
  must not depend on a live backend or the main app controller.
- Board and ultimate integration should use projection layers that can later map
  onto `P11-S08` and `P11-S09` instead of introducing throwaway shapes.

## Architectural Stance

- Prefer a controller + selector split over a single giant `useWorkbench()`
  hook. One controller owns behavior; view selectors adapt that state to each
  route.
- Prefer additive projection layers over parallel mutable state models. The
  dashboard, editor, ultimate, and board views should render derived state
  first, then graduate to richer runtime-native contracts later.
- Prefer explicit request correlation for launch/navigation flows over timing
  heuristics or optimistic guesses.
- Prefer graceful truth over pretty placeholders. When preview, board, or code
  data is unavailable, the UI should say why instead of silently showing mocks.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| UII-S01 | Shared Application Spine and Route State | Extract a shared browser controller, thin `App.tsx`, and wire a route-aware shell that can host all live views without duplicating state ownership. | current UI runtime |
| UII-S02 | Dashboard Product Catalog and Launch Flow | Turn the dashboard into a real product surface driven by target/project state, recent/starred preferences, and a deterministic launch intent into the editor. | UII-S01 |
| UII-S03 | Editor Runtime Composition and Safe Code Explorer | Replace editor mocks with real chat/preview/diff surfaces, add a target-root read-only code browser, and keep the legacy workbench usable. | UII-S01 |
| UII-S04 | Ultimate Mode Control Plane and Composer Semantics | Make ultimate mode a typed, visible, reload-safe workflow with first-class badge/toggle behavior instead of command-only magic. | UII-S01, UII-S03 |
| UII-S05 | Board Projection Contract and Live Kanban | Publish a real board projection from plan/session/runtime state and render the data-driven Kanban view against it without inventing a separate task store. | UII-S01, UII-S04 |
| UII-S06 | Cross-View Resilience, Polish, and Release Gate | Close the pack with route resilience, explicit system states, docs sync, preview-harness verification, and a clear audit checklist. | UII-S02, UII-S03, UII-S04, UII-S05 |

## Sequencing Rationale

- `UII-S01` lands first because every other story depends on one shared owner
  for socket, upload, access-gate, and reducer state.
- `UII-S02` follows so product selection and launch intent are stable before
  the editor stops relying on mocks.
- `UII-S03` mounts the real workbench surfaces inside the new editor after the
  app spine exists, and adds the safe code-browser contract that only the live
  route can validate.
- `UII-S04` layers typed ultimate controls onto the real editor/composer
  surface instead of baking them into a mock shell.
- `UII-S05` waits until the route spine and ultimate/session projections exist,
  then publishes one real board contract the UI can consume.
- `UII-S06` is deliberately last so the pack ends with cohesive state handling,
  docs, audit coverage, and regression checks instead of stopping at “wired.”

## Phase 11 Alignment

This pack intentionally improves today’s UI without pre-implementing Phase 11.
The board and ultimate work should align with those future packs by:

- naming and shaping projections so `UII-S05` can later swap its data source
  from current plan/session state to `P11-S08` task-graph output
- keeping current board state read-only and derived rather than inventing a new
  mutable task database
- treating typed ultimate state as a supervisor projection that `P11-S09` can
  later enrich, not replace
- avoiding a second scheduler, coordination bus, or file-lease system here

## Whole-Pack Success Signal

- Opening Shipyard in browser mode lands on a real dashboard, not a monolithic
  workbench-only shell.
- Creating or opening a product flows cleanly into the editor with preserved
  context and no duplicate socket sessions.
- The editor shows live transcript, preview, file diffs, and safe code browsing
  inside the redesigned layout.
- Ultimate mode feels first-class and observable from the UI, including queued
  feedback, stop behavior, and reconnect/reload state.
- The board route renders a live projection from actual runtime state with
  backend-defined columns and no mock fallback.
- Hosted access, `/human-feedback`, preview harness, and the current workbench
  remain functional.
- Tests, docs, and the pack audit checklist make the result shippable rather
  than merely connected.

## User Audit

- [`user-audit-checklist.md`](./user-audit-checklist.md)

## Implementation Evidence

- `UII-S01` landed the shared application spine in
  `shipyard/ui/src/App.tsx`, `shipyard/ui/src/use-workbench-controller.ts`,
  `shipyard/ui/src/app-route.ts`, `shipyard/ui/src/shell/NavBar.tsx`, and
  `shipyard/tests/ui-route-state.test.ts`.
- `UII-S02` landed the live dashboard catalog and launch flow in
  `shipyard/ui/src/dashboard-catalog.ts`,
  `shipyard/ui/src/dashboard-preferences.ts`,
  `shipyard/ui/src/dashboard-launch.ts`,
  `shipyard/ui/src/views/DashboardView.tsx`,
  `shipyard/ui/src/views/ProductCard.tsx`,
  `shipyard/ui/src/App.tsx`,
  `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/server.ts`,
  `shipyard/tests/ui-dashboard-catalog.test.ts`, and
  `shipyard/tests/ui-dashboard-launch.test.ts`.
- Post-pack launch hardening extended `UII-S02` so hero submits now carry an
  `initialInstruction` through `shipyard/ui/src/dashboard-launch.ts`,
  `shipyard/ui/src/App.tsx`, `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/server.ts`, `shipyard/tests/ui-events.test.ts`, and
  `shipyard/tests/ui-runtime.test.ts`, which lets a dashboard create request
  scaffold, auto-enrich, and queue the first turn atomically.
- Post-pack polish extended the `UII-S02` dashboard cards with live preview and
  deployment surfaces by projecting preview URLs through
  `shipyard/src/ui/server.ts`, `shipyard/src/ui/contracts.ts`,
  `shipyard/ui/src/dashboard-catalog.ts`, and
  `shipyard/ui/src/views/ProductCard.tsx`.
- `UII-S03` landed the live editor runtime composition and safe code explorer in
  `shipyard/ui/src/views/EditorView.tsx`,
  `shipyard/ui/src/workbench-surfaces.tsx`,
  `shipyard/ui/src/ShipyardWorkbench.tsx`,
  `shipyard/ui/src/editor-preferences.ts`,
  `shipyard/ui/src/code-browser-client.ts`,
  `shipyard/ui/src/panels/CodeExplorerPanel.tsx`,
  `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/code-browser.ts`,
  `shipyard/src/ui/server.ts`,
  `shipyard/tests/ui-editor-view.test.ts`,
  `shipyard/tests/ui-editor-preferences.test.ts`,
  `shipyard/tests/ui-code-browser.test.ts`, and
  `shipyard/tests/ui-runtime.test.ts`.
- Post-pack hardening aligned the hosted code-browser HTTP gate with the shared
  access-cookie contract in `shipyard/src/ui/server.ts` and
  `shipyard/ui/src/code-browser-client.ts`.
- Post-pack editor fidelity work normalized the editor route so the chat and
  workspace panes stretch through the full shell height, and formatted
  assistant replies into safe rich text in `shipyard/ui/src/styles.css`,
  `shipyard/ui/src/shell/shell.css`,
  `shipyard/ui/src/panels/panels.css`,
  `shipyard/ui/src/panels/FormattedMessage.tsx`,
  `shipyard/ui/src/panels/ChatWorkspace.tsx`, and
  `shipyard/ui/src/preview-harness.tsx`, with focused coverage in
  `shipyard/tests/ui-chat-workspace.test.ts`,
  `shipyard/tests/ui-editor-view.test.ts`, and
  `shipyard/tests/ui-workbench.test.ts`.
- Post-pack hosted preview hardening taught the dashboard and editor to prefer
  public deployment surfaces over unreachable loopback previews in hosted
  sessions via `shipyard/ui/src/preview-surface.ts`,
  `shipyard/ui/src/dashboard-catalog.ts`,
  `shipyard/ui/src/panels/PreviewPanel.tsx`,
  `shipyard/ui/src/views/EditorView.tsx`,
  `shipyard/ui/src/App.tsx`,
  `shipyard/tests/ui-dashboard-catalog.test.ts`, and
  `shipyard/tests/ui-editor-view.test.ts`.
- `UII-S04` landed the typed ultimate control plane and explicit composer
  semantics in `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`,
  `shipyard/src/ui/server.ts`,
  `shipyard/src/engine/ultimate-mode.ts`,
  `shipyard/ui/src/ultimate-composer.ts`,
  `shipyard/ui/src/use-workbench-controller.ts`,
  `shipyard/ui/src/panels/ComposerPanel.tsx`,
  `shipyard/ui/src/HumanFeedbackPage.tsx`,
  `shipyard/ui/src/shell/NavBar.tsx`,
  `shipyard/ui/src/shell/UltimateBadge.tsx`,
  `shipyard/ui/src/shell/UltimateToggle.tsx`,
  `shipyard/tests/ui-ultimate-composer.test.ts`,
  `shipyard/tests/ui-events.test.ts`,
  `shipyard/tests/ui-view-models.test.ts`,
  `shipyard/tests/ui-human-feedback-page.test.ts`, and
  `shipyard/tests/ui-runtime.test.ts`.
- The live board outcome originally scoped for `UII-S05` shipped during
  `UII-S06` by consuming the already-published runtime `taskBoard` projection,
  so no separate board-story branch remains open.
- Post-pack route hardening made the board explicitly project-scoped at
  `#/board/<productId>` in `shipyard/ui/src/router.ts`,
  `shipyard/ui/src/app-route.ts`, `shipyard/ui/src/App.tsx`,
  `shipyard/ui/src/board-view-model.ts`,
  `shipyard/ui/src/shell/NavBar.tsx`, and the focused coverage in
  `shipyard/tests/ui/router.test.ts`,
  `shipyard/tests/ui-route-state.test.ts`, and
  `shipyard/tests/ui-board-view-model.test.ts`. The board now resolves and
  persists against an explicit product route instead of ambient dashboard
  selection.
- `UII-S06` landed the cross-view resilience and release gate in
  `shipyard/ui/src/App.tsx`,
  `shipyard/ui/src/board-view-model.ts`,
  `shipyard/ui/src/board-preferences.ts`,
  `shipyard/ui/src/target-selection.ts`,
  `shipyard/ui/src/dashboard-system-notice.ts`,
  `shipyard/ui/src/views/BoardView.tsx`,
  `shipyard/ui/src/views/KanbanView.tsx`,
  `shipyard/ui/src/HostedAccessGate.tsx`,
  `shipyard/ui/src/HumanFeedbackPage.tsx`,
  `shipyard/ui/src/README.md`,
  `shipyard/tests/ui-board-preferences.test.ts`,
  `shipyard/tests/ui-board-view-model.test.ts`,
  `shipyard/tests/ui-dashboard-system-notice.test.ts`,
  `shipyard/tests/ui-access.test.ts`, and
  `shipyard/tests/ui-human-feedback-page.test.ts`.
