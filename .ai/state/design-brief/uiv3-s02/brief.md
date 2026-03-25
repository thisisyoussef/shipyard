# UIV3-S02: Shell Layout — Design Brief

Story: UIV3-S02
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

The shell is the spatial skeleton — it should be invisible when working and obvious when navigating. Think of it as a darkroom workbench: the structure recedes, the content glows. The shell itself uses the deepest surface tones (`--surface-canvas`) with the grid texture providing subtle spatial orientation. Panel boundaries are defined by elevation and border, not by heavy chrome.

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `ShipyardShell` | `src/shell/ShipyardShell.tsx` | Root CSS Grid layout with named areas |
| `ShellSidebar` | `src/shell/ShellSidebar.tsx` | Collapsible sidebar wrapper (left and right variants) |
| `ShellFooter` | `src/shell/ShellFooter.tsx` | Status bar footer |
| `IconRail` | `src/shell/IconRail.tsx` | 48px collapsed sidebar with icon buttons |

### Modified Components

| Component | Change |
|---|---|
| `ShipyardWorkbench.tsx` | Extract layout structure into ShipyardShell; workbench becomes content-only |
| `styles.css` | Remove `.workbench-shell`, `.workbench-grid`, sidebar column definitions |

### CSS Files

| File | Purpose |
|---|---|
| `src/shell/shell.css` | All shell layout styles |

---

## 3. Token Selections

