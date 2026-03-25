# UIV3-S05: Activity Feed — Design Brief

Story: UIV3-S05
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

The activity feed is the system's memory — a chronological record of instructions, tool executions, and outcomes. It should feel like a flight recorder or engineering log: dense but scannable, structured but not rigid, informative without overwhelming. The visual language draws from timeline interfaces (GitHub activity, Linear history, CI/CD pipelines) with a focus on progressive disclosure.

Key mood words translated to implementation:
- **Chronological** — clear temporal flow with visual connectors, most recent at top
- **Scannable** — glance rows show tool name + status at a glance, details expand on demand
- **Structured** — consistent turn card format, repeating visual rhythm, predictable information hierarchy
- **Honest** — status badges use semantic colors truthfully, errors are visible not hidden, duration/timing shown

The feed must scale gracefully from empty state (first use) to hundreds of turns (long session), maintaining performance and usability at both extremes.

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `ActivityFeedShell` | `src/activity/ActivityFeedShell.tsx` | Container with scope toggle and turn list |
| `TurnCard` | `src/activity/TurnCard.tsx` | Individual turn with header, summary, expandable details |
| `TurnTimeline` | `src/activity/TurnTimeline.tsx` | Vertical connector line + turn nodes |
| `GlanceRow` | `src/activity/GlanceRow.tsx` | Collapsed tool call: icon + name + status badge |
| `ToolDetail` | `src/activity/ToolDetail.tsx` | Expanded tool call details (args, output, timing) |
| `ScopeToggle` | `src/activity/ScopeToggle.tsx` | Latest/All segmented control |
| `EmptyState` | `src/activity/EmptyState.tsx` | First-use empty state with guidance |

### Modified Components

| Component | Change |
|---|---|
| `ActivityFeed.tsx` | Refactor to compose new sub-components; simplify to orchestrator |
| `primitives.tsx` | No changes — reuses existing Badge, StatusDot, SurfaceCard |

### CSS Files

| File | Purpose |
|---|---|
| `src/activity/activity.css` | All activity feed styles (consolidates from styles.css) |

---

## 3. Token Selections

### From S01 Primitives (used directly)

- `--surface-card` — turn card background
- `--surface-card-strong` — turn card hover/active
- `--surface-inset` — glance row expanded detail background
- `--surface-muted` — timeline connector line
- `--border-subtle` — turn card border, glance row separator
- `--border-medium` — turn card border on hover
- `--text-strong` — turn instruction heading
- `--text-default` — turn summary, tool names
- `--text-muted` — timestamps, secondary metadata
- `--text-faint` — turn card kickers, micro labels
- `--font-body` — headings, body text
- `--font-mono` — tool names, durations, file paths
- `--space-2` through `--space-6` — internal spacing
- `--radius-lg` — turn card corners
- `--radius-md` — glance row, detail block corners
- `--elevation-2` — turn card shadow
- `--elevation-1` — glance row subtle lift on hover

### From S01 Motion

