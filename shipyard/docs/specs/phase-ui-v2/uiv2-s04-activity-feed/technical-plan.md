# Technical Plan

## Metadata
- Story ID: UIV2-S04
- Story Title: Activity Feed Reimagination
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/ActivityFeed.tsx` — new component (feed container with virtual scrolling)
  - `shipyard/ui/src/TurnCard.tsx` — new component (turn boundary with tool call list)
  - `shipyard/ui/src/ToolCallRow.tsx` — new component (glance-level tool call with expand)
  - `shipyard/ui/src/hooks/useVirtualScroll.ts` — new hook or thin wrapper around a virtualizer
  - `shipyard/ui/src/hooks/useAutoScroll.ts` — new hook for auto-scroll-to-bottom behavior
  - `shipyard/ui/src/activity-diff.ts` — consumed (not modified), provides `buildActivityBlocks()`, `selectVisibleTurns()`
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — activity rendering extracted, replaced with `<ActivityFeed />`
  - `shipyard/ui/src/styles.css` — activity feed styles extracted/rewritten
  - `shipyard/ui/src/tokens/components.css` — feed/card component tokens (from S01)

- Public interfaces/contracts:
  ```typescript
  interface ActivityFeedProps {
    turns: TurnViewModel[];
    activeTurnIndex: number | null;
    activeToolCallId: string | null;
    onToolCallSelect?: (turnIndex: number, toolCallId: string) => void;
  }

  interface TurnCardProps {
    turn: TurnViewModel;
    isActive: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    activeToolCallId: string | null;
  }

  interface ToolCallRowProps {
    toolCall: ToolCallViewModel;
    isActive: boolean;
    isExpanded: boolean;
    onToggleExpand: () => void;
  }
  ```

- Data flow summary:
  - `App.tsx` passes `turns` (from `useDeferredValue`) and derived `activeTurnIndex` / `activeToolCallId` to ActivityFeed.
  - ActivityFeed manages collapse state internally (which turns are collapsed).
  - TurnCard renders its tool calls, delegating to ToolCallRow for each.
  - ToolCallRow manages its own expand/collapse state for detail view.
  - Virtual scrolling wraps the turn list, rendering only visible turns plus a buffer.

## Pack Cohesion and Sequencing

- Higher-level pack objectives: Make long agent runs scannable under pressure (3-second find target from the README).
- Story ordering rationale: S04 depends on S02 for the shell slot but is independent of S03 (composer). Both S03 and S04 can proceed in parallel after S02. S05 (diff viewer) builds on S04's card patterns.
- Whole-pack success signal: A developer can identify the current state, last error, and latest diff in a 50+ tool-call run within 3 seconds.

## Architecture Decisions

- **Decision**: Use a lightweight virtual scrolling approach rather than a full library like `react-virtuoso` or `@tanstack/virtual`.
  - Rationale: The feed has variable-height items (collapsed turns vs expanded turns vs expanded tool calls). A custom hook using `IntersectionObserver` and `ResizeObserver` keeps the dependency count at zero while handling variable heights. If complexity grows, migration to `@tanstack/virtual` is straightforward since the hook API can be kept compatible.
  - Fallback: If custom virtualizer proves too complex for the time budget, use `@tanstack/react-virtual` (7KB gzipped, well-maintained, supports variable sizes).

- **Decision**: Turn collapse state is managed inside ActivityFeed (local state), not lifted to App.tsx.
  - Rationale: Collapse state is purely visual, has no bearing on data flow, and does not need persistence. Keeping it local reduces prop complexity.

- **Decision**: Auto-collapse older turns when a new turn starts.
  - Rationale: Progressive disclosure. The developer cares most about the current turn. Older turns are still accessible via click-to-expand but don't compete for attention.

- **Decision**: Tool call icons are mapped from tool type strings (e.g., "file_read", "file_edit", "shell_exec") using a static icon map.
  - Rationale: The tool type set is known and bounded. A static map is faster than dynamic icon loading and avoids runtime resolution.

- **Decision**: Auto-scroll uses a "stick to bottom" pattern: if the user is within 100px of the bottom, new items scroll into view. If the user has scrolled up, auto-scroll is suspended until they scroll back to bottom.
  - Rationale: Standard behavior in terminal and chat UIs. Prevents jarring scroll jumps when the developer is reviewing history.

## Component Hierarchy

```
ActivityFeed
├── [empty state placeholder]
└── VirtualScrollContainer
    ├── TurnCard (turn 1, collapsed)
    │   └── TurnSummaryRow (badges: 5 tools, 4 success, 1 error)
    ├── TurnCard (turn 2, collapsed)
    │   └── TurnSummaryRow
    └── TurnCard (turn 3, expanded, active)
        ├── TurnHeader (turn number, timestamp, instruction)
        ├── ToolCallRow (completed, collapsed — glance view)
        ├── ToolCallRow (completed, expanded — detail view)
        ├── ToolCallRow (running, active — elevated with pulse)
        └── ToolCallRow (pending — skeleton placeholder)
