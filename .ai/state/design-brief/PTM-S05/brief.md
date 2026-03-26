# PTM-S05 Design Brief

## Story
- Story ID: PTM-S05
- Story Title: Multi-Project Browser Workspaces
- Date: 2026-03-26
- Source: manual fallback brief after `generate-design-brief.mjs` stalled

## Reference Research

### What to borrow
- Multi-project dashboards work best when the project switch surface is compact,
  searchable, and clearly separated from the main working area.
- Creation flows feel fastest when the modal is minimal: name, short
  description, template choice, and one dominant CTA.
- The active project should be obvious through hierarchy and status, while
  background project activity should stay visible through concise badges rather
  than a full second transcript.

### What to avoid
- Do not turn the top of the workbench into a loud dashboard grid.
- Do not make status rely on color alone.
- Do not bury open/create actions behind extra navigation when another project
  is already busy.

## Landscape Assessment

- Existing reusable pieces:
  - `MicroLabel`, `Badge`, and `StatusDot` in `shipyard/ui/src/primitives.tsx`
  - the current `TargetHeader`, `TargetSwitcher`, and split-pane shell
  - existing badge tones for neutral/accent/success/warning/danger states
- Existing drift to avoid:
  - the current workbench has a strong active target header but no notion of
    multiple open projects, so adding the new surface should feel like a shell
    extension, not a second navigation system

## Visual Direction

- Mood: calm operator console, not project-management SaaS
- Personality: focused, reliable, low-drama
- Shell behavior: keep the existing header and split-pane layout, then insert a
  compact project strip between the shell header and the target header
- Dominant action: "Open or create target" stays secondary to the active
  project itself, but should remain visible even during background work

## Component Inventory

### New components
- `ProjectBoard`: horizontal strip of open projects with active state and
  background status

### Updated components
- `ShipyardWorkbench`: render the project board above the target header
- `TargetSwitcher`: update copy from replace/switch semantics to open/activate
- `TargetHeader`: keep detailed target information focused on the active project

## Layout Decisions

- Insert the project board as a compact rail directly above `TargetHeader`
- Each project item should read like a status chip with three layers:
  - name
  - one-line status
  - optional small badges for busy/ready/error
- The strip should support horizontal scroll on smaller screens rather than
  wrapping into multiple noisy rows
- Keep the active project shell keyed so the conversation and workspace repaint
  cleanly when the active project changes

## Typography Decisions

- Reuse the existing shell typography
- Use `MicroLabel` for the strip label: `Open Projects`
- Project names should be bold but not oversized
- Background status text should stay one line and muted unless it is an error

## Color Decisions

- Neutral surfaces and borders stay dominant
- Accent tone marks the active project and busy working state
- Success/warning/danger remain status-only, not background fills
- Use outline, weight, and status dot together so active/busy are never
  color-only distinctions

## Motion Plan

- Project activation: short opacity/translate transition only
- Background status updates: no large animation, only subtle status-dot pulse
  for busy projects
- Reduced motion: remove translate and pulse, keep instant state changes

## Copy Direction

- Prefer `Open projects`, `Open or create`, `Active here`, `Running in
  background`, and `Ready`
- Avoid phrases that imply another target must wait for the current one to
  finish
- Keep target creation CTA language direct: `Create target`

## Accessibility Requirements

- Project strip should expose tab-like activation semantics
- Active project state must be announced
- Keyboard users need arrow navigation across open projects plus Enter/Space
  activation
- Status text should be readable without depending on dots or color

## Edge Cases and Resilience

- Empty board: render a calm empty state with the open/create action
- Long target names: truncate visually with full title tooltip
- Many open projects: horizontal scroll with intact keyboard focus order
- Background errors: show concise error badge in the strip, full details only in
  the active project shell after activation

## Anti-Patterns To Avoid

- full dashboard cards
- loud gradient blocks
- second-row nav bars with duplicate actions
- decorative motion unrelated to project activation or runtime state

## Critique Summary

- Visual hierarchy: 8/10
- Discoverability: 8/10
- Calmness: 9/10
- Honesty of status: 9/10
- Main risk: letting the strip become too verbose; keep it concise and let the
  active target header do the deeper explanatory work
