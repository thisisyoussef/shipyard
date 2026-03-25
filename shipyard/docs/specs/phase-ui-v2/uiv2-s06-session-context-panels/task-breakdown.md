# Task Breakdown

## Story
- Story ID: UIV2-S06
- Story Title: Session and Context Panels

## Execution Notes
- Reuse the collapsible/accordion pattern from S02 — do not reinvent it.
- Use native `<details>`/`<summary>` for collapsible sections to get keyboard and screen reader support for free.
- Context input area must remain visible (sticky positioning) even when the history timeline is long.
- Derive `SessionSummary` view model in `ShipyardWorkbench` before passing to `SessionPanel` — keep the panel component a pure presentational component.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extract `SessionPanel.tsx` from `ShipyardWorkbench.tsx`. Move all session metadata rendering into a standalone component with typed props. Preserve existing render output. | none | yes | `pnpm --dir shipyard build`, visual parity check |
| T002 | Build progressive disclosure session summary. Add status dot (8px circle, colored by state, with `aria-label`). Add one-line summary text derived from session state. Collapse all metadata sections by default using `<details>`/`<summary>`. | blocked-by:T001 | no | `pnpm --dir shipyard test`, keyboard walkthrough |
| T003 | Extract `ContextPanel.tsx` from `ShipyardWorkbench.tsx`. Move context injection UI and history rendering into a standalone component. Wire `onSubmit` callback for context injection. | none | yes (parallel with T001) | `pnpm --dir shipyard build`, visual parity check |
| T004 | Build 3-zone context layout. Zone 1: sticky input textarea + submit button, always visible. Zone 2: queued context preview with chips/tags and empty state. Zone 3: scrollable history area. Separate zones with subtle borders and uppercase zone headers. | blocked-by:T003 | no | `pnpm --dir shipyard test`, visual check |
| T005 | Build condensed context history timeline. Each entry shows timestamp + turn badge + first-line preview (truncated ~60 chars). Click expands to full content. Alternating background tints for scanability. | blocked-by:T004 | no | `pnpm --dir shipyard test` |
| T006 | Run `arrange` + `polish` + `critique` skills. Fix any findings related to spacing, alignment, typography, visual hierarchy, and interaction polish. Verify keyboard navigation through all collapsible sections and timeline entries. | blocked-by:T002,T005 | no | `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`, `pnpm --dir shipyard build`, `git diff --check` |

## Completion Criteria

- Session panel shows glanceable status with progressive disclosure for detail.
- Context panel has clear visual separation of input, queued, and history zones.
- Context history is a condensed, expandable timeline — not full cards.
- Both panels reuse S02 collapsible patterns and are keyboard-accessible.
- All skill evaluations pass without high-severity issues.
