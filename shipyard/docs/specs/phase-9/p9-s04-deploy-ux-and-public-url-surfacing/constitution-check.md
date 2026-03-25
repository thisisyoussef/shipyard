# Constitution Check

- [x] New modules respect SRP and dependency direction. Deploy state,
  persistence, backend routing, and visual presentation remain separated.
- [x] Backwards compatibility respected. Natural-language deploys via the tool
  surface keep working even if the browser adds a first-class deploy control.
- [x] Testing strategy covers the change. Backend contracts, persisted deploy
  state, and UI states all have explicit coverage.
- [x] New dependency justified and risk-assessed. No new UI framework or state
  library is required for deployment status surfacing.
