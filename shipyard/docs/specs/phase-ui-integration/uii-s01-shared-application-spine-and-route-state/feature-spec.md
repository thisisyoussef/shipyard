# Feature Spec

## Metadata
- Story ID: UII-S01
- Story Title: Shared Application Spine and Route State
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase UI Integration

## Problem Statement

`shipyard/ui/src/App.tsx` currently owns hosted access bootstrap, socket
lifecycle, reducer updates, uploads, composer state, human-feedback routing,
and workbench rendering in one large component. That shape worked for a
single-view workbench, but it blocks the new Dashboard, Editor, and Board views
from sharing one truthful runtime state. Shipyard needs a thin application
shell with one shared controller and route-aware view selectors before any of
the new UI surfaces can be wired safely.

## Story Pack Objectives
- Objective 1: establish one shared browser controller for socket, uploads,
  access, reducer, and composer behavior.
- Objective 2: make Dashboard, Editor, Board, and human-feedback routable
  surfaces without duplicating runtime ownership.
- Objective 3: preserve today’s workbench behavior while creating clean seams
  for later integration stories.
- How this story contributes to the overall objective set: it is the foundation
  every other pack story depends on.

## User Stories
- As an operator, I want to move between dashboard, editor, board, and
  human-feedback views without reconnecting or losing session state.
- As a future integration story, I want route-specific view models so each
  surface receives only the state it actually needs.

## Acceptance Criteria
- [x] AC-1: `App.tsx` becomes a thin shell that delegates socket, hosted access,
  uploads, reducer updates, and composer state to a shared controller layer.
- [x] AC-2: The browser app uses one shared controller across dashboard,
  editor, board, and human-feedback surfaces; route changes do not create
  duplicate sockets or duplicate upload state.
- [x] AC-3: Hash-based routing supports `#/`, `#/editor/:productId`, and
  project-scoped board routes at `#/board/:productId`, while `/human-feedback`
  remains a backward-compatible operator entry point.
- [x] AC-4: Reloading on editor or board routes restores the same session and
  resolves missing or inactive products to an explicit fallback state instead of
  silently showing mocks.
- [x] AC-5: The preview harness remains standalone and the current
  `ShipyardWorkbench` stays usable throughout the refactor.

## Edge Cases
- Empty/null inputs: an editor route with no resolvable product falls back to a
  clear dashboard or missing-product state.
- Boundary values: route changes during reconnect or while a turn is running do
  not reset the active controller.
- Invalid/malformed data: unknown hashes resolve predictably; stale product ids
  never crash the shell.
- External-service failures: hosted access or socket bootstrap failures remain
  visible before any route surface tries to render live content.

## Non-Functional Requirements
- Reliability: one source of truth for browser state; no per-view drift.
- Maintainability: route shells and selectors should shrink future UI stories,
  not move the monolith to another file.
- Performance: route transitions stay client-side and cheap.
- Observability: reconnect, missing-product, and access-gate states remain
  inspectable in the same reducer/session snapshot path.

## UI Requirements
- Required states: locked access, dashboard default, editor loading selection,
  missing product, board empty, reconnecting, active turn.
- Accessibility contract: nav items are keyboard reachable; route fallback copy
  is screen-reader readable; focus management survives route changes.
- Design token contract: new shell/navigation surfaces use existing Art Deco
  tokens and motion primitives.
- Visual-regression snapshot states: dashboard shell, editor shell, board shell,
  human-feedback alias, hosted-access gate.

## Out of Scope
- Real dashboard card metadata.
- Code browser APIs.
- Typed ultimate control messages.
- Live board projection.

## Done Definition
- Shipyard has one route-aware browser application spine that can host all
  planned live views without regressing current workbench or operator flows.

## Implementation Evidence

- `shipyard/ui/src/use-workbench-controller.ts`: the former `App.tsx`
  controller responsibilities now live in one shared hook that owns hosted
  access, websocket lifecycle, reducer updates, uploads, composer state, and
  workbench actions.

  ```ts
  export function useWorkbenchController() {
    const [viewState, setViewState] = useState(createInitialWorkbenchState);
    const [accessState, setAccessState] = useState<HostedAccessState>({ ... });
  }
  ```

- `shipyard/ui/src/app-route.ts`: route resolution and editor-target fallback
  logic are explicit and typed, including reload-safe `opening` and `missing`
  states for deep-linked editor and board routes.

  ```ts
  export function selectBoardRouteState(options: SelectProductRouteStateOptions): BoardRouteState {
    const openProject = findOpenProject(options.projectBoard, options.productId);
    if (openProject) {
      return {
        status: "opening",
        intent: { kind: "activate-project", projectId: openProject.projectId },
      };
    }
  }
  ```

- `shipyard/ui/src/App.tsx`: the browser app is now a thin route shell that
  mounts `DashboardLandingView`, `ShipyardWorkbench`, parked board fallbacks,
  or `HumanFeedbackPage` against the shared controller instead of owning the
  runtime logic inline.

  ```tsx
  const controller = useWorkbenchController();
  const appRoute = resolveAppRoute(window.location.pathname, window.location.hash);

  return appRoute.view === "dashboard" ? (
    <DashboardLandingView ... />
  ) : (
    renderEditorContent()
  );
  ```

- `shipyard/ui/src/shell/NavBar.tsx` and `shipyard/ui/src/preview-harness.tsx`:
  the shared nav now supports editor deep-links, a parked board state, and
  standalone preview-harness routing without booting the live controller.

- `shipyard/tests/ui-route-state.test.ts` and `shipyard/tests/ui/router.test.ts`:
  coverage now locks down mixed pathname/hash routing plus encoded filesystem
  editor routes.