### From S01 Primitives (used directly)
- `--surface-canvas` — shell background
- `--surface-card` — sidebar panel backgrounds
- `--border-subtle` — panel dividers
- `--border-medium` — sidebar border when expanded
- `--text-muted` — footer status text
- `--text-body` — footer labels
- `--font-mono` — footer data values
- `--space-0` through `--space-6` — internal gaps
- `--radius-0` (none) for the shell itself; panels inside use `--radius-xl`
- `--elevation-1` — footer bar
- `--blur-md` — sidebar glass effect

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--shell-header-h` | `48px` | Fixed header strip height |
| `--shell-footer-h` | `32px` | Fixed footer bar height |
| `--sidebar-left-w` | `220px` | Left sidebar expanded width |
| `--sidebar-left-collapsed-w` | `48px` | Left sidebar icon rail width |
| `--sidebar-right-w` | `280px` | Right sidebar expanded width |
| `--sidebar-right-collapsed-w` | `0px` | Right sidebar fully hidden |
| `--sidebar-transition` | `var(--duration-slow) var(--ease-smooth)` | Collapse/expand timing |
| `--shell-gutter` | `var(--space-3)` | Gap between shell edge and content |

---

## 4. Layout Decisions

### CSS Grid Structure

```css
.shipyard-shell {
  display: grid;
  grid-template-rows: var(--shell-header-h) 1fr var(--shell-footer-h);
  grid-template-columns:
    [left-start] var(--sidebar-left-w)
    [left-end main-start] 1fr
    [main-end right-start] var(--sidebar-right-w)
    [right-end];
  grid-template-areas:
    "header  header  header"
    "left    main    right"
    "footer  footer  footer";
  height: 100vh;
  overflow: hidden;
}
```

### Named Grid Areas

| Area | Content |
|---|---|
| `header` | 48px header strip (S03) — spans full width |
| `left` | Session panel, context panel — collapsible to 48px icon rail |
| `main` | Primary content: turns, file events, composer |
| `right` | Activity feed, file details — collapsible to 0px |
| `footer` | Status bar — spans full width |

### Panel Overflow

- `main` area: `overflow-y: auto` with custom scrollbar styling
- `left` / `right` sidebars: `overflow-y: auto` independently
- Each scrollable region gets thin custom scrollbar: 6px wide, `--gray-5` thumb, transparent track

### Grid Gaps

- No gap between grid areas at the shell level. Panels provide their own margin/padding via `--shell-gutter`.
- This allows border-to-border sidebar collapse animations without gap artifacts.

### Sidebar Collapse Behavior

**Left sidebar:**
- Expanded: `220px` — shows full session panel, context panel with text labels
- Collapsed: `48px` — icon rail with tooltip labels on hover
- Toggle: button in header (S03) or keyboard shortcut `Cmd+B`
- Transition: width animates over `320ms` with `--ease-smooth`
- Content inside fades out at `120ms`, icon rail fades in at `200ms` (staggered)

**Right sidebar:**
- Expanded: `280px` — shows activity feed, file detail panel
- Collapsed: `0px` — fully hidden, no rail
- Toggle: button in header (S03) or keyboard shortcut `Cmd+Shift+B`
- Transition: width animates over `320ms` with `--ease-smooth`

**Collapse state management:**
- Stored in React state in ShipyardShell
- Persisted to `localStorage` key `shipyard:sidebar-state`
- Shape: `{ left: "expanded" | "collapsed", right: "expanded" | "collapsed" }`

### Sidebar Internal Structure

Left sidebar (expanded):
```
+---------------------------+
| [Session panel]           |  <- SurfaceCard, overflow-y auto
|                           |
+---------------------------+
| [Context panel]           |  <- SurfaceCard, overflow-y auto
+---------------------------+
```

Left sidebar (collapsed — icon rail):
```
+------+
| [ic] |  Session icon
| [ic] |  Context icon
| [ic] |  (future slots)
|      |
+------+
```

Icon rail icons: 20x20px, `--text-muted` default, `--accent-strong` when the corresponding panel is active/has content. Each icon has `title` attribute and `aria-label`.

### Footer Status Bar

- Full-width bar at bottom, `32px` tall
- Background: `--surface-card` with `--border-subtle` top border
- Content: flex row with space-between
- Left cluster: connection status dot + label, session ID (mono, truncated)
- Right cluster: workspace path (mono, truncated), agent status label
- All text at `--text-xs` size, `--text-muted` color
- Mono values in `--font-mono`

---

## 5. Typography Decisions

The shell itself has minimal typography:
- Footer labels: `--type-caption` (xs, body font, medium weight)
- Footer values: `--type-mono-xs` (2xs, mono font)
- Icon rail tooltips: `--type-caption`
- No headings in the shell layer itself (headings live in panel content)

---

## 6. Color Decisions

- Shell background: `--surface-canvas` — the deepest layer
- Sidebar background: `--surface-card` with `backdrop-filter: var(--blur-md)` for glass
- Sidebar border: `1px solid var(--border-subtle)` on the edge facing `main`
- Footer background: `--surface-card-strong` — slightly elevated from canvas
- Footer top border: `1px solid var(--border-subtle)`
- Icon rail background: `--surface-canvas` (same as shell, icons float on dark)
- Active icon: `--accent-strong`
- Inactive icon: `--text-muted`
- Scrollbar thumb: `var(--gray-5)`
- Scrollbar track: `transparent`

No new color tones. All colors reference S01 semantic tokens.

---

## 7. Motion Plan

### Sidebar Collapse/Expand

| Property | Timing | Easing |
|---|---|---|
| `grid-template-columns` (width) | `320ms` | `--ease-smooth` |
| Sidebar content opacity (fade out) | `120ms` | `--ease-in` |
| Icon rail opacity (fade in) | `120ms` delay `200ms` | `--ease-out` |
| Sidebar content opacity (fade in on expand) | `180ms` delay `160ms` | `--ease-out` |

The width transition drives the spatial change. Content fades are staggered: on collapse, text fades out first, then width shrinks, then icons appear. On expand, width grows first, then text fades in.

### Footer Entrance

- Footer slides up from bottom on initial mount: `translateY(100%)` to `translateY(0)` over `duration-slow` with `ease-out`.

### Panel Scroll

- No motion on scroll itself. Custom scrollbar appears/disappears with `opacity` transition at `duration-fast`.

### Reduced Motion

All sidebar transitions collapse to `0ms`. Panels appear instantly. Footer appears without slide.

---

## 8. Copy Direction

### Footer Status Labels

| State | Left text | Right text |
|---|---|---|
| Connecting | "Connecting..." | workspace path |
| Connected | "Connected" | workspace path, "Ready" |
| Agent busy | "Working" | workspace path, "Turn N" |
| Error | "Disconnected" | workspace path, "Error" |
| Reconnecting | "Reconnecting..." | workspace path |

Tone: terse, technical, factual. No emoji. No friendly language. Status bar is glanceable metadata, not conversational.

### Icon Rail Tooltips

- Session: "Session"
- Context: "Context"

Short noun labels. No verbs, no descriptions.

---

## 9. Accessibility Requirements

### Focus Order

1. Header (S03) — left to right
2. Left sidebar content — top to bottom (skip if collapsed, announce collapsed state)
3. Main content — top to bottom
4. Right sidebar content — top to bottom (skip if collapsed)
5. Footer — not in tab order (decorative status, `aria-live="polite"` for connection changes)

### ARIA Roles

| Element | Role | Notes |
|---|---|---|
| `.shipyard-shell` | none (div) | Landmarks are on children |
| `header` area | `role="banner"` | Via `<header>` element |
| `left` sidebar | `role="complementary"` + `aria-label="Session and context"` | Via `<aside>` |
| `main` area | `role="main"` | Via `<main>` |
| `right` sidebar | `role="complementary"` + `aria-label="Activity feed"` | Via `<aside>` |
| `footer` area | `role="contentinfo"` | Via `<footer>` |
| Sidebar toggle | `aria-expanded="true|false"` + `aria-controls="sidebar-left|sidebar-right"` | On toggle buttons |

### Sidebar Collapse Announcement

When a sidebar collapses/expands, the toggle button's `aria-expanded` attribute updates. Screen readers announce the state change. No additional `aria-live` region needed since the button itself communicates the change.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+B` / `Ctrl+B` | Toggle left sidebar |
| `Cmd+Shift+B` / `Ctrl+Shift+B` | Toggle right sidebar |

