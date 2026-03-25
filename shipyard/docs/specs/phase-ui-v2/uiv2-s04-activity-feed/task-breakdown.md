# Task Breakdown

## Story
- Story ID: UIV2-S04
- Story Title: Activity Feed Reimagination

## Execution Notes
- Extract the existing flat list rendering first, then rebuild as timeline layout.
- Build the tool call icon map early — it is needed by both TurnCard and ToolCallRow.
- Virtual scrolling should be the last feature added, after the layout and interactions are correct. It is easier to debug layout issues without virtualization.
- Test with realistic data: use the existing `buildActivityBlocks()` and `selectVisibleTurns()` from `activity-diff.ts` to generate test data from mock turn sequences.
- The auto-scroll hook should be tested with a mock scrollable container before integration.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extract `ActivityFeed.tsx` and `TurnCard.tsx` from `ShipyardWorkbench.tsx`. Move the existing turn/tool-call rendering logic into the new components. Wire props from ShipyardWorkbench/App. Verify existing behavior is preserved (flat list, same data, same rendering). | none | no | `pnpm --dir shipyard build`, existing activity list renders |
| T002 | Build the timeline layout. Add vertical connector line (2px border-subtle) along the left edge of the feed. Position turn headers at junction points. Add turn number, timestamp, and instruction preview to TurnCard header. Style turn boundaries with spacing from S01 tokens. | blocked-by:T001 | no | `pnpm --dir shipyard build`, visual check |
| T003 | Implement `ToolCallRow.tsx` glance view. Create tool-type icon map (inline SVGs for file_read, file_write, file_edit, shell_exec, search, browser, context, unknown). Render each tool call as: icon (16px) + StatusDot (per status) + one-line summary text. Target 32px row height. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, icons render correctly |
| T004 | Implement expand/collapse for tool calls. Clicking a ToolCallRow toggles between glance view and detail view. Detail view shows: full request parameters (pre-formatted, mono font), full result/output (truncated at 50 lines with "show more" button), error message with stack trace if failed. Use `aria-expanded` for accessibility. | blocked-by:T003 | no | `pnpm --dir shipyard build`, expand/collapse works |
| T005 | Style the currently-running tool call. Apply: pulsing StatusDot (from primitives), 3px accent-strong left border, elevation-2 shadow, accent-soft background tint. Running tool call should auto-scroll into view (uses auto-scroll hook from T007). | blocked-by:T003 | yes | `pnpm --dir shipyard build`, running tool visually prominent |
| T006 | Implement collapsed turn view. Each completed turn can collapse to a single-line summary: turn number, instruction snippet (first 60 chars), and badges showing counts (N tools, N success, N errors). Add auto-collapse: when a new turn starts, previous turns collapse automatically. Click to re-expand. | blocked-by:T002,T003 | no | `pnpm --dir shipyard build`, collapse/expand works |
| T007 | Build `useAutoScroll` hook. Track "at bottom" state (within 100px threshold). On new item arrival: scroll to bottom if at bottom, show "New activity" floating badge if not. Badge click scrolls to bottom. Write unit tests. | none | yes | Unit tests pass, `pnpm --dir shipyard test` |
| T008 | Implement virtual scrolling. Build `useVirtualScroll` hook (or integrate `@tanstack/react-virtual` as fallback). Render only visible turns plus 3-item overscan buffer. Track actual heights via ResizeObserver. Handle expand/collapse height changes. Activate when feed has 30+ items. | blocked-by:T001,T007 | no | Scroll 200 items without frame drops, DOM node count under 50 |
| T009 | Implement empty state. When turns array is empty, show a centered placeholder: "Waiting for first instruction..." with a subtle pulse animation on an icon. When a turn has 0 tool calls, show "Thinking..." placeholder within the turn card. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, empty state renders |
| T010 | Run `arrange`, `bolder`, and `critique` skills on the completed activity feed. Address any high-severity findings (spatial rhythm, visual hierarchy, prominence of active state). | blocked-by:T002,T003,T004,T005,T006,T008,T009 | no | Skill output review |

## TDD Mapping

- T001 tests:
  - [ ] ActivityFeed renders a list of TurnCard components
  - [ ] ActivityFeed shows empty state when turns is empty
  - [ ] TurnCard renders tool calls from TurnViewModel
- T002 tests:
  - [ ] Timeline connector line renders between turns
  - [ ] Turn header shows turn number, timestamp, instruction preview
  - [ ] Turn boundaries have correct spacing
- T003 tests:
  - [ ] ToolCallRow renders correct icon for each tool type
  - [ ] StatusDot color matches tool call status
  - [ ] One-line summary shows tool name and key parameter
  - [ ] Row height is 32px at glance level
- T004 tests:
  - [ ] Clicking ToolCallRow toggles expanded state
  - [ ] Expanded view shows request, result, and error sections
  - [ ] Long output truncated at 50 lines with "show more"
  - [ ] `aria-expanded` attribute toggles correctly
- T005 tests:
  - [ ] Running tool has pulse animation on StatusDot
  - [ ] Running tool has accent-strong left border
  - [ ] Running tool has elevation-2 shadow
- T006 tests:
  - [ ] Collapsed turn shows single-line summary with badges
  - [ ] Badge shows correct tool/success/error counts
  - [ ] New turn arrival collapses previous turns
  - [ ] Click on collapsed turn re-expands it
- T007 tests:
  - [ ] Hook detects at-bottom state correctly
  - [ ] New items trigger scroll-to-bottom when at bottom
  - [ ] New items show badge when user has scrolled up
  - [ ] Badge click scrolls to bottom
- T008 tests:
  - [ ] Virtual scrolling renders only visible items plus overscan
  - [ ] Scroll position stable during new item arrival
  - [ ] Expand/collapse updates virtual item heights
  - [ ] 200-item feed scrolls at 60fps
- T009 tests:
  - [ ] Empty feed shows placeholder message
  - [ ] Turn with 0 tool calls shows "Thinking..." placeholder

## Completion Criteria

- [ ] All acceptance criteria from feature-spec.md verified
- [ ] ActivityFeed.tsx, TurnCard.tsx, and ToolCallRow.tsx are self-contained
- [ ] Timeline layout with turn grouping is visually clear
- [ ] Glance view, expand/collapse, and virtual scrolling work correctly
- [ ] Currently-running tool is visually prominent and auto-scrolls into view
- [ ] Performance: 200 turns scroll at 60fps with under 50 DOM nodes
- [ ] Build, typecheck, and tests pass
- [ ] Skills report satisfactory quality
