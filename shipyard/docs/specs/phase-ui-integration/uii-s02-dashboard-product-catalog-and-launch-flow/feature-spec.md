# Feature Spec

## Metadata
- Story ID: UII-S02
- Story Title: Dashboard Product Catalog and Launch Flow
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase UI Integration

## Problem Statement

The new dashboard currently renders mock cards. Real Shipyard data is split
across `targetManager`, `projectBoard`, current session state, and runtime-only
knowledge about what target or project was just created. Without a projection
layer and a deterministic launch flow, the dashboard will look polished but act
untrustworthy. Shipyard needs a live product catalog plus a clean bridge from
“what should we build?” to the editor.

## Story Pack Objectives
- Objective 1: turn the dashboard into a live catalog of real Shipyard targets.
- Objective 2: make create/open flows deterministic and route-safe.
- Objective 3: add small UX layers, such as recent/starred memory, that make
  the dashboard feel intentionally usable rather than merely wired.
- How this story contributes to the overall objective set: it gives the new app
  shell a truthful landing surface and launch path.

## User Stories
- As an operator, I want to see real products, statuses, and last activity on
  the dashboard before I choose where to work.
- As an operator, I want the hero prompt to create or launch a product and land
  me in the editor with my intent preserved.
- As a returning user, I want recent and starred products to survive reloads.

## Acceptance Criteria
- [ ] AC-1: Dashboard cards are derived from live `targetManager`,
  `projectBoard`, and current-session state rather than mock data.
- [ ] AC-2: Hero prompt submission uses a deterministic create/launch flow that
  lands in the editor with the launch intent preserved as a draft or queued
  handoff, without relying on brittle timing.
- [ ] AC-3: Opening a dashboard card resolves the correct active project or
  target before the editor route renders live content.
- [ ] AC-4: Recent and starred tabs work with truthful data and survive reloads
  through an explicit preference layer.
- [ ] AC-5: Missing preview/status metadata degrades gracefully with placeholder
  artwork and explanatory copy rather than silent blanks.

## Edge Cases
- Empty/null inputs: no targets, no recent products, or blank hero prompt.
- Boundary values: a target may exist without an open project runtime yet.
- Invalid/malformed data: a stale route/product reference or failed create
  request shows a clear error notice.
- External-service failures: target creation or activation failures never leave
  the dashboard stuck in a fake “opening” state.

## Non-Functional Requirements
- Reliability: dashboard status and launch state must reflect backend truth.
- Performance: dashboard projection should be cheap enough to recompute on
  every relevant session/project update.
- Observability: create/open flows should expose correlation ids or equivalent
  request intent so failures are traceable.
- Maintainability: dashboard preferences remain replaceable by future persisted
  metadata without changing the view contract.

## UI Requirements
- Required states: empty catalog, create in progress, create failed, active
  project, busy project, missing preview, no starred products.
- Accessibility contract: tablist semantics, keyboard-triggered hero submit,
  card buttons with clear labels, and readable empty-state copy.
- Design token contract: cards and hero keep the Art Deco command system; no
  hardcoded fallback colors.
- Visual-regression snapshot states: empty dashboard, populated dashboard,
  active project card, create-in-progress notice, no-starred filter.

## Out of Scope
- Server-synced stars or favorites.
- Rename/delete/context-menu operations.
- Automatic screenshot capture pipeline for dashboard thumbnails.

## Done Definition
- The dashboard becomes a truthful entry surface for Shipyard with a clean,
  reload-safe path into the editor.