- `--duration-fast` (100ms) — glance row expand/collapse
- `--duration-normal` (200ms) — turn card entrance
- `--duration-slow` (350ms) — timeline connector draw
- `--ease-out` — all transitions
- `--stagger-delay` (75ms) — staggered turn entrance

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--timeline-width` | `2px` | Vertical connector line thickness |
| `--timeline-color` | `var(--border-subtle)` | Connector line color |
| `--timeline-node-size` | `10px` | Turn node dot diameter |
| `--timeline-gutter` | `var(--space-6)` | Space from timeline to turn card |
| `--turn-card-gap` | `var(--space-4)` | Vertical gap between turn cards |
| `--glance-row-h` | `44px` | Collapsed glance row height |
| `--glance-expand-max-h` | `320px` | Maximum expanded detail height |

---

## 4. Layout Decisions

### Feed Shell Structure

```
+------------------------------------------------------------------+
| [Section Header: "Activity"]           [Scope: Latest | All]     |
+------------------------------------------------------------------+
| Timeline     Turn Cards                                           |
| │            +------------------------------------------------+   |
| ●────────────│ Turn N                                         │   |
| │            │ [Instruction heading]                          │   |
| │            │ [Status badge] [Timestamp]                     │   |
| │            │                                                 │   |
| │            │ [Summary paragraph]                            │   |
| │            │                                                 │   |
| │            │ ▸ Tool timeline (N grouped steps)              │   |
| │            │   [GlanceRow] [GlanceRow] ...                  │   |
| │            +------------------------------------------------+   |
| │                                                                 |
| ●────────────[Turn N-1 card...]                                   |
| │                                                                 |
+------------------------------------------------------------------+
```

### Timeline Layout

- Vertical line runs along left edge of feed, inside the panel padding
- Line is continuous from first turn to last visible turn
- Each turn has a node (filled circle) positioned at the turn card's top edge
- Node connects to turn card via horizontal connector (8px long)
- Timeline width: 2px, color: `--timeline-color` (subtle)
- Node diameter: 10px, filled with status color

### Turn Card Structure

```
+----------------------------------------------------------+
| [Kicker: "Turn N"]                                        |
| [Instruction heading - up to 2 lines]                     |
| [Status badge] [Started at timestamp]                     |
+----------------------------------------------------------+
| [Summary paragraph - up to 3 lines]                       |
+----------------------------------------------------------+
| [Context strip - if context was injected]                 |
+----------------------------------------------------------+
| [Agent copy - latest message]                             |
+----------------------------------------------------------+
| ▸ Tool timeline (N grouped steps)                         |
|   ┌──────────────────────────────────────────────────┐    |
|   │ [StatusDot] read-file src/app.ts          [done] │    |
|   │ [StatusDot] edit-block ...                [done] │    |
|   │ [StatusDot] run-command pnpm test      [running] │    |
|   └──────────────────────────────────────────────────┘    |
+----------------------------------------------------------+
```

### Glance Row Layout

- Fixed height: 44px (`--glance-row-h`)
- Flex row: `[StatusDot 10px] [gap 8px] [Tool name flex-1] [Status badge]`
- Tool name truncates with ellipsis if needed
- Entire row is clickable to expand

### Expanded Detail Layout (inside GlanceRow)

When expanded, the detail area slides down below the glance row:

```
┌─────────────────────────────────────────────────────────┐
│ [Glance row - now with ▾ indicator]                     │
├─────────────────────────────────────────────────────────┤
│ [Detail area - inset background]                        │
│                                                         │
│  Arguments:    value                                    │
│  Output:       [code block or truncated text]          │
│  Duration:     234ms                                    │
│  Timestamp:    12:34:56.789                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Scope Toggle Position

- Positioned in section header's `meta` slot (right side)
- Segmented control style: two buttons with shared border
- Active button has `--surface-card-strong` background

---

## 5. Typography Decisions

### Section Header

- Kicker: `--type-kicker` (xs, uppercase, bold, wide tracking)
- Title: `--type-heading-card` (md, semibold)

### Turn Card

- Turn label (kicker): `--text-xs`, `--weight-medium`, `--text-faint`
- Instruction heading: `--text-base`, `--weight-semibold`, `--text-strong`, max 2 lines with ellipsis
- Status badge: standard badge typography from primitives
- Timestamp: `--text-xs`, `--font-mono`, `--text-muted`
- Summary paragraph: `--text-sm`, `--weight-normal`, `--text-default`, max 3 lines with ellipsis
- Context strip labels: `--text-xs`, `--font-mono`, `--text-muted`
- Agent copy: `--text-sm`, `--weight-normal`, `--text-default`

### Glance Row

- Tool name: `--text-sm`, `--font-mono`, `--weight-medium`, `--text-default`
- Status label: `--text-xs`, `--weight-semibold` (inside badge)

### Expanded Detail

- Label (dt): `--text-xs`, `--weight-medium`, `--text-muted`
- Value (dd): `--text-sm`, `--font-mono`, `--text-default`
- Code blocks: `--text-xs`, `--font-mono`, `--text-default`, `--surface-inset` background
- Duration: `--text-xs`, `--font-mono`, `--text-muted`

### Empty State

- Heading: `--text-md`, `--weight-semibold`, `--text-strong`
- Body: `--text-sm`, `--weight-normal`, `--text-muted`

---

## 6. Color Decisions

### Timeline

- Connector line: `--timeline-color` (`--border-subtle`)
- Node fill: matches turn status color
  - `idle/pending`: `--text-muted`
  - `working`: `--accent-strong`
  - `success`: `--success-strong`
  - `error`: `--danger-strong`

### Turn Card

| State | Border | Background |
|---|---|---|
| Default | `--border-subtle` | `--surface-card` |
| Hover | `--border-medium` | `--surface-card-strong` |
| Accent (working) | `--accent-border` | `--surface-card` |
| Success | `--border-success` | `--surface-card` |
| Danger (error) | `--border-danger` | `--surface-card` |

### Glance Row

| State | Border | Background |
|---|---|---|
| Collapsed | `--border-subtle` bottom | transparent |
| Collapsed hover | `--border-subtle` bottom | `--surface-muted` |
| Expanded | `--border-subtle` all | `--surface-muted` |
| Running | `--accent-border` left (2px accent line) | transparent |

### Status Badges (reuse from primitives)

- `neutral`: pending, queued
- `accent`: running, working
- `success`: done, passed
- `danger`: error, failed
- `warning`: timeout, partial

### Scope Toggle

