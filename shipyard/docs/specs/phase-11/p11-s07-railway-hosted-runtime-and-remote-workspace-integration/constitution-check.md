# Constitution Check

- [x] New modules respect SRP and dependency direction. Hosted workspace boot,
  provider env validation, hosted auth adapters, preview availability, and
  degraded-runtime status remain separate concerns.
- [x] Backwards compatibility is planned. Local workflows remain supported while
  Railway-hosted execution becomes a first-class runtime path.
- [x] Testing strategy covers the change. Hosted workspace restore, auth-mode
  selection, degraded fallback, preview or deploy surface distinction, and
  restart behavior all need explicit coverage.
- [x] New dependency risk is bounded. Railway-specific behavior stays inside the
  hosting boundary and builds on the existing hosted contract rather than
  creating a separate cloud-only runtime.
