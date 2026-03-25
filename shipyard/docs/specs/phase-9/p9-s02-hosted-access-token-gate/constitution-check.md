# Constitution Check

- [x] New modules respect SRP and dependency direction. Access gating lives at
  the UI transport/bootstrap boundary and does not bleed into the core engine.
- [x] Backwards compatibility respected. When no access token env var is set,
  current local behavior remains unchanged.
- [x] Testing strategy covers the change. Hosted login, websocket rejection,
  and secret-redaction behavior all have explicit coverage.
- [x] New dependency justified and risk-assessed. No new auth provider or
  session framework is required for the lightweight shared-secret gate.
