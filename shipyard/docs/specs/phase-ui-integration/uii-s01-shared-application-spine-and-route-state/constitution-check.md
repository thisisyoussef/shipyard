# Constitution Check

- [x] New modules respect SRP and dependency direction. The shared browser
      controller owns behavior, selector helpers shape route models, and
      `App.tsx` becomes a thin shell instead of another state owner.
- [x] Testing strategy covers the change. Routing, rehydration, reducer
      continuity, and legacy workbench behavior all have focused regression
      coverage before the refactor lands.
- [x] Backwards compatibility is preserved. Hosted access, uploads,
      `/human-feedback`, preview harness, and existing `ShipyardWorkbench`
      behavior remain available.
- [x] No new runtime dependencies are introduced. Routing stays hand-rolled and
      state remains inside the current React/browser platform.
