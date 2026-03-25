# Constitution Check

- [x] New modules respect SRP and dependency direction. The verifier still evaluates only and does not inherit write authority.
- [x] Backwards compatibility respected. Existing single-command verification can be normalized into the richer evaluation-plan contract.
- [x] Testing strategy covers the change. Contract tests cover plan validation, ordered execution, and hard-failure semantics.
- [x] New dependency justified and risk-assessed. No new dependency is required for command-backed multi-check verification.
