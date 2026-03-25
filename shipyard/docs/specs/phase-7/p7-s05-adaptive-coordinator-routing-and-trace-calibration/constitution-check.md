# Constitution Check

- [x] New modules respect SRP and dependency direction. The coordinator integrates routing and evidence, while planner and evaluator roles remain isolated contracts.
- [x] Backwards compatibility respected. Trivial tasks can stay on the existing lightweight path and LangSmith remains optional.
- [x] Testing strategy covers the change. Route-selection, trace-metadata, and calibration-fixture tests are planned before final integration.
- [x] New dependency justified and risk-assessed. No new dependency is required here beyond any browser automation introduced earlier in the pack.
