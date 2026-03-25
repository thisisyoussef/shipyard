# Constitution Check

- [x] New modules respect SRP and dependency direction. `SessionPanel.tsx` owns session display; `ContextPanel.tsx` owns context management UI. Both are leaf presentational components receiving typed props from `ShipyardWorkbench`. Neither imports the other.
- [x] Backwards compatibility respected. Extraction refactor preserves existing render output before restyling. No changes to `workbench-state.ts` or `context-ui.ts` public APIs. The WebSocket session protocol is unchanged.
- [x] Testing strategy covers the change. Unit tests for status dot rendering, collapsible section toggling, 3-zone layout, and timeline expansion. Integration test for context submission flow.
- [x] New dependency justified and risk-assessed. No new runtime dependencies. Native `<details>`/`<summary>` elements used for collapsible sections — no accordion library needed.
- [x] Accessibility baseline maintained. Status dot has `aria-label`. Collapsible sections use native `<details>` for built-in keyboard and screen reader support. Timeline entries are focusable and expandable via Enter/Space.
- [x] Performance discipline maintained. Condensed timeline entries reduce DOM node count compared to full-card history. Sticky input area uses CSS `position: sticky` — no JS scroll handlers. Collapsible sections use CSS-only show/hide.
