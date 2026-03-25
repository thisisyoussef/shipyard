# UIV3-S06: Diff/File Viewer — Design Brief

Story: UIV3-S06
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

The file viewer is a precision code inspection tool. It draws inspiration from VS Code's explorer and GitHub's diff viewer: crisp typography, clear visual hierarchy, and functional density without clutter. The file tree is navigational infrastructure — quiet when browsing, expressive when files change. Diffs are the hero content: they should be immediately scannable with unmistakable add/remove/context distinction.

The atmosphere is clinical but not sterile. Line numbers ground the viewer in source truth. Status badges communicate file state at a glance. The viewer should feel like a high-quality code review tool built into the workbench.

Key mood words translated to implementation rules:
- **Precise** — pixel-perfect alignment of line numbers and code, strict monospace grid
- **Scannable** — color-coded line backgrounds for instant add/remove recognition, clear file status badges
- **Navigable** — collapsible directories with clear expand/collapse affordances, keyboard-accessible tree
- **Dense** — optimized for viewing many lines; compact line heights, minimal chrome

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `FileTree` | `src/file-viewer/FileTree.tsx` | Collapsible directory tree with file/folder icons |
| `FileTreeItem` | `src/file-viewer/FileTreeItem.tsx` | Single tree node: folder (collapsible) or file (selectable) |
| `DiffViewer` | `src/file-viewer/DiffViewer.tsx` | Unified diff renderer with line numbers and syntax highlighting |
| `DiffLine` | `src/file-viewer/DiffLine.tsx` | Single diff line: add, remove, context, or hunk header |
| `DiffHunkHeader` | `src/file-viewer/DiffHunkHeader.tsx` | `@@ -n,m +n,m @@` header with optional context label |
| `FileStatusBadge` | `src/file-viewer/FileStatusBadge.tsx` | Compact status indicator: running, success, error, modified |
| `DiffPagination` | `src/file-viewer/DiffPagination.tsx` | Load-more / pagination for large diffs |

### Modified Components

| Component | Change |
|---|---|
| `SurfaceCard` | May be used as container for file tree and diff viewer panels |

### CSS Files

| File | Purpose |
|---|---|
| `src/file-viewer/file-tree.css` | File tree layout and icons |
| `src/file-viewer/diff-viewer.css` | Diff rendering, line highlighting, pagination |

---

## 3. Token Selections

### From S01/S02 Primitives

- `--font-mono` — all code content, line numbers
- `--text-mono-small` — line numbers
- `--text-sm` — file/folder names
- `--text-xs` — status badges, hunk headers
- `--text-2xs` — line numbers (very compact)
- `--surface-canvas` — viewer background
- `--surface-card` — tree panel background
- `--surface-inset` — diff viewport background
- `--border-subtle` — panel borders, tree dividers
- `--text-strong` — file names, code content
- `--text-muted` — folder names, unchanged context lines
- `--text-faint` — line numbers
- `--success-strong`, `--success-soft` — added lines
- `--danger-strong`, `--danger-soft` — removed lines
- `--accent-strong`, `--accent-soft` — modified file indicator
- `--warning-strong`, `--warning-soft` — hunk headers
- `--space-1` through `--space-4` — tree indentation, internal padding
- `--radius-sm`, `--radius-md` — badges, tree icons

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--tree-indent` | `var(--space-4)` | Depth indentation per level |
| `--tree-item-h` | `28px` | Tree row height |
| `--tree-icon-size` | `16px` | Folder/file icon size |
| `--diff-line-h` | `22px` | Diff line height |
| `--diff-gutter-w` | `48px` | Line number gutter width |
| `--diff-add-bg` | `rgba(126, 201, 154, 0.12)` | Added line background |
| `--diff-add-border` | `rgba(126, 201, 154, 0.4)` | Added line left accent |
| `--diff-remove-bg` | `rgba(236, 129, 112, 0.12)` | Removed line background |
| `--diff-remove-border` | `rgba(236, 129, 112, 0.4)` | Removed line left accent |
| `--diff-context-bg` | `transparent` | Context line background |
| `--diff-hunk-bg` | `rgba(214, 181, 109, 0.08)` | Hunk header background |
| `--diff-hunk-border` | `rgba(214, 181, 109, 0.3)` | Hunk header border |

---

## 4. Layout Decisions

### File Tree Structure

```css
.file-tree {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--surface-card);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.file-tree-header {
  display: flex;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.file-tree-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) 0;
}
```

### Tree Item Layout

```css
.file-tree-item {
  display: flex;
  align-items: center;
  height: var(--tree-item-h);
  padding: 0 var(--space-3);
  padding-left: calc(var(--tree-indent) * var(--depth) + var(--space-3));
  gap: var(--space-2);
  cursor: pointer;
}

