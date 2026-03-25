# Task Breakdown

## Story
- Story ID: UIV2-S05
- Story Title: Diff and File Viewer Overhaul

## Execution Notes
- Extract components from `ShipyardWorkbench.tsx` before adding new features to avoid merge conflicts with S04 changes.
- File tree ARIA pattern must use `role="tree"` / `role="treeitem"` — do not use a generic list.
- Syntax-category coloring uses simple regex, not a parser. Keep the classifier under 50 lines.
- Test the clipboard copy in the integration test by mocking `navigator.clipboard`.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extract `DiffViewer.tsx` from `ShipyardWorkbench.tsx` — move all diff rendering logic into a standalone component with typed props. Ensure existing render output is unchanged. | none | yes | `pnpm --dir shipyard build`, visual parity check |
| T002 | Extract `FileTree.tsx` from `ShipyardWorkbench.tsx` — move file sidebar logic into a standalone component. Add `role="tree"` / `role="treeitem"` ARIA structure. Wire turn grouping from activity stream. | none | yes (parallel with T001) | `pnpm --dir shipyard build`, ARIA audit |
| T003 | Build file tree grouped by turn with status indicators. Each turn header shows turn number and file count. Each file shows ADD/MOD/DEL label + colored dot. Turn headers are collapsible. Keyboard navigation with arrow keys. | blocked-by:T002 | no | `pnpm --dir shipyard test`, keyboard walkthrough |
| T004 | Add line numbers to diff rendering. Render a gutter column with line numbers in monospace font, muted color. Line numbers track original/new file positions for ADD/DEL lines. | blocked-by:T001 | no | `pnpm --dir shipyard test`, visual check |
| T005 | Implement paginated diff expansion. Diffs with 20+ lines show first 10. "Show N more lines" button reveals next 10. "Show all remaining" link for power users. Track expansion state per file path. | blocked-by:T004 | no | `pnpm --dir shipyard test` |
| T006 | Add syntax-category coloring. Simple regex classifier for keywords, strings, comments. Apply token colors as foreground on diff content. Ensure background tints for ADD/DEL/CTX do not obscure syntax colors. | blocked-by:T004 | yes (parallel with T005) | `pnpm --dir shipyard build`, visual check |
| T007 | Add copyable file paths. File path rendered as `<button>` with clipboard copy on click. "Copied" toast/indicator with 1.5s fade. Fallback for non-clipboard-API environments. | blocked-by:T001 | yes (parallel with T003–T006) | `pnpm --dir shipyard test` |
| T008 | Run `colorize` + `typeset` + `fixing-accessibility` skills. Fix any findings. Verify focus order, screen reader labels, color contrast on diff backgrounds. | blocked-by:T003,T004,T005,T006,T007 | no | `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`, `pnpm --dir shipyard build`, `git diff --check` |

## Completion Criteria

- File tree sidebar shows a structured, grouped, keyboard-navigable tree of file changes per turn.
- Diff viewer renders line numbers, syntax-category colors, and accessible ADD/DEL/CTX labels.
- Large diffs are expandable in chunks, not truncated.
- File paths are one-click copyable with visual feedback.
- All components pass accessibility skill check.
