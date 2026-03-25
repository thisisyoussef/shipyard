# Technical Plan

## Metadata
- Story ID: UIV2-S02
- Story Title: Shell and Navigation Chrome
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/ShipyardShell.tsx` — new layout component
  - `shipyard/ui/src/HeaderStrip.tsx` — new compact header component
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — refactored to use ShipyardShell, layout code extracted
  - `shipyard/ui/src/App.tsx` — may pass layout state (sidebar visibility) to shell
  - `shipyard/ui/src/styles.css` — layout rules migrated to shell-specific styles
  - `shipyard/ui/src/tokens/components.css` — shell/header/sidebar component tokens (from S01)

- Public interfaces/contracts:
  - `ShipyardShell` props: `header`, `leftSidebar`, `main`, `rightSidebar` (ReactNode slots), `leftSidebarOpen`, `rightSidebarOpen`, `onToggleLeftSidebar`, `onToggleRightSidebar`
  - `HeaderStrip` props: `workspaceName`, `targetPath`, `connectionState`, `agentStatus`
  - Keyboard shortcut registration via `useEffect` on `document.addEventListener('keydown', ...)`

- Data flow summary:
  - `App.tsx` owns sidebar open/close state (persisted in localStorage for session continuity).
  - `ShipyardShell` receives open/close state as props and renders CSS grid with conditional column widths.
  - `HeaderStrip` receives connection and agent status from App's existing state management.
  - Keyboard events bubble to a document-level handler that checks for Cmd/Ctrl+B and Cmd/Ctrl+Shift+B.

## Pack Cohesion and Sequencing

- Higher-level pack objectives: Establish the spatial framework that all content components (S03–S06) mount into.
- Story ordering rationale: S02 depends on S01 for token values but must complete before S03/S04 because those stories need the shell's slot system to mount their components.
- Whole-pack success signal: S02 is successful when content components can be slotted into named areas without knowing about the shell's layout mechanics.

## Architecture Decisions

- **Decision**: Use CSS Grid with named template areas for the shell layout.
  - Rationale: Named areas make responsive rearrangement declarative (`grid-template-areas` changes per breakpoint). The current layout uses CSS grid but without named areas.

- **Decision**: Sidebar state lives in App.tsx (lifted state) rather than in ShipyardShell.
  - Rationale: App.tsx already owns all view state. Sidebar visibility may need to be coordinated with content rendering (e.g., hiding right sidebar when no diff is selected). Keeping state in App avoids prop-drilling or context overhead for now.

- **Decision**: Sidebar collapse uses CSS `width` transition rather than `transform: translateX`.
  - Rationale: `width` transition naturally reflows the grid, giving the main content area the reclaimed space. `translateX` would require absolute positioning and manual space reclamation.
  - Mitigation for jank: Use `will-change: width` on the sidebar element and ensure the main content area uses `min-width: 0` to prevent grid blowout.

- **Decision**: Keyboard shortcuts use a single document-level event listener with modifier key detection.
  - Rationale: Simpler than a keyboard shortcut library. The app has only two layout shortcuts. Guard against firing inside textareas by checking `event.target.tagName`.

## Component Structure

### ShipyardShell.tsx
```
┌─────────────────────────────────────────────────────┐
│ HeaderStrip (grid-area: header)                      │
├──────────┬──────────────────────────┬───────────────┤
│ Left     │ Main                     │ Right         │
│ Sidebar  │ (grid-area: main)        │ Sidebar       │
│ (grid-   │                          │ (grid-        │
│ area:    │                          │ area:         │
│ left)    │                          │ right)        │
│          │                          │               │
│ 220px /  │ 1fr                      │ 280px /       │
│ 48px     │                          │ 0px           │
└──────────┴──────────────────────────┴───────────────┘
```

### Grid Definition
```css
.shipyard-shell {
  display: grid;
  grid-template-areas:
    "header header header"
    "left   main   right";
  grid-template-columns: var(--shell-left-width) 1fr var(--shell-right-width);
  grid-template-rows: var(--shell-header-height) 1fr;
  height: 100vh;
}
```

### Responsive Breakpoints
| Breakpoint | Left Sidebar | Main | Right Sidebar | Header |
|---|---|---|---|---|
| 1440px+ | 220px full | fluid | 280px full | full |
| 1024px | 48px icon rail | fluid | hidden | full |
| 768px | hidden | full-width | hidden | compact + menu |
| 375px | hidden | full-width | hidden | minimal |

### Icon Rail
When collapsed, the left sidebar shows:
- Activity icon (list/timeline)
- Files icon (folder)
- Context icon (layers/stack)
- Divider
- Settings icon (gear)

Each icon is a `<button>` with `aria-label` and a tooltip on hover/focus.

## Dependency Plan

- Existing dependencies used: React (useState, useEffect, useCallback), CSS Grid, CSS custom properties from S01.
- New dependencies proposed: None.
- Risk and mitigation:
  - Risk: Sidebar width transition causes layout thrash on lower-end devices.
    Mitigation: Apply `contain: layout` on the main content area. Test with Chrome Performance panel.
  - Risk: Keyboard shortcuts conflict with browser defaults (Cmd+B = bold in some contexts).
    Mitigation: `event.preventDefault()` only when the shell is the active context. Do not capture when focus is in a contenteditable or textarea.

## Test Strategy

- Unit tests:
  - ShipyardShell renders with all four slots populated.
  - Sidebar visibility props control CSS class application.
  - Keyboard shortcut handler toggles correct sidebar state.
- Integration tests:
  - App renders ShipyardShell with WorkbenchContent slotted correctly.
  - Sidebar toggle persists state across re-renders.
- Visual verification:
  - Shell renders correctly at 1440px, 1024px, 768px, 375px viewports.
  - Sidebar collapse/expand animation is smooth (200–300ms).
- Skill-based validation:
  - Run `arrange` skill on shell layout for spatial analysis.
  - Run `critique` skill for overall layout quality.

## Rollout and Risk Mitigation

- Rollback strategy: ShipyardShell is a new component. If it causes issues, the old layout in ShipyardWorkbench can be restored by removing the ShipyardShell wrapper.
- Observability checks: Sidebar state stored in localStorage enables debugging (inspect `shipyard:sidebar-left`, `shipyard:sidebar-right` keys).
- Maintenance note: New content panels should be added as slot children, never hardcoded inside ShipyardShell.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
