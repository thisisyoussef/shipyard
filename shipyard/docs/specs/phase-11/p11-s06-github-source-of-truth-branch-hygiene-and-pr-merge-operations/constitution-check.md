# Constitution Check

- [x] New modules respect SRP and dependency direction. Auth capability,
  repository binding, branch lifecycle, PR lifecycle, and merge recovery remain
  separate concerns instead of one overloaded git helper.
- [x] Backwards compatibility is planned. Local-only management still works in
  an explicit degraded mode when GitHub auth or binding is unavailable, rather
  than failing closed and stranding the project.
- [x] Testing strategy covers the change. Auth-adapter selection, degraded
  fallback, branch sync, PR lifecycle, and first-merge-wins conflict recovery
  all need explicit coverage.
- [x] New dependency risk is bounded. GitHub-specific behavior stays behind a
  normalized source-control capability contract so local `gh`, hosted OAuth or
  App auth, and service-token modes do not leak throughout the runtime.
