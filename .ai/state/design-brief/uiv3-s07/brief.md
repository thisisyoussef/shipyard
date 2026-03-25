# UIV3-S07: Session/Context Panels — Design Brief

Story: UIV3-S07
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

The session and context panels are the user's control surfaces — they answer "where am I?" and "what does the agent know?" The session panel provides progressive disclosure of workspace metadata: start minimal, reveal depth on demand. The context panel is a lightweight input mechanism with history, not a chat interface.

These panels live in the left sidebar and must work at both full width (220px) and condensed width (when the sidebar is narrow). The mood is informational and utilitarian: status indicators, timestamps, file paths, signal lists. No decoration, no personality flourishes.

Key mood words translated to implementation rules:
- **Informational** — clear data hierarchy, metadata organized in scannable groups
- **Progressive** — collapsed by default, expand to reveal detail levels
- **Compact** — dense layouts that fit the sidebar width constraint
- **Contextual** — surface what's relevant now, archive what's historical

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `SessionPanel` | `src/panels/SessionPanel.tsx` | Session status, workspace info, discovery metadata |
| `SessionHeader` | `src/panels/SessionHeader.tsx` | Session ID, status badge, timestamps |
| `DiscoverySection` | `src/panels/DiscoverySection.tsx` | Collapsible section showing discovery signals |
| `SignalList` | `src/panels/SignalList.tsx` | List of discovered signals (scripts, configs, paths) |
| `SignalItem` | `src/panels/SignalItem.tsx` | Single signal with icon, label, value |
| `ContextPanel` | `src/panels/ContextPanel.tsx` | Context input, queued preview, history |
| `ContextTextarea` | `src/panels/ContextTextarea.tsx` | Auto-expanding textarea for context input |
| `ContextQueue` | `src/panels/ContextQueue.tsx` | Preview of context about to be sent |
| `ContextHistory` | `src/panels/ContextHistory.tsx` | List of previously sent context items |
| `ContextHistoryItem` | `src/panels/ContextHistoryItem.tsx` | Single historical context with timestamp |

### Modified Components

| Component | Change |
|---|---|
| `ShellSidebar` | Renders SessionPanel and ContextPanel as children |
| `IconRail` | Icons for session and context when sidebar is collapsed |

### CSS Files

| File | Purpose |
|---|---|
| `src/panels/session-panel.css` | Session panel layout, discovery sections |
| `src/panels/context-panel.css` | Context input, queue, history |

---

## 3. Token Selections

### From S01/S02 Primitives

- `--surface-card` — panel backgrounds
- `--surface-inset` — textarea background, history items
- `--surface-muted` — hover states, separator backgrounds
- `--border-subtle` — section dividers, panel borders
- `--border-medium` — textarea focus border
- `--text-strong` — primary labels, session ID
- `--text-muted` — secondary labels, timestamps
- `--text-faint` — placeholders, hints
- `--font-mono` — session IDs, file paths, signal values
- `--font-body` — labels, section headers
- `--text-xs`, `--text-sm` — compact typography
- `--space-2`, `--space-3`, `--space-4` — internal spacing
- `--radius-md`, `--radius-lg` — section containers, inputs
- `--accent-strong`, `--accent-soft` — active states, send button

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--session-header-h` | `48px` | Session header height |
| `--context-textarea-min-h` | `64px` | Minimum textarea height |
| `--context-textarea-max-h` | `160px` | Maximum textarea height (before scroll) |
| `--context-item-h` | `32px` | History item height |
| `--signal-item-h` | `28px` | Signal item height |
| `--panel-section-gap` | `var(--space-4)` | Gap between panel sections |

---

## 4. Layout Decisions

### Session Panel Structure

```css
.session-panel {
  display: flex;
  flex-direction: column;
  gap: var(--panel-section-gap);
  padding: var(--space-4);
  background: var(--surface-card);
  border-radius: var(--radius-xl);
}
```

### Session Header

```css
.session-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.session-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.session-id {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-timestamp {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--text-faint);
}
```

Session header shows:
- Row 1: "Session" label + status badge
- Row 2: Session ID (truncated with copy button)
- Row 3: Started timestamp

### Discovery Section (Progressive Disclosure)

```css
.discovery-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.discovery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.discovery-header:hover {
  background: var(--surface-muted);
}

