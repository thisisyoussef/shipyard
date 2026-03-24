# Technical Plan

## Metadata
- Story ID: UIR-S01
- Story Title: Visual System and Layout Refresh
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - UI app root from Phase Pre-2
  - layout shell components (top bar, sidebars, main panel)
  - shared styling/tokens module
- Public interfaces/contracts:
  - no changes to the WebSocket event schema
  - no changes to the engine or CLI flags
- Data flow summary: UI consumes the same event stream and session data; only layout and styling change.

## Architecture Decisions

- Decision: consolidate colors, type, and spacing into a single token source.
- Decision: keep layout structure consistent across screen sizes with a single responsive grid.
- Rationale: reduce ad hoc styling and ensure later UI changes are fast and consistent.

## Dependency Plan

- Existing dependencies used: the frontend stack defined in Phase Pre-2.
- New dependencies proposed: none.

## Implementation Notes

- Create a token map (CSS variables or theme object) for:
  - background layers
  - primary and secondary text
  - accent/status colors
  - spacing scale
  - radius and elevation
- Use the token map in shared UI primitives before applying to the full layout.
- Verify the layout still supports the five-panel intent from Phase Pre-2.

## Test Strategy

- Manual: run the local UI smoke test and verify legibility across panels.
- UI QA critic: run the workflow to capture any copy or hierarchy issues.

## Rollout and Risk Mitigation

- Rollback strategy: revert to the previous token map and layout styles.
- Observability: ensure status and error indicators remain visible under the new palette.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
