# Constitution Check

- [x] New modules respect SRP and dependency direction. Shared scaffold generation remains the single source of truth; bootstrap routing reuses it instead of duplicating it.
- [x] Backwards compatibility respected. Existing minimal presets and target creation flows remain valid.
- [x] Testing strategy covers the change. Preset generation, guard rails, shared reuse, and bootstrap routing all have explicit coverage.
- [x] New dependency justified and risk-assessed. No new dependencies are required.