.discovery-content {
  padding-left: var(--space-3);
}

.discovery-content[data-collapsed="true"] {
  display: none;
}
```

Discovery sections:
1. **Workspace** — path, name (always visible)
2. **Target** — target path (always visible if set)
3. **Scripts** — detected scripts (collapsible)
4. **Config Files** — detected configs (collapsible)
5. **Environment** — detected env signals (collapsible)

Each collapsible section shows item count badge when collapsed.

### Signal List

```css
.signal-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
}

.signal-item {
  display: flex;
  align-items: center;
  height: var(--signal-item-h);
  padding: 0 var(--space-2);
  gap: var(--space-2);
  border-radius: var(--radius-xs);
}

.signal-item:hover {
  background: var(--surface-muted);
}

.signal-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.signal-label {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signal-value {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--text-faint);
}
```

### Context Panel Structure

Context panel has 3 zones stacked vertically:

```css
.context-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface-card);
  border-radius: var(--radius-xl);
}

.context-zone-input { /* Zone 1: Textarea */ }
.context-zone-queue { /* Zone 2: Queued preview */ }
.context-zone-history { /* Zone 3: History list */ }
```

### Context Textarea

```css
.context-textarea-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.context-textarea {
  min-height: var(--context-textarea-min-h);
  max-height: var(--context-textarea-max-h);
  padding: var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  color: var(--text-strong);
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  resize: none;
  overflow-y: auto;
}

.context-textarea::placeholder {
  color: var(--text-faint);
}

.context-textarea:focus {
  border-color: var(--accent-strong);
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring-color);
}

.context-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
```

Auto-expand behavior: textarea grows with content up to `max-height`, then scrolls.

### Context Queue (Preview)

```css
.context-queue {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--accent-subtle);
  border: 1px dashed var(--accent-border);
  border-radius: var(--radius-sm);
}

.context-queue-label {
  font-size: var(--text-xs);
  color: var(--accent-strong);
  font-weight: var(--weight-medium);
}

.context-queue-preview {
  font-size: var(--text-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-queue:empty {
  display: none;
}
```

### Context History

```css
.context-history {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 200px;
  overflow-y: auto;
}

.context-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) 0;
}

.context-history-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: var(--weight-medium);
}

.context-history-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
  padding: var(--space-2);
  background: var(--surface-inset);
  border-radius: var(--radius-xs);
}

.context-history-item:hover {
  background: var(--surface-muted);
}

