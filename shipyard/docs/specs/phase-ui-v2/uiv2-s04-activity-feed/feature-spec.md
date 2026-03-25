# Feature Spec

## Metadata
- Story ID: UIV2-S04
- Story Title: Activity Feed Reimagination
- Author: Claude
- Date: 2026-03-24
- Estimated effort: 2–3 hours
- Related pack: Phase UI v2 — Complete UI Reimagination
- Depends on: UIV2-S02 (Shell and Navigation Chrome)
- Skills: arrange, animate, bolder, critique

## Problem Statement

The current activity feed in `ShipyardWorkbench.tsx` renders all tool calls as a flat scrollable list. Each tool call is rendered as a `SurfaceCard` with a Badge for status. This works for small runs (5–10 tool calls) but breaks down under real usage:

1. **Flat list, no turn grouping.** When an agent performs a multi-tool turn (e.g., read file, edit file, run test), all tool calls appear as siblings with no visual boundary between turns. The developer cannot quickly identify which tools belong to which instruction.
2. **No timeline feel.** There are no timestamps, no visual timeline connector, and no sense of chronological flow between turns.
3. **Critical information buried.** The most important information — what changed, did it succeed — requires reading into each card. There is no glance-level summary with icon + status color + one-line description.
4. **No virtual scrolling.** Long runs (50+ tool calls) render all items into the DOM, causing scroll jank and high memory usage.
5. **Active tool not prominent.** The currently-running tool call looks the same as completed ones. The developer has to scan for the "running" badge to find it.
6. **No collapsed turn view.** There is no way to collapse a completed turn to a single-line summary showing success/error count, freeing visual space for the current turn.

The data structures are already well-designed: `TurnViewModel[]` from `view-models.ts` groups tool calls by turn, and `activity-diff.ts` provides `buildActivityBlocks()`, `selectVisibleTurns()`, and `ActivityScope` for filtering. The rendering just needs to catch up.

## Story Objectives

- Objective 1: Extract an `ActivityFeed.tsx` component and a `TurnCard.tsx` sub-component from ShipyardWorkbench.
- Objective 2: Build a timeline-style layout with vertical connector lines between turns and clear turn boundaries.
- Objective 3: Show each tool call at glance level: icon (by tool type) + status color dot + one-line summary.
- Objective 4: Implement expand/collapse on tool calls to show full request, result, and error detail.
- Objective 5: Implement virtual scrolling for runs with 50+ tool calls using a lightweight virtualizer.
- Objective 6: Style the currently-running tool call with elevated visual prominence (pulsing indicator, elevated card, accent border).
- Objective 7: Implement collapsed turn view showing turn summary with success/error count.

## User Stories

- As a developer watching a long agent run, I want to see which turn I am in and what the current tool is doing without scanning the full list.
- As a developer reviewing a completed run, I want to collapse old turns to their summary so I can focus on the latest activity.
- As a developer debugging a failure, I want to expand a failed tool call to see the full error detail without leaving the activity feed.
- As a developer on a run with 100+ tool calls, I want smooth scrolling without performance degradation.

## Acceptance Criteria

- [ ] AC-1: `ActivityFeed.tsx` exists as a self-contained component. `TurnCard.tsx` exists as a sub-component for individual turn rendering.
- [ ] AC-2: Turns are visually grouped with clear boundaries: turn number, timestamp, instruction preview text, and a vertical timeline connector between turns.
- [ ] AC-3: Each tool call within a turn shows at glance level: tool-type icon (file, edit, shell, search, browser, etc.), status color dot (green success, red error, amber running, gray pending), and a one-line summary (e.g., "Read src/App.tsx", "Edit tokens.css +12 -3", "Shell: pnpm test").
- [ ] AC-4: Clicking a tool call expands it to show: full request parameters, full result/output (truncated at 50 lines with "show more"), error message and stack trace if failed.
- [ ] AC-5: The currently-running tool call has: pulsing StatusDot, accent-strong left border, elevated shadow (elevation-2), and auto-scrolls into view.
- [ ] AC-6: Virtual scrolling activates when the feed contains 30+ items. Items outside the viewport are not rendered. Scroll position is preserved on new items arriving.
- [ ] AC-7: Each completed turn can be collapsed to a single-line summary: turn number, instruction snippet (first 60 chars), and badges showing tool count, success count, and error count.
- [ ] AC-8: Collapsed turns auto-collapse when a new turn starts (progressive disclosure: latest turn expanded, older turns collapsed).
- [ ] AC-9: The activity feed uses component tokens from S01 and mounts inside ShipyardShell's left sidebar or main area (configurable via S02 shell).
- [ ] AC-10: `pnpm --dir shipyard build` and `pnpm --dir shipyard typecheck` pass.

## Edge Cases

- Empty state: no turns yet. Show a placeholder message: "Waiting for first instruction..." with a subtle animation.
- Turn with 0 tool calls (instruction sent but agent has not started): show turn header with "Thinking..." placeholder.
- Tool call with very long output (e.g., 1000-line file read): truncate to 50 lines with expandable "show more" that loads additional lines in 50-line increments.
- Rapid tool calls (10+ per second during a batch operation): virtual scrolling must batch DOM updates to avoid frame drops. Use `requestAnimationFrame` batching.
- Scroll position management: when auto-scroll is active (user has not scrolled up), new items scroll into view. When user has scrolled up (reviewing history), auto-scroll is disabled until user scrolls back to bottom.
- Tool call with no result yet (in-flight): show a skeleton/placeholder for the result area.

## Non-Functional Requirements

- Performance: Feed must render 200+ tool calls without frame drops during scroll. Virtual scrolling must maintain 60fps. Initial render of 50 items must complete in under 100ms.
- Accessibility: Tool call expand/collapse must use `aria-expanded`. Turn boundaries must be navigable via keyboard (Tab between turns, Enter to expand). Status colors must have text/icon alternatives (not color-only).
- Memory: Virtual scrolling must keep DOM node count under 50 regardless of total item count.

## UI Requirements

- Timeline connector: 2px vertical line in border-subtle color, positioned left of turn cards, connecting turn headers.
- Turn header: display font for turn number, mono font for timestamp, body font for instruction preview. Accent-soft background on active turn.
- Tool call glance: 32px row height, icon at 16px, status dot at 8px, one-liner in body font, mono font for file paths.
- Expanded tool call: surface-inset background, mono font for request/result content, pre-formatted with horizontal scroll for long lines.
- Currently-running: left border 3px accent-strong, shadow elevation-2, StatusDot with pulse animation from motion tokens.
- Collapsed turn: single-line, 36px height, subtle background, badges right-aligned.

## Out of Scope

- Diff rendering within tool calls (covered in S05).
- Filtering or searching within the activity feed.
- Exporting or copying activity feed content.
- Tool call retry/re-run from the feed.

## Done Definition

- ActivityFeed.tsx and TurnCard.tsx are clean, self-contained components.
- Timeline layout with turn grouping is visually clear.
- Glance view, expand/collapse, and virtual scrolling work correctly.
- Currently-running tool is visually prominent.
- `arrange`, `bolder`, and `critique` skills report satisfactory quality.
- Build, typecheck, and tests pass.
