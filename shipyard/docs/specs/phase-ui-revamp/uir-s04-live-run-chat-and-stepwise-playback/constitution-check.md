# Constitution Check

- [x] New modules respect SRP and dependency direction. Tool payload shaping, runtime event emission, reducer state, and presentation components stay separate.
- [x] New dependency justified and risk-assessed. No new dependencies required.
- [x] Testing strategy covers the change. Unit, integration, and browser smoke checks cover the runtime and UI surfaces.
- [x] Backwards compatibility respected. WebSocket schema changes are additive and optional so older session state can still rehydrate.
