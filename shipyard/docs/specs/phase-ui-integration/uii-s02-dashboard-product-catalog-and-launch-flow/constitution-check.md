# Constitution Check

- [x] Dashboard data shaping remains separate from presentational card
      components. Projection logic lives outside `DashboardView` and
      `ProductCard`.
- [x] Launch flow uses explicit request correlation instead of timing guesses,
      which keeps navigation behavior deterministic and debuggable.
- [x] No new runtime dependencies are introduced. Recent/starred preferences
      use browser storage only.
- [x] Accessibility is defined for hero prompt, filter tabs, cards, and empty
      states before implementation begins.
