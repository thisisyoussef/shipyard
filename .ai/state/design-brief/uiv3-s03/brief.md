# UIV3-S03: Header Strip — Design Brief

Story: UIV3-S03
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

The header is a thin, precision instrument bar — not a hero banner. It replaces the current oversized `top-bar` (which occupies ~200px+ with brand copy, summary paragraph, and large action blocks) with a compact 48px strip that communicates identity, location, and connection at a glance. Think Linear's top bar or VS Code's title bar: minimal chrome, maximum information density per pixel.

The header should feel anchored and stable. It does not scroll. It does not change height. It is the one constant landmark across all states.

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `HeaderStrip` | `src/shell/HeaderStrip.tsx` | 48px fixed header with brand, workspace, connection, actions |

### Sub-elements (not separate components, but distinct rendered sections)

| Element | Description |
|---|---|
| `header-brand` | Logo mark + "Shipyard" wordmark |
| `header-location` | Workspace name + target name (breadcrumb style) |
| `header-connection` | Connection status badge (dot + label) |
| `header-actions` | Icon buttons: trace, refresh, sidebar toggles |

### Removed/Replaced

| Element | Disposition |
|---|---|
| `.top-bar` (current) | Removed entirely |
| `.brand-lockup` | Replaced by compact `header-brand` |
| `.brand-copy h1` | Removed — no hero heading in header |
| `.brand-summary` | Removed — summary text moves to session banner or is dropped |
| `.top-bar-actions` | Replaced by `header-actions` icon buttons |
| `.top-info-block` (workspace/target) | Replaced by inline `header-location` breadcrumb |

---

## 3. Token Selections

### From S01 Primitives
- `--shell-header-h`: `48px` (from S02 component tokens)
- `--surface-card-strong` — header background (slightly elevated from canvas)
- `--border-subtle` — bottom border
- `--blur-md` — backdrop-filter for glass effect
- `--shadow-inner` — subtle top-edge highlight
- `--text-strong` — workspace name
- `--text-muted` — target name, separator
- `--text-xs` — "Shipyard" wordmark size
- `--text-sm` — workspace/target text size
- `--font-body` — wordmark
- `--font-mono` — workspace/target paths
- `--accent-strong` — logo mark gradient, active toggle
- `--space-2`, `--space-3`, `--space-4` — internal spacing
- `--radius-sm` — icon button border radius
- `--radius-md` — logo mark radius
- `--duration-fast`, `--duration-normal` — hover/press transitions

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--header-bg` | `var(--surface-card-strong)` | Header background |
| `--header-border` | `var(--border-subtle)` | Bottom border |
| `--header-icon-size` | `18px` | Icon button icon size |
| `--header-btn-size` | `32px` | Icon button hit target |

---

## 4. Layout Decisions

### Header Internal Layout

```css
.header-strip {
  display: flex;
  align-items: center;
  height: var(--shell-header-h);  /* 48px */
  padding: 0 var(--space-3);
  gap: var(--space-2);
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border);
  backdrop-filter: var(--blur-md);
  box-shadow: var(--shadow-inner);
}
```

### Horizontal Zones (left to right)

```
[Brand] [Divider] [Location] -----stretch----- [Connection] [Actions]
  80px    1px       fluid                          auto        auto
```

| Zone | Width | Alignment |
|---|---|---|
| Brand | fixed ~80px (mark + wordmark) | flex-start |
| Vertical divider | 1px, 20px tall, `--border-subtle` | N/A |
| Location | fluid, `min-width: 0` for truncation | flex-start |
| Spacer | `flex: 1` | N/A |
| Connection badge | auto-width | flex-end |
| Action buttons | auto, `gap: var(--space-1)` | flex-end |

### Brand Mark

- Size: `24px x 24px` (down from current 48px)
- Shape: rounded square with `--radius-sm` (6px)
- Background: `linear-gradient(135deg, var(--amber-7), var(--amber-5))`
- Border: `1px solid oklch(1 0 0 / 0.12)`
- Inner icon: anchor/ship silhouette or letter "S" in `--text-inverse`, `12px`
- Shadow: `var(--elevation-1)`

### Wordmark

- Text: "Shipyard"
- Font: `--font-body`, `--weight-semibold`, `--text-xs`
- Color: `--text-muted`
- Letter-spacing: `--tracking-wider`
- Text-transform: uppercase
- Placed to the right of the mark with `--space-2` gap

### Location Breadcrumb

- Structure: `workspace / target`
- Workspace: `--font-mono`, `--text-sm`, `--text-strong`, `--weight-medium`
- Separator: `/` in `--text-faint`, `--space-1` horizontal padding
- Target: `--font-mono`, `--text-sm`, `--text-muted`, `--weight-normal`
- Both truncate with `text-overflow: ellipsis` on overflow
- Workspace shows folder name only (last segment of path), not full path
- Target shows folder name only
- On hover over either segment: `title` attribute shows full path

### Connection Badge

- Reuses the existing `Badge` primitive with `StatusDot`
- Tone: derived from connection state (same logic as current)
- Size: compact — `--text-xs`, `min-height: 24px`, padding `2px 8px`
- Placed before action buttons

### Action Buttons

All action buttons are icon-only with tooltip:

| Button | Icon | Tooltip | Shortcut |
|---|---|---|---|
| Copy trace path | clipboard icon | "Copy trace path" | none |
| Refresh session | refresh/sync icon | "Refresh session" | none |
| Toggle left sidebar | sidebar-left icon | "Toggle sidebar (Cmd+B)" | `Cmd+B` |
| Toggle right sidebar | sidebar-right icon | "Toggle activity (Cmd+Shift+B)" | `Cmd+Shift+B` |

Button style:
```css
.header-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--header-btn-size);   /* 32px */
  height: var(--header-btn-size);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);
}