```

## Timeline Layout

```
│  Turn 1 — "Analyze the codebase"          12:34:05
│  ┌──────────────────────────────────────┐
├──│ ● Read src/App.tsx                   │  ✓
│  │ ● Read src/styles.css                │  ✓
│  │ ● Shell: wc -l src/*.tsx             │  ✗
│  └──────────────────────────────────────┘
│
│  Turn 2 — "Fix the build error"           12:34:18
│  ┌──────────────────────────────────────┐
├──│ ● Edit src/App.tsx +3 -1             │  ✓
│  │ ○ Shell: pnpm build                  │  ◌ running...
│  └──────────────────────────────────────┘
```

The vertical line (2px, border-subtle) runs along the left edge. Turn headers are positioned at junction points. The timeline connector visually links turns in chronological order.

## Virtual Scrolling Strategy

### useVirtualScroll Hook
- Input: container ref, item count, estimated item height (80px for collapsed turn, variable for expanded).
- Uses `IntersectionObserver` to detect which items are near the viewport.
- Renders items within viewport + 3-item overscan buffer above and below.
- Uses `ResizeObserver` on rendered items to track actual heights for accurate positioning.
- Maintains a height cache map for measured items.
- Returns: `{ virtualItems, totalHeight, scrollToIndex }`.

### useAutoScroll Hook
- Input: container ref, item count.
- Tracks whether user is "at bottom" (within 100px threshold).
- On new item count increase: if at bottom, scroll to bottom. If not, show a "New activity" floating badge.
- Clicking the badge scrolls to bottom and re-enables auto-scroll.
- Returns: `{ isAtBottom, scrollToBottom, showNewActivityBadge }`.

## Tool Type Icon Map

| Tool Type | Icon | Description |
|---|---|---|
| file_read | doc-text | Read file contents |
| file_write | doc-edit | Write/create file |
| file_edit | pencil | Edit file (surgical) |
| shell_exec | terminal | Shell command execution |
| search | magnifying-glass | Code/file search |
| browser | globe | Browser/web operation |
| context | layers | Context injection |
| unknown | circle-question | Unrecognized tool type |

Icons will be inline SVGs (no icon library dependency) at 16px size within 32px row height.

## Dependency Plan

- Existing dependencies used: React, CSS custom properties, `activity-diff.ts` view model builders, `view-models.ts` types.
- New dependencies proposed:
  - **Option A (preferred)**: No new dependencies. Custom `useVirtualScroll` hook using `IntersectionObserver` + `ResizeObserver`.
  - **Option B (fallback)**: `@tanstack/react-virtual` (~7KB gzipped) if custom virtualizer exceeds time budget.
- Risk and mitigation:
  - Risk: Custom virtualizer has edge cases with variable-height items during rapid updates.
    Mitigation: Conservative overscan buffer (3 items). Height cache invalidation on expand/collapse. Fallback to Option B if more than 1 hour spent on virtualizer bugs.
  - Risk: Auto-scroll interferes with virtual scrolling position tracking.
    Mitigation: Auto-scroll sets `scrollTop` on the container, which the virtualizer observes naturally.

## Test Strategy

- Unit tests:
  - `ActivityFeed`: Renders turns from TurnViewModel array. Shows empty state when turns is empty. Passes active turn/tool call IDs to children.
  - `TurnCard`: Renders expanded with tool calls visible. Renders collapsed with summary row. Toggle fires callback.
  - `ToolCallRow`: Renders glance view (icon, status dot, one-liner). Renders expanded view with request/result. Active state applies accent border and pulse.
  - `useAutoScroll`: Detects at-bottom state. Scrolls to bottom on new items when at bottom. Does not scroll when user has scrolled up.
- Integration tests:
  - Feed renders 50+ turns without errors.
  - Clicking a tool call expands it and shows detail.
  - New turn arrival auto-collapses previous turn.
  - Currently-running tool has elevated styling.
- Performance tests:
  - Render 200 turns and measure scroll FPS (target: 60fps).
  - Measure DOM node count with virtual scrolling (target: under 50 visible items).
- Skill-based validation:
  - Run `arrange` skill for spatial layout quality.
  - Run `bolder` skill for visual hierarchy and prominence.
  - Run `critique` skill for overall design quality.

## Rollout and Risk Mitigation

- Rollback strategy: ActivityFeed is a new component. ShipyardWorkbench's old flat list rendering can be restored by removing the ActivityFeed import.
- Observability checks: Turn count and active tool call ID are visible in the component's data attributes for debugging.
- Maintenance note: New tool types should be added to the icon map. New activity grouping patterns should be implemented in `activity-diff.ts` (data layer), not in the rendering components.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
