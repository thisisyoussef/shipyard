# Task Breakdown

## Story
- Story ID: UIV2-S02
- Story Title: Shell and Navigation Chrome

## Execution Notes
- Extract layout first, then rebuild components. Do not attempt to redesign content panels in this story.
- Test at all four breakpoints (1440, 1024, 768, 375) after each visual change.
- Keep ShipyardWorkbench functional throughout the refactor — do not break the existing UI at any intermediate commit.
- Use S01's component tokens for all new shell styling (no hardcoded colors or spacing).

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extract `ShipyardShell.tsx` layout component from `ShipyardWorkbench.tsx`. Define the slot-based props interface (`header`, `leftSidebar`, `main`, `rightSidebar`). Implement CSS Grid with named template areas. Wire the shell into `App.tsx` wrapping existing content. | none | no | `pnpm --dir shipyard build`, existing UI renders |
| T002 | Rebuild the top bar as `HeaderStrip.tsx`: 40–48px compact strip with workspace name (serif font), target path (mono font), connection StatusDot, and agent status Badge. Remove the old banner section from ShipyardWorkbench. | blocked-by:T001 | no | `pnpm --dir shipyard build`, visual check |
| T003 | Implement collapsible left sidebar. Add `leftSidebarOpen` state to App.tsx (default: true, persisted to localStorage). Wire to ShipyardShell which sets `--shell-left-width` CSS variable. Build icon rail (48px) with icons for activity, files, context, and settings. Each icon is a button with `aria-label`. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, toggle works |
| T004 | Implement collapsible right sidebar. Add `rightSidebarOpen` state to App.tsx (default: true, persisted to localStorage). Wire to ShipyardShell which sets `--shell-right-width` to 280px or 0px. Transition width change with motion tokens. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, toggle works |
| T005 | Add keyboard shortcuts for sidebar toggle. Register a single `keydown` listener on `document` in App.tsx. `Cmd/Ctrl+B` toggles left sidebar. `Cmd/Ctrl+Shift+B` toggles right sidebar. Guard: do not fire when `event.target` is a textarea, input, or contenteditable. Call `event.preventDefault()` when handled. | blocked-by:T003,T004 | no | Keyboard shortcuts work, no conflicts with textarea input |
| T006 | Implement responsive breakpoints. At 1440px+: full layout. At 1024px: left sidebar auto-collapses to icon rail, right hidden. At 768px: both hidden, add a hamburger/menu button in header. At 375px: single-column, compact header, 44px tap targets. Use CSS `@media` queries plus optional JS `matchMedia` for state sync. | blocked-by:T001,T002,T003,T004 | no | Visual check at all four widths |
| T007 | Run `arrange` and `critique` skills on the final shell layout. Address any high-severity findings (spatial rhythm, alignment, proportions). | blocked-by:T006 | no | Skill output review |

## TDD Mapping

- T001 tests:
  - [ ] ShipyardShell renders a CSS grid with four named areas (header, left, main, right)
  - [ ] Slot children appear in their designated grid areas
  - [ ] ShipyardWorkbench still renders all existing content
- T002 tests:
  - [ ] HeaderStrip renders workspace name, target path, connection dot, agent status
  - [ ] Header height is 40–48px
  - [ ] Old banner section removed from ShipyardWorkbench
- T003 tests:
  - [ ] Left sidebar toggles between 220px and 48px
  - [ ] Icon rail shows 4 icon buttons with aria-labels
  - [ ] State persists to localStorage
- T004 tests:
  - [ ] Right sidebar toggles between 280px and 0px
  - [ ] Transition duration matches motion token (200–300ms)
- T005 tests:
  - [ ] `Cmd+B` toggles left sidebar state
  - [ ] `Cmd+Shift+B` toggles right sidebar state
  - [ ] Shortcuts do not fire when focus is in textarea
- T006 tests:
  - [ ] At 1024px, left sidebar is icon rail by default
  - [ ] At 768px, both sidebars hidden, hamburger visible
  - [ ] At 375px, touch targets are 44px minimum
- T007 tests:
  - [ ] `arrange` skill reports no spatial rhythm violations
  - [ ] `critique` skill reports no high-severity issues

## Completion Criteria

- [ ] All acceptance criteria from feature-spec.md verified
- [ ] ShipyardShell.tsx exists as a layout-only component
- [ ] ShipyardWorkbench.tsx line count reduced (layout code extracted)
- [ ] Sidebars collapse/expand with smooth transitions
- [ ] Keyboard shortcuts functional
- [ ] Responsive behavior correct at all four breakpoints
- [ ] Build, typecheck, and tests pass
