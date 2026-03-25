# Constitution Check

- [x] New modules respect SRP and dependency direction. Hosted startup stays in
  the CLI and UI-server boundary; provider config stays at the deploy/config
  edge instead of leaking into the engine.
- [x] Backwards compatibility respected. Local terminal mode and local `--ui`
  remain supported when hosted settings are absent.
- [x] Testing strategy covers the change. CLI startup, health behavior, and
  provider host/port handling all have explicit test and smoke coverage.
- [x] New dependency justified and risk-assessed. No new runtime dependency is
  required for the Railway host baseline.
