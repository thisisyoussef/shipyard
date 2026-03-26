# Constitution Check

- [x] New modules respect SRP and dependency direction. Verification planning,
  assertion execution, and eval-ops calibration remain separate from route
  selection and UI presentation.
- [x] Backwards compatibility is planned. Existing command-based verification
  stays available while richer assertions and eval surfaces roll in.
- [x] Testing strategy covers the change. Planner selection, mixed assertion
  execution, failure evidence, and eval trace export all need focused tests.
- [x] New dependency risk is bounded. Assertion helpers should reuse existing
  preview, command, and trace infrastructure before adding new external
  services.
