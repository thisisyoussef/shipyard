# Technical Plan

## Metadata
- Story ID: UII-S01
- Story Title: Shared Application Spine and Route State
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/ui/src/App.tsx`
  - new shared browser controller module under `shipyard/ui/src/`
  - new selector helpers for dashboard/editor/board route models
  - `shipyard/ui/src/router.ts`
  - `shipyard/ui/src/use-router.ts`
  - `shipyard/ui/src/shell/NavBar.tsx`
- Public interfaces/contracts:
  - `useWorkbenchController()`
  - `WorkbenchControllerState`
  - `WorkbenchControllerActions`
  - `selectDashboardRouteModel(...)`
  - `selectEditorRouteModel(...)`
  - `selectBoardRouteModel(...)`
- Data flow summary: one controller owns access bootstrap, socket lifecycle,
  reducer updates, uploads, notices, and composer behavior; route selectors
  derive minimal props for each view; `App.tsx` only resolves access + route
  and renders the correct surface.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - shared app spine
  - live route surfaces
  - additive contracts
  - future-compatible projections
  - release-quality UX
- Story ordering rationale: every later story depends on one shared owner for
  socket and reducer state.
- Gaps/overlap check: this story sets the shell and selectors only; dashboard,
  editor, ultimate, and board wiring remain separate stories.
- Whole-pack success signal: later views mount against the same controller
  rather than reconstructing websocket/reducer logic route by route.

## Architecture Decisions
- Decision: split the refactor into a controller + selectors rather than one
  giant `useWorkbench()` hook.
  - Alternatives considered:
    - move the entire `App.tsx` body into a single hook
    - introduce a third-party global state library
  - Rationale: a controller + selector split creates seams for later stories
    without replacing one monolith with another.
- Decision: keep hash routing for the main app, but preserve `/human-feedback`
  as a backward-compatible pathname entry.
  - Alternatives considered:
    - move everything to pathname routing
    - add a router dependency
  - Rationale: current constraints forbid new dependencies and the existing
    operator feedback entry should keep working.
- Decision: treat `productId` in the editor route as a desired target/project,
  not proof that the runtime is already on that target.
  - Rationale: this lets later stories resolve the right project safely on
    reload or direct deep-link entry.

## Data Model / API Contracts
- Request shape:
  - no new backend contract required in this story
- Response shape:
  - route selectors return route-specific derived models
- Storage/index changes:
  - local route state only; no new persisted server artifact yet

## Dependency Plan
- Existing dependencies used: React state/hooks, current websocket manager,
  workbench reducer, hash router, hosted-access bootstrap.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the refactor moves bugs into a new controller without shrinking
    complexity.
  - Mitigation: preserve reducer logic first, then add route selectors around
    it with focused regression tests.
  - Risk: route and reload logic diverge from `/human-feedback`.
  - Mitigation: keep a shared resolver that understands both pathname and hash
    modes.

## Test Strategy
- Unit tests:
  - route parsing/building and `/human-feedback` compatibility
  - selector behavior for dashboard/editor/board resolution
- Integration tests:
  - current workbench still renders through the new app spine
  - reload on editor route restores the same session snapshot
- E2E or smoke tests:
  - manual route switching with one live websocket connection
- Edge-case coverage mapping:
  - missing product id
  - reconnect during route change
  - access gate before route hydration

## UI Implementation Plan
- Behavior logic modules:
  - shared controller
  - route selectors
  - route resolver
- Component structure:
  - `App.tsx` shell
  - `NavBar`
  - route dispatch to dashboard/editor/board/human-feedback
- Accessibility implementation plan:
  - maintain focusable nav controls and explicit route fallback text
- Visual regression capture plan:
  - shell states for dashboard/editor/board plus access gate

## Rollout and Risk Mitigation
- Rollback strategy: the story is an internal refactor first; the old
  `ShipyardWorkbench` can still render inside the new editor route while later
  stories land.
- Feature flags/toggles: none required.
- Observability checks: connection state and agent status remain visible in the
  same workbench snapshot after route changes and reloads.

## Implementation Evidence

- Code references:
  - `shipyard/ui/src/use-workbench-controller.ts`: extracted the stateful browser
    controller from the former `App.tsx` monolith.
  - `shipyard/ui/src/app-route.ts`: adds the mixed pathname/hash resolver plus
    editor-route derivation helpers.
  - `shipyard/ui/src/App.tsx`: now delegates to the shared controller and
    renders a thin route shell with parked board and missing-product states.
  - `shipyard/ui/src/shell/NavBar.tsx` and
    `shipyard/ui/src/preview-harness.tsx`: align the navigation contract with
    route-aware editor deep-links while keeping preview standalone.
  - `shipyard/tests/ui-route-state.test.ts` and `shipyard/tests/ui/router.test.ts`:
    cover route resolution and encoded editor target paths.
- Representative snippets:

```tsx
const editorRouteState = appRoute.view === "editor"
  ? selectEditorRouteState({
      productId: appRoute.productId,
      projectBoard: controller.viewState.projectBoard,
      targetManager: controller.viewState.targetManager,
    })
  : null;
```

```ts
if (item.view === "editor") {
  if (editorRoute) {
    onNavigate(editorRoute);
  }
  return;
}
```

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/ui/router.test.ts tests/ui-view-models.test.ts tests/ui-workbench.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
