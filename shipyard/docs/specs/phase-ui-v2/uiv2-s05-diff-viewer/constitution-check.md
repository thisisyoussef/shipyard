# Constitution Check

- [x] New modules respect SRP and dependency direction. `DiffViewer.tsx` owns diff rendering; `FileTree.tsx` owns tree navigation. Both are leaf components consuming typed props from `ShipyardWorkbench`.
- [x] Backwards compatibility respected. Extraction refactor preserves existing render output before adding features. No changes to the WebSocket event contract or `activity-diff.ts` public API.
- [x] Testing strategy covers the change. Unit tests for tree grouping, diff pagination, and line number rendering. Integration test for file selection scrolling. Accessibility checks via skill chain.
- [x] New dependency justified and risk-assessed. No new runtime dependencies. Syntax-category coloring uses inline regex, not a third-party highlighter library.
- [x] Accessibility baseline maintained. ARIA tree roles, keyboard navigation, color-plus-label redundancy, focus management for tree and diff expansion controls.
- [x] Performance discipline maintained. Paginated expansion avoids rendering 100+ line diffs at once. File tree uses CSS transitions only (no JS animation). Clipboard API is async and non-blocking.