.file-tree-item:hover {
  background: var(--surface-muted);
}

.file-tree-item[data-selected="true"] {
  background: var(--accent-soft);
  border-left: 2px solid var(--accent-strong);
}
```

Tree indentation uses CSS custom property `--depth` set inline for each item.

### Folder Expand/Collapse

- Chevron icon (8px) rotates 90 degrees on expand
- Folder icon swaps between closed-folder and open-folder variants
- Children animate height with `max-height` transition

### Diff Viewer Structure

```css
.diff-viewer {
  display: flex;
  flex-direction: column;
  background: var(--surface-inset);
  border-radius: var(--radius-lg);
  overflow: hidden;
  font-family: var(--font-mono);
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-subtle);
}

.diff-content {
  flex: 1;
  overflow-y: auto;
}
```

### Diff Line Layout

```css
.diff-line {
  display: flex;
  align-items: stretch;
  height: var(--diff-line-h);
  font-size: var(--text-mono-small);
  line-height: var(--diff-line-h);
}

.diff-gutter {
  flex-shrink: 0;
  width: var(--diff-gutter-w);
  padding: 0 var(--space-2);
  text-align: right;
  color: var(--text-faint);
  background: var(--surface-canvas);
  border-right: 1px solid var(--border-subtle);
  user-select: none;
}

