# Constitution Check

- [x] New modules respect SRP and dependency direction. Coordinator routing remains the decision layer.
- [x] Backwards compatibility respected. Existing coordinator behavior remains intact until explicitly routed to subagents.
- [x] Testing strategy covers the change. Coordinator integration can be exercised with focused scenarios.
- [x] New dependency justified and risk-assessed. No new dependency required beyond existing agent/runtime machinery.
