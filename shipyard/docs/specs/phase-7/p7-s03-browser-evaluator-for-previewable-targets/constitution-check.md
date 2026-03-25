# Constitution Check

- [x] New modules respect SRP and dependency direction. Browser automation lives in a dedicated read-only evaluator instead of leaking into the coordinator.
- [x] Backwards compatibility respected. Targets without preview support continue to work and report a structured unavailable state.
- [x] Testing strategy covers the change. Contract tests and preview-target integration coverage are planned before coordinator integration.
- [x] New dependency justified and risk-assessed. A local browser automation dependency is justified because preview-backed UI evidence is the story's core deliverable.
