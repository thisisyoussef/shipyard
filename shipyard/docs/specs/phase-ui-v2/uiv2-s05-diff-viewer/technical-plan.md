# Technical Plan

## Metadata
- Story ID: UIV2-S05
- Story Title: Diff and File Viewer Overhaul
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — extract diff and file sidebar logic
  - `shipyard/ui/src/DiffViewer.tsx` — new component for diff rendering
  - `shipyard/ui/src/FileTree.tsx` — new component for file tree sidebar
  - `shipyard/ui/src/activity-diff.ts` — consumed as data source, may need minor shape additions
  - `shipyard/ui/src/view-models.ts` — may need a grouped-by-turn view model
  - `shipyard/ui/src/styles.css` — diff and tree styles using design tokens from S01

- Public interfaces/contracts:
  - `FileTree` props: `{ turns: TurnFileGroup[]; selectedPath: string | null; onSelect: (path: string) => void }`
  - `DiffViewer` props: `{ diffs: FileDiff[]; expandedPaths: Set<string>; initialLines?: number }`
  - `TurnFileGroup`: `{ turnId: string; turnNumber: number; files: FileEntry[] }`
  - `FileEntry`: `{ path: string; status: 'add' | 'modify' | 'delete'; lineCount: number }`

- Data flow summary:
  1. `ShipyardWorkbench` groups file events by turn using the existing activity stream.
  2. `FileTree` renders the grouped tree in the sidebar; selecting a file updates `selectedPath`.
  3. `DiffViewer` renders the diff for the selected file (or all files in scroll order).
  4. Large diffs use local component state to track expansion (`expandedChunks` map).
  5. File path copy uses the Clipboard API with a transient "Copied" indicator via local state timeout.

## Implementation Notes

### FileTree Component
- Use `<ul role="tree">` with `<li role="treeitem">` for turn groups and file entries.
- Turn headers are collapsible: `aria-expanded` toggles child visibility.
- Status indicators: colored dot + text label (ADD/MOD/DEL). Colors from design tokens: `--color-status-success` for ADD, `--color-status-warning` for MOD, `--color-status-error` for DEL.
- Keyboard: Arrow keys navigate, Enter/Space toggles expansion or selects file.

### DiffViewer Component
- Render a table-like layout: gutter (line numbers) | label (ADD/DEL/CTX) | content.
- Line numbers in `--font-mono` at `--font-size-sm`, colored `--color-text-muted`.
- Syntax-category coloring via simple regex classification (not a full parser):
  - Keywords: `--color-syntax-keyword` (blue family)
  - Strings: `--color-syntax-string` (green family)
  - Comments: `--color-syntax-comment` (gray family)
  - Default: `--color-text-primary`
- Background tints for ADD/DEL/CTX lines use low-opacity token colors to avoid obscuring syntax coloring.

### Paginated Expansion
- Default `initialLines = 10` for diffs with 20+ lines.
- "Show N more lines" button appears at the cut point; N = `min(10, remaining)`.
- Each click appends another chunk to the visible range.
- "Show all remaining" link alongside the chunk button for power users.

### Copyable Paths
- File path rendered as `<button>` with `title="Click to copy path"`.
- `navigator.clipboard.writeText(path)` on click.
- Brief "Copied" indicator via CSS class toggle (fade in/out, 1.5s duration).
- Fallback: `document.execCommand('copy')` for older contexts.

## Test Strategy

- Unit: Verify `FileTree` renders correct grouping and responds to selection.
- Unit: Verify `DiffViewer` renders line numbers, labels, and respects `initialLines` pagination.
- Unit: Verify "Show more" button increments visible lines correctly.
- Integration: Verify clicking a file in the tree scrolls the diff panel to the correct position.
- Accessibility: Verify ARIA tree roles, keyboard navigation, and focus management.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
