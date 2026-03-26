# Constitution Check

- [x] New modules respect SRP and dependency direction. Routing policy,
  helper-role capability definitions, and coordinator orchestration stay
  separate concerns.
- [x] Backwards compatibility is planned. Existing heuristics can remain as a
  fallback while the typed routing artifact proves stable.
- [x] Testing strategy covers the change. Route selection, confidence
  thresholds, fallback behavior, and helper-capability enforcement all need
  explicit tests.
- [x] New dependency risk is bounded. Helper-role expansion should reuse the
  existing subagent/runtime patterns rather than adding an uncontrolled swarm
  framework.
