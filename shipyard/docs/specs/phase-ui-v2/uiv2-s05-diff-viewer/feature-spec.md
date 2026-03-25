# Feature Spec

## Metadata
- Story ID: UIV2-S05
- Story Title: Diff and File Viewer Overhaul
- Author: Claude
- Date: 2026-03-24
- Related PRD/phase gate: Phase UI v2 — Complete UI Reimagination
- Estimated effort: 2h
- Depends on: UIV2-S04 (Activity Feed Reimagination)
- Skills: colorize, typeset, fixing-accessibility

## Problem Statement

The diff viewer is a flat list of colored lines with no structural hierarchy. It lacks a file tree view, has no syntax highlighting, no side-by-side option, and the file event sidebar does not group files by turn or status. When an agent run produces 20+ file changes across multiple turns, finding a specific file or understanding the scope of changes requires scrolling through an undifferentiated list. Large diffs are simply truncated with no way to see the rest. File paths are plain text that cannot be copied without manual selection.

This makes it difficult for developers to review agent output efficiently, which directly undermines the pack goal of "scanability under pressure."

## Story Objectives

- Objective 1: Rebuild the file sidebar as a hierarchical file tree grouped by turn and change status (added, modified, deleted).
- Objective 2: Add syntax-category-aware diff rendering with line numbers for quick orientation.
- Objective 3: Replace hard truncation of large diffs with paginated "show more" expansion.
- Objective 4: Make file paths interactive — copyable on click with visual feedback.

## User Stories

- As a developer reviewing agent output, I want files grouped by turn so I can understand what changed in each step.
- As a developer reading a diff, I want line numbers so I can reference specific changes.
- As a developer reviewing a large diff, I want to expand it incrementally so I can see the full change without losing context.
- As a developer, I want to copy a file path with one click so I can open it in my editor.

## Acceptance Criteria

- [ ] AC-1: File tree view is rendered in the sidebar, grouped by turn with expandable turn headers showing turn number and file count.
- [ ] AC-2: Each file entry in the tree shows a status indicator (ADD/MOD/DEL) with both color and label for accessibility.
- [ ] AC-3: Clicking a file in the tree scrolls the diff panel to that file's diff.
- [ ] AC-4: Diff rendering includes line numbers in a gutter column, styled in `--color-text-muted`.
- [ ] AC-5: Diff lines use syntax-category coloring (keyword, string, comment, default) in addition to ADD/DEL/CTX background tints.
- [ ] AC-6: ADD/DEL/CTX labels remain visible alongside color (color is never the sole signal).
- [ ] AC-7: Large diffs (20+ lines) show the first 10 lines with a "Show N more lines" control; clicking it reveals the next chunk (10 lines at a time).
- [ ] AC-8: File paths are rendered as clickable elements; clicking copies the path to clipboard and shows a brief "Copied" toast.
- [ ] AC-9: Diff viewer logic is extracted to `DiffViewer.tsx`; file tree logic is extracted to `FileTree.tsx`.
- [ ] AC-10: The component passes the `fixing-accessibility` skill check (focus management, screen reader labels, keyboard navigation in tree).

## Notes / Evidence

- Current diff rendering lives in `ShipyardWorkbench.tsx` as inline JSX mixed with the activity feed.
- The `activity-diff.ts` module provides diff data structures that the new components should consume.
- File tree should use `role="tree"` / `role="treeitem"` ARIA patterns for accessibility.
- The "Show N more lines" pattern is used by GitHub and GitLab diff viewers — proven UX for large diffs.

## Out of Scope

- Side-by-side (split) diff view — deferred to a future enhancement story.
- Full syntax highlighting with language grammar parsing (only category-level coloring: keyword, string, comment, default).
- Inline commenting or annotation on diff lines.
- Git blame integration.

## Done Definition

- File changes are browsable via a structured tree grouped by turn.
- Diffs are readable with line numbers and category coloring.
- Large diffs are incrementally expandable, not truncated.
- File paths are one-click copyable.
- All interactive elements are keyboard-navigable and screen-reader-friendly.