- Inactive button: `--surface-muted` background, `--text-muted` text
- Active button: `--surface-card-strong` background, `--text-strong` text
- Border: `--border-subtle` around entire control

---

## 7. Motion Plan

### Turn Card Entrance

- Animation: `translateY(8px) opacity(0)` → `translateY(0) opacity(1)`
- Duration: `--duration-normal` (200ms)
- Easing: `--ease-out`
- Stagger: each turn delayed by `--stagger-delay` (75ms) from previous
- Trigger: on initial render and when new turn is added

### Timeline Connector Draw

- Animation: line grows downward from previous node to new node
- Duration: `--duration-slow` (350ms)
- Easing: `--ease-out`
- Implementation: CSS `scaleY` transform on a pseudo-element, `transform-origin: top`

### Timeline Node Pulse

- For `working` status: subtle pulse animation
- Animation: `opacity 0.8 → 1 → 0.8`, `scale 1 → 1.1 → 1`
- Duration: 1200ms, infinite loop
- Easing: `ease-in-out`

### Glance Row Expand/Collapse

- Animation: `max-height: 0` → `max-height: var(--glance-expand-max-h)`
- Duration: `--duration-fast` (100ms)
- Easing: `--ease-out`
- Chevron indicator rotates 90 degrees on expand

### Scope Toggle Switch

- Animation: background color transition
- Duration: `--duration-fast` (100ms)
- Easing: `--ease-out`

### New Activity Indicator

When new tool call arrives while viewing:
- Brief highlight flash on the glance row
- Animation: `background-color` flash to `--accent-soft` then back
- Duration: 400ms total (200ms in, 200ms out)

### Scroll to New Turn

- When a new turn is added and feed is scrolled, do not auto-scroll
- Instead, show a "New activity" indicator at top that, when clicked, smooth scrolls to latest
- Scroll animation: native `scrollIntoView({ behavior: 'smooth' })`

### Reduced Motion

All animations collapse to instant (0ms). Timeline draws without animation. Pulse is disabled (static node). Expand/collapse is instant.

---

## 8. Copy Direction

### Section Header

- Kicker: "Activity"
- Title: "Chat and execution log"

### Scope Toggle Labels

- "Latest run" — shows only the current/most recent run
- "All runs" — shows full session history

### Turn Card Labels

- Turn label: "Turn {N}" where N is 1-indexed
- Timestamps: relative when <24h ("2 min ago"), absolute when older ("Mar 24, 14:32")

### Glance Row Status Labels

| Status | Label |
|---|---|
| `pending` | "pending" |
| `running` | "running" |
| `done` | "done" |
| `error` | "error" |
| `skipped` | "skipped" |
| `timeout` | "timeout" |

### Tool Timeline Summary

- Collapsed: "Tool timeline ({N} grouped steps)"
- Expanded: same, with chevron rotated

### Empty State

- Heading: "Ready for the first instruction"
- Body: "Send an instruction in the composer above. Activity will appear here as the agent works."

### Hidden Turns Indicator

When scope is "latest" and older turns exist:
> "{N} older turns hidden"

This is a warning badge in the toolbar, not a link.

### Accessibility Labels

- Timeline: `aria-label="Turn timeline"`
- Each turn card: `aria-label="Turn {N}: {instruction truncated}"`
- Glance row button: `aria-label="{tool name}, {status}"`
- Scope toggle: `role="group"`, `aria-label="Activity scope"`
- Each scope button: `aria-pressed="true|false"`

---

## 9. Accessibility Requirements

### Keyboard Navigation

| Key | Action |
|---|---|
| `Tab` | Move focus through scope toggle, then turn cards, then glance rows |
| `Enter` / `Space` | Expand/collapse glance row when focused |
| `Arrow Up/Down` | Move between glance rows within a turn (when focus is on glance row) |
| `Escape` | Collapse all expanded glance rows in current turn |

### Focus Order

1. Scope toggle buttons (left to right)
2. First turn card
3. Within turn card: tool timeline `<details>` summary
4. Within tool timeline: each glance row (top to bottom)
5. Next turn card
6. ...repeat

### ARIA Roles and States

| Element | Role / Attribute |
|---|---|
| Feed container | `role="feed"`, `aria-label="Activity feed"` |
| Turn list | `role="list"` (via `<ol>`) |
| Turn card | `role="article"`, `aria-posinset="{n}"`, `aria-setsize="{total}"` |
| Tool timeline | `<details>` native semantics |
| Glance row list | `role="list"` (via `<ol>`) |
| Glance row | `role="listitem"` |
| Glance row trigger | `<button>` with `aria-expanded` |
| Scope toggle | `role="group"` with toggle buttons using `aria-pressed` |

### Live Regions

- New turn added: announce via `aria-live="polite"` region
  - Announcement: "Turn {N} started: {instruction truncated}"
