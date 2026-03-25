# Constitution Check

- [x] New modules respect SRP and dependency direction. Deployment logic lands
  in a dedicated tool contract rather than leaking into prompts or random shell
  helpers.
- [x] Backwards compatibility respected. Local and hosted Shipyard both call
  the same deploy tool surface.
- [x] Testing strategy covers the change. Tool registration, process mocking,
  timeout handling, and error parsing all have explicit coverage.
- [x] New dependency justified and risk-assessed. Prefer provider CLI usage in
  a repo-owned, deterministic way rather than relying on mutable global state.
