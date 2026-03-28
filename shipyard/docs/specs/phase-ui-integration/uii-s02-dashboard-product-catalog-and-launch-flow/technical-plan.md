# Technical Plan

## Metadata
- Story ID: UII-S02
- Story Title: Dashboard Product Catalog and Launch Flow
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/ui/src/views/DashboardView.tsx`
  - `shipyard/ui/src/views/ProductCard.tsx`
  - new dashboard projection helper under `shipyard/ui/src/`
  - new lightweight dashboard-preferences helper under `shipyard/ui/src/`
  - shared browser controller from `UII-S01`
  - `shipyard/src/ui/contracts.ts` if request-correlation metadata is added
- Public interfaces/contracts:
  - `DashboardCardViewModel`
  - `DashboardLaunchIntent`
  - `DashboardPreferences`
  - optional `requestId` on create/switch messages for launch correlation
- Data flow summary: dashboard projection combines `targetManager`,
  `projectBoard`, current session state, and local preferences to create cards;
  hero prompt and card-open actions register a launch intent; matching backend
  completion events route the app into the editor and preserve the draft.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - live dashboard
  - seamless launch flow
  - truthful product metadata
  - release-quality UX
- Story ordering rationale: the dashboard must become truthful before the editor
  starts depending on it as the primary entry path.
- Gaps/overlap check: this story owns catalog and launch intent only; the live
  editor composition remains `UII-S03`.
- Whole-pack success signal: operators can start from the dashboard with no
  ambiguity about what project will open or what intent will carry forward.

## Architecture Decisions
- Decision: create a dashboard projection layer instead of mapping raw runtime
  objects inside `DashboardView`.
  - Alternatives considered:
    - keep view-level mapping logic inline
    - add new server-only dashboard state before proving the UX
  - Rationale: a projection layer keeps the view presentational and gives later
    stories one contract to extend.
- Decision: use explicit request correlation for hero create/open flows.
  - Alternatives considered:
    - infer completion from whichever target becomes active next
    - navigate optimistically before create completes
  - Rationale: explicit correlation prevents wrong-product navigation when
    multiple project events arrive close together.
- Decision: keep preview thumbnails optional and placeholder-backed for now.
  - Rationale: the dashboard should be truthful today without blocking on a new
    screenshot pipeline.

## Data Model / API Contracts
- Request shape:
  - optional `requestId` on `target:create_request`
  - existing `project:activate_request` and `target:switch_request`
- Response shape:
  - optional matching `requestId` on `target:switch_complete`
  - dashboard projection view model on the frontend
- Storage/index changes:
  - browser-local preferences for `starred`, `lastOpenedAt`, and active tab

## Dependency Plan
- Existing dependencies used: `targetManager`, `projectBoard`, current session
  snapshot, router/controller from `UII-S01`.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: dashboard state lies when a target exists but its project runtime is
    not open.
  - Mitigation: projection distinguishes catalog presence from open-project
    activity instead of collapsing them.
  - Risk: create/open flows race with other backend events.
  - Mitigation: correlate user intent to completion events explicitly.

## Test Strategy
- Unit tests:
  - dashboard projection maps runtime truth into card truth
  - preference hydration and persistence
- Integration tests:
  - hero prompt create flow preserves launch intent
  - card open resolves the correct product into the editor route
- E2E or smoke tests:
  - create target from dashboard, land in editor, reload, and return to dashboard
- Edge-case coverage mapping:
  - no targets
  - create failure
  - target exists but project runtime is not open
  - stale product id

## UI Implementation Plan
- Behavior logic modules:
  - dashboard projection
  - dashboard preferences
  - launch intent resolution
- Component structure:
  - `DashboardView`
  - `ProductCard`
  - `NewProductCard`
- Accessibility implementation plan:
  - hero form + tabs + cards must all work without pointer input
- Visual regression capture plan:
  - empty catalog, active project, busy project, recent tab, starred tab

## Rollout and Risk Mitigation
- Rollback strategy: keep the route shell from `UII-S01`; only the dashboard
  projection and launch flow are additive.
- Feature flags/toggles: none required.
- Observability checks: log or trace create/open request ids and resulting
  target/project activation so mismatches are debuggable.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/ui-view-models.test.ts tests/ui-runtime.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