.diff-code {
  flex: 1;
  padding: 0 var(--space-3);
  white-space: pre;
  overflow-x: auto;
}
```

### Line Type Backgrounds

| Type | Background | Left Border |
|---|---|---|
| `add` | `var(--diff-add-bg)` | `3px solid var(--diff-add-border)` |
| `remove` | `var(--diff-remove-bg)` | `3px solid var(--diff-remove-border)` |
| `context` | `var(--diff-context-bg)` | none |
| `hunk` | `var(--diff-hunk-bg)` | `3px solid var(--diff-hunk-border)` |

### Line Numbers

- Two columns for unified diff: old line number, new line number
- Add lines show only new line number (old is blank)
- Remove lines show only old line number (new is blank)
- Context lines show both
- Use `--text-2xs` for maximum density

### Pagination for Large Diffs

When diff exceeds 500 lines:
- Show first 200 lines
- "Show more" button loads next 200
- Progress indicator: "Showing 200 of 1,247 lines"
- Alternative: virtualized scroll (heavier implementation)

```css
.diff-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  gap: var(--space-3);
  background: var(--surface-card);
  border-top: 1px solid var(--border-subtle);
}
```

---

## 5. Typography Decisions

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| Tree panel header | `--font-body` | `--text-sm` | `--weight-semibold` | `--text-strong` |
| Folder name | `--font-body` | `--text-sm` | `--weight-medium` | `--text-muted` |
| File name | `--font-body` | `--text-sm` | `--weight-normal` | `--text-strong` |
| File name (selected) | `--font-body` | `--text-sm` | `--weight-medium` | `--text-strong` |
| Diff header (file path) | `--font-mono` | `--text-sm` | `--weight-medium` | `--text-strong` |
| Line number | `--font-mono` | `--text-2xs` | `--weight-normal` | `--text-faint` |
| Code content | `--font-mono` | `--text-mono-small` | `--weight-normal` | `--text-strong` |
| Hunk header (`@@`) | `--font-mono` | `--text-xs` | `--weight-normal` | `--warning-strong` |
| Status badge | `--font-body` | `--text-xs` | `--weight-semibold` | tone-dependent |
| Pagination text | `--font-body` | `--text-xs` | `--weight-normal` | `--text-muted` |

Line height for code: `--diff-line-h` (22px) — optimized for scanning many lines without excess whitespace.

---

## 6. Color Decisions

### File Tree Colors

- Background: `--surface-card`
- Item hover: `--surface-muted`
- Selected item: `--accent-soft` background + `--accent-strong` left border
- Folder icon: `--text-muted`
- File icon: `--text-muted`
- Expand chevron: `--text-faint`

### Diff Colors

- Viewer background: `--surface-inset`
- Header background: `--surface-card`
- Gutter background: `--surface-canvas`
- Add line: `--diff-add-bg` with `--success-strong` for the `+` prefix
- Remove line: `--diff-remove-bg` with `--danger-strong` for the `-` prefix
- Context line: transparent background
- Hunk header: `--diff-hunk-bg` with `--warning-strong` text

### File Status Badge Colors

| Status | Background | Text | Border |
|---|---|---|---|
| `running` | `--accent-soft` | `--accent-strong` | `--accent-border` |
| `success` | `--success-soft` | `--success-strong` | `--border-success` |
| `error` | `--danger-soft` | `--danger-strong` | `--border-danger` |
| `modified` | `--accent-soft` | `--accent-strong` | `--accent-border` |
| `added` | `--success-soft` | `--success-strong` | `--border-success` |
| `deleted` | `--danger-soft` | `--danger-strong` | `--border-danger` |

---

## 7. Motion Plan

### Tree Expand/Collapse

| Property | Timing | Easing |
|---|---|---|
| Chevron rotation | `--duration-fast` | `--ease-out` |
| Children `max-height` | `--duration-normal` | `--ease-out` |
| Children `opacity` | `--duration-fast` delay `50ms` | `--ease-out` |

### Tree Item Hover/Select

| Property | Timing | Easing |
|---|---|---|
| Background color | `--duration-fast` | `--ease-default` |
| Border appearance (selected) | `--duration-fast` | `--ease-default` |

### Diff Line Highlight

When cursor hovers a diff line:
- Background brightens slightly (increase alpha by 0.04)
- Transition: `--duration-fast`, `--ease-default`

### Status Badge Pulse (Running State)

```css
.file-status-badge[data-status="running"]::before {
  animation: status-pulse 1.5s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Load More Animation

When "Show more" is clicked:
- New lines fade in with `opacity` 0 to 1
- Stagger: first line at 0ms, each subsequent line +20ms (capped at 200ms total)
- Duration: `--duration-normal`

### Reduced Motion

- Tree expand/collapse: instant (no height animation)
- All hover transitions: instant
- Status pulse: disabled (static icon)
- Load more: instant appearance, no stagger

---

## 8. Copy Direction

### Tree Panel Labels

| Element | Text |
|---|---|
| Panel header | "Files" |
| Empty state | "No files changed" |
| Expand folder tooltip | "Expand" |
| Collapse folder tooltip | "Collapse" |

### Diff Viewer Labels

| Element | Text |
|---|---|
| Header (single file) | `{filename}` |
| Header (with change count) | `{filename} (+{added} -{removed})` |
| Hunk context (when available) | `{function_name}` after `@@` markers |
| Empty diff | "No changes" |
| Binary file | "Binary file (not shown)" |
| Load more button | "Show more lines" |
| Progress text | "Showing {n} of {total} lines" |
| Full diff loaded | "All lines loaded" |

### Status Badge Labels

| Status | Text |
|---|---|
| `running` | "running" |
| `success` | "done" |
| `error` | "error" |
| `modified` | "M" (single letter) |
| `added` | "A" |
| `deleted` | "D" |

Tone: factual, technical, minimal. No conversational language.

---

## 9. Accessibility Requirements

### Focus Order

File tree:
1. Search/filter input (if present)
2. Each tree item in DOM order (depth-first)

Diff viewer:
1. Diff header (file path — may be a link/button for file actions)
2. Diff content is not individually focusable (code is read-only)
3. Load more button (when present)

### ARIA Roles

| Element | Role | Notes |
|---|---|---|
| `.file-tree` | `tree` | Announces as tree widget |
| `.file-tree-item[data-type="folder"]` | `treeitem` | Has `aria-expanded` |
| `.file-tree-item[data-type="file"]` | `treeitem` | Selectable |
| folder children container | `group` | Groups nested items |
| `.diff-viewer` | `region` + `aria-label="Diff viewer"` | Landmark |
| `.diff-line` | none (presentational) | Code is in `<pre>` or `<code>` |
| status badge | `status` | Announces state changes |

### Keyboard Navigation

File tree:
| Key | Action |
|---|---|
| `ArrowDown` | Move to next visible item |
| `ArrowUp` | Move to previous visible item |
| `ArrowRight` | Expand folder (if collapsed) or move to first child |
| `ArrowLeft` | Collapse folder (if expanded) or move to parent |
| `Enter` / `Space` | Select file or toggle folder |
| `Home` | Move to first item |
| `End` | Move to last visible item |

Diff viewer:
| Key | Action |
|---|---|
| `j` / `ArrowDown` | Scroll down one line |
| `k` / `ArrowUp` | Scroll up one line |
| `n` | Jump to next hunk |
| `p` | Jump to previous hunk |
| `Shift+G` | Jump to end of diff |
| `g g` | Jump to start of diff |

### Contrast

- Line numbers (`--text-faint`) on `--surface-canvas`: verify >= 4.5:1 for informational text
- Add/remove prefix symbols: use `--success-strong` / `--danger-strong` which are verified 4.5:1+
- Status badge text on soft backgrounds: all verified in S01

### Screen Reader

- Tree items announce: "{name}, {type}, {level} of {total}, {expanded/collapsed if folder}"
- File with status: "{filename}, {status}, modified"
- Diff lines are in a `<pre>` block with appropriate `aria-label` describing the diff context

---

## 10. Anti-Patterns to Avoid

1. **No syntax highlighting in S06.** This story focuses on diff structure. Syntax highlighting is a future enhancement.
2. **No inline editing.** The diff viewer is read-only. Edits happen through the agent.
3. **No side-by-side diff.** Unified diff only in this story. Side-by-side is a future mode.
4. **No file icons for every extension.** Use generic file/folder icons. Extension-specific icons are polish.
5. **No sticky headers inside diff.** Keep the diff simple — hunk headers scroll with content.
6. **No virtual scrolling in tree.** Tree is typically small enough. Virtualize only if proven needed.
7. **No drag-and-drop in tree.** Files are not reorganized via the viewer.
8. **No context menus.** Keep interactions to click and keyboard. Context menus are future work.
9. **No external links in diff.** Line numbers and code are not clickable (no jump-to-editor).
10. **No loading spinners in diff lines.** Loading state is at the viewer level, not per-line.

---

## 11. Responsive Breakpoint Behavior

### 1440px (Desktop Large)

- File tree panel: 220px (matches sidebar width)
- Diff viewer: fills remaining width
- Both panels visible simultaneously
- Full line numbers (two-column: old + new)

### 1024px (Desktop)

- File tree may collapse to icon-only if space constrained
- Diff viewer takes priority
- Line numbers remain two-column

### 768px (Tablet)

- File tree collapses to slide-over panel (drawer from left)
- Diff viewer is full-width
- Line numbers: single column (new line number only)
- "Files" button in diff header opens tree drawer

### 375px (Mobile)

- File tree as full-screen modal or drawer
- Diff viewer full-width with horizontal scroll for long lines
- Line numbers: single column, narrower gutter (32px)
- Load more shows fewer lines per batch (100 instead of 200)

### Breakpoint CSS

```css
@media (max-width: 768px) {
  .file-tree {
    position: fixed;
    inset: var(--shell-header-h) auto var(--shell-footer-h) 0;
    width: 280px;
    z-index: 30;
    transform: translateX(-100%);
    transition: transform var(--collapse-duration) var(--collapse-easing);
  }

  .file-tree[data-open="true"] {
    transform: translateX(0);
  }

  .diff-gutter-old {
    display: none;
  }

  .diff-gutter {
    width: 36px;
  }
}

@media (max-width: 375px) {
  .diff-gutter {
    width: 32px;
    font-size: var(--text-3xs);
  }

  .diff-line {
    height: 20px;
  }
}
```
