# Feature Spec

## Metadata
- Story ID: UIV2-S02
- Story Title: Shell and Navigation Chrome
- Author: Claude
- Date: 2026-03-24
- Estimated effort: 2–3 hours
- Related pack: Phase UI v2 — Complete UI Reimagination
- Depends on: UIV2-S01 (Design System Foundation)
- Skills: arrange, animate, critique

## Problem Statement

The current shell in `ShipyardWorkbench.tsx` (1109 lines) is a monolithic component that mixes layout, content rendering, and state display into a single file. The top bar carries hero-level visual weight with a large title and branding area that competes with the actual content. The three-column CSS grid has fixed proportions with no ability to collapse sidebars. There is no keyboard-driven panel management, no responsive breakpoint strategy, and no spatial rhythm connecting the header to the content area.

Specific issues:
1. **Top bar is oversized.** The banner section with session title, status badges, and meta information occupies 150+ pixels of vertical space. In a tool where vertical space is precious (code diffs, activity feeds), this is wasteful.
2. **No collapsible sidebars.** The left and right panels are always visible. At narrow widths, content is crushed rather than panels being hidden.
3. **No icon rail.** When the sidebar collapses, there is no compact navigation option — it simply disappears.
4. **No keyboard shortcuts for layout.** Panel toggles require mouse interaction.
5. **Monolithic component.** Layout structure, session banner, composer, activity feed, diff viewer, context panel — all live in one 1109-line file.

## Story Objectives

- Objective 1: Extract a `ShipyardShell.tsx` component that owns only layout (header, left sidebar, main content, right sidebar) with no content rendering.
- Objective 2: Rebuild the top bar as a compact header strip (40–48px) showing workspace name, target directory, connection status, and agent status only.
- Objective 3: Implement collapsible left sidebar that transitions to an icon rail (48px wide) at narrow widths or on toggle.
- Objective 4: Implement collapsible right sidebar that fully hides when not needed.
- Objective 5: Add keyboard shortcuts: `Cmd/Ctrl+B` for left sidebar, `Cmd/Ctrl+Shift+B` for right sidebar.
- Objective 6: Implement responsive breakpoints at 1440px, 1024px, 768px, and 375px with intentional layout behavior at each.

## User Stories

- As a developer using Shipyard on a 13" laptop, I want to collapse the sidebars so the activity feed and diff viewer get maximum space.
- As a keyboard-first user, I want to toggle panels without reaching for the mouse.
- As a developer running a long agent session, I want the top bar to be compact so I can see more activity and diff content.
- As a developer on a wide monitor, I want the shell to use the space intelligently with balanced panels rather than stretching content to fill 2560px.

## Acceptance Criteria

- [ ] AC-1: `ShipyardShell.tsx` exists as a layout-only component accepting children via named slots (header, leftSidebar, main, rightSidebar).
- [ ] AC-2: Top bar is a compact header strip at 40–48px height showing: workspace identity (name + connection dot), target directory path, agent status badge.
- [ ] AC-3: Left sidebar collapses to a 48px icon rail showing section icons (activity, files, context) with tooltips.
- [ ] AC-4: Right sidebar collapses fully (0px width) with a smooth transition.
- [ ] AC-5: `Cmd/Ctrl+B` toggles left sidebar between full and icon-rail states.
- [ ] AC-6: `Cmd/Ctrl+Shift+B` toggles right sidebar between full and hidden states.
- [ ] AC-7: Sidebar collapse/expand transitions are 200–300ms with ease-out easing from the motion token system (S01).
- [ ] AC-8: At 1440px+: full three-column layout (left sidebar 220px, main fluid, right sidebar 280px).
- [ ] AC-9: At 1024px: left sidebar auto-collapses to icon rail, right sidebar hidden by default.
- [ ] AC-10: At 768px: both sidebars hidden, main content full-width, hamburger menu or swipe for sidebar access.
- [ ] AC-11: At 375px: single-column layout, compact header, touch-friendly tap targets (44px minimum).
- [ ] AC-12: Shell layout uses CSS Grid with named areas for predictable positioning.
- [ ] AC-13: `ShipyardWorkbench.tsx` is refactored to use `ShipyardShell` as its layout container, reducing its line count by extracting layout concerns.
- [ ] AC-14: `pnpm --dir shipyard build` and `pnpm --dir shipyard typecheck` pass.

## Edge Cases

- Sidebar toggle during an active animation should queue, not interrupt.
- Keyboard shortcut must not fire when focus is inside a text input/textarea (prevent conflict with browser shortcuts).
- Shell must handle the case where session state is null (pre-connection) gracefully with a placeholder header.
- Icon rail icons must have accessible labels (aria-label or tooltip with keyboard access).
- CSS Grid must not cause content overflow when sidebars are transitioning.

## Non-Functional Requirements

- Performance: Sidebar transitions must use `transform` or `width` on compositor-friendly properties. No layout thrash during animation.
- Accessibility: Sidebar toggle buttons must have `aria-expanded` state. Focus must not be trapped in a collapsed sidebar.
- Maintainability: Shell component should accept children/slots, not import content components directly.

## UI Requirements

- Header strip: dark background (surface-shell), 1px bottom border (border-subtle), no shadow.
- Workspace identity: monospace font for target path, status dot from primitives.
- Icon rail: icons at 20px with 48px hit target, active state with accent-soft background.
- Sidebar border: 1px right/left border (border-subtle) with no shadow.
- Content area: surface-canvas background, no inner border.

## Out of Scope

- Sidebar content (activity feed, file list, context panel) — those are S03, S04, S06.
- Breadcrumb navigation within sidebar sections.
- Drag-to-resize sidebar widths.
- Theme switcher in the header.

## Done Definition

- ShipyardShell.tsx exists as a clean layout component with zero content rendering.
- Top bar is compact and informational.
- Both sidebars collapse with transitions and keyboard shortcuts.
- Responsive behavior is intentional at all four breakpoints.
- ShipyardWorkbench line count is reduced.
- `arrange` and `critique` skills report no high-severity layout issues.