.header-icon-btn:hover {
  background: var(--surface-muted);
  color: var(--text-strong);
  border-color: var(--border-subtle);
}

.header-icon-btn:active {
  transform: scale(0.95);
}

.header-icon-btn[data-active="true"] {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
```

Sidebar toggle buttons show `data-active="true"` when the corresponding sidebar is expanded.

---

## 5. Typography Decisions

| Element | Font | Size | Weight | Tracking | Color |
|---|---|---|---|---|---|
| Wordmark "Shipyard" | `--font-body` | `--text-xs` | `--weight-semibold` | `--tracking-wider` | `--text-muted` |
| Workspace name | `--font-mono` | `--text-sm` | `--weight-medium` | `--tracking-normal` | `--text-strong` |
| Target name | `--font-mono` | `--text-sm` | `--weight-normal` | `--tracking-normal` | `--text-muted` |
| Path separator | `--font-mono` | `--text-sm` | `--weight-normal` | N/A | `--text-faint` |
| Connection label | `--font-body` | `--text-xs` | `--weight-semibold` | `--tracking-wide` | tone-dependent |
| Button tooltips | `--font-body` | `--text-xs` | `--weight-normal` | `--tracking-normal` | `--text-strong` |

No serif/display font in the header. Headings are for content areas, not the app chrome.

---

## 6. Color Decisions

- Header background: `--surface-card-strong` — one step above canvas for visual separation
- Bottom border: `--border-subtle` — 1px, just enough to separate from content
- Logo gradient: `--amber-7` to `--amber-5` at 135deg
- Active sidebar toggle: `--accent-strong` icon, `--accent-soft` background, `--accent-border` border
- Hover: `--surface-muted` background, `--text-strong` icon
- Connection badge: follows existing tone mapping (success=green, accent=amber, danger=red, warning=yellow)
- Divider between brand and location: `--border-subtle`, 1px wide, 20px tall, centered vertically

No new colors. The header is intentionally monochromatic except for the connection badge and active toggle state.

---

## 7. Motion Plan

### Hover/Press

| Interaction | Property | Timing |
|---|---|---|
| Button hover | `background`, `color`, `border-color` | `--duration-fast` (120ms), `--ease-default` |
| Button press | `transform: scale(0.95)` | `--duration-instant` (80ms) |
| Tooltip appear | `opacity` 0 to 1 + `translateY(-4px)` to 0 | `--duration-normal` (200ms), `--ease-out`, delay `400ms` |
| Tooltip disappear | `opacity` 1 to 0 | `--duration-fast` (120ms), `--ease-in` |

### Connection Badge Transition

When connection state changes (e.g., "connected" to "working"), the badge text and tone update:
- Background color crossfades over `--duration-normal`
- StatusDot begins/stops pulse animation
- No layout shift — badge maintains minimum width

### Header Mount

- Header does not animate on mount. It is present immediately at full opacity.
- This is intentional: the header is a stability anchor.

---

## 8. Copy Direction

### Static Labels

| Element | Text |
|---|---|
| Wordmark | "Shipyard" (always) |
| Separator | "/" |
| Trace tooltip | "Copy trace path" |
| Refresh tooltip | "Refresh session" |
| Left sidebar tooltip (expanded) | "Collapse sidebar" |
| Left sidebar tooltip (collapsed) | "Expand sidebar" |
| Right sidebar tooltip (expanded) | "Hide activity" |
| Right sidebar tooltip (collapsed) | "Show activity" |

### Dynamic Labels

| State | Connection badge text |
|---|---|
| Connecting (no session) | "connecting" |
| Connecting (has session) | "reconnecting" |
| Connected | "connected" |
| Agent busy | "working" |
| Error | "error" |
| Disconnected | "offline" |

### Workspace/Target Display

- Show only the last path segment (folder name), not the full absolute path
- If workspace is unknown: show "..." in muted text
- If target is unknown: show "..." in muted text
- Full paths are in `title` attributes for hover inspection

Tone: purely informational, no personality. The header is a cockpit instrument panel.

---

## 9. Accessibility Requirements

### Focus Order

Left to right within the header:
1. Brand mark (not focusable — decorative)
2. Workspace segment (not focusable unless we make it a link later)
3. Connection badge (not focusable — informational)
4. Copy trace button
5. Refresh button
6. Left sidebar toggle
7. Right sidebar toggle

### ARIA

| Element | Attribute | Value |
|---|---|---|
| `<header>` | `role` | `banner` (implicit from `<header>`) |
| Connection badge | `aria-label` | `"Connection status: {state}"` |
| Connection badge | `role` | `status` |
| Connection badge | `aria-live` | `polite` |
| Copy trace button | `aria-label` | `"Copy trace path"` |
| Refresh button | `aria-label` | `"Refresh session"` |
| Left sidebar toggle | `aria-label` | `"Toggle sidebar"` |
| Left sidebar toggle | `aria-expanded` | `"true"` or `"false"` |
| Left sidebar toggle | `aria-controls` | `"sidebar-left"` |
| Right sidebar toggle | `aria-label` | `"Toggle activity panel"` |
| Right sidebar toggle | `aria-expanded` | `"true"` or `"false"` |
| Right sidebar toggle | `aria-controls` | `"sidebar-right"` |
| All icon buttons | `title` | Tooltip text (for mouse users) |

### Contrast

- All icon buttons in default state: `--text-muted` on transparent background. Since they have visible borders on hover and rely on icon shape (not just color), the lower contrast of muted icons is acceptable per WCAG (decorative icons with programmatic labels).
- Active toggle: `--accent-strong` on `--accent-soft` background — verify >= 4.5:1.
- Connection badge text: follows existing verified tone contrasts from S01.

### Keyboard

- All buttons reachable via Tab
- Enter/Space activates buttons
- Sidebar toggles also respond to global shortcuts (`Cmd+B`, `Cmd+Shift+B`)
- Focus visible ring: `--focus-ring` token from S01

---

## 10. Anti-Patterns to Avoid

1. **No hero heading in the header.** The current `h1 Developer Workbench` is removed. The header is chrome, not content.
2. **No multi-line content.** Everything in the header is single-line. If text overflows, it truncates with ellipsis.
3. **No header height changes.** `48px` is fixed. No conditional expansion, no responsive height shifts.
4. **No text buttons in the header.** All actions are icon-only to maintain density. Text labels go in tooltips.
5. **No brand summary paragraph.** The tagline about "traceable sessions, surgical edits" is content, not chrome. It belongs in the session banner if anywhere.
6. **No dropdown menus from the header** (in this story). Future stories may add workspace switcher, but S03 is static display only.
7. **No hamburger menu at desktop sizes.** The hamburger only appears at 375px (mobile) where sidebars are fully hidden.
8. **No opacity animation on mount.** Header is instant. It anchors the user's spatial model.
9. **No gradient background on the header itself.** Gradients are for the body/canvas. The header is a solid surface.
10. **No box-shadow below the header.** Use a 1px border, not a shadow, for the bottom edge. Shadows compete with card elevation.

---

## 11. Responsive Breakpoint Behavior

### 1440px (Desktop Large)
- Full layout: brand + divider + location + connection + all 4 action buttons
- All elements visible, no truncation needed at typical workspace names

### 1024px (Desktop)
- Same as 1440 but workspace/target names may truncate
- Right sidebar toggle shows `data-active="false"` since right sidebar auto-collapsed
- All buttons remain visible

### 768px (Tablet)
- Brand mark visible, wordmark "Shipyard" hidden
- Location shows workspace name only (target hidden)
- Connection badge shows dot only, label hidden
- All 4 action buttons remain (they are 32px each, total ~140px)
- Total header content fits in ~300px minimum

Layout at 768px:
```
[Mark] [Divider] [Workspace...] ---stretch--- [Dot] [Trace] [Refresh] [Left] [Right]
```

### 375px (Mobile)
- Brand mark visible, wordmark hidden
- Location hidden entirely (available in footer or session panel)
- Connection dot visible, no label
- Action buttons: only hamburger menu (replaces sidebar toggles) + refresh
- Trace button moves into hamburger menu

Layout at 375px:
```
[Mark] ---stretch--- [Dot] [Refresh] [Hamburger]
```

The hamburger button opens a slide-over drawer containing:
- Workspace / target info
- Navigation to session panel, context panel, activity panel
- Trace path copy action

This drawer is a future story concern but the hamburger button slot is reserved in S03.

### Breakpoint CSS Strategy

Use `display: none` on specific elements at breakpoints (since they are purely visual — the information is available elsewhere):

```css
@media (max-width: 768px) {
  .header-wordmark { display: none; }
  .header-target { display: none; }
  .header-connection-label { display: none; }
}

@media (max-width: 375px) {
  .header-location { display: none; }
  .header-trace-btn { display: none; }
  .header-sidebar-toggles { display: none; }
  .header-hamburger { display: flex; }  /* hidden at wider breakpoints */
}
```