- Turn completed: announce status change
  - Announcement: "Turn {N} {status}" (e.g., "Turn 3 completed successfully")
- New tool call in current turn: no announcement (too noisy)

### Contrast Requirements

- All text combinations meet WCAG AA 4.5:1 minimum
- Timeline connector at 10% opacity is decorative (not sole indicator)
- Status is always communicated via text label + color

### Focus Indicators

- Scope toggle buttons: `--focus-ring` on focus-visible
- Glance rows: `--focus-ring` on focus-visible
- Details summary: `--focus-ring` on focus-visible

---

## 10. Anti-Patterns to Avoid

1. **No auto-scroll hijacking.** Never scroll the user away from what they're reading. Use a "jump to latest" affordance instead.

2. **No expand-all by default.** All tool details are collapsed by default except for the currently running one.

3. **No virtual scrolling until needed.** For < 100 turns, render all. Introduce virtualization only if performance degrades (future story).

4. **No status-only indicators.** Every status must have both color AND text label.

5. **No truncation without ellipsis.** Any truncated text must show "..." and have `title` or tooltip with full text.

6. **No real-time timestamp updates.** Relative timestamps ("2 min ago") are calculated once on render. Update only on re-render.

7. **No horizontal scroll in feed.** All content fits within the panel width. Long values wrap or truncate.

8. **No nested expansion.** Glance rows expand to one level only. No nested accordions within detail.

9. **No loading spinners in timeline.** Use the pulsing node animation for running state, not a spinner.

10. **No unmounting during collapse animation.** Content fades/shrinks but remains in DOM until animation completes.

---

## 11. Responsive Breakpoint Behavior

### 1440px (Desktop Large)

- Feed panel at full width within right sidebar (280px)
- Turn cards have full padding (`--space-5`)
- All columns in tool detail visible

### 1024px (Tablet Large)

- Right sidebar may be collapsed by default (see S02)
- When visible, feed takes full sidebar width
- No change to internal layout

### 768px (Tablet)

- Feed moves to slide-over panel or main content area
- Turn cards reduce padding to `--space-4`
- Timestamps show abbreviated format ("14:32" not "March 24, 14:32")
- Tool detail uses stacked layout instead of grid

### 375px (Mobile)

- Feed is full-screen when accessed (separate route or modal)
- Turn cards at minimum padding `--space-3`
- Scope toggle buttons stack vertically
- Glance rows show only tool name + status dot (no badge text)
- Expanded detail uses full width, single column

### Breakpoint Implementation

```css
@media (max-width: 768px) {
  .turn-card {
    padding: var(--space-4);
  }

  .turn-started-at {
    font-size: var(--text-2xs);
  }

  .tool-detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 375px) {
  .turn-card {
    padding: var(--space-3);
  }

  .scope-toggle {
    flex-direction: column;
  }

  .glance-row .ui-badge {
    display: none;
  }

  .glance-row .status-dot {
    flex-shrink: 0;
  }
}
```

---

## Critique Checklist

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy | 8/10 | Clear turn → tool → detail progression |
| Information architecture | 9/10 | Timeline metaphor matches mental model |
| Emotional resonance | 7/10 | Professional but could be warmer |
| Discoverability | 8/10 | Expandable details are clearly afforded |
| Composition | 8/10 | Clean timeline layout, consistent rhythm |
| Typography | 8/10 | Good mono/body distinction, appropriate sizes |
| Color | 9/10 | Semantic status colors consistent throughout |
| States | 9/10 | All states covered, good running state feedback |
| Microcopy | 8/10 | Terse labels, clear status language |

Average: 8.2/10 — Exceeds quality bar.

---

## Implementation Notes

1. **Timeline DOM structure**: Use CSS Grid with the timeline in a pseudo-element or dedicated column. The line itself is a `::before` on the list container with `height: 100%`.

2. **Node positioning**: Each node is positioned via CSS using the turn card's position. Use `position: absolute` relative to the timeline column.

3. **Expand animation**: Use `grid-template-rows: 0fr` → `1fr` technique for smooth height animation without JavaScript measurement. Wrap detail content in a `min-height: 0` container.

4. **Scope persistence**: Store selected scope in React state. Do not persist to localStorage — scope should reset on page refresh.

5. **Turn virtualization boundary**: Current implementation renders all turns. If session history exceeds 50 turns, consider virtualization. This is out of scope for S05 but should be architected to allow.

6. **Stagger calculation**: Entrance stagger should only apply to turns visible on initial render. Turns added after mount animate individually without stagger.

7. **Running state detection**: A tool is "running" if it has a `startedAt` but no `completedAt`. This comes from the view model, not recalculated in UI.

8. **Timestamp formatting**: Use `Intl.RelativeTimeFormat` for relative times. Calculate once on render, not reactively.
