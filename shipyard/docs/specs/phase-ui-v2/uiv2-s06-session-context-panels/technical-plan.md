# Technical Plan

## Metadata
- Story ID: UIV2-S06
- Story Title: Session and Context Panels
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — extract session and context rendering
  - `shipyard/ui/src/SessionPanel.tsx` — new component for session display
  - `shipyard/ui/src/ContextPanel.tsx` — new component for context management
  - `shipyard/ui/src/context-ui.ts` — consumed as data source for context history
  - `shipyard/ui/src/view-models.ts` — may need `SessionSummary` and `ContextTimelineEntry` view models
  - `shipyard/ui/src/workbench-state.ts` — consumed for session state (read-only)
  - `shipyard/ui/src/styles.css` — panel-specific styles using design tokens

- Public interfaces/contracts:
  - `SessionPanel` props: `{ session: SessionState; onToggleSection?: (sectionId: string) => void }`
  - `ContextPanel` props: `{ history: ContextEntry[]; queued: ContextEntry[]; onSubmit: (content: string) => void }`
  - `SessionSummary`: `{ status: 'connected' | 'disconnected' | 'error'; summaryLine: string; turnCurrent: number; turnTotal: number | null }`
  - `ContextTimelineEntry`: `{ id: string; turnId: string; timestamp: string; preview: string; fullContent: string }`

- Data flow summary:
  1. `ShipyardWorkbench` derives `SessionSummary` from `workbench-state` and passes it to `SessionPanel`.
  2. `SessionPanel` renders the status dot + summary at top, collapsible metadata sections below.
  3. `ShipyardWorkbench` passes context data from `context-ui.ts` to `ContextPanel`.
  4. `ContextPanel` renders the 3-zone layout: input, queued preview, history timeline.
  5. Collapsible sections reuse the accordion pattern from S02 (CSS `<details>`/`<summary>` or equivalent).

## Implementation Notes

### SessionPanel Component
- **Status dot**: 8px `border-radius: 50%` element. Colors:
  - Connected: `--color-status-success` (green)
  - Disconnected: `--color-status-warning` (amber)
  - Error: `--color-status-error` (red)
  - Dot has `aria-label="Session status: connected"` (etc.)
- **Summary line**: Single `<p>` with status text, e.g., "Connected — Turn 7 of 12" or "Disconnected — last seen 2m ago".
- **Collapsible sections**:
  - "Project Info" — path, signals, agent model. Shows item count in header: "Project Info (3 signals)".
  - "Timing" — start time, elapsed, last activity.
  - "File Paths" — target dir, output dir, config paths. Count in header.
  - Use `<details>` with `<summary>` for native keyboard and screen reader support. Style with design tokens.

### ContextPanel Component
- **Zone 1 — Input area**: Always visible at the top. `<textarea>` with submit button. Sticky if panel scrolls.
- **Zone 2 — Queued preview**: Below input. Shows queued context entries as chips/tags with content preview. Empty state: "No context queued for next turn."
- **Zone 3 — History timeline**: Scrollable list of `ContextTimelineEntry` items.
  - Each entry: `<time>` element + turn badge + first-line preview (truncated to ~60 chars).
  - Click expands to show full content in a collapsible region.
  - Alternating background tints: `--color-surface-primary` and `--color-surface-secondary`.

### Visual Separation
- Zones separated by subtle `1px` borders using `--color-border-subtle`.
- Zone headers in `--font-sans` at `--font-size-sm`, uppercase, letter-spaced, muted color.

## Test Strategy

- Unit: Verify `SessionPanel` renders correct status dot color and summary text for each state.
- Unit: Verify collapsible sections toggle visibility and update `aria-expanded`.
- Unit: Verify `ContextPanel` renders all three zones and handles empty states.
- Unit: Verify history timeline entries expand on click to show full content.
- Integration: Verify context submission calls `onSubmit` with textarea content and clears input.
- Accessibility: Verify keyboard navigation through collapsible sections and timeline entries.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