.context-history-text {
  font-size: var(--text-xs);
  color: var(--text-default);
  line-height: var(--leading-snug);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.context-history-time {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--text-faint);
}
```

History shows most recent first. Each item is truncated to 2 lines with timestamp below.

### Condensed Layout (Narrow Sidebar)

When sidebar width drops below 180px:

```css
@container sidebar (max-width: 180px) {
  .session-header-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .discovery-section .signal-value {
    display: none;
  }

  .context-queue {
    display: none;
  }

  .context-history-text {
    -webkit-line-clamp: 1;
  }
}
```

---

## 5. Typography Decisions

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| "Session" label | `--font-body` | `--text-xs` | `--weight-semibold` | `--text-muted` |
| Status badge | `--font-body` | `--text-xs` | `--weight-semibold` | tone-dependent |
| Session ID | `--font-mono` | `--text-xs` | `--weight-normal` | `--text-muted` |
| Timestamp | `--font-mono` | `--text-2xs` | `--weight-normal` | `--text-faint` |
| Section header (Discovery) | `--font-body` | `--text-xs` | `--weight-medium` | `--text-muted` |
| Signal label | `--font-body` | `--text-xs` | `--weight-normal` | `--text-muted` |
| Signal value (path/count) | `--font-mono` | `--text-2xs` | `--weight-normal` | `--text-faint` |
| "Context" label | `--font-body` | `--text-xs` | `--weight-semibold` | `--text-muted` |
| Textarea content | `--font-body` | `--text-sm` | `--weight-normal` | `--text-strong` |
| Textarea placeholder | `--font-body` | `--text-sm` | `--weight-normal` | `--text-faint` |
| Queue label | `--font-body` | `--text-xs` | `--weight-medium` | `--accent-strong` |
| History label | `--font-body` | `--text-xs` | `--weight-medium` | `--text-muted` |
| History item text | `--font-body` | `--text-xs` | `--weight-normal` | `--text-default` |
| History timestamp | `--font-mono` | `--text-2xs` | `--weight-normal` | `--text-faint` |

---

## 6. Color Decisions

### Session Panel Colors

- Background: `--surface-card`
- Section headers: `--text-muted`
- Dividers: `--border-subtle`
- Session ID: `--text-muted` (de-emphasized but copyable)
- Timestamp: `--text-faint`
- Signal icons: `--text-muted`
- Hover background: `--surface-muted`

### Context Panel Colors

- Background: `--surface-card`
- Textarea background: `--surface-inset`
- Textarea border (default): `--border-subtle`
- Textarea border (focus): `--accent-strong`
- Focus ring: `--focus-ring-color`
- Send button: primary button tokens (amber gradient)
- Queue background: `--accent-subtle`
- Queue border: `--accent-border` (dashed)
- Queue label: `--accent-strong`
- History item background: `--surface-inset`
- History item hover: `--surface-muted`

### Status Mapping (Session Panel)

| Status | Badge Tone |
|---|---|
| Connecting | `accent` (amber) |
| Connected | `success` (green) |
| Running | `accent` with pulse |
| Error | `danger` (red) |
| Idle | `neutral` |

---

## 7. Motion Plan

### Section Expand/Collapse

| Property | Timing | Easing |
|---|---|---|
| Content `max-height` | `--duration-normal` | `--ease-out` |
| Content `opacity` | `--duration-fast` | `--ease-out` |
| Chevron rotation | `--duration-fast` | `--ease-default` |

### Textarea Focus

| Property | Timing | Easing |
|---|---|---|
| Border color | `--duration-fast` | `--ease-default` |
| Box-shadow (focus ring) | `--duration-fast` | `--ease-default` |

### Textarea Auto-Expand

```css
.context-textarea {
  transition: height var(--duration-normal) var(--ease-out);
}
```

Smooth height transition as user types multi-line content.

### Context Queue Appearance

When user types in textarea, queue preview appears:

| Property | Timing | Easing |
|---|---|---|
| `opacity` | `--duration-fast` | `--ease-out` |
| `transform: translateY(-4px)` to `0` | `--duration-fast` | `--ease-out` |

### History Item Entrance

New history items appear at top with:

| Property | Timing | Easing |
|---|---|---|
| `opacity` 0 to 1 | `--duration-normal` | `--ease-out` |
| `transform: translateY(-8px)` to `0` | `--duration-normal` | `--ease-out` |

Existing items shift down smoothly.

### Copy Action Feedback

When session ID is copied:
- Icon swaps to checkmark
- Toast appears (or inline "Copied" text)
- Reverts after 2 seconds

### Reduced Motion

- Section expand: instant (no height animation)
- Textarea: no height transition
- Queue/history: instant appearance, no translate
- Focus ring: instant

---

## 8. Copy Direction

### Session Panel Labels

| Element | Text |
|---|---|
| Section header | "Session" |
| Status (connecting) | "connecting" |
| Status (connected) | "connected" |
| Status (running) | "working" |
| Status (error) | "error" |
| Status (idle) | "idle" |
| Session ID tooltip | "Copy session ID" |
| Copied confirmation | "Copied" |
| Timestamp prefix | "Started" |
| Timestamp format | `HH:mm:ss` (24-hour) or relative "2m ago" |
| Discovery: Workspace | "Workspace" |
| Discovery: Target | "Target" |
| Discovery: Scripts | "Scripts" |
| Discovery: Configs | "Config Files" |
| Discovery: Environment | "Environment" |
| Empty discovery | "No signals detected" |

### Context Panel Labels

| Element | Text |
|---|---|
| Section header | "Context" |
| Textarea placeholder | "Add context for the agent..." |
| Send button | "Send" |
| Queue label | "Queued" |
| History header | "History" |
| Empty history | "No context sent yet" |
| Clear history button | "Clear" |
| History timestamp format | `HH:mm` |

Tone: terse, technical. Avoid conversational phrasing.

---

## 9. Accessibility Requirements

### Focus Order

Session Panel:
1. Copy session ID button
2. Each collapsible section header (in DOM order)
3. Items within expanded sections (not individually focusable unless actionable)

Context Panel:
1. Context textarea
2. Send button
3. Clear history button (if visible)
4. History items are not individually focusable (read-only)

### ARIA Roles

| Element | Role/Attribute | Notes |
|---|---|---|
| `.session-panel` | `region` + `aria-label="Session information"` | Landmark |
| Status badge | `status`, `aria-live="polite"` | Announces state changes |
| Copy button | `aria-label="Copy session ID"` | Icon-only button |
| Collapsible section | `button` with `aria-expanded` | Header is the toggle |
| Section content | `region` with `aria-labelledby` | Points to header |
| `.context-panel` | `region` + `aria-label="Context input"` | Landmark |
| Context textarea | `aria-label="Add context for agent"` | Describes purpose |
| Send button | `aria-label="Send context"` | If icon-only |
| History list | `list` | Or semantic `<ul>` |
| History item | `listitem` | Or semantic `<li>` |

### Keyboard Navigation

| Key | Action |
|---|---|
| `Tab` | Move between focusable elements |
| `Enter` / `Space` | Toggle collapsible section |
| `Enter` (in textarea) | Does NOT send (newline); use button or Cmd+Enter |
| `Cmd+Enter` | Send context (keyboard shortcut) |
| `Escape` | Clear textarea (if focused and not empty) |

### Contrast

- All text meets 4.5:1 minimum
- Placeholder text (`--text-faint`) on `--surface-inset`: verify >= 4.5:1
- Focus ring provides 3:1 contrast against adjacent colors

### Screen Reader

- Session panel announces: "Session information, region"
- Status changes announced via `aria-live`
- Discovery sections announce expanded/collapsed state
- Context panel announces: "Context input, region"
- Textarea has descriptive label
- History items announced as list

---

## 10. Anti-Patterns to Avoid

1. **No chat-style bubbles.** Context is not a conversation. Use flat list items, not message bubbles.
2. **No markdown rendering in context.** Context is plain text. No rich formatting.
3. **No auto-send on Enter.** Textarea should allow multi-line input. Send is explicit (button or Cmd+Enter).
4. **No infinite scroll in history.** History is capped (e.g., 20 items). Older items are removed.
5. **No drag-and-drop reordering.** Context history is chronological only.
6. **No inline editing of history.** History is read-only. User can copy but not modify.
7. **No file attachments in context.** This is text-only. File context is handled elsewhere.
8. **No session switching from this panel.** Session panel is display-only. Session management is a separate flow.
9. **No real-time typing indicators.** No "agent is reading" feedback in context panel.
10. **No timestamps in the future.** Timestamps are always relative to now (past) or absolute.

---

## 11. Responsive Breakpoint Behavior

### 1440px (Desktop Large)

- Left sidebar at 220px
- Session and Context panels stacked vertically with full content
- All discovery sections visible with values
- Context history shows 3-4 items without scroll

### 1024px (Desktop)

- Same as 1440px
- Panels may be slightly tighter if sidebar width reduced

### 768px (Tablet)

- Left sidebar at 48px (icon rail only)
- Session and Context panels move to slide-over drawer
- Drawer opens on icon click
- Full panel content visible in drawer (280px width)

### 375px (Mobile)

- No persistent sidebar
- Session/Context accessible via hamburger menu drawer
- Drawer is full-screen or near-full-screen
- Context textarea takes most of viewport height
- History shows 2 items max with "View all" link

### Condensed Mode (Container Query)

When sidebar container width < 180px:
- Stack session header rows vertically
- Hide signal values (show labels only)
- Hide context queue preview
- Truncate history items to 1 line
- Show count badge on discovery sections

```css
@container sidebar (max-width: 180px) {
  .discovery-section .signal-value {
    display: none;
  }

  .discovery-section .signal-list {
    display: none;
  }

  .discovery-header .count-badge {
    display: inline-flex;
  }

  .context-history-text {
    -webkit-line-clamp: 1;
  }
}
```