These are registered as global keyboard listeners on the shell. They do not conflict with browser defaults (Cmd+B is bold in contenteditable, but we have no contenteditable in sidebar toggles).

### Skip Links

Add a visually hidden skip link as first child of shell:
```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```
Visible on focus, positioned at top-left.

---

## 10. Anti-Patterns to Avoid

1. **No fixed-width sidebars via `width` property.** Use `grid-template-columns` for layout control — this allows the main area to naturally fill remaining space.
2. **No `position: fixed` for sidebars.** Everything lives in the CSS Grid. Fixed positioning breaks grid flow and causes stacking context issues.
3. **No `display: none` to hide collapsed sidebars.** Animate width to 0/48px. `display: none` removes elements from accessibility tree and prevents transition.
4. **No layout shift on sidebar toggle.** Main content area must smoothly resize, never jump.
5. **No inner scrollbar on the shell.** Only `main`, `left`, and `right` areas scroll independently. The shell itself is `overflow: hidden`.
6. **No gap between grid areas.** Gaps create visible voids during sidebar collapse. Use panel padding instead.
7. **No z-index stacking for layout.** All layout is handled by grid placement. Z-index only for overlays (command palette in S04, not here).
8. **No hardcoded pixel heights except header (48px) and footer (32px).** Everything else is fluid.
9. **No sidebar content rendering when collapsed.** The collapsed sidebar renders only the IconRail. Full panel content unmounts or is hidden with `visibility: hidden` + `opacity: 0` for transition.
10. **No localStorage read during render.** Read sidebar state in a `useEffect` or `useSyncExternalStore` to avoid hydration mismatch.

---

## 11. Responsive Breakpoint Behavior

### 1440px (Desktop Large)
- All three columns visible: left (220px) + main (fluid) + right (280px)
- Footer visible
- This is the design-target layout

### 1024px (Tablet Large)
- Right sidebar auto-collapses to `0px` (hidden)
- Left sidebar remains at 220px
- User can manually re-expand right sidebar (it overlays main as a slide-over panel at this breakpoint with `position: absolute` + `z-index`)
- Main content fills remaining width

### 768px (Tablet)
- Left sidebar auto-collapses to 48px icon rail
- Right sidebar hidden (0px)
- Main content fills `calc(100vw - 48px)`
- Footer text truncates: show only connection dot + status word on left, workspace folder name on right

### 375px (Mobile)
- Left sidebar icon rail hidden (0px) — all navigation moves to header hamburger menu
- Right sidebar hidden (0px)
- Main content is full width
- Footer shows only connection dot + single status word
- Header adapts (see S03)

### Breakpoint Implementation

```css
@media (max-width: 1024px) {
  .shipyard-shell {
    grid-template-columns: var(--sidebar-left-w) 1fr 0px;
  }
  .shipyard-shell[data-right-expanded="true"] .shell-sidebar-right {
    position: absolute;
    right: 0;
    top: var(--shell-header-h);
    bottom: var(--shell-footer-h);
    width: var(--sidebar-right-w);
    z-index: 20;
    box-shadow: var(--elevation-3);
  }
}

@media (max-width: 768px) {
  .shipyard-shell {
    grid-template-columns: var(--sidebar-left-collapsed-w) 1fr 0px;
  }
}

@media (max-width: 375px) {
  .shipyard-shell {
    grid-template-columns: 0px 1fr 0px;
    grid-template-rows: var(--shell-header-h) 1fr var(--shell-footer-h);
  }
}
```

At each breakpoint, the sidebar state in `localStorage` is overridden by the responsive rule. When the viewport grows back above the threshold, the persisted preference is restored.
